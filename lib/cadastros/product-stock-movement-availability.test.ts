import { describe, expect, it } from "vitest"
import {
  assertProductCommercialSaleSupported,
  productStockMovementAvailability,
} from "@/lib/cadastros/product-commercial-contract"

const unit = { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" }

describe("Disponibilidade de Entrada/Ajuste lida da projeção comercial canônica", () => {
  it.each([
    ["sem declaração (legado unitário)", {}],
    ["metadata ausente", null],
    ["declaração por unidade", { comercial: unit }],
  ])("%s: movimentação disponível em UN", (_label, metadata) => {
    expect(productStockMovementAvailability(metadata)).toEqual({ disponivel: true, unidade: "UN" })
    expect(() => assertProductCommercialSaleSupported(metadata)).not.toThrow()
  })

  it.each([
    [{ comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }, "KG"],
    [{ comercial: { version: 1, modoVenda: "peso", unidade: "G", basePreco: "G" } }, "G"],
    [{ vendaPorPeso: true }, "KG"],
    [{ vendaPorPeso: true, comercial: unit }, "KG"],
  ])("peso em preparação bloqueia com motivo próprio e unidade: %j", (metadata, unidade) => {
    const availability = productStockMovementAvailability(metadata)
    expect(availability).toMatchObject({ disponivel: false, motivo: "peso_em_preparacao", unidade })
    if (availability.disponivel) throw new Error("unreachable")
    expect(availability.titulo).toMatch(/peso em preparação/)
    expect(availability.orientacao).toContain(unidade)
    // A tela e o writer concordam: o servidor recusa a mesma movimentação.
    expect(() => assertProductCommercialSaleSupported(metadata)).toThrow()
  })

  it.each([
    { version: 1, modoVenda: "unidade", unidade: "KG", basePreco: "KG" },
    { version: 2, modoVenda: "unidade", unidade: "UN", basePreco: "UN" },
    { version: 2, modoVenda: "peso", unidade: "KG", basePreco: "KG" },
    null,
  ])("declaração inválida tem orientação própria, sem unidade presumida: %j", (comercial) => {
    const availability = productStockMovementAvailability({ comercial })
    expect(availability).toMatchObject({ disponivel: false, motivo: "declaracao_invalida", unidade: null })
    if (availability.disponivel) throw new Error("unreachable")
    expect(availability.titulo).toMatch(/declaração comercial inválida/)
    expect(availability.orientacao).not.toMatch(/Movimentar estoque/)
    expect(() => assertProductCommercialSaleSupported({ comercial })).toThrow()
  })
})
