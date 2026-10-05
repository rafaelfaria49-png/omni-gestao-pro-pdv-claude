import { describe, expect, it } from "vitest";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import {
  CHECKLIST_ENTRADA_PADRAO_V3,
  construirTimelineOperacionalV3,
  diagnosticoPreenchidoV3,
  lerChecklistEntradaV3,
  lerDiagnosticoV3,
  lerHistoricoV3,
  lerRecepcaoV3,
  lerSenhaAcessoriosV3,
  resumoChecklistV3,
} from "./workspace-model";

function os(over: Record<string, unknown>): OrdemServico {
  return { id: "os1", codigo: "OS-1", criadoEm: "2026-06-01T10:00:00Z", timeline: [], ...over } as unknown as OrdemServico;
}
function ev(over: Partial<EventoTimeline>): EventoTimeline {
  return { id: "e", tipo: "observacao", autor: "Tec", autorTipo: "usuario", conteudo: "", criadoEm: "2026-06-01T10:00:00Z", ...over } as EventoTimeline;
}

describe("workspace — checklist de entrada", () => {
  it("usa padrão V3 (tudo não testado) quando a OS não tem checklist", () => {
    const itens = lerChecklistEntradaV3(os({}));
    expect(itens).toHaveLength(CHECKLIST_ENTRADA_PADRAO_V3.length);
    expect(itens.every((i) => i.estado === "nao_testado")).toBe(true);
  });

  it("lê checklist existente e sanitiza estado inválido", () => {
    const itens = lerChecklistEntradaV3(
      os({ checklist: [{ id: "liga", label: "Liga", estado: "ok" }, { id: "x", label: "X", estado: "zzz" }] }),
    );
    expect(itens[0].estado).toBe("ok");
    expect(itens[1].estado).toBe("nao_testado");
  });

  it("resumo conta ok/ruim/não-testado", () => {
    const r = resumoChecklistV3([
      { id: "a", label: "A", estado: "ok" },
      { id: "b", label: "B", estado: "ruim" },
      { id: "c", label: "C", estado: "nao_testado" },
      { id: "d", label: "D", estado: "ok" },
    ]);
    expect(r).toEqual({ ok: 2, ruim: 1, naoTestado: 1, total: 4 });
  });
});

describe("workspace — senha + acessórios", () => {
  it("lê senha/tipo/acessórios da OS", () => {
    const sa = lerSenhaAcessoriosV3(
      os({ senhaEquipamento: "1234", senhaEquipamentoTipo: "numerica", equipamento: { acessorios: ["Chip", "", "Cabo"] } }),
    );
    expect(sa).toEqual({ senha: "1234", senhaTipo: "numerica", acessorios: ["Chip", "Cabo"] });
  });

  it("defaults seguros quando ausente", () => {
    const sa = lerSenhaAcessoriosV3(os({}));
    expect(sa).toEqual({ senha: "", senhaTipo: "numerica", acessorios: [] });
  });
});

describe("workspace — diagnóstico técnico", () => {
  it("prefere diagnosticoV3; semeia inicial/solução da aberturaV3", () => {
    const d = lerDiagnosticoV3(
      os({ aberturaV3: { diagnosticoInicial: { diagnosticoTecnico: "placa oxidada", solucaoPrevista: "limpeza" } } }),
    );
    expect(d.inicial).toBe("placa oxidada");
    expect(d.solucao).toBe("limpeza");
    expect(diagnosticoPreenchidoV3(d)).toBe(true);

    const d2 = lerDiagnosticoV3(os({ diagnosticoV3: { inicial: "A", final: "B", causa: "C", solucao: "D" } }));
    expect(d2).toMatchObject({ inicial: "A", final: "B", causa: "C", solucao: "D" });
  });

  it("vazio quando não há nada", () => {
    expect(diagnosticoPreenchidoV3(lerDiagnosticoV3(os({})))).toBe(false);
  });
});

describe("workspace — recepção", () => {
  it("usa aberturaV3.recepcao e cai em criadoEm/sla quando ausente", () => {
    const r = lerRecepcaoV3(os({ aberturaV3: { recepcao: { dataEntrada: "2026-06-02T08:00:00Z", recebidoPor: "Ana", localFisico: "bancada" } }, sla: { prazo: "2026-06-05T00:00:00Z" } }));
    expect(r.dataEntrada).toBe("2026-06-02T08:00:00Z");
    expect(r.recebidoPor).toBe("Ana");
    expect(r.previsaoEntrega).toBe("2026-06-05T00:00:00Z");

    const r2 = lerRecepcaoV3(os({ criadoEm: "2026-06-01T10:00:00Z" }));
    expect(r2.dataEntrada).toBe("2026-06-01T10:00:00Z");
  });

  it("R4: previsão combinada já passada sinaliza 'vencida' (calculado agora), exceto depois da entrega", () => {
    const recepcao = { previsaoEntrega: "2020-06-05T15:00:00.000Z", previsaoEntregaMeta: { precisao: "dia", dia: "2020-06-05" } };
    expect(lerRecepcaoV3(os({ aberturaV3: { versao: 1, recepcao } })).previsaoVencida).toBe(true);
    expect(lerRecepcaoV3(os({ aberturaV3: { versao: 1, recepcao }, entregueEm: "2020-06-04T15:00:00.000Z" })).previsaoVencida).toBe(false);
  });
});

describe("workspace — timeline operacional", () => {
  it("marca etapas pelo status atual mesmo sem evento explícito (não inventa data)", () => {
    const steps = construirTimelineOperacionalV3(os({ operacaoStatusV3: "em_execucao" }));
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey.criada.atingido).toBe(true);
    expect(byKey.recebida.atingido).toBe(true);
    expect(byKey.diagnostico.atingido).toBe(true);
    expect(byKey.orcamento.atingido).toBe(true);
    expect(byKey.aprovada.atingido).toBe(true);
    expect(byKey.em_reparo.atingido).toBe(true);
    expect(byKey.pronta.atingido).toBe(false);
    expect(byKey.entregue.atingido).toBe(false);
    // sem evento real → sem responsável; só criada/recebida têm "em" (datas reais)
    expect(byKey.em_reparo.responsavel).toBeUndefined();
    expect(byKey.criada.em).toBe("2026-06-01T10:00:00Z");
  });

  it("usa evento real para data + responsável da etapa", () => {
    const steps = construirTimelineOperacionalV3(
      os({
        operacaoStatusV3: "aprovado",
        timeline: [
          ev({ tipo: "orcamento_enviado", autor: "Bruno", criadoEm: "2026-06-03T09:00:00Z" }),
          ev({ tipo: "orcamento_aprovado", autor: "Cliente", criadoEm: "2026-06-03T15:00:00Z" }),
        ],
      }),
    );
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey.orcamento.em).toBe("2026-06-03T09:00:00Z");
    expect(byKey.orcamento.responsavel).toBe("Bruno");
    expect(byKey.aprovada.em).toBe("2026-06-03T15:00:00Z");
    expect(byKey.aprovada.responsavel).toBe("Cliente");
    expect(byKey.entregue.atingido).toBe(false);
  });

  it("reconhece mudanca_status por metadata.para", () => {
    const steps = construirTimelineOperacionalV3(
      os({ operacaoStatusV3: "diagnostico", timeline: [ev({ tipo: "mudanca_status", autor: "Ana", metadata: { para: "diagnostico" }, criadoEm: "2026-06-02T11:00:00Z" })] }),
    );
    const diag = steps.find((s) => s.key === "diagnostico")!;
    expect(diag.atingido).toBe(true);
    expect(diag.em).toBe("2026-06-02T11:00:00Z");
    expect(diag.responsavel).toBe("Ana");
  });

  it("OS cancelada não acende etapas por ordem (só por evento)", () => {
    const steps = construirTimelineOperacionalV3(os({ operacaoStatusV3: "cancelada" }));
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey.diagnostico.atingido).toBe(false);
    expect(byKey.criada.atingido).toBe(true);
  });

  // GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001: datas efetivas, sem âncora técnica.
  it("Recebida/Entregue usam as datas efetivas com a precisão gravada (só-dia nunca mostra 12:00)", () => {
    const steps = construirTimelineOperacionalV3(
      os({
        operacaoStatusV3: "entregue",
        aberturaV3: { recepcao: { dataEntrada: "2026-09-24T15:00:00.000Z", dataEntradaMeta: { precisao: "dia", dia: "2026-09-24" }, recebidoPor: "Ana" } },
        entregueEm: "2026-10-01T15:00:00.000Z",
        entregaV3: { entregueEm: "2026-10-01T15:00:00.000Z", entregueEmMeta: { precisao: "dia", dia: "2026-10-01" }, registradoEm: "2026-10-04T20:00:00.000Z" },
        timeline: [
          // Registro real da entrega (retroativa) e o status intermediário emitido no mesmo instante.
          ev({ tipo: "mudanca_status", autor: "Bia", metadata: { para: "recebida" }, criadoEm: "2026-10-04T20:00:00.000Z" }),
          ev({ tipo: "entrega_cliente", autor: "Bia", criadoEm: "2026-10-04T20:00:00.000Z" }),
        ],
      }),
    );
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey.recebida).toMatchObject({ atingido: true, em: "2026-09-24T15:00:00.000Z", emTexto: "24/09/2026", responsavel: "Ana" });
    expect(byKey.entregue).toMatchObject({ atingido: true, em: "2026-10-01T15:00:00.000Z", emTexto: "01/10/2026", responsavel: "Bia" });
  });

  it("entrada com horário informado mostra o horário na loja", () => {
    const steps = construirTimelineOperacionalV3(
      os({ aberturaV3: { recepcao: { dataEntrada: "2026-09-24T12:30:00.000Z", dataEntradaMeta: { precisao: "data_hora", dia: "2026-09-24" } } } }),
    );
    expect(steps.find((s) => s.key === "recebida")!.emTexto).toBe("24/09/2026 09:30");
  });

  it("orçamento sem o aparelho na loja: 'Recebida' não acende nem ganha data fabricada", () => {
    const steps = construirTimelineOperacionalV3(os({ comercialV4: { tipo: "orcamento_pre_os" }, aberturaV3: { recepcao: {} } }));
    const recebida = steps.find((s) => s.key === "recebida")!;
    expect(recebida.atingido).toBe(false);
    expect(recebida.em).toBeUndefined();
    expect(recebida.emTexto).toBeUndefined();
  });
});

describe("workspace — histórico", () => {
  it("ordena eventos do mais recente para o mais antigo", () => {
    const h = lerHistoricoV3(
      os({ timeline: [ev({ id: "a", criadoEm: "2026-06-01T10:00:00Z" }), ev({ id: "b", criadoEm: "2026-06-03T10:00:00Z" }), ev({ id: "c", criadoEm: "2026-06-02T10:00:00Z" })] }),
    );
    expect(h.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
});
