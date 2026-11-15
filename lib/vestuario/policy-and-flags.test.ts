import { describe, expect, it } from "vitest"
import { vestuarioFeatureFlags } from "./feature-flags.server"
import { vestuarioSalePolicy } from "./sale-policy"

describe("flags privadas P01 e política de venda", () => {
  it("todas as flags ficam desligadas por padrão", () => {
    expect(vestuarioFeatureFlags("loja-a", {})).toMatchObject({ requested: { catalog: false, stock: false, sale: false }, enabled: { catalog: false, stock: false, sale: false } })
  })
  it("P02: allowlist libera só o catálogo; estoque e venda continuam forçados a false", () => {
    const env = { VESTUARIO_STORE_ALLOWLIST: "loja-a, loja-b", VESTUARIO_CATALOG_ENABLED: "1", VESTUARIO_STOCK_ENABLED: "1", VESTUARIO_SALE_ENABLED: "1" }
    expect(vestuarioFeatureFlags("loja-a", env)).toMatchObject({ phase: "P02", requested: { catalog: true, stock: true, sale: true }, enabled: { catalog: true, stock: false, sale: false } })
    expect(vestuarioFeatureFlags("loja-c", env).enabled.catalog).toBe(false)
    expect(vestuarioFeatureFlags("loja-c", env).requested.sale).toBe(false)
  })
  it("P02: catálogo nunca liga em Production, mesmo com flag e allowlist", () => {
    const env = { VERCEL_ENV: "production", VESTUARIO_STORE_ALLOWLIST: "loja-a", VESTUARIO_CATALOG_ENABLED: "1", VESTUARIO_STOCK_ENABLED: "1", VESTUARIO_SALE_ENABLED: "1" }
    expect(vestuarioFeatureFlags("loja-a", env)).toMatchObject({ enabled: { catalog: false, stock: false, sale: false }, reason: "CATALOG_NOT_RELEASED_IN_PRODUCTION" })
    expect(vestuarioFeatureFlags("loja-a", { ...env, VERCEL_ENV: "preview" }).enabled).toEqual({ catalog: true, stock: false, sale: false })
    expect(vestuarioFeatureFlags("loja-a", { VESTUARIO_STORE_ALLOWLIST: "loja-a", VESTUARIO_CATALOG_ENABLED: "true" }).enabled.catalog).toBe(false)
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
