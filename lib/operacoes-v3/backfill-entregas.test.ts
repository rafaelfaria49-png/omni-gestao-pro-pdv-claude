import { describe, it, expect } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  montarBackfillEntregaV3,
  precisaBackfillEntregaV3,
  resolverEntregueEmBackfillV3,
} from "./backfill-entregas";

const NOW = new Date("2026-06-08T12:00:00.000Z");

type OSLike = OrdemServico & Record<string, unknown>;
function os(over: Record<string, unknown>): OSLike {
  return {
    id: "os1",
    codigo: "OS-2026-0001",
    cliente: { nome: "Maria" },
    timeline: [],
    ...over,
  } as unknown as OSLike;
}

describe("backfill-entregas · precisaBackfillEntregaV3 (alvo preciso)", () => {
  it("entregue (status-only legado) SEM entrega legível → precisa", () => {
    expect(precisaBackfillEntregaV3(os({ operacaoStatusV3: "entregue" }))).toBe(true);
  });

  it("entregue COM entregaV3 → NÃO precisa (idempotência)", () => {
    expect(
      precisaBackfillEntregaV3(os({ operacaoStatusV3: "entregue", entregaV3: { entregueEm: "2026-06-01T10:00:00.000Z" } })),
    ).toBe(false);
  });

  it("entregue do V2 (tem entregueEm, sem entregaV3) → NÃO precisa (fallback do reader cobre)", () => {
    expect(precisaBackfillEntregaV3(os({ operacaoStatusV3: "entregue", entregueEm: "2026-06-01T10:00:00.000Z" }))).toBe(false);
  });

  it("entregue com retirada.retiradoEm → NÃO precisa", () => {
    expect(
      precisaBackfillEntregaV3(os({ operacaoStatusV3: "entregue", retirada: { confirmado: true, retiradoEm: "2026-06-01T10:00:00.000Z" } })),
    ).toBe(false);
  });

  it("não-entregue → NÃO precisa", () => {
    expect(precisaBackfillEntregaV3(os({ operacaoStatusV3: "pronta" }))).toBe(false);
    expect(precisaBackfillEntregaV3(os({ status: "em_execucao" }))).toBe(false);
    expect(precisaBackfillEntregaV3(null)).toBe(false);
  });
});

describe("backfill-entregas · resolverEntregueEmBackfillV3 (recuperação de data)", () => {
  it("recupera a data do evento de transição para 'entregue' na timeline", () => {
    const r = resolverEntregueEmBackfillV3(
      os({
        timeline: [
          { id: "e1", tipo: "mudanca_status", criadoEm: "2026-06-02T09:00:00.000Z", metadata: { para: "pronta" } },
          { id: "e2", tipo: "mudanca_status", criadoEm: "2026-06-03T15:30:00.000Z", metadata: { para: "entregue" } },
        ],
      }),
      NOW,
    );
    expect(r).toEqual({ entregueEm: "2026-06-03T15:30:00.000Z", fonte: "timeline_status" });
  });

  it("sem evento de entrega, usa atualizadoEm", () => {
    const r = resolverEntregueEmBackfillV3(os({ atualizadoEm: "2026-06-04T08:00:00.000Z", timeline: [] }), NOW);
    expect(r).toEqual({ entregueEm: "2026-06-04T08:00:00.000Z", fonte: "atualizadoEm" });
  });

  it("sem nenhuma pista, usa 'agora' aproximado", () => {
    const r = resolverEntregueEmBackfillV3(os({ timeline: [] }), NOW);
    expect(r).toEqual({ entregueEm: NOW.toISOString(), fonte: "aproximado" });
  });
});

describe("backfill-entregas · montarBackfillEntregaV3 (patch aditivo)", () => {
  it("monta entregaV3 (origem backfill) + entregueEm + retirada + evento, recuperando a data", () => {
    const candidata = os({
      operacaoStatusV3: "entregue",
      cliente: { nome: "João" },
      timeline: [{ id: "e2", tipo: "mudanca_status", criadoEm: "2026-06-03T15:30:00.000Z", metadata: { para: "entregue" } }],
    });
    const { patch, evento, plano } = montarBackfillEntregaV3(candidata, NOW);

    expect(patch.entregaV3).toMatchObject({
      entregueEm: "2026-06-03T15:30:00.000Z",
      entreguePor: "(backfill)",
      recebidoPor: "João",
      origem: "backfill",
      backfillEm: NOW.toISOString(),
    });
    expect(patch.entregueEm).toBe("2026-06-03T15:30:00.000Z");
    expect(patch.retirada).toMatchObject({ confirmado: true, retiradoPor: "João", retiradoEm: "2026-06-03T15:30:00.000Z", origem: "backfill" });
    expect(evento.tipo).toBe("entrega_cliente");
    expect(evento.metadata).toMatchObject({ backfill: true, fonteData: "timeline_status", aproximado: false });
    expect(plano).toMatchObject({ codigo: "OS-2026-0001", fonteData: "timeline_status", recebidoPor: "João", aproximado: false });
  });

  it("data aproximada marca aproximado=true no entregaV3 e no evento", () => {
    const { patch, evento, plano } = montarBackfillEntregaV3(os({ operacaoStatusV3: "entregue", timeline: [] }), NOW);
    expect((patch.entregaV3 as Record<string, unknown>).aproximado).toBe(true);
    expect(evento.metadata).toMatchObject({ aproximado: true });
    expect(plano.aproximado).toBe(true);
  });

  it("idempotência: aplicar o patch torna a OS NÃO-candidata (lerEntregaV3 passa a reconhecer)", () => {
    const candidata = os({ operacaoStatusV3: "entregue", timeline: [] });
    expect(precisaBackfillEntregaV3(candidata)).toBe(true);
    const { patch } = montarBackfillEntregaV3(candidata, NOW);
    const corrigida = { ...candidata, ...patch } as OSLike;
    expect(precisaBackfillEntregaV3(corrigida)).toBe(false);
  });
});
