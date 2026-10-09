import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { criarAutorizacaoEntregaSemCobrancaV3 } from "@/lib/operacoes-v3/delivery-financial-guard";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import { projectFinancialOSV4, type ProjectFinancialOSV4Input } from "./financial-projection";

const storeId = "store-a";
const osId = "os-1";
const localKey = localKeyContaReceberOSV3(storeId, osId);

function payload(total = 300, extra: Record<string, unknown> = {}): OrdemServico & Record<string, unknown> {
  return {
    id: osId,
    codigo: "OS-TESTE",
    status: "pronta",
    operacaoStatusV3: "pronta",
    orcamento: {
      id: "orc-1",
      status: "aprovado",
      sintetizado: false,
      total,
      desconto: 0,
      servicos: total > 0 ? [{ id: "s1", descricao: "Serviço", valor: total }] : [],
      pecas: [],
      criadoEm: "2026-07-01T10:00:00.000Z",
    },
    timeline: [],
    ...extra,
  } as unknown as OrdemServico & Record<string, unknown>;
}

function title(total = 300, status = "pendente", historico: unknown[] = [], extra: Record<string, unknown> = {}) {
  return {
    id: "cr-1",
    storeId,
    localKey,
    valor: total,
    status,
    payload: { ordemServicoId: osId, historico, ...extra },
  };
}

function project(over: Partial<ProjectFinancialOSV4Input> = {}) {
  return projectFinancialOSV4({
    storeId,
    osId,
    osCode: "OS-TESTE",
    operationalStatus: "pronta",
    payload: payload(),
    prismaValorTotal: 300,
    titulo: title(),
    loadedAt: "2026-07-15T12:00:00.000Z",
    ...over,
  });
}

describe("FinancialProjectionOSV4 — contrato puro e reconciliação", () => {
  it("caso A: preserva total comercial e marca título divergente como INCONSISTENT", () => {
    const result = project({ payload: payload(825), prismaValorTotal: 825, titulo: title(0) });
    expect(result).toMatchObject({
      version: 1,
      expectedTotal: 825,
      approvedBudgetTotal: 825,
      osColumnTotal: 825,
      receivableTotal: 0,
      financialStatus: "INCONSISTENT",
      consistencyStatus: "INCONSISTENT",
      canDeliver: false,
      deliveryDecision: "BLOCK_INCONSISTENT",
    });
  });

  it("caso B/F: CR quitada prevalece sem pagamentoV3 e conserva Dinheiro + Pix", () => {
    const result = project({
      payload: payload(280),
      prismaValorTotal: 280,
      titulo: title(280, "pago", [
        { tipo: "pagamento", valor: 200, formaPagamento: "dinheiro", at: "2026-07-15T10:00:00.000Z" },
        { tipo: "pagamento", valor: 80, formaPagamento: "pix", at: "2026-07-15T11:00:00.000Z" },
      ]),
    });
    expect(result).toMatchObject({ financialStatus: "PAID", receivedTotal: 280, balance: 0, canDeliver: true });
    expect(result.paymentMethods.map((item) => item.label)).toEqual(["Dinheiro", "Pix"]);
    expect(result.financialEvents).toHaveLength(2);
  });

  it("caso C: deriva Débito do histórico estruturado do título", () => {
    const result = project({ titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300, formaPagamento: "debito" }]) });
    expect(result.financialStatus).toBe("PAID");
    expect(result.paymentMethods).toEqual([expect.objectContaining({ label: "Débito", source: "RECEIVABLE_HISTORY" })]);
  });

  it("caso D: total positivo sem título é CHARGE_NOT_CREATED, nunca sem cobrança", () => {
    expect(project({ titulo: null })).toMatchObject({
      expectedTotal: 300,
      financialStatus: "CHARGE_NOT_CREATED",
      consistencyStatus: "INCOMPLETE",
      canReceive: false,
      canDeliver: false,
    });
  });

  it("caso E: pagamento parcial calcula recebido e saldo pela CR", () => {
    expect(project({ titulo: title(300, "parcial", [{ tipo: "pagamento", valor: 100, formaPagamento: "pix" }]) })).toMatchObject({
      financialStatus: "PARTIAL",
      receivedTotal: 100,
      balance: 200,
      canReceive: true,
      canDeliver: false,
    });
  });

  it("pagamentos e estornos expõem bruto estornado e saldo líquido", () => {
    const result = project({ titulo: title(300, "parcial", [
      { tipo: "liquidacao", valor: 300, formaPagamento: "credito" },
      { tipo: "estorno_pagamento", valor: 100 },
    ]) });
    expect(result).toMatchObject({ financialStatus: "PARTIAL", receivedTotal: 200, reversedTotal: 100, balance: 100 });
    expect(result.financialEvents.map((event) => event.type)).toEqual(["liquidacao", "estorno_pagamento"]);
  });

  it("caso G: autorização a prazo válida permite entrega sem fingir quitação", () => {
    const result = project({
      payload: payload(300, {
        aPrazoV3: {
          modo: "a_prazo", status: "pendente", valor: 300, vencimento: "2026-08-15",
          tituloLocalKey: localKey, autorizadoEntrega: true, autorizadoEm: "2026-07-15T10:00:00.000Z", autorizadoPor: "Operador",
        },
      }),
      titulo: title(300, "pendente", [{ tipo: "a_prazo_autorizado", valor: 300 }]),
    });
    expect(result).toMatchObject({
      financialStatus: "AUTHORIZED_CREDIT", authorizedCredit: true,
      receivedTotal: 0, balance: 300, canDeliver: true, deliveryDecision: "ALLOW_AUTHORIZED_CREDIT",
    });
    expect(result.installments).toEqual([
      expect.objectContaining({ number: "1", dueAt: "2026-08-15", amount: 300, status: "pendente" }),
    ]);
  });

  // OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001 (R/P2): o espelho `aPrazoV3` antigo não pode
  // continuar aparecendo como cobrança/parcela pendente quando o título diz outra coisa.
  const aPrazoPendente = (valor: number) => ({
    aPrazoV3: {
      modo: "a_prazo", status: "pendente", valor, vencimento: "2026-11-10",
      tituloLocalKey: localKey, autorizadoEntrega: true, autorizadoEm: "2026-10-03T10:00:00.000Z", autorizadoPor: "Operador",
    },
  });

  it("caso G2: depois da quitação o espelho a prazo não vira parcela nem cobrança", () => {
    const result = project({
      payload: payload(400, aPrazoPendente(50)),
      prismaValorTotal: 400,
      titulo: title(400, "pago", [
        { tipo: "pagamento", valor: 350 },
        { tipo: "a_prazo_autorizado", valor: 50 },
        { tipo: "liquidacao", valor: 50 },
      ]),
    });
    expect(result).toMatchObject({ financialStatus: "PAID", receivedTotal: 400, balance: 0, authorizedCredit: false, collectionMode: null });
    expect(result.installments).toEqual([]);
  });

  it("caso G3: estorno deixa a autorização menor que o saldo → sem parcela a prazo", () => {
    const result = project({
      payload: payload(400, aPrazoPendente(50)),
      prismaValorTotal: 400,
      titulo: title(400, "pendente", [
        { tipo: "pagamento", valor: 350 },
        { tipo: "a_prazo_autorizado", valor: 50 },
        { tipo: "estorno_pagamento", valor: 350 },
      ]),
    });
    expect(result).toMatchObject({ balance: 400, authorizedCredit: false, canDeliver: false, collectionMode: null });
    expect(result.installments).toEqual([]);
  });

  it("caso G4: pagamento parcial depois do a prazo → parcela limitada ao saldo real", () => {
    const result = project({
      payload: payload(400, aPrazoPendente(50)),
      prismaValorTotal: 400,
      titulo: title(400, "parcial", [
        { tipo: "pagamento", valor: 350 },
        { tipo: "a_prazo_autorizado", valor: 50 },
        { tipo: "pagamento", valor: 20 },
      ]),
    });
    expect(result).toMatchObject({ financialStatus: "AUTHORIZED_CREDIT", balance: 30, collectionMode: "a_prazo" });
    expect(result.installments).toEqual([expect.objectContaining({ dueAt: "2026-11-10", amount: 30, status: "pendente" })]);
  });

  // R2/P2: parcelas PERSISTIDAS (título do faturamento / payload legado) também são cobrança
  // a vencer — quitado o título, viram histórico; com a prazo vigente, ele prevalece.
  const parcelasFaturamento = [
    { numero: "1", vencimento: "2026-10-10", valor: 200, status: "pendente" },
    { numero: "2", vencimento: "2026-11-10", valor: 200, status: "pendente" },
  ];

  it("caso G5: título quitado com parcelas persistidas e modo legado → sem parcela nem cobrança", () => {
    const result = project({
      payload: payload(400, { ...aPrazoPendente(50), faturamentoModoCobranca: "parcelado", faturamentoParcelas: parcelasFaturamento }),
      prismaValorTotal: 400,
      titulo: title(400, "pago", [
        { tipo: "pagamento", valor: 350 },
        { tipo: "a_prazo_autorizado", valor: 50 },
        { tipo: "liquidacao", valor: 50 },
      ], { parcelas: parcelasFaturamento }),
    });
    expect(result).toMatchObject({ financialStatus: "PAID", balance: 0, collectionMode: null });
    expect(result.installments).toEqual([]);
  });

  it("caso G6: misto ativo → a parcela exibida é o a prazo reconciliado, não o plano persistido", () => {
    const result = project({
      payload: payload(400, aPrazoPendente(50)),
      prismaValorTotal: 400,
      titulo: title(400, "parcial", [
        { tipo: "pagamento", valor: 350 },
        { tipo: "a_prazo_autorizado", valor: 50 },
      ], { parcelas: parcelasFaturamento }),
    });
    expect(result).toMatchObject({ financialStatus: "AUTHORIZED_CREDIT", balance: 50, collectionMode: "a_prazo" });
    expect(result.installments).toEqual([{ number: "1", dueAt: "2026-11-10", amount: 50, status: "pendente" }]);
  });

  it("caso G7: saldo em aberto sem a prazo vigente → plano persistido continua visível (legado)", () => {
    const result = project({
      payload: payload(400, { faturamentoModoCobranca: "parcelado" }),
      prismaValorTotal: 400,
      titulo: title(400, "parcial", [{ tipo: "pagamento", valor: 100 }], { parcelas: parcelasFaturamento }),
    });
    expect(result).toMatchObject({ financialStatus: "PARTIAL", balance: 300, collectionMode: "parcelado" });
    expect(result.installments.map((item) => item.dueAt)).toEqual(["2026-10-10", "2026-11-10"]);
  });

  it("caso H: total zero só vira AUTHORIZED_NO_CHARGE com autorização persistida válida", () => {
    const authorization = criarAutorizacaoEntregaSemCobrancaV3({
      solicitacao: { categoria: "garantia", motivo: "Retorno coberto" },
      storeId,
      autorizadoPorId: "u1",
      autorizadoPorNome: "Operador",
      autorizadoEm: "2026-07-15T10:00:00.000Z",
    });
    const result = project({ payload: payload(0, { entregaSemCobrancaV3: authorization }), prismaValorTotal: 0, titulo: null });
    expect(result).toMatchObject({
      expectedTotal: 0, financialStatus: "AUTHORIZED_NO_CHARGE", authorizedNoCharge: true,
      noChargeCategory: "garantia", noChargeReason: "Retorno coberto", canDeliver: true,
    });
  });

  it("total zero explícito sem autorização é NO_PRICE incompleto", () => {
    expect(project({ payload: payload(0), prismaValorTotal: 0, titulo: null })).toMatchObject({
      financialStatus: "NO_PRICE", consistencyStatus: "INCOMPLETE", canDeliver: false,
    });
  });

  it("caso I: falha de leitura é UNKNOWN e não devolve valores de liquidação permissivos", () => {
    const result = project({ falhaLeituraTitulo: true, titulo: null });
    expect(result).toMatchObject({
      financialStatus: "UNKNOWN", consistencyStatus: "UNKNOWN",
      receivedTotal: null, balance: null, canReceive: false, canDeliver: false,
    });
  });

  it("prioriza split estruturado do PDV sobre snapshot e legado", () => {
    const result = project({
      payload: payload(300, {
        pagamentoV3: { total: 300, recebido: 300, ultimaForma: "Crédito" },
        faturamentoFormaPagamento: "dinheiro",
        timeline: [{
          id: "ev-1", tipo: "operacao_cobranca_gerada", criadoEm: "2026-07-15T12:00:00.000Z",
          metadata: { linhas: [{ forma: "dinheiro", valor: 200 }, { forma: "pix", valor: 100 }] },
        }],
      }),
      titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300 }]),
    });
    expect(result.paymentMethods.map((item) => item.label)).toEqual(["Dinheiro", "Pix"]);
    expect(result.paymentMethods.every((item) => item.source === "PDV_SPLIT")).toBe(true);
  });

  it("representa título cancelado ou estornado explicitamente e mantém entrega bloqueada", () => {
    expect(project({ titulo: title(300, "cancelado") })).toMatchObject({ financialStatus: "CANCELLED", canDeliver: false });
    expect(project({ titulo: title(300, "estornado", [{ tipo: "estorno_titulo" }]) })).toMatchObject({ financialStatus: "REVERSED", canDeliver: false });
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — pagamentos vigentes do título (receivablePayments)", () => {
  it("lista pagamento/liquidação na ordem, com a identidade gravada (loteId)", () => {
    const result = project({ titulo: title(300, "pago", [{ tipo: "pagamento", valor: 100, loteId: "op-1" }, { tipo: "a_prazo_autorizado", valor: 200 }, { tipo: "liquidacao", valor: 200 }]) });
    expect(result.receivablePayments).toEqual([{ amount: 100, operationId: "op-1" }, { amount: 200, operationId: null }]);
  });

  it("estorno remove exatamente o pagamento referido; sem referência, o último vigente", () => {
    const comRef = project({ titulo: title(300, "parcial", [{ tipo: "pagamento", valor: 100, loteId: "a" }, { tipo: "pagamento", valor: 200, loteId: "b" }, { tipo: "estorno_pagamento", valor: 100, refHistoricoIndex: 0 }]) });
    expect(comRef.receivablePayments).toEqual([{ amount: 200, operationId: "b" }]);
    const semRef = project({ titulo: title(300, "parcial", [{ tipo: "pagamento", valor: 100, loteId: "a" }, { tipo: "pagamento", valor: 200, loteId: "b" }, { tipo: "estorno_pagamento", valor: 200 }]) });
    expect(semRef.receivablePayments).toEqual([{ amount: 100, operationId: "a" }]);
  });

  it("rev 13 — baixa do recebimento misto (sem loteId) leva a identidade do marcador gravado com ela; baixa externa segue sem identidade", () => {
    const misto = project({ titulo: title(400, "parcial", [
      { tipo: "pagamento", valor: 350 },
      { tipo: "a_prazo_autorizado", valor: 50, operacaoId: "op-m", recebidoAgora: 350 },
    ]) });
    expect(misto.receivablePayments).toEqual([{ amount: 350, operationId: "op-m" }]);
    // Baixa externa (Financeiro), sem loteId e sem marcador: sem identidade.
    expect(project({ titulo: title(300, "pago", [{ tipo: "pagamento", valor: 100, loteId: "op-1" }, { tipo: "pagamento", valor: 200 }]) }).receivablePayments)
      .toEqual([{ amount: 100, operationId: "op-1" }, { amount: 200, operationId: null }]);
    // Marcador que não descreve ESTA baixa: outro valor recebido, sem operacaoId (a prazo puro), zero recebido, ou não adjacente.
    const semVinculo = [
      [{ tipo: "pagamento", valor: 200 }, { tipo: "a_prazo_autorizado", valor: 50, operacaoId: "op-m", recebidoAgora: 350 }],
      [{ tipo: "pagamento", valor: 200 }, { tipo: "a_prazo_autorizado", valor: 100 }],
      [{ tipo: "pagamento", valor: 200 }, { tipo: "a_prazo_autorizado", valor: 100, operacaoId: "op-m", recebidoAgora: 0 }],
      [{ tipo: "pagamento", valor: 200 }, { tipo: "observacao" }, { tipo: "a_prazo_autorizado", valor: 100, operacaoId: "op-m", recebidoAgora: 200 }],
    ];
    for (const historico of semVinculo) {
      expect(project({ titulo: title(300, "parcial", historico) }).receivablePayments).toEqual([{ amount: 200, operationId: null }]);
    }
  });

  it("referência a pagamento inexistente/já estornado ou histórico inválido = ilegível (null); sem título = []", () => {
    const duplo = project({ titulo: title(300, "parcial", [{ tipo: "pagamento", valor: 100 }, { tipo: "estorno_pagamento", valor: 100, refHistoricoIndex: 0 }, { tipo: "estorno_pagamento", valor: 100, refHistoricoIndex: 0 }]) });
    expect(duplo.receivablePayments).toBeNull();
    expect(project({ titulo: title(300, "pendente", "x" as unknown as unknown[]) }).receivablePayments).toBeNull();
    expect(project({ titulo: null }).receivablePayments).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — dimensões aditivas.
// Fatos do título, situação comercial e impedimento estruturado; a decisão
// legada fica intacta (equivalência completa no harness dedicado do GOAL).
// ---------------------------------------------------------------------------

const orcamentoRascunho = { id: "orc-1", status: "rascunho", sintetizado: false, total: 300, desconto: 0, servicos: [{ id: "s1", descricao: "Troca de Tela", valor: 300 }], pecas: [], criadoEm: "2026-07-01T10:00:00.000Z" };
const rascunho = (extra: Record<string, unknown> = {}) => payload(300, { orcamento: orcamentoRascunho, ...extra });
const recebimentoOS = (operacaoId: string, valor: number, forma = "dinheiro") => ({
  id: `ev-${operacaoId}`,
  tipo: "operacao_cobranca_gerada",
  autor: "Operador",
  conteudo: `Quitação: ${forma} R$ ${valor.toFixed(2)}`,
  criadoEm: "2026-07-15T11:00:00.000Z",
  metadata: { operacaoId, total: valor, linhas: [{ forma, valor }] },
});

describe("GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — fatos, comercial e impedimento", () => {
  it("A1: rascunho + título liquidado mostra os fatos verificados e a pendência comercial, sem mudar a decisão", () => {
    const r = project({
      payload: rascunho({ timeline: [recebimentoOS("op-1", 300)] }),
      titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300, loteId: "op-1" }]),
    });
    expect(r).toMatchObject({ financialStatus: "UNKNOWN", deliveryDecision: "BLOCK_UNKNOWN", receivedTotal: null, balance: null, canDeliver: false, canReceive: false });
    expect(r.fatos).toMatchObject({ tituloEncontrado: true, verificavel: true, motivo: null, valorTitulo: 300, recebidoLiquido: 300, saldoTitulo: 0, liquidado: true, semMeioIdentificado: 0 });
    expect(r.fatos?.meios).toEqual([{ label: "Dinheiro", valor: 300, operacaoId: "op-1", fonte: "OS_TIMELINE" }]);
    expect(r.comercial).toMatchObject({ orcamento: "rascunho", totalOrcamento: 300, totalAprovado: null, confereComTitulo: true, divergencias: [] });
    expect(r.acoes).toEqual({ podeReceber: false, podeEntregar: false, impedimento: { codigo: "APROVACAO_COMERCIAL_PENDENTE", destino: "comercial" } });
  });

  it("status pago isolado, sem baixa no histórico, NÃO vira pagamento", () => {
    const r = project({ payload: rascunho(), titulo: title(300, "pago", []) });
    expect(r.fatos).toMatchObject({ verificavel: false, motivo: "HISTORICO_INVALIDO", recebidoLiquido: null, saldoTitulo: null, temRegistroDePagamento: false });
  });

  it("timeline ou espelho pagamentoV3 sem título não inferem pagamento", () => {
    const r = project({
      payload: rascunho({ timeline: [recebimentoOS("op-1", 300)], pagamentoV3: { total: 300, recebido: 300, saldo: 0, status: "quitado" } }),
      titulo: null,
    });
    expect(r.fatos).toMatchObject({ tituloEncontrado: false, verificavel: false, recebidoLiquido: null, saldoTitulo: null });
  });

  it("A3: vínculo, histórico, estorno e excesso viram motivo estruturado e valores nulos (nunca zero)", () => {
    const casos: Array<[Partial<ProjectFinancialOSV4Input>, string]> = [
      [{ titulo: { ...title(300, "pago", [{ tipo: "liquidacao", valor: 300 }]), storeId: "outra" } }, "TITULO_NAO_VINCULADO"],
      [{ titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300 }], { ordemServicoId: "outra-os" }) }, "TITULO_NAO_VINCULADO"],
      [{ titulo: title(300, "pago", [{ tipo: "liquidacao", valor: "x" }]) }, "HISTORICO_INVALIDO"],
      [{ titulo: title(300, "parcial", [{ tipo: "pagamento", valor: 200 }, { tipo: "estorno_pagamento", valor: 100, refHistoricoIndex: 9 }]) }, "ESTORNO_AMBIGUO"],
      [{ titulo: title(300, "parcial", [{ tipo: "pagamento", valor: 200 }, { tipo: "estorno_pagamento", valor: 50 }]) }, "ESTORNO_AMBIGUO"],
      [{ titulo: title(300, "pago", [{ tipo: "pagamento", valor: 200 }, { tipo: "pagamento", valor: 200 }]) }, "RECEBIDO_ACIMA_DO_TITULO"],
      [{ falhaLeituraTitulo: true }, "FALHA_LEITURA"],
      [{ titulo: title(300, "cancelado", []) }, "COBRANCA_CANCELADA"],
    ];
    for (const [over, motivo] of casos) {
      const r = project({ payload: rascunho(), ...over });
      expect(r.fatos, motivo).toMatchObject({ verificavel: false, motivo, recebidoLiquido: null, saldoTitulo: null, valorTitulo: null, liquidado: false });
      expect(r.canDeliver).toBe(false);
    }
  });

  it("meio do pagamento só por identidade da operação: valor igual com outra operação fica sem meio", () => {
    const r = project({
      payload: payload(300, { timeline: [recebimentoOS("op-outra", 300, "pix")] }),
      titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300, loteId: "op-1" }]),
    });
    expect(r.fatos).toMatchObject({ verificavel: true, meios: [], semMeioIdentificado: 300 });
  });

  it("A4: forma registrada na própria baixa do título prevalece; nada é trocado", () => {
    const r = project({ titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300, loteId: "op-1", formaPagamento: "debito" }]) });
    expect(r.fatos?.meios).toEqual([{ label: "Débito", valor: 300, operacaoId: "op-1", fonte: "RECEIVABLE_HISTORY" }]);
  });

  it("A5: mesma operação no título e na timeline vira UM item de histórico; eventos auditáveis preservados", () => {
    const r = project({
      payload: payload(300, { timeline: [recebimentoOS("op-1", 300)] }),
      titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300, loteId: "op-1", at: "2026-07-15T11:00:01.000Z" }]),
    });
    expect(r.financialEvents).toHaveLength(2);
    expect(r.historico).toHaveLength(1);
    expect(r.historico?.[0]).toMatchObject({ operacaoId: "op-1", valor: 300, meio: "Dinheiro", fontes: ["OS_TIMELINE", "RECEIVABLE"] });
    expect(r.historico?.[0]?.eventIds).toHaveLength(2);
  });

  it("A5: sem identidade comprovada nada se agrupa — mesmo valor e horário viram fontes separadas", () => {
    const evento = { ...recebimentoOS("op-1", 300), metadata: { total: 300, linhas: [{ forma: "dinheiro", valor: 300 }] } };
    const r = project({
      payload: payload(300, { timeline: [evento] }),
      titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300, at: "2026-07-15T11:00:00.000Z" }]),
    });
    expect(r.historico).toHaveLength(2);
    expect(r.historico?.map((h) => h.fontes)).toEqual(expect.arrayContaining([["RECEIVABLE"], ["OS_TIMELINE"]]));
  });

  it("orçamento recusado, vencido e preço ausente apontam para o comercial; divergência título × fontes vira divergência estruturada", () => {
    const recusado = project({ payload: payload(300, { orcamento: { ...orcamentoRascunho, status: "recusado" } }), titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300 }]) });
    expect(recusado.acoes?.impedimento).toEqual({ codigo: "ORCAMENTO_RECUSADO", destino: "comercial" });
    const vencido = project({ payload: payload(300, { orcamento: { ...orcamentoRascunho, status: "enviado", validoAte: "2026-07-01T00:00:00.000Z" } }) });
    expect(vencido.comercial?.orcamento).toBe("expirado");
    expect(vencido.acoes?.impedimento).toEqual({ codigo: "ORCAMENTO_EXPIRADO", destino: "comercial" });
    const semPreco = project({ payload: { id: osId, status: "pronta" } as unknown as OrdemServico & Record<string, unknown>, prismaValorTotal: 0, titulo: null });
    expect(semPreco.acoes?.impedimento).toEqual({ codigo: "PRECO_AUSENTE", destino: "comercial" });
    const divergente = project({ payload: rascunho(), prismaValorTotal: 280, titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300 }]) });
    expect(divergente.acoes?.impedimento).toEqual({ codigo: "VALORES_DIVERGENTES", destino: "financeiro" });
    expect(divergente.comercial?.divergencias.map((d) => d.codigo)).toEqual(["FONTES_DE_PRECO"]);
  });
});

describe("GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R1: leitura estrita dos fatos do título", () => {
  it("R1-1: payload nulo, histórico não-array, entrada nula ou sem tipo NÃO viram fato verificável", () => {
    const semPayload = project({ payload: rascunho(), titulo: { ...title(300, "pendente"), payload: null } });
    expect(semPayload.fatos).toMatchObject({ verificavel: false, motivo: "HISTORICO_INVALIDO", recebidoLiquido: null, saldoTitulo: null });
    for (const historico of [[{ tipo: "liquidacao", valor: 300 }, null], [{ tipo: "liquidacao", valor: 300 }, {}], [{ valor: 300 }]]) {
      const r = project({ payload: rascunho(), titulo: title(300, "pago", historico as unknown[]) });
      expect(r.fatos, JSON.stringify(historico)).toMatchObject({ verificavel: false, motivo: "HISTORICO_INVALIDO", liquidado: false, recebidoLiquido: null });
    }
    const naoArray = project({ payload: rascunho(), titulo: title(300, "pendente", [], { historico: { 0: { tipo: "liquidacao" } } }) });
    expect(naoArray.fatos?.motivo).toBe("HISTORICO_INVALIDO");
  });

  it("R1-1: título recém-criado (sem histórico, pendente, desta OS) é fato verificável de zero recebido", () => {
    const r = project({ payload: rascunho(), titulo: { ...title(300, "pendente"), payload: { ordemServicoId: osId, origem: "operacoes-v3" } } });
    expect(r.fatos).toMatchObject({ verificavel: true, recebidoLiquido: 0, saldoTitulo: 300, liquidado: false });
  });

  it("R1-1: sem ordemServicoId desta OS não há vínculo positivo", () => {
    const r = project({ payload: rascunho(), titulo: { ...title(300, "pago", [{ tipo: "liquidacao", valor: 300 }]), payload: { historico: [{ tipo: "liquidacao", valor: 300 }] } } });
    expect(r.fatos).toMatchObject({ verificavel: false, motivo: "TITULO_NAO_VINCULADO" });
  });

  it("R1-2: estorno sem referência, com referência a baixa já estornada ou com valor diferente = ESTORNO_AMBIGUO", () => {
    const casos: unknown[][] = [
      [{ tipo: "pagamento", valor: 150, loteId: "op-a" }, { tipo: "pagamento", valor: 150, loteId: "op-b" }, { tipo: "estorno_pagamento", valor: 150 }],
      [{ tipo: "pagamento", valor: 200, loteId: "op-a" }, { tipo: "estorno_pagamento", valor: 100, refHistoricoIndex: 0 }],
      [{ tipo: "pagamento", valor: 200, loteId: "op-a" }, { tipo: "estorno_pagamento", valor: 200, refHistoricoIndex: 0 }, { tipo: "estorno_pagamento", valor: 200, refHistoricoIndex: 0 }],
      // estornos de valores trocados que se compensam na soma
      [{ tipo: "pagamento", valor: 100, loteId: "op-a" }, { tipo: "pagamento", valor: 200, loteId: "op-b" }, { tipo: "estorno_pagamento", valor: 200, refHistoricoIndex: 0 }, { tipo: "estorno_pagamento", valor: 100, refHistoricoIndex: 1 }],
    ];
    for (const historico of casos) {
      const r = project({ payload: rascunho(), titulo: title(300, "parcial", historico) });
      expect(r.fatos, JSON.stringify(historico)).toMatchObject({ verificavel: false, motivo: "ESTORNO_AMBIGUO", pagamentosVigentes: null, recebidoLiquido: null });
    }
  });

  it("R1-2: estorno canônico (referência + mesmo valor) segue verificável e remove exatamente a baixa referida", () => {
    const r = project({
      payload: rascunho(),
      titulo: title(300, "parcial", [{ tipo: "pagamento", valor: 100, loteId: "op-a" }, { tipo: "pagamento", valor: 200, loteId: "op-b" }, { tipo: "estorno_pagamento", valor: 100, refHistoricoIndex: 0 }]),
    });
    expect(r.fatos).toMatchObject({ verificavel: true, recebidoBruto: 300, estornado: 100, recebidoLiquido: 200, saldoTitulo: 100 });
    expect(r.fatos?.pagamentosVigentes).toEqual([{ amount: 200, operationId: "op-b" }]);
  });

  it("R1-3: PAID legado com estorno de referência inexistente + reposição → decisão legada intacta, fatos em conferência", () => {
    const r = project({
      payload: payload(300, { timeline: [recebimentoOS("op-1", 300)] }),
      titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300, loteId: "op-1" }, { tipo: "estorno_pagamento", valor: 300, refHistoricoIndex: 9 }, { tipo: "pagamento", valor: 300 }]),
    });
    expect(r).toMatchObject({ financialStatus: "PAID", canDeliver: true, receivedTotal: 300 });
    expect(r.fatos).toMatchObject({ tituloEncontrado: true, verificavel: false, motivo: "ESTORNO_AMBIGUO" });
  });
});

describe("GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R2: valor monetário dos fatos sem coerção", () => {
  const legado = (r: ReturnType<typeof project>) => ({
    deliveryDecision: r.deliveryDecision, canDeliver: r.canDeliver, canReceive: r.canReceive,
    financialStatus: r.financialStatus, receivedTotal: r.receivedTotal, balance: r.balance,
  });

  it("R2-1: valor de baixa em array, booleano, texto ou objeto NÃO comprova pagamento", () => {
    for (const valor of [[300], true, "300", { valor: 300 }]) {
      const r = project({ payload: payload(300, { timeline: [recebimentoOS("op-1", 300)] }), titulo: title(300, "pago", [{ tipo: "liquidacao", valor, loteId: "op-1" }]) });
      expect(r.fatos, JSON.stringify(valor)).toMatchObject({ verificavel: false, motivo: "HISTORICO_INVALIDO", recebidoLiquido: null, liquidado: false, pagamentosVigentes: null });
    }
  });

  it("R2-1: a leitura legada (decisão) segue a mesma — só os fatos ficam estritos", () => {
    const numero = project({ payload: payload(300, { timeline: [recebimentoOS("op-1", 300)] }), titulo: title(300, "pago", [{ tipo: "liquidacao", valor: 300, loteId: "op-1" }]) });
    const coagido = project({ payload: payload(300, { timeline: [recebimentoOS("op-1", 300)] }), titulo: title(300, "pago", [{ tipo: "liquidacao", valor: [300], loteId: "op-1" }]) });
    expect(legado(coagido)).toEqual(legado(numero));
    expect(numero.fatos?.verificavel).toBe(true);
    expect(coagido.fatos?.verificavel).toBe(false);
  });

  it("R2-1: estorno com valor coagido é ambíguo; valor do título que não é número não abre vínculo", () => {
    const estorno = project({
      payload: rascunho(),
      titulo: title(300, "parcial", [{ tipo: "pagamento", valor: 100, loteId: "op-a" }, { tipo: "pagamento", valor: 200, loteId: "op-b" }, { tipo: "estorno_pagamento", valor: [100], refHistoricoIndex: 0 }]),
    });
    expect(estorno.fatos).toMatchObject({ verificavel: false, motivo: "ESTORNO_AMBIGUO" });
    for (const valor of ["300", [300], true]) {
      const r = project({ payload: rascunho(), titulo: { ...title(300, "pago", [{ tipo: "liquidacao", valor: 300 }]), valor } as unknown as ProjectFinancialOSV4Input["titulo"] });
      expect(r.fatos, JSON.stringify(valor)).toMatchObject({ verificavel: false, motivo: "TITULO_NAO_VINCULADO", recebidoLiquido: null });
    }
  });
});

describe("GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R3: meios dos fatos estritos, sem atribuição fictícia", () => {
  const evento = (operacaoId: string, total: unknown, linhas: unknown) => ({
    id: `ev-${operacaoId}`, tipo: "operacao_cobranca_gerada", autor: "Operador", conteudo: "Recebimento",
    criadoEm: "2026-07-15T11:00:00.000Z", metadata: { operacaoId, total, linhas },
  });
  const liquidado = (extra: Record<string, unknown> = {}) => title(420, "pago", [{ tipo: "liquidacao", valor: 420, loteId: "op-1", ...extra }]);
  const legado = (r: ReturnType<typeof project>) => ({
    deliveryDecision: r.deliveryDecision, canDeliver: r.canDeliver, canReceive: r.canReceive, financialStatus: r.financialStatus,
    consistencyStatus: r.consistencyStatus, consistencyIssues: r.consistencyIssues, receivedTotal: r.receivedTotal, balance: r.balance,
  });

  it("R3-P2a: linha do evento da MESMA operação com valor [420] não vira Pix R$ 420", () => {
    const r = project({ payload: payload(420, { timeline: [evento("op-1", 420, [{ forma: "pix", valor: [420] }])] }), prismaValorTotal: 420, titulo: liquidado() });
    expect(r.fatos).toMatchObject({ verificavel: true, recebidoLiquido: 420 });
    expect(r.fatos?.meios).toEqual([]);
    expect(r.fatos?.semMeioIdentificado).toBe(420);
  });

  it("R3-P2b: baixa de R$ 420 com split só de Pix R$ 100 → Pix R$ 100 + R$ 320 sem meio (nunca Pix R$ 420)", () => {
    for (const campo of ["split", "linhas"]) {
      const r = project({ payload: payload(420), prismaValorTotal: 420, titulo: liquidado({ [campo]: [{ forma: "pix", valor: 100 }] }) });
      expect(r.fatos?.meios, campo).toEqual([{ label: "Pix", valor: 100, operacaoId: "op-1", fonte: "RECEIVABLE_HISTORY" }]);
      expect(r.fatos?.semMeioIdentificado, campo).toBe(320);
    }
  });

  it("R3-P2c: evento da operação com Pix R$ 100 e o resto sem linha → Pix R$ 100 + R$ 320 sem meio", () => {
    const r = project({ payload: payload(420, { timeline: [evento("op-1", 420, [{ forma: "pix", valor: 100 }])] }), prismaValorTotal: 420, titulo: liquidado() });
    expect(r.fatos?.meios).toEqual([{ label: "Pix", valor: 100, operacaoId: "op-1", fonte: "OS_TIMELINE" }]);
    expect(r.fatos?.semMeioIdentificado).toBe(320);
  });

  it("R3-P2d: split completo preserva o valor de cada meio", () => {
    const r = project({
      payload: payload(420, { timeline: [evento("op-1", 420, [{ forma: "pix", valor: 100 }, { forma: "dinheiro", valor: 320 }])] }),
      prismaValorTotal: 420, titulo: liquidado(),
    });
    expect(r.fatos?.meios).toEqual([
      { label: "Pix", valor: 100, operacaoId: "op-1", fonte: "OS_TIMELINE" },
      { label: "Dinheiro", valor: 320, operacaoId: "op-1", fonte: "OS_TIMELINE" },
    ]);
    expect(r.fatos?.semMeioIdentificado).toBe(0);
  });

  it("R3-P2e: valores e formas malformados nunca viram meio nem valor (sem coerção)", () => {
    const invalidos: unknown[] = [true, false, [100], { valor: 100 }, "", "100", null, Number.NaN, Number.POSITIVE_INFINITY, -100, 0];
    for (const valor of invalidos) {
      const doEvento = project({ payload: payload(420, { timeline: [evento("op-1", 420, [{ forma: "pix", valor }, { forma: "dinheiro", valor: 320 }])] }), prismaValorTotal: 420, titulo: liquidado() });
      expect(doEvento.fatos?.meios, `evento ${String(valor)}`).toEqual([{ label: "Dinheiro", valor: 320, operacaoId: "op-1", fonte: "OS_TIMELINE" }]);
      expect(doEvento.fatos?.semMeioIdentificado, `evento ${String(valor)}`).toBe(100);
      const daBaixa = project({ payload: payload(420), prismaValorTotal: 420, titulo: liquidado({ split: [{ forma: "pix", valor }] }) });
      expect(daBaixa.fatos?.meios, `baixa ${String(valor)}`).toEqual([]);
      expect(daBaixa.fatos?.semMeioIdentificado, `baixa ${String(valor)}`).toBe(420);
    }
    for (const forma of [true, 7, ["pix"], { codigo: "pix" }, "  "]) {
      const r = project({ payload: payload(420), prismaValorTotal: 420, titulo: liquidado({ formaPagamento: forma }) });
      expect(r.fatos?.meios, JSON.stringify(forma)).toEqual([]);
      expect(r.fatos?.semMeioIdentificado, JSON.stringify(forma)).toBe(420);
    }
    // total do evento malformado: o vínculo da operação não se comprova
    const totalCoagido = project({ payload: payload(420, { timeline: [evento("op-1", [420], [{ forma: "pix", valor: 420 }])] }), prismaValorTotal: 420, titulo: liquidado() });
    expect(totalCoagido.fatos?.meios).toEqual([]);
  });

  it("R3-P2f: linhas que somam MAIS que a baixa são contraditórias — nada é atribuído", () => {
    const r = project({ payload: payload(420), prismaValorTotal: 420, titulo: liquidado({ split: [{ forma: "pix", valor: 300 }, { forma: "dinheiro", valor: 300 }] }) });
    expect(r.fatos?.meios).toEqual([]);
    expect(r.fatos?.semMeioIdentificado).toBe(420);
  });

  it("R3-P2: forma única da própria baixa, sem split, continua sendo a forma da baixa inteira; decisões idênticas", () => {
    const base = project({ payload: payload(420), prismaValorTotal: 420, titulo: liquidado() });
    const comForma = project({ payload: payload(420), prismaValorTotal: 420, titulo: liquidado({ formaPagamento: "credito" }) });
    const comSplit = project({ payload: payload(420), prismaValorTotal: 420, titulo: liquidado({ split: [{ forma: "pix", valor: [100] }] }) });
    expect(comForma.fatos?.meios).toEqual([{ label: "Crédito", valor: 420, operacaoId: "op-1", fonte: "RECEIVABLE_HISTORY" }]);
    expect(legado(comForma)).toEqual(legado(base));
    expect(legado(comSplit)).toEqual(legado(base));
  });
});

describe("GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R4: orçamento malformado não derruba a projeção", () => {
  const legado = (r: ReturnType<typeof project>) => ({
    deliveryDecision: r.deliveryDecision, canDeliver: r.canDeliver, canReceive: r.canReceive, financialStatus: r.financialStatus,
    consistencyStatus: r.consistencyStatus, receivedTotal: r.receivedTotal, balance: r.balance,
  });
  const comServicos = (servicos: unknown, pecas: unknown = []) =>
    rascunho({ timeline: [recebimentoOS("op-1", 300)], orcamento: { ...orcamentoRascunho, servicos, pecas } });
  const titulo = () => title(300, "pago", [{ tipo: "liquidacao", valor: 300, loteId: "op-1" }]);

  it("R4-P2: linha null, grupoId não textual ou lista que não é lista → total comercial desconhecido com diagnóstico; fatos e decisão preservados", () => {
    const casos: Array<[string, unknown, unknown]> = [
      ["serviço null", [null], []],
      ["grupoId numérico", [{ id: "s1", descricao: "Serviço", valor: 300, grupoId: 17 }], []],
      ["grupoId objeto (peça)", [{ id: "s1", valor: 300 }], [{ id: "p1", grupoId: {}, quantidade: 1, valorUnitario: 10 }]],
      ["servicos texto", "Serviço", []],
      ["pecas objeto", [{ id: "s1", valor: 300 }], { p1: 1 }],
    ];
    for (const [nome, servicos, pecas] of casos) {
      const r = project({ payload: comServicos(servicos, pecas), titulo: titulo() });
      expect(r.comercial, nome).toMatchObject({ orcamento: "rascunho", totalOrcamento: null, confereComTitulo: null });
      expect(r.comercial?.divergencias.map((d) => d.codigo), nome).toContain("ORCAMENTO_ILEGIVEL");
      expect(r.fatos, nome).toMatchObject({ verificavel: true, recebidoLiquido: 300, liquidado: true });
      expect(r.acoes?.impedimento, nome).toEqual({ codigo: "APROVACAO_COMERCIAL_PENDENTE", destino: "comercial" });
      expect(legado(r), nome).toMatchObject({ deliveryDecision: "BLOCK_UNKNOWN", canDeliver: false, canReceive: false });
    }
  });

  it("R4-P2: orçamento que não é registro (lista/texto) é ausente, sem total comercial zero inventado", () => {
    for (const orcamento of [[], ["x"], "orçamento"]) {
      const r = project({ payload: rascunho({ timeline: [recebimentoOS("op-1", 300)], orcamento }), titulo: titulo() });
      expect(r.comercial, JSON.stringify(orcamento)).toMatchObject({ orcamento: "ausente", totalOrcamento: null, confereComTitulo: null, divergencias: [] });
    }
  });

  it("R4-P2: linhas legíveis seguem calculando o total (grupoId nulo ou texto)", () => {
    const r = project({ payload: comServicos([{ id: "s1", descricao: "Serviço", valor: 300, grupoId: null }]), titulo: titulo() });
    expect(r.comercial).toMatchObject({ totalOrcamento: 300, confereComTitulo: true, divergencias: [] });
  });
});

describe("GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R5: nenhum campo do orçamento ou do status fora do formato derruba a projeção", () => {
  // Valores que chegam por JSON e exigiriam conversão implícita (ou a fariam lançar).
  const HOSTIS: unknown[] = [JSON.parse('{"toString":null}'), JSON.parse('{"valueOf":null,"toString":null}'), JSON.parse("[420]"), JSON.parse('{"v":1}'), "420", true];
  const titulo = () => title(300, "pago", [{ tipo: "liquidacao", valor: 300, loteId: "op-1" }]);
  const comOrcamento = (orcamento: Record<string, unknown>) =>
    rascunho({ timeline: [recebimentoOS("op-1", 300)], orcamento: { ...orcamentoRascunho, ...orcamento } });
  const servico = (extra: Record<string, unknown>) => ({ id: "s1", descricao: "Serviço", valor: 300, ...extra });
  const peca = (extra: Record<string, unknown>) => ({ id: "p1", descricao: "Peça", quantidade: 1, valorUnitario: 10, ...extra });

  it("R5-P2: desconto, validade e campos numéricos de serviço/peça hostis → total comercial desconhecido com diagnóstico; fatos e decisão preservados", () => {
    const variantes = (h: unknown): Array<[string, Record<string, unknown>]> => [
      ["orcamento.desconto", { desconto: h }],
      // validade em texto é o formato próprio (o leitor decide se é data); só os outros tipos são hostis
      ...(typeof h === "string" ? [] : [["orcamento.validoAte (enviado)", { status: "enviado", validoAte: h }] as [string, Record<string, unknown>]]),
      ["servico.valor", { servicos: [servico({ valor: h })] }],
      ["servico.desconto", { servicos: [servico({ desconto: h })] }],
      ["servico.custoV3", { servicos: [servico({ custoV3: h })] }],
      ["peca.quantidade", { pecas: [peca({ quantidade: h })] }],
      ["peca.valorUnitario", { pecas: [peca({ valorUnitario: h })] }],
      ["peca.desconto", { pecas: [peca({ desconto: h })] }],
      ["peca.custoUnitario", { pecas: [peca({ custoUnitario: h })] }],
    ];
    for (const h of HOSTIS) {
      for (const [campo, orcamento] of variantes(h)) {
        const rotulo = `${campo} = ${JSON.stringify(h)}`;
        let r!: ReturnType<typeof project>;
        expect(() => { r = project({ payload: comOrcamento(orcamento), titulo: titulo() }); }, rotulo).not.toThrow();
        expect(r.comercial?.divergencias.map((d) => d.codigo), rotulo).toContain("ORCAMENTO_ILEGIVEL");
        if (campo !== "orcamento.validoAte (enviado)") expect(r.comercial?.totalOrcamento, rotulo).toBeNull();
        else expect(r.comercial?.orcamento, rotulo).toBe("desconhecido");
        expect(r.fatos, rotulo).toMatchObject({ verificavel: true, recebidoLiquido: 300, liquidado: true });
        expect(r, rotulo).toMatchObject({ deliveryDecision: "BLOCK_UNKNOWN", canDeliver: false, canReceive: false });
      }
    }
  });

  it("R5-P2: status do título que não é texto não lança — fatos em conferência, decisão legada igual", () => {
    for (const status of [7, JSON.parse('{"toString":null}'), true, ["pago"]]) {
      const base = { ...titulo(), status };
      let r!: ReturnType<typeof project>;
      expect(() => { r = project({ payload: rascunho({ timeline: [recebimentoOS("op-1", 300)] }), titulo: base as unknown as ProjectFinancialOSV4Input["titulo"] }); }, JSON.stringify(status)).not.toThrow();
      expect(r.fatos, JSON.stringify(status)).toMatchObject({ verificavel: false, motivo: "HISTORICO_INVALIDO", recebidoLiquido: null });
      expect(r, JSON.stringify(status)).toMatchObject({ deliveryDecision: "BLOCK_UNKNOWN", canDeliver: false });
    }
  });

  it("R5: orçamento íntegro (números finitos, validade em texto) segue calculando e decidindo o vencimento", () => {
    const ok = project({ payload: comOrcamento({ desconto: 0, servicos: [servico({ desconto: 0, custoV3: 92 })], pecas: [] }), titulo: titulo() });
    expect(ok.comercial).toMatchObject({ orcamento: "rascunho", totalOrcamento: 300, confereComTitulo: true, divergencias: [] });
    const vencido = project({ payload: comOrcamento({ status: "enviado", validoAte: "2026-07-01" }), titulo: titulo() });
    expect(vencido.comercial).toMatchObject({ orcamento: "expirado", divergencias: [] });
  });
});
