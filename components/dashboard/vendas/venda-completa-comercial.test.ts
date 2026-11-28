import { describe, expect, it } from "vitest"
import {
  RETROATIVA_FORM_VAZIA,
  aplicarBrinde,
  buildComercialPayload,
  derivarCaracteristicas,
  limiteDiasDoOverride,
  limitesRetroativa,
  linhaPodeSerBrinde,
  removerBrinde,
  retroativaFormDoRascunho,
  rotuloTipoCupom,
  rotulosCaracteristicas,
  tipoVendaLegado,
  validarRetroativa,
  type BrindeLinha,
  type BuildComercialInput,
  type ComercialCartLine,
} from "./venda-completa-comercial"

// 2026-11-27 15:00 em São Paulo (UTC-3) — "hoje" da loja = 2026-11-27.
const AGORA = new Date("2026-11-27T18:00:00.000Z")

const base = (over: Partial<BuildComercialInput> = {}): BuildComercialInput => ({
  cart: [],
  sentLineIds: [],
  sentUnitPrices: [],
  retroativa: RETROATIVA_FORM_VAZIA,
  recursos: { retroativa: true, brindes: true },
  podeRetroativa: true,
  agora: AGORA,
  limiteDias: null,
  ...over,
})

const brinde = (motivo: string) => ({ motivo, precoOriginal: 25, descontoOriginal: 10 })

describe("buildComercialPayload — venda comum", () => {
  it("sem brinde e sem retroativa não envia `comercial`", () => {
    const r = buildComercialPayload(base({ cart: [{ lineId: "a" }], sentLineIds: ["a"], sentUnitPrices: [10] }))
    expect(r).toEqual({ ok: true })
  })
})

describe("buildComercialPayload — brindes", () => {
  it("lineIndex = índice na lista REALMENTE enviada (linha filtrada fora não desloca o brinde)", () => {
    const cart: ComercialCartLine[] = [
      { lineId: "a" },
      { lineId: "filtrada" },
      { lineId: "b", brinde: brinde("cortesia") },
    ]
    // "filtrada" não foi enviada: o brinde "b" é o índice 1 do saleLines, não 2 do carrinho.
    const r = buildComercialPayload(base({ cart, sentLineIds: ["a", "b"], sentUnitPrices: [10, 0] }))
    expect(r).toEqual({ ok: true, comercial: { brindes: [{ lineIndex: 1, motivo: "cortesia" }] } })
  })

  it("exige preço zero na linha enviada", () => {
    const cart: ComercialCartLine[] = [{ lineId: "b", brinde: brinde("cortesia") }]
    const r = buildComercialPayload(base({ cart, sentLineIds: ["b"], sentUnitPrices: [5] }))
    expect(r.ok).toBe(false)
  })

  it("recusa linha de brinde ausente do envio", () => {
    const cart: ComercialCartLine[] = [{ lineId: "b", brinde: brinde("cortesia") }]
    expect(buildComercialPayload(base({ cart, sentLineIds: [], sentUnitPrices: [] })).ok).toBe(false)
  })

  it("motivo com menos de 3 caracteres é recusado (trim)", () => {
    const cart: ComercialCartLine[] = [{ lineId: "b", brinde: brinde("  ok ") }]
    const r = buildComercialPayload(base({ cart, sentLineIds: ["b"], sentUnitPrices: [0] }))
    expect(r).toMatchObject({ ok: false, field: "brindes" })
  })

  it("avulso, aparelho e serviço não podem ser brinde", () => {
    for (const extra of [{ isAvulso: true }, { isAparelho: true }, { isServico: true }]) {
      const cart: ComercialCartLine[] = [{ lineId: "b", ...extra, brinde: brinde("cortesia") }]
      expect(buildComercialPayload(base({ cart, sentLineIds: ["b"], sentUnitPrices: [0] })).ok).toBe(false)
      expect(linhaPodeSerBrinde(extra)).toBe(false)
    }
    expect(linhaPodeSerBrinde({})).toBe(true)
  })

  it("recurso desligado com brinde marcado falha (nunca envia em silêncio)", () => {
    const cart: ComercialCartLine[] = [{ lineId: "b", brinde: brinde("cortesia") }]
    const r = buildComercialPayload(base({ cart, sentLineIds: ["b"], sentUnitPrices: [0], recursos: { retroativa: true, brindes: false } }))
    expect(r.ok).toBe(false)
  })
})

describe("aplicarBrinde / removerBrinde", () => {
  it("zera preço e desconto e restaura os originais", () => {
    const line: { lineId: string; price: number; discountPct: number; brinde?: BrindeLinha } = { lineId: "x", price: 25, discountPct: 10 }
    const g = aplicarBrinde(line)
    expect(g.price).toBe(0)
    expect(g.discountPct).toBe(0)
    expect(g.brinde).toEqual({ motivo: "", precoOriginal: 25, descontoOriginal: 10 })
    expect(aplicarBrinde(g)).toBe(g)
    const back = removerBrinde(g)
    expect(back).toEqual({ lineId: "x", price: 25, discountPct: 10 })
    expect("brinde" in back).toBe(false)
  })
})

describe("retroativa — limites e validação (espelho do servidor)", () => {
  const form = (over: Partial<typeof RETROATIVA_FORM_VAZIA> = {}) => ({
    ativa: true, dataEfetivaVenda: "2026-11-20", dataEfetivaEntrega: "", justificativa: "Venda feita no papel", ...over,
  })

  it("faixa = [hoje − limite, ontem] no fuso da loja; default 30 dias; clamp 1..365", () => {
    expect(limitesRetroativa(AGORA, null)).toEqual({ hoje: "2026-11-27", ontem: "2026-11-26", minVenda: "2026-10-28", limiteDias: 30 })
    expect(limitesRetroativa(AGORA, 7).minVenda).toBe("2026-11-20")
    expect(limitesRetroativa(AGORA, 0).limiteDias).toBe(1)
    expect(limitesRetroativa(AGORA, 9999).limiteDias).toBe(365)
    // 01:00 UTC do dia 28 ainda é dia 27 em São Paulo.
    expect(limitesRetroativa(new Date("2026-11-28T01:00:00.000Z"), null).hoje).toBe("2026-11-27")
  })

  it("lê limiteDias do override", () => {
    expect(limiteDiasDoOverride({ enabled: true, limiteDias: 10 })).toBe(10)
    expect(limiteDiasDoOverride(true)).toBeNull()
    expect(limiteDiasDoOverride(undefined)).toBeNull()
  })

  it("aceita ontem e o limite exato; recusa hoje e além do limite", () => {
    expect(validarRetroativa(form({ dataEfetivaVenda: "2026-11-26" }), AGORA, 7).ok).toBe(true)
    expect(validarRetroativa(form({ dataEfetivaVenda: "2026-11-20" }), AGORA, 7).ok).toBe(true)
    expect(validarRetroativa(form({ dataEfetivaVenda: "2026-11-19" }), AGORA, 7)).toMatchObject({ ok: false, field: "dataEfetivaVenda" })
    expect(validarRetroativa(form({ dataEfetivaVenda: "2026-11-27" }), AGORA, 7)).toMatchObject({ ok: false, field: "dataEfetivaVenda" })
    expect(validarRetroativa(form({ dataEfetivaVenda: "" }), AGORA, 7).ok).toBe(false)
  })

  it("entrega entre a venda e hoje; justificativa ≥ 10", () => {
    expect(validarRetroativa(form({ dataEfetivaEntrega: "2026-11-27" }), AGORA, null).ok).toBe(true)
    expect(validarRetroativa(form({ dataEfetivaEntrega: "2026-11-19" }), AGORA, null)).toMatchObject({ ok: false, field: "dataEfetivaEntrega" })
    expect(validarRetroativa(form({ dataEfetivaEntrega: "2026-11-28" }), AGORA, null)).toMatchObject({ ok: false, field: "dataEfetivaEntrega" })
    expect(validarRetroativa(form({ justificativa: " curta    " }), AGORA, null)).toMatchObject({ ok: false, field: "justificativa" })
  })

  it("monta só o cenário A (pagamento hoje), sem entrega quando vazia", () => {
    const r = buildComercialPayload(base({ retroativa: form() }))
    expect(r).toEqual({
      ok: true,
      comercial: { retroativa: { modo: "pagamento_hoje", dataEfetivaVenda: "2026-11-20", justificativa: "Venda feita no papel" } },
    })
  })

  it("sem permissão ou recurso desligado: falha em vez de enviar", () => {
    expect(buildComercialPayload(base({ retroativa: form(), podeRetroativa: false })).ok).toBe(false)
    expect(buildComercialPayload(base({ retroativa: form(), recursos: { retroativa: false, brindes: true } })).ok).toBe(false)
  })

  it("rascunho local não confiável é saneado", () => {
    expect(retroativaFormDoRascunho(null)).toBeNull()
    expect(retroativaFormDoRascunho({ ativa: "sim", dataEfetivaVenda: 5 })).toEqual({
      ativa: false, dataEfetivaVenda: "", dataEfetivaEntrega: "", justificativa: "",
    })
  })
})

describe("derivarCaracteristicas — não excludentes", () => {
  const cart: ComercialCartLine[] = [{ lineId: "a" }]

  it("cartão de crédito parcelado NÃO é crediário da loja", () => {
    const c = derivarCaracteristicas({ cart, payments: [{ type: "cartao_credito", value: 100 }], retroativa: false, origemOrcamento: false })
    expect(c.cartaoCredito).toBe(true)
    expect(c.crediarioLoja).toBe(false)
    expect(c.pagamentoMisto).toBe(false)
    expect(tipoVendaLegado(c)).toBe("comum")
  })

  it("a prazo/carnê = crediário; misto com mais de uma forma", () => {
    const c = derivarCaracteristicas({
      cart, payments: [{ type: "dinheiro", value: 20 }, { type: "a_prazo", value: 80 }], retroativa: false, origemOrcamento: false,
    })
    expect(c.crediarioLoja).toBe(true)
    expect(c.pagamentoMisto).toBe(true)
    expect(derivarCaracteristicas({ cart, payments: [{ type: "carne", value: 10 }], retroativa: false, origemOrcamento: false }).crediarioLoja).toBe(true)
    // Forma com valor zero não conta para "misto".
    expect(derivarCaracteristicas({ cart, payments: [{ type: "pix", value: 10 }, { type: "dinheiro", value: 0 }], retroativa: false, origemOrcamento: false }).pagamentoMisto).toBe(false)
  })

  it("garantia por dias na linha ou aparelho; brinde; tudo junto", () => {
    const c = derivarCaracteristicas({
      cart: [{ lineId: "a", garantiaDias: 90 }, { lineId: "b", brinde: brinde("cortesia") }],
      payments: [{ type: "a_prazo", value: 50 }, { type: "cartao_credito", value: 50 }],
      retroativa: true,
      origemOrcamento: true,
    })
    expect(rotulosCaracteristicas(c)).toEqual([
      "A prazo (crediário da loja)", "Cartão de crédito", "Pagamento misto", "Com garantia", "Retroativa", "Com brinde", "Originada de orçamento",
    ])
    expect(tipoVendaLegado(c)).toBe("orcamento")
    expect(derivarCaracteristicas({ cart: [{ lineId: "x", isAparelho: true }], payments: [], retroativa: false, origemOrcamento: false }).comGarantia).toBe(true)
  })

  it("rótulo do cupom: características combinadas, data efetiva, ausente na venda comum", () => {
    const comum = derivarCaracteristicas({ cart, payments: [{ type: "pix", value: 1 }], retroativa: false, origemOrcamento: false })
    expect(rotuloTipoCupom(comum)).toBeUndefined()
    const retro = derivarCaracteristicas({ cart: [{ lineId: "a", garantiaDias: 30 }], payments: [], retroativa: true, origemOrcamento: false })
    expect(rotuloTipoCupom(retro, "2026-11-20")).toBe("Com garantia · Retroativa (data efetiva 20/11/2026)")
    expect(tipoVendaLegado(retro)).toBe("garantia")
  })
})
