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
