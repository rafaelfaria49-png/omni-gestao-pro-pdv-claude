/**
 * CAD-R2-014 — importador avançado: tradução do patch puro para o
 * ProductWriteInput preservando presença (ausente = preserva).
 *
 * - `sku: null` (limpeza do sintético) → `""` (CLEAR canônico; `null` seria omissão)
 * - chaves ausentes no patch → ausentes no input (preserva curadoria do operador)
 * - `brand: ""` (limpeza da cópia da categoria) → preservado como `""`
 * - metadata (fiscal + lote + fornecedor) → passada aditivamente
 * - estoque nunca entra no input de update
 */
import { describe, expect, it } from "vitest"
import { patchAtualizacaoParaWriteInput } from "./persistidor"

describe("patchAtualizacaoParaWriteInput", () => {
  it("preserva presença: só chaves do patch viram chaves do input", () => {
    const input = patchAtualizacaoParaWriteInput(
      { name: "Pilhas", price: 10 } as unknown as Record<string, unknown>,
      { importacao: { lote: "b1" } },
    ) as unknown as Record<string, unknown>
    expect(input.nome).toBe("Pilhas")
    expect(input.preco).toBe(10)
    expect(input.metadata).toEqual({ importacao: { lote: "b1" } })
    expect("sku" in input).toBe(false)
    expect("barcode" in input).toBe(false)
    expect("marca" in input).toBe(false)
    expect("estoque" in input).toBe(false)
    expect("stock" in input).toBe(false)
  })

  it("sku null (limpeza do sintético) vira string vazia (CLEAR)", () => {
    const input = patchAtualizacaoParaWriteInput(
      { name: "X", sku: null } as unknown as Record<string, unknown>,
      {},
    ) as unknown as Record<string, unknown>
    expect(input.sku).toBe("")
  })

  it("sku real passa intacto", () => {
    const input = patchAtualizacaoParaWriteInput(
      { name: "X", sku: "ABC-123" } as unknown as Record<string, unknown>,
      {},
    ) as unknown as Record<string, unknown>
    expect(input.sku).toBe("ABC-123")
  })

  it("brand vazio (limpeza da cópia da categoria) é preservado", () => {
    const input = patchAtualizacaoParaWriteInput(
      { name: "X", brand: "" } as unknown as Record<string, unknown>,
      {},
    ) as unknown as Record<string, unknown>
    expect(input.marca).toBe("")
  })

  it("custo/preço/garantia/active/status mapeiam com presença", () => {
    const input = patchAtualizacaoParaWriteInput(
      {
        name: "X",
        precoCusto: 5,
        price: 12,
        warrantyDays: 90,
        active: false,
        status: "Incompleto",
      } as unknown as Record<string, unknown>,
      {},
    ) as unknown as Record<string, unknown>
    expect(input.custo).toBe(5)
    expect(input.preco).toBe(12)
    expect(input.garantia).toBe(90)
    expect(input.active).toBe(false)
    expect(input.status).toBe("Incompleto")
  })
})
