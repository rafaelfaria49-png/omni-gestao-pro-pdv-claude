import { describe, expect, it } from "vitest"
import { vestuarioFeatureFlags } from "./feature-flags.server"
import { vestuarioSalePolicy } from "./sale-policy"

describe("flags privadas P01 e política de venda", () => {
  it("todas as flags ficam desligadas por padrão", () => {
    expect(vestuarioFeatureFlags("loja-a", {})).toMatchObject({ requested: { catalog: false, stock: false, sale: false }, enabled: { catalog: false, stock: false, sale: false } })
  })
  it("flags solicitadas e allowlist não liberam capacidade de banco/estoque inexistente", () => {
    const env = { VESTUARIO_STORE_ALLOWLIST: "loja-a, loja-b", VESTUARIO_CATALOG_ENABLED: "1", VESTUARIO_STOCK_ENABLED: "1", VESTUARIO_SALE_ENABLED: "1" }
    expect(vestuarioFeatureFlags("loja-a", env)).toMatchObject({ phase: "P01", requested: { catalog: true, stock: true, sale: true }, enabled: { catalog: false, stock: false, sale: false } })
    expect(vestuarioFeatureFlags("loja-c", env).requested.sale).toBe(false)
  })
  it("não aceita flag pública, truthiness ou wildcard para autorizar loja", () => {
    expect(vestuarioFeatureFlags("loja-a", { NEXT_PUBLIC_VESTUARIO_SALE_ENABLED: "1", VESTUARIO_STORE_ALLOWLIST: "*", VESTUARIO_SALE_ENABLED: "1" }).requested.sale).toBe(false)
    expect(vestuarioFeatureFlags("loja-a", { VESTUARIO_STORE_ALLOWLIST: "loja-a", VESTUARIO_SALE_ENABLED: "true" }).requested.sale).toBe(false)
    expect(vestuarioFeatureFlags("", { VESTUARIO_STORE_ALLOWLIST: "loja-a", VESTUARIO_SALE_ENABLED: "1" }).requested.sale).toBe(false)
  })
  it("preserva o simples e permite apenas rascunho offline para grade futura", () => {
    expect(vestuarioSalePolicy("SIMPLES")).toEqual({ policy: "LEGACY_UNCHANGED" })
    expect(vestuarioSalePolicy("COM_GRADE")).toEqual({ policy: "SERVER_CONFIRMATION_REQUIRED", surfaces: ["classic", "venda-completa"], operational: false, requireVariant: true, requireServerConfirmation: true, allowOfflineConfirmedSale: false, allowOfflineDraft: true, localStockIsAuthoritative: false })
  })
})
