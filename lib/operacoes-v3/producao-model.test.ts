import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  bancadaPorTecnicoV3,
  calcularAtrasoMinutosV3,
  filaProducaoV3,
  lerPrioridadeV3,
  lerSlaV3,
  metricasPorTecnicoV3,
  ordenarPorPrioridadeV3,
  producaoDoDiaV3,
  tecnicoIdFromNomeV3,
  tecnicosConhecidosV3,
} from "./producao-model";

const NOW = new Date("2026-06-05T12:00:00.000Z");
const H = 3600000;
const emHoras = (h: number) => new Date(NOW.getTime() + h * H).toISOString();

function os(over: Record<string, unknown>): OrdemServico {
  return { id: "o", codigo: "OS", cliente: { nome: "C" }, timeline: [], ...over } as unknown as OrdemServico;
}

describe("prioridade — leitura", () => {
  it("usa payload.prioridadeV3 quando válido", () => {
    expect(lerPrioridadeV3(os({ prioridadeV3: "alta" }))).toBe("alta");
  });
  it("faz fallback do prioridade V2 (critica→urgente, media→normal)", () => {
    expect(lerPrioridadeV3(os({ prioridade: "critica" }))).toBe("urgente");
    expect(lerPrioridadeV3(os({ prioridade: "media" }))).toBe("normal");
  });
  it("default normal", () => {
    expect(lerPrioridadeV3(os({}))).toBe("normal");
  });
});

describe("SLA simples", () => {
  it("no prazo / em risco / atrasada / sem prazo", () => {
    expect(lerSlaV3(os({ operacaoStatusV3: "aberta", sla: { prazo: emHoras(48), status: "ok" } }), NOW).situacao).toBe("no_prazo");
    expect(lerSlaV3(os({ operacaoStatusV3: "aberta", sla: { prazo: emHoras(12), status: "ok" } }), NOW).situacao).toBe("em_risco");
    expect(lerSlaV3(os({ operacaoStatusV3: "em_execucao", sla: { prazo: emHoras(-2), status: "ok" } }), NOW).situacao).toBe("atrasada");
    expect(lerSlaV3(os({ operacaoStatusV3: "aberta" }), NOW).situacao).toBe("sem_prazo");
  });
  it("OS finalizada não fica atrasada", () => {
    const entregue = os({ operacaoStatusV3: "entregue", sla: { prazo: emHoras(-50), status: "estourado" } });
    expect(lerSlaV3(entregue, NOW).situacao).toBe("no_prazo");
  });
});

describe("atraso", () => {
  it("retorna minutos de atraso quando atrasada", () => {
    const atrasada = os({ operacaoStatusV3: "em_execucao", sla: { prazo: emHoras(-2), status: "ok" } });
    expect(calcularAtrasoMinutosV3(atrasada, NOW)).toBe(120);
  });
  it("retorna null quando no prazo", () => {
    const ok = os({ operacaoStatusV3: "em_execucao", sla: { prazo: emHoras(48), status: "ok" } });
    expect(calcularAtrasoMinutosV3(ok, NOW)).toBeNull();
  });
});

describe("ordenar por prioridade", () => {
  it("urgente > normal > baixa", () => {
    const lista = [
      os({ id: "baixa", operacaoStatusV3: "aberta", prioridadeV3: "baixa" }),
      os({ id: "urgente", operacaoStatusV3: "aberta", prioridadeV3: "urgente" }),
      os({ id: "normal", operacaoStatusV3: "aberta", prioridadeV3: "normal" }),
    ];
    expect(ordenarPorPrioridadeV3(lista, NOW).map((o) => o.id)).toEqual(["urgente", "normal", "baixa"]);
  });
  it("em empate de prioridade, mais atrasada/próxima primeiro", () => {
    const lista = [
      os({ id: "no-prazo", operacaoStatusV3: "aberta", prioridadeV3: "normal", sla: { prazo: emHoras(48), status: "ok" } }),
      os({ id: "atrasada", operacaoStatusV3: "aberta", prioridadeV3: "normal", sla: { prazo: emHoras(-5), status: "ok" } }),
    ];
    expect(ordenarPorPrioridadeV3(lista, NOW)[0].id).toBe("atrasada");
  });
});

const ORDENS = [
  os({ id: "1", operacaoStatusV3: "em_execucao", tecnico: { id: "t1", nome: "Ana" }, prioridadeV3: "normal" }),
  os({ id: "2", operacaoStatusV3: "diagnostico", tecnico: { id: "t1", nome: "Ana" }, prioridadeV3: "urgente" }),
  os({ id: "3", operacaoStatusV3: "aberta" }), // sem técnico
  os({ id: "4", operacaoStatusV3: "entregue", tecnico: { id: "t1", nome: "Ana" }, entregaV3: { entregueEm: NOW.toISOString() } }),
  os({ id: "5", operacaoStatusV3: "cancelada", tecnico: { id: "t2", nome: "Bia" } }),
  os({ id: "6", operacaoStatusV3: "pronta", tecnico: { id: "t2", nome: "Bia" } }),
];

describe("agrupar por técnico (bancada)", () => {
  it("agrupa OS ativas, ordena por prioridade e põe 'Sem técnico' por último", () => {
    const g = bancadaPorTecnicoV3(ORDENS, NOW);
    // Ana (2 ativas) > Bia (1 ativa) > Sem técnico (1)
    expect(g.map((x) => x.tecnicoId)).toEqual(["t1", "t2", "__sem_tecnico__"]);
    expect(g[0].ordens.map((o) => o.id)).toEqual(["2", "1"]); // urgente antes de normal
    expect(g[g.length - 1].semTecnico).toBe(true);
    // entregue (#4) e cancelada (#5) não entram na bancada
    expect(g.flatMap((x) => x.ordens.map((o) => o.id))).not.toContain("4");
    expect(g.flatMap((x) => x.ordens.map((o) => o.id))).not.toContain("5");
  });
});

describe("métricas por técnico", () => {
  it("conta total/execução/prontas/atrasadas/entregues hoje (sem cancelada)", () => {
    const m = metricasPorTecnicoV3(ORDENS, NOW);
    const ana = m.find((x) => x.tecnicoId === "t1")!;
    expect(ana.totalAtribuidas).toBe(3); // 1, 2, 4 (entregue conta; cancelada não)
    expect(ana.emExecucao).toBe(1);
    expect(ana.entreguesHoje).toBe(1);
    const bia = m.find((x) => x.tecnicoId === "t2")!;
    expect(bia.totalAtribuidas).toBe(1); // só #6 (pronta); #5 cancelada fora
    expect(bia.prontas).toBe(1);
  });
});

describe("produção do dia + fila", () => {
  it("conta produção do dia por status", () => {
    const d = producaoDoDiaV3(ORDENS, NOW);
    expect(d.emDiagnostico).toBe(1); // #2
    expect(d.emExecucao).toBe(1); // #1
    expect(d.prontas).toBe(1); // #6
    expect(d.semTecnico).toBe(1); // #3
    expect(d.entreguesHoje).toBe(1); // #4
  });
  it("distribui a fila pelas colunas de status", () => {
    const f = filaProducaoV3(ORDENS, NOW);
    expect(f.aguardando_diagnostico.map((o) => o.id)).toEqual(["3"]);
    expect(f.em_diagnostico.map((o) => o.id)).toEqual(["2"]);
    expect(f.em_execucao.map((o) => o.id)).toEqual(["1"]);
    expect(f.pronta.map((o) => o.id)).toEqual(["6"]);
  });
});

describe("técnicos conhecidos", () => {
  it("lista distintos e gera id estável a partir do nome", () => {
    const ts = tecnicosConhecidosV3(ORDENS);
    expect(ts.map((t) => t.nome)).toEqual(["Ana", "Bia"]);
    expect(tecnicoIdFromNomeV3("José da Silva")).toBe("tec:jose-da-silva");
  });
});
