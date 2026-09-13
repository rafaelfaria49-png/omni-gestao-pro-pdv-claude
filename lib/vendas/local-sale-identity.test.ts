import { describe, expect, it } from "vitest"

import {
  assertGeneratedClientSaleId,
  buildProvisionalSaleRef,
  classifyLocalSaleSync,
  deriveLegacySaleClientSaleId,
  displaySaleNumber,
  generateClientSaleId,
  isProvisionalSaleRef,
  saleLocalKey,
} from "./local-sale-identity"

describe("local-sale-identity", () => {
  it("gera clientSaleId opaco válido e estável na forma cs_", () => {
    const id = generateClientSaleId()
    expect(id.startsWith("cs_")).toBe(true)
    expect(id).toBe(assertGeneratedClientSaleId(id))
    expect(id).not.toMatch(/^VDA-/i)
    expect(id).not.toMatch(/^PEND-/i)
  })

  it("rejeita clientSaleId com forma de número comercial", () => {
    expect(() => assertGeneratedClientSaleId("VDA-RC02-2026-000001")).toThrow()
    expect(() => assertGeneratedClientSaleId("PEND-cs_abc")).toThrow()
  })

  it("referência provisória nunca casa com ^VDA-", () => {
    const clientSaleId = "cs_localattempt01"
    const ref = buildProvisionalSaleRef(clientSaleId)
    expect(ref.startsWith("PEND-")).toBe(true)
    expect(isProvisionalSaleRef(ref)).toBe(true)
    expect(ref).not.toMatch(/^VDA-/)
    expect(isProvisionalSaleRef("VDA-RC02-2026-000001")).toBe(false)
    expect(isProvisionalSaleRef("VDA-2026-0615")).toBe(false)
  })

  it("saleLocalKey prefere clientSaleId", () => {
    expect(saleLocalKey({ id: "PEND-cs_localattempt01", clientSaleId: "cs_localattempt01" })).toBe(
      "cs_localattempt01",
    )
    expect(saleLocalKey({ id: "VDA-2026-0001" })).toBe("VDA-2026-0001")
  })

  it("classifica pending / quarentena / confirmada", () => {
    expect(classifyLocalSaleSync({ syncPending: true })).toBe("LOCAL_PENDING")
    expect(
      classifyLocalSaleSync({
        syncPending: true,
        syncBlockedCode: "PEDIDO_ID_CONFLITO_MESMA_LOJA",
      }),
    ).toBe("LOCAL_QUARANTINED")
    expect(classifyLocalSaleSync({})).toBe("REMOTE_CONFIRMED")
  })

  it("displaySaleNumber não apresenta PEND como VDA", () => {
    expect(displaySaleNumber("PEND-cs_localattempt01")).toBe("PENDENTE — AGUARDANDO NÚMERO")
    expect(displaySaleNumber("VDA-RC02-2026-000001", true)).toBe("PENDENTE — AGUARDANDO NÚMERO")
    expect(displaySaleNumber("VDA-RC02-2026-000001")).toBe("VDA-RC02-2026-000001")
  })
})

describe("deriveLegacySaleClientSaleId — identidade determinística de venda preservada", () => {
  const venda = {
    id: "VDA-2026-0412",
    at: "2026-06-15T18:42:07.123Z",
    total: 59.9,
    lines: [{ inventoryId: "prod-1", quantity: 2, unitPrice: 29.95 }],
    paymentBreakdown: { dinheiro: 59.9, pix: 0 },
  }

  it("duas abas (ou antes e depois de um crash) chegam à MESMA chave", () => {
    const a = deriveLegacySaleClientSaleId("loja-2", venda)
    const b = deriveLegacySaleClientSaleId("loja-2", {
      ...venda,
      paymentBreakdown: { pix: 0, dinheiro: 59.9 },
    })
    expect(a).toBe(b)
  })

  it("é identidade técnica válida, nunca com forma de número comercial", () => {
    const id = deriveLegacySaleClientSaleId("loja-2", venda)
    expect(id).toMatch(/^lq_[0-9a-f]{32}$/)
    expect(assertGeneratedClientSaleId(id)).toBe(id)
  })

  it("vendas diferentes — ou a mesma venda em outra loja — têm chaves diferentes", () => {
    const base = deriveLegacySaleClientSaleId("loja-2", venda)
    expect(deriveLegacySaleClientSaleId("loja-1", venda)).not.toBe(base)
    expect(deriveLegacySaleClientSaleId("loja-2", { ...venda, at: "2026-06-15T18:42:07.124Z" })).not.toBe(base)
    expect(deriveLegacySaleClientSaleId("loja-2", { ...venda, total: 59.8 })).not.toBe(base)
    expect(deriveLegacySaleClientSaleId("loja-2", { ...venda, id: "VDA-2026-0413" })).not.toBe(base)
  })
})
