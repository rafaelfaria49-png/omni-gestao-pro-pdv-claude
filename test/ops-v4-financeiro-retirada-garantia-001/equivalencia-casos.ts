// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — matriz de casos da EQUIVALÊNCIA de decisões.
//
// As MESMAS entradas alimentam o gerador do baseline (rodado uma vez sobre a main
// ANTES da mudança, `equivalencia.gerar.ts`) e o teste de equivalência
// (`equivalencia.test.ts`). Massa sintética; nenhuma loja/OS real.
import type { OrdemServico } from "@/types/os";
import { criarAutorizacaoEntregaSemCobrancaV3 } from "@/lib/operacoes-v3/delivery-financial-guard";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import type { ProjectFinancialOSV4Input } from "@/lib/operacoes-v4/financial-projection";

export const LOJA = "loja-sintetica-frg";
export const OS_ID = "os-sintetica-frg";
export const LOADED_AT = "2026-10-09T12:00:00.000Z";
const KEY = localKeyContaReceberOSV3(LOJA, OS_ID);

type Status = "rascunho" | "enviado" | "aprovado" | "recusado";

export function orcamento(status: Status, total = 420, extra: Record<string, unknown> = {}) {
  return {
    id: "orc-frg",
    status,
    sintetizado: false,
    total,
    desconto: 0,
    servicos: total > 0 ? [{ id: "serv-1", descricao: "Troca de Tela", valor: total }] : [],
    pecas: [],
    criadoEm: "2026-09-18T10:00:00.000Z",
    ...extra,
  };
}

export function os(extra: Record<string, unknown> = {}): OrdemServico & Record<string, unknown> {
  return {
    id: OS_ID,
    codigo: "OS-SINT-00025",
    storeId: LOJA,
    status: "pronta",
    operacaoStatusV3: "pronta",
    cliente: { nome: "Cliente Sintético" },
    timeline: [],
    ...extra,
  } as unknown as OrdemServico & Record<string, unknown>;
}

export function titulo(valor: number, status: string, historico: unknown[] = [], extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return {
    id: "cr-frg",
    storeId: LOJA,
    localKey: KEY,
    valor,
    status,
    payload: { ordemServicoId: OS_ID, historico, ...extra },
    ...over,
  };
}

/** Evento que `receberOSV3` grava na timeline da OS (mesma `operacaoId` da baixa). */
export function eventoRecebimento(operacaoId: string, valor: number, forma = "dinheiro", criadoEm = "2026-10-05T21:37:38.000Z") {
  return {
    id: `ev-${operacaoId}`,
    tipo: "operacao_cobranca_gerada",
    autor: "Operador Sintético",
    autorTipo: "usuario",
    conteudo: `Quitação: ${forma} R$ ${valor.toFixed(2)} (total R$ ${valor.toFixed(2)}) · saldo R$ 0.00 (quitado).`,
    criadoEm,
    metadata: { operacaoId, total: valor, linhas: [{ forma, valor }], op: "liquidar", intencao: "quitacao" },
  };
}

const LIQUIDACAO = { tipo: "liquidacao", valor: 420, loteId: "op-1", at: "2026-10-05T21:37:39.000Z", userLabel: "Operador Sintético" };

function caso(nome: string, input: Partial<ProjectFinancialOSV4Input>): { nome: string; input: ProjectFinancialOSV4Input } {
  return {
    nome,
    input: {
      storeId: LOJA,
      osId: OS_ID,
      osCode: "OS-SINT-00025",
      operationalStatus: "pronta",
      payload: os({ orcamento: orcamento("aprovado") }),
      prismaValorTotal: 420,
      titulo: null,
      loadedAt: LOADED_AT,
      ...input,
    },
  };
}

const semCobranca = criarAutorizacaoEntregaSemCobrancaV3({
  solicitacao: { categoria: "cortesia", motivo: "Cortesia sintética" },
  storeId: LOJA,
  autorizadoPorId: "u-1",
  autorizadoPorNome: "Gerente Sintético",
  autorizadoEm: "2026-10-01T12:00:00.000Z",
});

export const CASOS: Array<{ nome: string; input: ProjectFinancialOSV4Input }> = [
  caso("A1 rascunho + título liquidado (forma da OS-2026-00025)", {
    payload: os({ orcamento: orcamento("rascunho"), operacaoStatusV3: "recebida", timeline: [eventoRecebimento("op-1", 420)] }),
    titulo: titulo(420, "pago", [LIQUIDACAO]),
  }),
  caso("rascunho sem título", { payload: os({ orcamento: orcamento("rascunho") }) }),
  caso("enviado + título liquidado", { payload: os({ orcamento: orcamento("enviado") }), titulo: titulo(420, "pago", [LIQUIDACAO]) }),
  caso("enviado vencido + título liquidado", {
    payload: os({ orcamento: orcamento("enviado", 420, { validoAte: "2026-09-20T12:00:00.000Z" }) }),
    titulo: titulo(420, "pago", [LIQUIDACAO]),
  }),
  caso("recusado + título liquidado", { payload: os({ orcamento: orcamento("recusado") }), titulo: titulo(420, "pago", [LIQUIDACAO]) }),
  caso("rascunho + título liquidado com valor divergente da coluna", {
    payload: os({ orcamento: orcamento("rascunho") }),
    prismaValorTotal: 380,
    titulo: titulo(420, "pago", [LIQUIDACAO]),
  }),
  caso("A2 aprovado + título liquidado", {
    payload: os({ orcamento: orcamento("aprovado"), timeline: [eventoRecebimento("op-1", 420)] }),
    titulo: titulo(420, "pago", [LIQUIDACAO]),
  }),
  caso("aprovado + parcial", {
    payload: os({ orcamento: orcamento("aprovado") }),
    titulo: titulo(420, "parcial", [{ tipo: "pagamento", valor: 100, loteId: "op-p" }]),
  }),
  caso("aprovado + título pendente", { titulo: titulo(420, "pendente", []) }),
  caso("aprovado sem título", {}),
  caso("sem orçamento real, coluna 420 + título liquidado (legado)", {
    payload: os({ valorTotal: 420 }),
    titulo: titulo(420, "pago", [LIQUIDACAO]),
  }),
  caso("sem orçamento e sem preço", { payload: os({}), prismaValorTotal: 0 }),
  caso("prévia sintetizada", { payload: os({ orcamento: { ...orcamento("rascunho"), sintetizado: true }, valorTotal: 420 }) }),
  caso("aprovado total zero sem autorização", { payload: os({ orcamento: orcamento("aprovado", 0) }), prismaValorTotal: 0 }),
  caso("aprovado total zero com cortesia autorizada", {
    payload: os({ orcamento: orcamento("aprovado", 0), entregaSemCobrancaV3: semCobranca }),
    prismaValorTotal: 0,
  }),
  caso("A3 título de outra loja", { titulo: titulo(420, "pago", [LIQUIDACAO], {}, { storeId: "outra-loja" }) }),
  caso("A3 título de outra OS", { titulo: titulo(420, "pago", [LIQUIDACAO], { ordemServicoId: "outra-os" }) }),
  caso("A3 título com valor divergente", { titulo: titulo(400, "pago", [{ tipo: "liquidacao", valor: 400, loteId: "op-1" }]) }),
  caso("A3 histórico inválido", { titulo: titulo(420, "pago", [{ tipo: "liquidacao", valor: "x" }]) }),
  caso("A3 histórico não-array", { titulo: titulo(420, "pago", [], { historico: "corrompido" }) }),
  caso("A3 estorno com referência inexistente", {
    titulo: titulo(420, "parcial", [{ tipo: "pagamento", valor: 200, loteId: "op-a" }, { tipo: "estorno_pagamento", valor: 100, refHistoricoIndex: 7 }]),
  }),
  caso("A3 recebido acima do título", {
    titulo: titulo(420, "pago", [{ tipo: "pagamento", valor: 300, loteId: "op-a" }, { tipo: "pagamento", valor: 300, loteId: "op-b" }]),
  }),
  caso("A3 status pago com saldo aberto", { titulo: titulo(420, "pago", [{ tipo: "pagamento", valor: 100, loteId: "op-a" }]) }),
  caso("A3 falha de leitura do título", { falhaLeituraTitulo: true }),
  caso("título cancelado", { titulo: titulo(420, "cancelado", []) }),
  caso("título estornado", { titulo: titulo(420, "estornado", [LIQUIDACAO, { tipo: "estorno_pagamento", valor: 420, refHistoricoIndex: 0 }]) }),
  caso("A6 estornado + reposição externa do mesmo valor", {
    payload: os({ orcamento: orcamento("aprovado"), timeline: [eventoRecebimento("op-1", 420)] }),
    titulo: titulo(420, "pago", [LIQUIDACAO, { tipo: "estorno_pagamento", valor: 420, refHistoricoIndex: 0 }, { tipo: "pagamento", valor: 420 }]),
  }),
  caso("misto: baixa sem loteId + marcador a prazo", {
    payload: os({
      orcamento: orcamento("aprovado"),
      aPrazoV3: {
        modo: "a_prazo", status: "pendente", valor: 220, vencimento: "2026-11-10", tituloLocalKey: KEY,
        autorizadoEntrega: true, autorizadoEm: "2026-10-05T12:00:00.000Z", autorizadoPor: "Operador", operacaoId: "op-m",
      },
    }),
    titulo: titulo(420, "parcial", [
      { tipo: "pagamento", valor: 200 },
      { tipo: "a_prazo_autorizado", operacaoId: "op-m", recebidoAgora: 200 },
    ]),
  }),
  caso("baixa externa sem identidade (Financeiro)", { titulo: titulo(420, "pago", [{ tipo: "liquidacao", valor: 420 }]) }),
  caso("A4 forma débito no histórico do título", {
    titulo: titulo(420, "pago", [{ tipo: "liquidacao", valor: 420, loteId: "op-1", formaPagamento: "debito" }]),
  }),
];
