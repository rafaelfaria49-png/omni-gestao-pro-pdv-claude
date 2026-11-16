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
  it("Production permanece bloqueada sem opt-in extra, mesmo com flag e allowlist", () => {
    const env = { VERCEL_ENV: "production", VESTUARIO_STORE_ALLOWLIST: "loja-a", VESTUARIO_CATALOG_ENABLED: "1", VESTUARIO_STOCK_ENABLED: "1", VESTUARIO_SALE_ENABLED: "1" }
    expect(vestuarioFeatureFlags("loja-a", env)).toMatchObject({ enabled: { catalog: false, stock: false, sale: false }, reason: "CATALOG_PRODUCTION_RELEASE_REQUIRED" })
    expect(vestuarioFeatureFlags("loja-a", { ...env, VESTUARIO_CATALOG_PRODUCTION_ENABLED: "true" }).enabled.catalog).toBe(false)
    expect(vestuarioFeatureFlags("loja-a", { ...env, VERCEL_ENV: "preview" }).enabled).toEqual({ catalog: true, stock: false, sale: false })
  })
  it("Production: só loja na allowlist com ambas as flags privadas exatas recebe catálogo", () => {
    const env = { VERCEL_ENV: "production", VESTUARIO_STORE_ALLOWLIST: "loja-a", VESTUARIO_CATALOG_ENABLED: "1", VESTUARIO_CATALOG_PRODUCTION_ENABLED: "1", VESTUARIO_STOCK_ENABLED: "1", VESTUARIO_SALE_ENABLED: "1" }
    expect(vestuarioFeatureFlags("loja-a", env)).toMatchObject({
      enabled: { catalog: true, stock: false, sale: false },
      reason: "CATALOG_ENABLED_STOCK_AND_SALE_NOT_RELEASED",
    })
    expect(vestuarioFeatureFlags("loja-b", env).enabled).toEqual({ catalog: false, stock: false, sale: false })
    expect(vestuarioFeatureFlags("loja-a", { ...env, VESTUARIO_CATALOG_ENABLED: "true" }).enabled.catalog).toBe(false)
    expect(vestuarioFeatureFlags("loja-a", { ...env, VESTUARIO_CATALOG_ENABLED: "0" }).enabled.catalog).toBe(false)
    expect(vestuarioFeatureFlags("loja-a", { ...env, VESTUARIO_STORE_ALLOWLIST: "*" }).enabled.catalog).toBe(false)
    expect(vestuarioFeatureFlags("loja-a", { ...env, VESTUARIO_STORE_ALLOWLIST: "" }).enabled.catalog).toBe(false)
    expect(vestuarioFeatureFlags("loja-a", { ...env, NEXT_PUBLIC_VESTUARIO_CATALOG_ENABLED: "1", VESTUARIO_CATALOG_ENABLED: undefined }).enabled.catalog).toBe(false)
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
