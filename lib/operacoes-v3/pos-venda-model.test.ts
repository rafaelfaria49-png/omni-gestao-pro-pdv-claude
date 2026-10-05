import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  classificarGarantiasV3,
  kpisPosVendaV3,
  lerEntregaV3,
  lerFotosSaidaV3,
  lerGarantiaV3,
  lerRetornosV3,
  resumoRetornosV3,
  retornosDoClienteV3,
} from "./pos-venda-model";

const NOW = new Date("2026-06-04T12:00:00.000Z");
const DIA = 86400000;
function diasAtras(n: number): string {
  return new Date(NOW.getTime() - n * DIA).toISOString();
}

function os(over: Record<string, unknown>): OrdemServico {
  return { id: "os1", codigo: "OS-1", cliente: { nome: "Cliente" }, timeline: [], ...over } as unknown as OrdemServico;
}
function comGarantia(modelo: string, prazoDias?: number, extra: Record<string, unknown> = {}): OrdemServico {
  return os({ aberturaV3: { garantiaPrevista: { modelo, label: `Garantia ${modelo}`, prazoDias } }, ...extra });
}
function entregueEm(iso: string) {
  return { entregaV3: { entregueEm: iso, entreguePor: "Op", recebidoPor: "Cliente" } };
}

describe("entrega — leitura", () => {
  it("sem entrega → não entregue", () => {
    expect(lerEntregaV3(os({})).entregue).toBe(false);
  });
  it("com entregaV3 → entregue com metadados", () => {
    const e = lerEntregaV3(os(entregueEm(diasAtras(1))));
    expect(e.entregue).toBe(true);
    expect(e.recebidoPor).toBe("Cliente");
    expect(e.entreguePor).toBe("Op");
  });
  it("fallback para os.entregueEm/retirada", () => {
    expect(lerEntregaV3(os({ entregueEm: diasAtras(2) })).entregue).toBe(true);
  });
});

describe("fotos de saída — leitura", () => {
  it("sem entregaV3.fotosSaida → lista vazia honesta", () => {
    expect(lerFotosSaidaV3(os({}))).toEqual([]);
  });
  it("ignora item sem data URL de imagem", () => {
    expect(
      lerFotosSaidaV3(
        os({
          entregaV3: {
            fotosSaida: [{ id: "x", categoria: "reparado", dataUrl: "http://x" }],
          },
        }),
      ),
    ).toEqual([]);
  });
  it("lê fotos reais de saída", () => {
    const fotos = lerFotosSaidaV3(
      os({
        entregaV3: {
          fotosSaida: [
            { id: "f1", categoria: "reparado", dataUrl: "data:image/jpeg;base64,AAAA", tamanho: 12, criadoEm: "2026-08-01T12:00:00.000Z" },
          ],
        },
      }),
    );
    expect(fotos).toHaveLength(1);
    expect(fotos[0]).toMatchObject({ id: "f1", categoria: "reparado" });
  });
});

describe("garantia — situação", () => {
  it("ATIVA: entregue recentemente, dentro do prazo", () => {
    const g = lerGarantiaV3(comGarantia("tela", 90, entregueEm(NOW.toISOString())), NOW);
    expect(g.situacao).toBe("ativa");
    expect(g.prazoDias).toBe(90);
    expect(g.diasRestantes).toBe(90);
    expect(g.inicio).toBeTruthy();
    expect(g.vencimento).toBeTruthy();
  });

  it("VENCIDA: entregue há mais tempo que o prazo", () => {
    const g = lerGarantiaV3(comGarantia("tela", 90, entregueEm(diasAtras(100))), NOW);
    expect(g.situacao).toBe("vencida");
    expect(g.diasRestantes).toBeLessThan(0);
  });

  it("PREVISTA: tem garantia mas ainda não foi entregue", () => {
    const g = lerGarantiaV3(comGarantia("tela", 90), NOW);
    expect(g.situacao).toBe("prevista");
    expect(g.inicio).toBeUndefined();
    expect(g.vencimento).toBeUndefined();
  });

  it("SEM COBERTURA: modelo sem garantia", () => {
    const g = lerGarantiaV3(comGarantia("sem_garantia", 0, entregueEm(NOW.toISOString())), NOW);
    expect(g.situacao).toBe("sem_garantia");
    expect(g.semCobertura).toBe(true);
  });

  it("NENHUMA: OS sem dado de garantia", () => {
    expect(lerGarantiaV3(os({}), NOW).situacao).toBe("nenhuma");
  });

  it("R9: entrega só pelo dia — a garantia vale o último dia inteiro (a âncora 12:00 não a vence às 16:00)", () => {
    // Entrega em 01/01/2026 só pelo dia (âncora 12:00 na loja = 15:00Z), 90 dias.
    const soDia = { entregaV3: { entregueEm: "2026-01-01T15:00:00.000Z", entregueEmMeta: { precisao: "dia", dia: "2026-01-01" } } };
    expect(lerGarantiaV3(comGarantia("tela", 90, soDia), new Date("2026-04-01T19:00:00.000Z")).situacao).toBe("ativa"); // 01/04 16:00
    expect(lerGarantiaV3(comGarantia("tela", 90, soDia), new Date("2026-04-02T03:00:00.000Z")).situacao).toBe("vencida"); // 02/04 00:00
    // Com horário informado vale o instante: 12:00 explícito vence às 12:00.
    const comHora = { entregaV3: { entregueEm: "2026-01-01T15:00:00.000Z", entregueEmMeta: { precisao: "data_hora", dia: "2026-01-01" } } };
    expect(lerGarantiaV3(comGarantia("tela", 90, comHora), new Date("2026-04-01T19:00:00.000Z")).situacao).toBe("vencida");
  });

  it("R10: garantia V2 com fim explícito só vale por dia se começou na entrega; iniciada na aprovação vence no instante", () => {
    const entregaSoDia = { entregaV3: { entregueEm: "2026-01-01T15:00:00.000Z", entregueEmMeta: { precisao: "dia", dia: "2026-01-01" } } };
    const as16h = new Date("2026-04-01T19:00:00.000Z"); // 01/04 16:00 na loja
    // Iniciada na APROVAÇÃO (antes da entrega), término explícito 01/04 12:00: vencida às 16:00.
    const naAprovacao = os({ ...entregaSoDia, garantia: { ativa: true, prazoDias: 90, inicioEm: "2025-12-28T13:00:00.000Z", fimEm: "2026-04-01T15:00:00.000Z" } });
    expect(lerGarantiaV3(naAprovacao, as16h).situacao).toBe("vencida");
    // Ancorada na entrega só-dia (mesmo instante): vale o último dia inteiro.
    const naEntrega = os({ ...entregaSoDia, garantia: { ativa: true, prazoDias: 90, inicioEm: "2026-01-01T15:00:00.000Z", fimEm: "2026-04-01T15:00:00.000Z" } });
    expect(lerGarantiaV3(naEntrega, as16h).situacao).toBe("ativa");
    // Sem `inicioEm` (ou inválido): a origem canônica é a própria entrega só-dia → vale o dia inteiro.
    const semInicio = os({ ...entregaSoDia, garantia: { ativa: true, prazoDias: 90, fimEm: "2026-04-01T15:00:00.000Z" } });
    expect(lerGarantiaV3(semInicio, as16h).situacao).toBe("ativa");
    const inicioInvalido = os({ ...entregaSoDia, garantia: { ativa: true, prazoDias: 90, inicioEm: "não é data", fimEm: "2026-04-01T15:00:00.000Z" } });
    expect(lerGarantiaV3(inicioInvalido, as16h).situacao).toBe("ativa");
  });

  it("usa o prazo padrão do catálogo quando não informado", () => {
    const g = lerGarantiaV3(comGarantia("bateria", undefined, entregueEm(NOW.toISOString())), NOW);
    expect(g.prazoDias).toBe(90); // padrão de bateria
    expect(g.situacao).toBe("ativa");
  });
});

describe("garantia — classificação (ativa/vencendo/vencida/prevista)", () => {
  it("separa em baldes corretos pela janela de vencimento", () => {
    const ordens = [
      comGarantia("tela", 90, { ...entregueEm(diasAtras(30)), id: "a" }), // ~60 dias → ativa
      comGarantia("tela", 90, { ...entregueEm(diasAtras(80)), id: "b" }), // ~10 dias → vencendo
      comGarantia("tela", 90, { ...entregueEm(diasAtras(100)), id: "c" }), // vencida
      comGarantia("tela", 90, { id: "d" }), // prevista (sem entrega)
      os({ id: "e" }), // nenhuma → não entra
    ];
    const seg = classificarGarantiasV3(ordens, { vencendoDias: 15, now: NOW });
    expect(seg.ativas.map((l) => l.os.id)).toEqual(["a"]);
    expect(seg.vencendo.map((l) => l.os.id)).toEqual(["b"]);
    expect(seg.vencidas.map((l) => l.os.id)).toEqual(["c"]);
    expect(seg.previstas.map((l) => l.os.id)).toEqual(["d"]);
  });
});

describe("retorno — leitura + vínculo OS original", () => {
  const comRetornos = os({
    id: "os9",
    retornosV3: [
      { id: "r1", osOriginalId: "os9", osOriginalCodigo: "OS-9", motivo: "Tela falhando de novo", criadoEm: diasAtras(2), status: "aberto" },
      { id: "r2", osOriginalId: "os9", motivo: "Não carrega", criadoEm: diasAtras(10), status: "finalizado", finalizadoEm: diasAtras(8) },
    ],
  });

  it("lê retornos (mais recentes primeiro) e mantém o vínculo com a OS original", () => {
    const list = lerRetornosV3(comRetornos);
    expect(list.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(list.every((r) => r.osOriginalId === "os9")).toBe(true);
  });

  it("lê observação de abertura e o atendimento vinculado", () => {
    const list = lerRetornosV3(os({
      retornosV3: [{
        id: "r1",
        osOriginalId: "os9",
        motivo: "Touch",
        observacao: "Cliente deixou o aparelho",
        criadoEm: diasAtras(1),
        status: "aberto",
        osRetornoId: "os-nova",
        osRetornoCodigo: "OS-2001",
      }],
    }));
    expect(list[0]).toMatchObject({
      observacao: "Cliente deixou o aparelho",
      osRetornoId: "os-nova",
      osRetornoCodigo: "OS-2001",
    });
  });

  it("resume contagem por status", () => {
    const r = resumoRetornosV3(comRetornos);
    expect(r).toMatchObject({ total: 2, abertos: 1, finalizados: 1 });
    expect(r.ultimoMotivo).toBe("Tela falhando de novo");
  });

  it("ignora entradas inválidas", () => {
    expect(lerRetornosV3(os({ retornosV3: [{}, { id: "" }, null] }))).toHaveLength(0);
  });
});

describe("retornos — agregação por cliente", () => {
  it("soma retornos de todas as OS do mesmo cliente", () => {
    const ordens = [
      os({ id: "o1", clienteId: "c1", retornosV3: [{ id: "x", osOriginalId: "o1", motivo: "a", criadoEm: diasAtras(1), status: "aberto" }] }),
      os({ id: "o2", clienteId: "c1", retornosV3: [{ id: "y", osOriginalId: "o2", motivo: "b", criadoEm: diasAtras(1), status: "finalizado" }] }),
      os({ id: "o3", clienteId: "c2", retornosV3: [{ id: "z", osOriginalId: "o3", motivo: "c", criadoEm: diasAtras(1), status: "aberto" }] }),
    ];
    const agg = retornosDoClienteV3(ordens, ordens[0]);
    expect(agg).toMatchObject({ total: 2, abertos: 1, ordensComRetorno: 2 });
  });
});

describe("KPIs de pós-venda", () => {
  it("conta garantias ativas, retornos e taxa de retorno (OS com retorno ÷ entregues)", () => {
    const ordens = [
      comGarantia("tela", 90, { ...entregueEm(diasAtras(10)), id: "k1" }), // entregue + garantia ativa
      comGarantia("tela", 90, {
        ...entregueEm(diasAtras(20)),
        id: "k2",
        retornosV3: [{ id: "r", osOriginalId: "k2", motivo: "voltou", criadoEm: diasAtras(1), status: "aberto" }],
      }), // entregue + retorno aberto
      comGarantia("tela", 90, { id: "k3" }), // prevista, não entregue
    ];
    const kpi = kpisPosVendaV3(ordens, { now: NOW });
    expect(kpi.osEntregues).toBe(2);
    expect(kpi.garantiasAtivas).toBe(2); // k1 e k2 ativas
    expect(kpi.totalRetornos).toBe(1);
    expect(kpi.retornosAbertos).toBe(1);
    expect(kpi.osComRetorno).toBe(1);
    expect(kpi.taxaRetorno).toBe(50); // 1 de 2 entregues
  });
});

describe("OPS-V4-FLUXO-CURTO-002 — leitura canônica da garantia", () => {
  it("legado sem fonte inequívoca fica não definido e sem prazo fantasma", () => {
    expect(lerGarantiaV3(os({}))).toMatchObject({
      temGarantia: false,
      situacao: "nenhuma",
      prazoDias: 0,
      label: "Garantia não definida",
    });
  });

  it("sem_garantia com prazo histórico contraditório lê sem cobertura e zero", () => {
    expect(lerGarantiaV3(comGarantia("sem_garantia", 90))).toMatchObject({
      temGarantia: true,
      situacao: "sem_garantia",
      semCobertura: true,
      prazoDias: 0,
    });
  });

  it("tela com prazo zero lê o prazo padrão coberto, como o termo", () => {
    expect(lerGarantiaV3(comGarantia("tela", 0))).toMatchObject({
      temGarantia: true,
      situacao: "prevista",
      semCobertura: false,
      prazoDias: 90,
    });
  });
});
