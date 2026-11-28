import { describe, expect, it } from "vitest"
import { caracteristicasDaVenda, dataCompetenciaComercial, validarComercialVenda, type ContextoComercial } from "./contrato"

// 2026-11-27 15:00 em São Paulo (UTC-3).
const AGORA = new Date("2026-11-27T18:00:00.000Z")
const ctx = (p: Partial<ContextoComercial> = {}): ContextoComercial => ({
  agora: AGORA, operador: "gerente@loja", recursos: { retroativa: true, brindes: true }, limiteDias: 30, podeRetroativa: true, sessao: null, ...p,
})
const linhas = [
  { inventoryId: "p1", produtoId: "p1", quantity: 1, unitPrice: 2500 },
  { inventoryId: "p2", produtoId: "p2", quantity: 1, unitPrice: 0 },
]
const retro = (o: Record<string, unknown>) => ({ at: AGORA.toISOString(), lines: linhas, paymentBreakdown: { dinheiro: 2500 }, comercial: { retroativa: { modo: "pagamento_hoje", dataEfetivaVenda: "2026-11-25", justificativa: "Venda de quarta-feira paga hoje", ...o } } })

describe("venda retroativa — cenário A (pagamento hoje)", () => {
  it("aceita data passada dentro do limite e grava campos do servidor", () => {
    const r = validarComercialVenda(retro({}), ctx())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.allowClosedOriginalSession).toBe(false)
    expect(r.comercial.retroativa).toMatchObject({
      modo: "pagamento_hoje", dataEfetivaVenda: "2026-11-25", dataEfetivaEntrega: "2026-11-25",
      registradoEm: AGORA.toISOString(), operador: "gerente@loja", fuso: "America/Sao_Paulo", limiteDias: 30,
    })
    expect(r.comercial.caracteristicas.retroativa).toBe(true)
  })
  it("recusa hoje, futuro, fora do limite, entrega antes da venda e sem justificativa", () => {
    expect(validarComercialVenda(retro({ dataEfetivaVenda: "2026-11-27" }), ctx())).toMatchObject({ code: "RETROATIVA_NAO_PASSADA" })
    expect(validarComercialVenda(retro({ dataEfetivaVenda: "2026-12-01" }), ctx())).toMatchObject({ code: "RETROATIVA_NAO_PASSADA" })
    expect(validarComercialVenda(retro({ dataEfetivaVenda: "2026-10-01" }), ctx())).toMatchObject({ code: "RETROATIVA_FORA_DO_LIMITE" })
    expect(validarComercialVenda(retro({ dataEfetivaVenda: "2026-10-01" }), ctx({ limiteDias: 90 })).ok).toBe(true)
    expect(validarComercialVenda(retro({ dataEfetivaEntrega: "2026-11-24" }), ctx())).toMatchObject({ code: "RETROATIVA_ENTREGA_INVALIDA" })
    expect(validarComercialVenda(retro({ dataEfetivaEntrega: "2026-11-28" }), ctx())).toMatchObject({ code: "RETROATIVA_ENTREGA_INVALIDA" })
    expect(validarComercialVenda(retro({ justificativa: "curta" }), ctx())).toMatchObject({ code: "RETROATIVA_JUSTIFICATIVA" })
  })
  it("entrega efetiva distinta da venda é preservada (cenário 23)", () => {
    const r = validarComercialVenda(retro({ dataEfetivaEntrega: "2026-11-26" }), ctx())
    expect(r.ok && r.comercial.retroativa?.dataEfetivaEntrega).toBe("2026-11-26")
  })
  it("recurso desligado ou sem permissão de gerente → 403", () => {
    expect(validarComercialVenda(retro({}), ctx({ recursos: { retroativa: false, brindes: true } }))).toMatchObject({ status: 403, code: "RETROATIVA_DESATIVADA" })
    expect(validarComercialVenda(retro({}), ctx({ podeRetroativa: false }))).toMatchObject({ status: 403, code: "RETROATIVA_SEM_PERMISSAO" })
  })
  it("competência comercial usa a data efetiva; sem retroativa, o dia do registro", () => {
    const r = validarComercialVenda(retro({}), ctx())
    expect(r.ok && dataCompetenciaComercial({ comercial: r.comercial }, AGORA)).toBe("2026-11-25")
    expect(dataCompetenciaComercial({}, AGORA)).toBe("2026-11-27")
    expect(dataCompetenciaComercial({ comercial: { versao: 1, retroativa: { dataEfetivaVenda: "lixo" } } }, AGORA)).toBe("2026-11-27")
  })
})

describe("venda retroativa — cenário B (regularização em caixa fechado)", () => {
  const sessaoFechada = { id: "s1", status: "FECHADA", abertaEm: new Date("2026-11-25T11:00:00Z"), fechadaEm: new Date("2026-11-25T22:00:00Z") }
  const venda = (at: string, extra: Record<string, unknown> = {}) => ({
    ...retro({ modo: "regularizacao" }), at, sessaoId: "s1", ...extra,
  })
  it("aceita instante dentro da sessão original fechada e libera o lançamento na sessão original", () => {
    const r = validarComercialVenda(venda("2026-11-25T15:30:00Z"), ctx({ sessao: sessaoFechada }))
    expect(r).toMatchObject({ ok: true, allowClosedOriginalSession: true })
    expect(r.ok && r.comercial.retroativa?.sessaoOriginalId).toBe("s1")
  })
  it("recusa sem sessão, sessão aberta, horário fora da sessão ou de outro dia", () => {
    expect(validarComercialVenda(venda("2026-11-25T15:30:00Z"), ctx())).toMatchObject({ code: "REGULARIZACAO_SEM_SESSAO" })
    expect(validarComercialVenda(venda("2026-11-25T15:30:00Z"), ctx({ sessao: { ...sessaoFechada, status: "ABERTA", fechadaEm: null } }))).toMatchObject({ code: "REGULARIZACAO_SESSAO_ABERTA" })
    expect(validarComercialVenda(venda("2026-11-25T23:30:00Z"), ctx({ sessao: sessaoFechada }))).toMatchObject({ code: "REGULARIZACAO_FORA_DA_SESSAO" })
    expect(validarComercialVenda(venda("2026-11-26T15:30:00Z"), ctx({ sessao: sessaoFechada }))).toMatchObject({ code: "REGULARIZACAO_HORARIO" })
  })
  it("venda com aparelho não regulariza em caixa antigo", () => {
    const comAparelho = venda("2026-11-25T15:30:00Z", { lines: [{ ...linhas[0], deviceSale: { version: 1, aparelhoId: "a" } }] })
    expect(validarComercialVenda(comAparelho, ctx({ sessao: sessaoFechada }))).toMatchObject({ code: "RETROATIVA_APARELHO" })
  })
})

describe("brindes", () => {
  const comBrinde = (b: unknown, lines: Array<Record<string, unknown>> = linhas) => ({ lines, paymentBreakdown: { pix: 2500 }, comercial: { brindes: b } })
  it("linha de preço zero, produto do estoque e motivo → registrado", () => {
    const r = validarComercialVenda(comBrinde([{ lineIndex: 1, motivo: "Película de cortesia" }]), ctx())
    expect(r.ok && r.comercial.brindes).toEqual([{ lineIndex: 1, motivo: "Película de cortesia", produtoRef: "p2", quantidade: 1 }])
    expect(r.ok && r.comercial.caracteristicas.comBrinde).toBe(true)
  })
  it("recusa linha cobrada, avulsa, aparelho, repetida, sem motivo ou recurso desligado", () => {
    expect(validarComercialVenda(comBrinde([{ lineIndex: 0, motivo: "Cortesia" }]), ctx())).toMatchObject({ code: "BRINDE_COM_PRECO" })
    expect(validarComercialVenda(comBrinde([{ lineIndex: 0, motivo: "Cortesia" }], [{ ...linhas[1], isAvulso: true }]), ctx())).toMatchObject({ code: "BRINDE_AVULSO" })
    expect(validarComercialVenda(comBrinde([{ lineIndex: 0, motivo: "Cortesia" }], [{ ...linhas[1], deviceSale: {} }]), ctx())).toMatchObject({ code: "BRINDE_APARELHO" })
    expect(validarComercialVenda(comBrinde([{ lineIndex: 1, motivo: "a" }]), ctx())).toMatchObject({ code: "BRINDE_MOTIVO_OBRIGATORIO" })
    expect(validarComercialVenda(comBrinde([{ lineIndex: 1, motivo: "Cortesia" }, { lineIndex: 1, motivo: "Cortesia" }]), ctx())).toMatchObject({ code: "BRINDE_LINHA_INVALIDA" })
    expect(validarComercialVenda(comBrinde([{ lineIndex: 9, motivo: "Cortesia" }]), ctx())).toMatchObject({ code: "BRINDE_LINHA_INVALIDA" })
    expect(validarComercialVenda(comBrinde([{ lineIndex: 1, motivo: "Cortesia" }]), ctx({ recursos: { retroativa: true, brindes: false } }))).toMatchObject({ status: 403 })
  })
})

describe("características não exclusivas (Venda Comum / Garantia / A Prazo não são excludentes)", () => {
  it("a prazo + garantia + misto ao mesmo tempo; cartão de crédito não é crediário", () => {
    const c = caracteristicasDaVenda({
      lines: [{ quantity: 1, unitPrice: 100, warrantyDays: 90 }],
      paymentBreakdown: { dinheiro: 50, aPrazo: 50 },
    }, { retroativa: false, comBrinde: false })
    expect(c).toMatchObject({ aPrazo: true, crediarioLoja: true, comGarantia: true, pagamentoMisto: true, cartaoCredito: false })
    const cartao = caracteristicasDaVenda({ lines: [], paymentBreakdown: { cartaoCredito: 100 } }, { retroativa: false, comBrinde: false })
    expect(cartao).toMatchObject({ aPrazo: false, crediarioLoja: false, cartaoCredito: true, pagamentoMisto: false })
  })
  it("comercial malformado é recusado", () => {
    expect(validarComercialVenda({ comercial: "x" }, ctx())).toMatchObject({ code: "COMERCIAL_INVALIDO" })
    expect(validarComercialVenda({ comercial: [1] }, ctx())).toMatchObject({ code: "COMERCIAL_INVALIDO" })
  })
})
