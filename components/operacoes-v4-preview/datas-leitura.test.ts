// OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — leitura, documentos e paridade V3×V4 (puros).
import { afterEach, describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { adaptEntrega, adaptOsHeader } from "./os-adapter";
import { lerRecepcaoV3 } from "@/lib/operacoes-v3/workspace-model";
import { montarDocumentoOSV3, montarEtiquetaV3, montarTermoEntregaV3 } from "@/lib/operacoes-v3/print-model";
import { montarOrcamentoClienteViewV4 } from "@/lib/operacoes-v4/orcamento-cliente-view";
import { fimDoDiaLojaIsoV3, montarDataOperacionalV3, type DataOperacionalV3 } from "@/lib/operacoes-v3/datas-operacionais-model";

const TZ_ORIGINAL = process.env.TZ;
afterEach(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

function data(dia: string, hora = ""): DataOperacionalV3 {
  const r = montarDataOperacionalV3({ dia, hora });
  if (!r.ok) throw new Error(r.mensagem);
  return r.valor;
}

const ENTRADA = data("2026-09-24"); // só o dia
const PREVISAO = data("2026-09-28", "18:00");
const ENTREGA = data("2026-09-29");

function osRetroativa(over: Record<string, unknown> = {}): OrdemServico {
  return {
    id: "os-1",
    codigo: "OS-2026-00100",
    storeId: "loja-qa",
    criadoEm: "2026-10-04T17:00:00.000Z",
    atualizadoEm: "2026-10-04T17:00:00.000Z",
    status: "entregue",
    cliente: { id: "c", nome: "Cliente QA" },
    equipamento: { id: "e", tipo: "Smartphone", marca: "Moto", modelo: "G", defeitoRelatado: "Tela" },
    aberturaV3: {
      versao: 1,
      criadoEm: "2026-10-04T17:00:00.000Z",
      recepcao: {
        dataEntrada: ENTRADA.iso,
        dataEntradaMeta: ENTRADA.meta,
        previsaoEntrega: PREVISAO.iso,
        previsaoEntregaMeta: PREVISAO.meta,
        origem: "balcao",
        recebidoPor: "Ana",
      },
    },
    sla: { prazo: PREVISAO.iso, status: "ok", origemV3: "informada" },
    entregueEm: ENTREGA.iso,
    retirada: { confirmado: true, retiradoPor: "Cliente QA", retiradoEm: ENTREGA.iso },
    entregaV3: { entregueEm: ENTREGA.iso, entregueEmMeta: ENTREGA.meta, registradoEm: "2026-10-04T17:30:00.000Z", recebidoPor: "Cliente QA" },
    timeline: [],
    pecas: [],
    observacoes: [],
    anexos: [],
    garantia: { ativa: false },
    ...over,
  } as unknown as OrdemServico;
}

describe("V4 — adaptador mostra datas operacionais (e só o cadastro como cadastro)", () => {
  it("entrada só-dia sem horário inventado, previsão combinada e entrega efetiva", () => {
    for (const tz of ["UTC", "Asia/Tokyo", "America/Sao_Paulo"]) {
      process.env.TZ = tz;
      const h = adaptOsHeader(osRetroativa());
      expect(h.entradaRotulo).toBe("Entrada");
      expect(h.entrada).toBe("24/09/2026");
      expect(h.previsao).toBe("28/09/2026 18:00");
      expect(h.prazoInterno).toBe("");
      expect(h.entrega).toBe("29/09/2026");
    }
  });

  it("sem entrada registrada: rótulo 'Cadastro'; SLA automático aparece como prazo interno, nunca como previsão", () => {
    const h = adaptOsHeader(
      osRetroativa({ aberturaV3: { versao: 1, recepcao: {} }, sla: { prazo: "2026-10-06T17:00:00.000Z", status: "ok" }, entregaV3: undefined, entregueEm: undefined, retirada: undefined }),
    );
    expect(h.entradaRotulo).toBe("Cadastro");
    expect(h.entrada).toBe("04/10/2026 14:00");
    expect(h.previsao).toBe("Não informada");
    expect(h.prazoInterno).toBe("06/10/2026 14:00 (automático)");
  });

  it("orçamento sem aparelho: entrada honesta 'Aparelho não está na loja'", () => {
    const h = adaptOsHeader(osRetroativa({ comercialV4: { tipo: "orcamento_pre_os", statusComercial: "rascunho" }, aberturaV3: { versao: 1, recepcao: {} } }));
    expect(h.entrada).toBe("Aparelho não está na loja");
  });

  it("entrega: data efetiva + horário real do registro quando diferem", () => {
    const e = adaptEntrega(osRetroativa());
    expect(e.retiradoEm).toBe("29/09/2026");
    expect(e.registradoEm).toBe("04/10/2026 14:30");
  });
});

describe("D20 — paridade V3×V4: mesmo payload, mesma data, precisão e significado", () => {
  it("V3 (lerRecepcaoV3) e V4 (adaptOsHeader) exibem os mesmos textos", () => {
    for (const os of [osRetroativa(), osRetroativa({ aberturaV3: { recepcao: {} }, sla: { prazo: "2026-10-06T17:00:00.000Z", origemV3: "automatico" } })]) {
      const v3 = lerRecepcaoV3(os);
      const v4 = adaptOsHeader(os);
      expect(v3.entradaRotulo).toBe(v4.entradaRotulo);
      expect(v3.entradaTexto).toBe(v4.entrada);
      expect(v3.previsaoTexto || "Não informada").toBe(v4.previsao);
      expect(v3.prazoInternoTexto).toBe(v4.prazoInterno);
    }
  });
});

describe("D21 — documentos: entrada/entrega/proposta corretas; emissão/cadastro reais", () => {
  const AGORA = new Date("2026-10-04T18:00:00.000Z");

  it("OS impressa: entrada operacional (só-dia), previsão combinada; 'Criada' = cadastro real; 'Impressa' = agora", () => {
    const doc = montarDocumentoOSV3(osRetroativa(), undefined, { now: AGORA });
    expect(doc.recepcao.entradaTexto).toBe("24/09/2026");
    expect(doc.recepcao.previsaoTexto).toBe("28/09/2026 18:00");
    expect(doc.criadoEm).toBe("2026-10-04T17:00:00.000Z");
    expect(doc.impressoEm).toBe(AGORA.toISOString());
  });

  it("prazo interno nunca é impresso como previsão de entrega", () => {
    const doc = montarDocumentoOSV3(osRetroativa({ aberturaV3: { recepcao: {} }, sla: { prazo: "2026-10-06T17:00:00.000Z", origemV3: "automatico" } }), undefined, { now: AGORA });
    expect(doc.recepcao.previsaoTexto).toBe("");
  });

  it("Termo de Entrega usa a data EFETIVA; emissão continua sendo agora", () => {
    const termo = montarTermoEntregaV3(osRetroativa(), undefined, { now: AGORA });
    expect(termo.dataEntregaTexto).toBe("29/09/2026");
    expect(termo.impressoEm).toBe(AGORA.toISOString());
  });

  it("etiqueta usa a entrada operacional com rótulo honesto", () => {
    expect(montarEtiquetaV3(osRetroativa())).toMatchObject({ entradaRotulo: "Entrada", entradaTexto: "24/09/2026" });
    expect(montarEtiquetaV3(osRetroativa({ aberturaV3: undefined }))).toMatchObject({ entradaRotulo: "Cadastro" });
  });

  it("orçamento ao cliente: 'Data do orçamento' (proposta) separada de 'Emitido' (registro real); validade no fuso da loja", () => {
    process.env.TZ = "Asia/Tokyo";
    const proposta = data("2026-09-10");
    const os = osRetroativa({
      comercialV4: { tipo: "orcamento_pre_os", statusComercial: "enviado", dataProposta: proposta.iso, dataPropostaMeta: proposta.meta },
      orcamento: {
        id: "o",
        status: "enviado",
        pecas: [],
        servicos: [{ id: "s1", descricao: "Tela", valor: 300 }],
        desconto: 0,
        total: 300,
        criadoEm: "2026-10-04T17:00:00.000Z",
        enviadoEm: "2026-10-04T17:05:00.000Z",
        validoAte: fimDoDiaLojaIsoV3("2026-09-17"),
      },
    });
    const view = montarOrcamentoClienteViewV4(os)!;
    expect(view.dataPropostaTexto).toBe("10/09/2026");
    expect(view.dataCriacao).toBe("2026-10-04T17:00:00.000Z");
    expect(view.validade).toMatchObject({ validoAteTexto: "17/09/2026", vencida: true });
  });
});
