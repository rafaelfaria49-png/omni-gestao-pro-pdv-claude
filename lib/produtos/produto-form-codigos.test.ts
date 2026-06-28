import { describe, it, expect } from "vitest"
import {
  stripAutoCodigoPrefixes,
  normalizeUserCodigoInput,
  buildProdutoFormCodigos,
} from "./produto-form-codigos"

// ============================================================================
// PRODUTO-CODIGOS-UI-PAYLOAD-FIX-002 — contrato canônico dos códigos do formulário
// de cadastro de produtos:
//   SKU / Código interno  → payload.sku     → Produto.sku
//   Código de barras EAN  → payload.barcode → Produto.barcode
// O código bipado do Inventário (prefillBarcode) preenche `barcode` e DEVE virar
// payload.barcode — nunca um "código alternativo" colado em outra coluna.
// ============================================================================

describe("stripAutoCodigoPrefixes", () => {
  it("remove prefixos sintéticos legados (gc-/prod-/id-)", () => {
    expect(stripAutoCodigoPrefixes("gc-ALI-001")).toBe("ALI-001")
    expect(stripAutoCodigoPrefixes("prod-123")).toBe("123")
    expect(stripAutoCodigoPrefixes("id-abc")).toBe("abc")
  })
  it("preserva código real sem prefixo", () => {
    expect(stripAutoCodigoPrefixes("REF-FORNECEDOR")).toBe("REF-FORNECEDOR")
  })
})

describe("normalizeUserCodigoInput", () => {
  it("retorna undefined para vazio/espaços", () => {
    expect(normalizeUserCodigoInput("")).toBeUndefined()
    expect(normalizeUserCodigoInput("   ")).toBeUndefined()
    expect(normalizeUserCodigoInput(undefined)).toBeUndefined()
    expect(normalizeUserCodigoInput(null)).toBeUndefined()
  })
  it("apara e limpa prefixo", () => {
    expect(normalizeUserCodigoInput("  prod-123 ")).toBe("123")
  })
})

describe("buildProdutoFormCodigos", () => {
  it("SKU vai para sku; EAN vai para barcode", () => {
    expect(buildProdutoFormCodigos({ sku: "ALI-001", barcode: "7891234567890" })).toEqual({
      sku: "ALI-001",
      barcode: "7891234567890",
    })
  })

  it("código bipado do Inventário (prefillBarcode) vira payload.barcode (Produto.barcode)", () => {
    const codigos = buildProdutoFormCodigos({ sku: "", barcode: "7899876543210" })
    expect(codigos.barcode).toBe("7899876543210")
    expect(codigos.sku).toBeUndefined()
  })

  it("só SKU preenchido → não cria chave barcode (PATCH não toca campo ausente)", () => {
    const codigos = buildProdutoFormCodigos({ sku: "REF-9", barcode: "" })
    expect(codigos).toEqual({ sku: "REF-9" })
    expect("barcode" in codigos).toBe(false)
  })

  it("nada preenchido → objeto vazio (sem códigos no payload)", () => {
    expect(buildProdutoFormCodigos({ sku: "  ", barcode: "  " })).toEqual({})
    expect(buildProdutoFormCodigos({})).toEqual({})
  })

  it("apara espaços do EAN e limpa prefixo sintético do SKU", () => {
    expect(buildProdutoFormCodigos({ sku: " gc-CARR-99 ", barcode: "  7890000000001  " })).toEqual({
      sku: "CARR-99",
      barcode: "7890000000001",
    })
  })

  it("nunca cruza valores: barcode não vaza para sku nem vice-versa", () => {
    const onlyBarcode = buildProdutoFormCodigos({ barcode: "7891111111111" })
    expect(onlyBarcode.sku).toBeUndefined()
    const onlySku = buildProdutoFormCodigos({ sku: "INT-1" })
    expect(onlySku.barcode).toBeUndefined()
  })
})
