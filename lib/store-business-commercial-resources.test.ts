import { describe, expect, it } from "vitest"
import { validateCapabilitiesPayload, type StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"
import {
  BUSINESS_RESOURCES, BUSINESS_RESOURCE_GROUPS, MANUAL_ONLY_RESOURCES, businessResourceModule, resolveBusinessResource, type BusinessBranch,
} from "@/lib/store-business-capabilities"

const caps = (primaryBranch: BusinessBranch, overrides: StoreCapabilitiesV1["overrides"] = {}): StoreCapabilitiesV1 => ({ version: 1, business: { primaryBranch }, overrides })
const COMERCIAIS = [
  "commercial.refurbishment", "commercial.historicalCost", "commercial.implantationMode",
  "sales.retroactive", "sales.gifts", "sales.quickDeviceRegistration", "sales.tradeIn", "sales.detailedWarranty",
] as const

describe("VC-00 — recursos multissegmento combináveis (mesmo registry)", () => {
  it("todo recurso tem grupo conhecido e descrição", () => {
    for (const r of BUSINESS_RESOURCES) {
      expect(Object.keys(BUSINESS_RESOURCE_GROUPS)).toContain(r.group)
      expect(r.description.length).toBeGreaterThan(10)
    }
  })
  it("recursos comerciais nunca ligam por ramo nem em loja legada", () => {
    const branches = ["padaria", "assistencia", "acessorios", "moda", "variedades", "agropecuaria", "supermercado", "comercio"] as const
    for (const key of COMERCIAIS) {
      expect(MANUAL_ONLY_RESOURCES.has(key)).toBe(true)
      for (const b of branches) expect(resolveBusinessResource(caps(b), key).requested).toBe(false)
      expect(resolveBusinessResource(null, key, "ASSISTENCIA").requested).toBe(false)
    }
  })
  it("cenário 1: loja de roupa habilita celulares, preparação e custo histórico", () => {
    const moda = caps("moda", { "catalog.serializedDevices": true, "commercial.refurbishment": true, "commercial.historicalCost": true })
    expect(resolveBusinessResource(moda, "catalog.variants").requested).toBe(true)
    expect(resolveBusinessResource(moda, "commercial.refurbishment")).toMatchObject({ operational: true, missing: [] })
    expect(resolveBusinessResource(moda, "commercial.historicalCost").operational).toBe(true)
  })
  it("cenário 2: variedades combina peso, grade, assistência, brindes e retroativa", () => {
    const mix = caps("variedades", {
      "catalog.weight": true, "catalog.variants": true, "service.technical": true, "sales.gifts": true, "sales.retroactive": { enabled: true, limiteDias: 60 },
    })
    expect(resolveBusinessResource(mix, "service.technical").operational).toBe(true)
    expect(resolveBusinessResource(mix, "sales.gifts").operational).toBe(true)
    expect(resolveBusinessResource(mix, "sales.retroactive").operational).toBe(true)
    expect(validateCapabilitiesPayload(mix).ok).toBe(true)
  })
  it("dependência real: preparação sem IMEI ligado não opera e informa o que falta", () => {
    const r = resolveBusinessResource(caps("comercio", { "commercial.refurbishment": true }), "commercial.refurbishment")
    expect(r).toMatchObject({ requested: true, enabled: true, operational: false, missing: ["catalog.serializedDevices"] })
  })
  it("recurso em preparação nunca é operacional, mesmo ligado (sem interface falsa)", () => {
    const shop = caps("comercio", { "catalog.serializedDevices": true, "sales.tradeIn": true, "sales.quickDeviceRegistration": true, "sales.detailedWarranty": true })
    for (const key of ["sales.tradeIn", "sales.quickDeviceRegistration", "sales.detailedWarranty"] as const) {
      expect(resolveBusinessResource(shop, key)).toMatchObject({ enabled: true, operational: false, stage: "preparation" })
    }
  })
  it("permissão/plano continua obrigatório (permitted=false derruba também a dependência)", () => {
    const shop = caps("comercio", { "catalog.serializedDevices": true, "commercial.refurbishment": true })
    expect(resolveBusinessResource(shop, "commercial.refurbishment", undefined, false).operational).toBe(false)
    expect(businessResourceModule("commercial.refurbishment")).toBe("deviceCatalog")
    expect(businessResourceModule("sales.retroactive")).toBeNull()
    expect(businessResourceModule("service.technical")).toBe("operacoes")
  })
  it("limite retroativo validado no servidor (1..365 inteiro)", () => {
    for (const limiteDias of [0, 366, 2.5, "30"]) {
      expect(validateCapabilitiesPayload({ version: 1, overrides: { "sales.retroactive": { enabled: true, limiteDias } } }).ok).toBe(false)
    }
    expect(validateCapabilitiesPayload({ version: 1, overrides: { "sales.retroactive": { enabled: true, limiteDias: 365 } } }).ok).toBe(true)
  })
  it("chave de autoridade do servidor continua proibida dentro do override comercial", () => {
    expect(validateCapabilitiesPayload({ version: 1, overrides: { "sales.gifts": { enabled: true, plan: "ouro" } } }).ok).toBe(false)
  })
})
