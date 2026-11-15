import { describe, expect, it } from "vitest"
import {
  productCatalogV1Schema, variantIdentityV1Schema, stockTargetV1Schema,
  saleLineV1Schema, variantSaleLineV1Schema, stableVariantKey, validateVariantScope,
} from "./contracts"

const product = { version: 1, mode: "COM_GRADE", storeId: "loja-a", produtoId: "camiseta-a", gradeId: "adulto-a" }
const variant = { version: 1, storeId: "loja-a", produtoId: "camiseta-a", varianteId: "var-preto-m", corId: "preto-a", tamanhoId: "m-a", sku: "CAM-PRE-M", barcodeInterno: "OGV-A001" }
const line = { ...variant, kind: "VARIANTE", lineId: "linha-a", depositoId: "principal-a", catalogVersion: 1, quantity: 2, unitPriceCents: 3990, discountCents: 100, totalCents: 7880, skuSnapshot: variant.sku, corSnapshot: "Preto", tamanhoSnapshot: "M", barcodeSnapshot: variant.barcodeInterno }
// O wire da venda preserva snapshots; não duplica os nomes dos campos da identidade de cadastro.
const { sku: _sku, barcodeInterno: _barcode, ...saleLine } = line

describe("Vestuario/v1 — contratos estritos e identidade", () => {
  it("distingue produto simples, pai de grade, alvo simples e alvo de variante", () => {
    expect(productCatalogV1Schema.parse(product)).toEqual(product)
    expect(productCatalogV1Schema.parse({ version: 1, mode: "SIMPLES", storeId: "loja-a", produtoId: "legado" }).mode).toBe("SIMPLES")
    expect(stockTargetV1Schema.parse({ version: 1, kind: "VARIANTE", storeId: "loja-a", produtoId: "camiseta-a", varianteId: "var-preto-m", depositoId: "principal-a" }).kind).toBe("VARIANTE")
    expect(stockTargetV1Schema.parse({ version: 1, kind: "SIMPLES", storeId: "loja-a", produtoId: "legado", depositoId: "principal-a" }).kind).toBe("SIMPLES")
  })

  it.each([0, 2, "1", null])("recusa versão não suportada %j sem downgrade", (version) => {
    expect(productCatalogV1Schema.safeParse({ ...product, version }).success).toBe(false)
    expect(variantIdentityV1Schema.safeParse({ ...variant, version }).success).toBe(false)
  })

  it.each(["storeId", "produtoId", "varianteId", "corId", "tamanhoId", "sku", "barcodeInterno"] as const)("exige %s e não aceita identificador vazio", (key) => {
    const input = { ...variant, [key]: "" }
    expect(variantIdentityV1Schema.safeParse(input).success).toBe(false)
  })

  it("recusa campos de saldo/autoridade e controles no código de etiqueta", () => {
    expect(productCatalogV1Schema.safeParse({ ...product, stock: 60 }).success).toBe(false)
    expect(variantIdentityV1Schema.safeParse({ ...variant, actor: "admin" }).success).toBe(false)
    expect(variantIdentityV1Schema.safeParse({ ...variant, barcodeInterno: "OGV\nA" }).success).toBe(false)
    expect(variantIdentityV1Schema.safeParse({ ...variant, storeId: " loja-a" }).success).toBe(false)
  })

  it("identidade estável independe de renomear SKU/código e não colide entre lojas ou produtos", () => {
    const key = stableVariantKey(variant)
    const renamed = { ...variant, sku: "RENOMEADO" }
    expect(stableVariantKey(renamed)).toBe(key)
    expect(stableVariantKey({ ...variant, storeId: "loja-b" })).not.toBe(key)
    expect(stableVariantKey({ ...variant, produtoId: "outro" })).not.toBe(key)
    expect(stableVariantKey({ ...variant, varianteId: "var-preto-p" })).not.toBe(key)
  })

  it("não deriva IDs de cor/tamanho ou de um nome de produto", () => {
    const { varianteId: _id, ...withoutId } = variant
    expect(variantIdentityV1Schema.safeParse(withoutId).success).toBe(false)
  })

  it("preserva quantidade/preço/loja e snapshots de uma linha de variante", () => {
    expect(variantSaleLineV1Schema.parse(saleLine)).toEqual(saleLine)
    expect(saleLineV1Schema.parse(saleLine)).toEqual(saleLine)
  })

  it("o contrato prospectivo também possui uma linha simples versionada", () => {
    const simple = { version: 1, kind: "SIMPLES", storeId: "loja-a", produtoId: "legado", lineId: "linha-1", depositoId: "dep-a", catalogVersion: 1, quantity: 1, unitPriceCents: 100, discountCents: 0, totalCents: 100, skuSnapshot: "L1" }
    expect(saleLineV1Schema.parse(simple)).toEqual(simple)
    expect(saleLineV1Schema.safeParse({ ...simple, varianteId: "não-é-simples" }).success).toBe(false)
  })

  it.each([
    { quantity: 0 }, { quantity: 0.5 }, { quantity: NaN }, { quantity: 2_000_000_001 },
    { unitPriceCents: 39.9 }, { discountCents: 8000 }, { totalCents: 1 },
    { unitPriceCents: Number.MAX_SAFE_INTEGER, quantity: 2 }, { varianteId: undefined },
  ])("recusa linha incompleta, monetariamente incoerente ou fracionada %j", (patch) => {
    expect(variantSaleLineV1Schema.safeParse({ ...saleLine, ...patch }).success).toBe(false)
  })
})

describe("escopo autorizado e vínculos — sem escolher loja a partir do payload", () => {
  it("aceita só identidade integralmente vinculada ao produto/loja autorizados", () => {
    expect(validateVariantScope("loja-a", product, variant)).toEqual({ ok: true })
    expect(validateVariantScope("loja-a", { version: 1, mode: "SIMPLES", storeId: "loja-a", produtoId: "legado" }, null)).toEqual({ ok: true })
  })
  it.each([
    ["", product, variant, "UNTRUSTED_CONTEXT"],
    ["loja-b", product, variant, "CROSS_STORE"],
    ["loja-a", product, { ...variant, storeId: "loja-b" }, "CROSS_STORE"],
    ["loja-a", product, { ...variant, produtoId: "outro" }, "PRODUCT_MISMATCH"],
    ["loja-a", product, null, "VARIANT_REQUIRED"],
    ["loja-a", { ...product, mode: "SIMPLES", gradeId: undefined }, variant, "INVALID_CONTRACT"],
  ])("recusa escopo/vínculo inválido", (store, p, v, code) => {
    expect(validateVariantScope(store as string, p, v)).toEqual({ ok: false, code })
  })
  it("uma variante nunca transforma um produto simples em pai de grade", () => {
    expect(validateVariantScope("loja-a", { version: 1, mode: "SIMPLES", storeId: "loja-a", produtoId: variant.produtoId }, variant)).toEqual({ ok: false, code: "PRODUCT_MISMATCH" })
  })
})
