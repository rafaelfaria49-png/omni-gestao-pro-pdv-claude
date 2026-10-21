import { describe, expect, it } from "vitest"
import { validateCapabilitiesPayload, type StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"
import { businessPresentation, resolveBusinessResource, type BusinessBranch } from "@/lib/store-business-capabilities"
import { mergePrinterConfigServerSide } from "@/lib/pdv-settings-server-first"
import { overridesFromStoreCapabilities, resolveCapability } from "@/lib/pdv/resolve-capability"
import { assertProductCommercialSaleSupported, productCommercialCatalogProjection, productSpecificApplicability, validateProductCommercial } from "@/lib/cadastros/product-commercial-contract"

const caps = (primaryBranch: BusinessBranch, overrides: StoreCapabilitiesV1["overrides"] = {}): StoreCapabilitiesV1 => ({ version: 1, business: { primaryBranch }, overrides })

describe("Ramos combináveis, contrato canônico V1", () => {
  it("padaria nova não sugere aparelhos nem assistência", () => {
    const bakery = caps("padaria")
    for (const key of ["service.technical", "catalog.deviceCompatibility", "pdv.accessoryModelColor"] as const) {
      expect(resolveBusinessResource(bakery, key).enabled).toBe(false)
    }
    expect(businessPresentation(bakery).productExample).toContain("Pão")
  })
  it.each(["variedades", "agropecuaria", "comercio"] as const)("%s combina peso e grade sem mudar ramo", (branch) => {
    const mixed = caps(branch, { "catalog.weight": true, "catalog.variants": { enabled: true } })
    for (const key of ["catalog.weight", "catalog.variants"] as const) {
      expect(resolveBusinessResource(mixed, key)).toMatchObject({ enabled: true, operational: false, stage: "preparation" })
    }
    expect(resolveBusinessResource(mixed, "service.technical").enabled).toBe(false)
  })
  it("acessórios e compatibilidade independem de assistência e da permissão", () => {
    const accessoryShop = caps("variedades", { "pdv.accessoryModelColor": true, "catalog.deviceCompatibility": true })
    expect(resolveBusinessResource(accessoryShop, "pdv.accessoryModelColor").operational).toBe(true)
    expect(resolveBusinessResource(accessoryShop, "service.technical").enabled).toBe(false)
    expect(resolveBusinessResource(accessoryShop, "pdv.accessoryModelColor", undefined, false).enabled).toBe(false)
  })
  it("lojas legadas preservam acessórios e assistência sem gravação/reclassificação", () => {
    expect(resolveBusinessResource(null, "service.technical", "ASSISTENCIA").operational).toBe(true)
    expect(resolveBusinessResource(null, "pdv.accessoryModelColor", "VARIEDADES").operational).toBe(true)
    expect(resolveBusinessResource(null, "catalog.weight").enabled).toBe(false)
  })
  it("preset e patch preservam overrides, exemplos, layout e namespaces", () => {
    const prior = { pdvMainLayout: "classic", impressao: { mode: "local" }, capabilities: {
      ...caps("assistencia", { "catalog.weight": false, "pdv.accessoryModelColor": true }),
      business: { primaryBranch: "assistencia", presentation: { productExample: "Meu exemplo", brandExample: "Minha marca" } },
    } }
    const merged = mergePrinterConfigServerSide(prior, { capabilities: { version: 1, business: { primaryBranch: "padaria", presentation: { categoryExample: "Setor" } } } }, false)
    const next = merged.capabilities as StoreCapabilitiesV1
    expect(resolveBusinessResource(next, "catalog.weight").enabled).toBe(false)
    expect(resolveBusinessResource(next, "pdv.accessoryModelColor").enabled).toBe(true)
    expect(businessPresentation(next)).toEqual({ productExample: "Meu exemplo", brandExample: "Minha marca", categoryExample: "Setor" })
    expect(merged.pdvMainLayout).toBe("classic")
    expect(merged.impressao).toEqual(prior.impressao)
    expect(mergePrinterConfigServerSide(merged, { capabilities: caps("moda") }, true)).toEqual(merged)
  })
  it("uma preferência de acessórios é consumida também pelo runtime PDV sem elevar suporte", () => {
    const bakery = caps("padaria")
    expect(resolveCapability({ surfaceId: "classic", capabilityKey: "pdv.accessoryModelColor", overrides: overridesFromStoreCapabilities(bakery) }).enabled).toBe(false)
    expect(resolveCapability({ surfaceId: "next", capabilityKey: "pdv.accessoryModelColor", overrides: { "pdv.accessoryModelColor": true } }).enabled).toBe(false)
  })
  it.each([
    null, { version: 1, business: { primaryBranch: "inventado" } },
    { version: 1, business: { presentation: { plan: "OURO" } } },
    { version: 1, overrides: { "catalog.weight": { available: true } } },
    { version: 1, overrides: { "catalog.weight": { enabled: "true" } } },
    { version: 1, overrides: { "pdv.scale": true } },
    { version: 1, overrides: { "sale.fractionalQty": true } },
  ])("rejeita configuração inválida ou autoridade operacional forjada: %j", (input) => {
    expect(validateCapabilitiesPayload(input).ok).toBe(false)
  })
  it("valida e relê a nova configuração sem perder o envelope", () => {
    const input = caps("padaria", { "service.technical": false })
    expect(validateCapabilitiesPayload(JSON.parse(JSON.stringify(input)))).toEqual({ ok: true, data: input })
  })
  it("aplicação é explícita por produto, sem inferir pelo nome ou categoria", () => {
    expect(productSpecificApplicability({ name: "Capinha", category: "Celular" })).toEqual({ compatibilidade: false, acessorios: false })
    expect(productSpecificApplicability({ atributos: { modeloCompativel: "Modelo" } }).compatibilidade).toBe(true)
    expect(productSpecificApplicability({ atributos: { modeloCompativel: "Modelo" }, cadastroRecursos: { compatibilidade: false } }).compatibilidade).toBe(false)
  })
  it("peso é declaração independente do ramo, bloqueada mesmo com quantidade inteira", () => {
    const weight = { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" }
    expect(validateProductCommercial(weight)).toBe(true)
    expect(validateProductCommercial({ ...weight, basePreco: "UN" })).toBe(false)
    expect(productCommercialCatalogProjection({ comercial: weight }, 20)).toMatchObject({ precoNaBase: 20, basePreco: "KG", precisaoQuantidade: 3, vendaPorPeso: true, vendaOperacional: false, gradeOperacional: false })
    expect(() => assertProductCommercialSaleSupported({ comercial: weight })).toThrow(/Não venda.*unidade/)
    expect(() => assertProductCommercialSaleSupported({ vendaPorPeso: true })).toThrow()
    expect(() => assertProductCommercialSaleSupported({ vendaPorPeso: true, comercial: { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } })).toThrow()
    expect(() => assertProductCommercialSaleSupported({})).not.toThrow()
  })
  it.each([
    { version: 1, modoVenda: "unidade", unidade: "KG", basePreco: "KG" },
    { version: 2, modoVenda: "unidade", unidade: "UN", basePreco: "UN" },
    { version: 1, modoVenda: "fracionado", unidade: "G", basePreco: "G" },
    null,
  ])("declaração comercial inválida não se torna venda operacional por unidade: %j", (comercial) => {
    expect(() => assertProductCommercialSaleSupported({ comercial })).toThrow(/comercial inválida/i)
    expect(productCommercialCatalogProjection({ comercial }, 20).vendaOperacional).toBe(false)
  })
})
