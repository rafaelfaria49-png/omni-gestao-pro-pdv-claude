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
