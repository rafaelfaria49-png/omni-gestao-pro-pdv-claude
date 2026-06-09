import { describe, it, expect } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  chaveAparelhoV3,
  construirHistoricoAparelhoV3,
  mesmaChaveAparelhoV3,
  timelineAparelhoV3,
} from "./historico-aparelho-model";

const NOW = new Date("2026-06-09T12:00:00.000Z");
const DIA = 86400000;
function diasAtras(n: number): string {
  return new Date(NOW.getTime() - n * DIA).toISOString();
}

type OSLike = OrdemServico & Record<string, unknown>;
function os(over: Record<string, unknown>): OSLike {
  return {
    id: "os1",
    codigo: "OS-1",
    cliente: { nome: "Maria" },
    equipamento: { marca: "Apple", modelo: "iPhone", defeitoRelatado: "" },
    timeline: [],
    criadoEm: diasAtras(1),
    ...over,
  } as unknown as OSLike;
}

describe("historico-aparelho · chave do aparelho", () => {
  it("usa IMEI do equipamento quando não há prova de entrada", () => {
    const c = chaveAparelhoV3(os({ equipamento: { numeroSerie: "35-99/0011" } }));
    expect(c.tipo).toBe("imei");
    expect(c.chave).toBe("3599 0011".replace(/\s/g, ""));
  });

  it("prefere IMEI da prova de entrada (3E.2)", () => {
    const c = chaveAparelhoV3(os({ equipamento: { numeroSerie: "OLD" }, provaEntradaV3: { identificacao: { imei: "123456" } } }));
    expect(c.chave).toBe("123456");
  });

  it("cai para serial quando não há IMEI", () => {
    const c = chaveAparelhoV3(os({ equipamento: {}, provaEntradaV3: { identificacao: { serial: "SN-AB-9" } } }));
    expect(c.tipo).toBe("serial");
    expect(c.chave).toBe("SNAB9");
  });

  it("sem identificador → tipo nenhum (compat OS antiga)", () => {
    expect(chaveAparelhoV3(os({ equipamento: {} })).tipo).toBe("nenhum");
  });
});

describe("historico-aparelho · match entre OS", () => {
  it("casa por IMEI normalizado (formatações diferentes)", () => {
    const a = os({ id: "a", equipamento: { numeroSerie: "359900-11" } });
    const b = os({ id: "b", equipamento: { numeroSerie: "35990011" } });
    expect(mesmaChaveAparelhoV3(a, b)).toBe(true);
  });
  it("casa por serial quando IMEI ausente", () => {
    const a = os({ id: "a", equipamento: {}, provaEntradaV3: { identificacao: { serial: "Z9" } } });
    const b = os({ id: "b", equipamento: {}, provaEntradaV3: { identificacao: { serial: "z-9" } } });
    expect(mesmaChaveAparelhoV3(a, b)).toBe(true);
  });
  it("não casa aparelhos diferentes", () => {
    expect(mesmaChaveAparelhoV3(os({ equipamento: { numeroSerie: "111" } }), os({ equipamento: { numeroSerie: "222" } }))).toBe(false);
  });
});

describe("historico-aparelho · consolidação + alertas", () => {
  const atual = os({
    id: "atual",
    codigo: "OS-300",
    equipamento: { numeroSerie: "IMEI-1", defeitoRelatado: "Tela quebrada não acende" },
    criadoEm: diasAtras(1),
    operacaoStatusV3: "diagnostico",
  });
  const anterior = os({
    id: "ant",
    codigo: "OS-100",
    equipamento: { numeroSerie: "IMEI-1", defeitoRelatado: "Troca de tela" },
    criadoEm: diasAtras(120),
    operacaoStatusV3: "entregue",
    entregueEm: diasAtras(110),
    retornosV3: [{ id: "r1", osOriginalId: "ant", motivo: "voltou", criadoEm: diasAtras(100), status: "aberto" }],
  });
  const outro = os({ id: "x", codigo: "OS-200", equipamento: { numeroSerie: "OTHER" } });

  it("agrupa as OS do mesmo IMEI e marca a atual", () => {
    const h = construirHistoricoAparelhoV3(atual, [atual, anterior, outro], NOW);
    expect(h.totalOS).toBe(2);
    expect(h.temHistorico).toBe(true);
    expect(h.anteriores.map((l) => l.codigo)).toEqual(["OS-100"]);
    expect(h.ordens.find((l) => l.atual)?.codigo).toBe("OS-300");
  });

  it("ordena mais recente primeiro e lê serviços/defeito", () => {
    const h = construirHistoricoAparelhoV3(atual, [atual, anterior], NOW);
    expect(h.ordens[0].codigo).toBe("OS-300");
    expect(h.anteriores[0].defeito).toBe("Troca de tela");
  });

  it("emite alertas: já passou + múltiplos retornos + recorrência (tela)", () => {
    const atual2 = os({ id: "a2", codigo: "OS-9", equipamento: { numeroSerie: "K", defeitoRelatado: "tela piscando" } });
    const ant1 = os({ id: "b2", codigo: "OS-7", equipamento: { numeroSerie: "K", defeitoRelatado: "troca de tela" }, retornosV3: [{ id: "r", osOriginalId: "b2", motivo: "x", criadoEm: diasAtras(5), status: "aberto" }] });
    const ant2 = os({ id: "c2", codigo: "OS-8", equipamento: { numeroSerie: "K", defeitoRelatado: "bateria" }, retornosV3: [{ id: "r2", osOriginalId: "c2", motivo: "y", criadoEm: diasAtras(3), status: "aberto" }] });
    const h = construirHistoricoAparelhoV3(atual2, [atual2, ant1, ant2], NOW);
    const tipos = h.alertas.map((a) => a.tipo);
    expect(tipos).toContain("ja_passou");
    expect(tipos).toContain("multiplos_retornos");
    expect(tipos).toContain("recorrencia_defeito");
  });

  it("OS sem identificador → histórico só com a própria OS, sem alerta de 'já passou'", () => {
    const semId = os({ id: "z", equipamento: {} });
    const h = construirHistoricoAparelhoV3(semId, [semId, anterior], NOW);
    expect(h.totalOS).toBe(1);
    expect(h.temHistorico).toBe(false);
    expect(h.alertas.find((a) => a.tipo === "ja_passou")).toBeUndefined();
  });
});

describe("historico-aparelho · timeline cronológica", () => {
  it("agrega eventos das OS do aparelho em ordem cronológica", () => {
    const ant = os({
      id: "ant",
      codigo: "OS-100",
      equipamento: { numeroSerie: "IMEI-1" },
      timeline: [
        { id: "e1", tipo: "criacao", criadoEm: diasAtras(120), conteudo: "OS criada", autor: "x", autorTipo: "usuario" },
        { id: "e2", tipo: "entrega_cliente", criadoEm: diasAtras(110), conteudo: "entregue", autor: "x", autorTipo: "usuario" },
      ],
    });
    const atual = os({ id: "atual", codigo: "OS-300", equipamento: { numeroSerie: "IMEI-1" }, timeline: [{ id: "e3", tipo: "diagnostico_registrado", criadoEm: diasAtras(1), conteudo: "diag", autor: "x", autorTipo: "usuario" }] });
    const h = construirHistoricoAparelhoV3(atual, [atual, ant], NOW);
    const tl = timelineAparelhoV3(h, new Map([["ant", ant], ["atual", atual]]));
    expect(tl.map((e) => e.etapa)).toEqual(["recepcao", "entrega", "diagnostico"]);
    expect(tl[0].osCodigo).toBe("OS-100");
  });
});
