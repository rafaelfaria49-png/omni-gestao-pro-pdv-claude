import { describe, expect, it } from "vitest"
import {
  assertProductCommercialSaleSupported,
  assertProductStockEntrySupported,
  productCommercialCatalogProjection,
  productStockMovementAvailability,
} from "@/lib/cadastros/product-commercial-contract"

const unit = { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" }
const kg = { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" }

describe("Disponibilidade de Entrada/Ajuste lida da projeção comercial canônica", () => {
  it.each([
    ["sem declaração (legado unitário)", {}],
    ["metadata ausente", null],
    ["declaração por unidade", { comercial: unit }],
  ])("%s: movimentação disponível em UN", (_label, metadata) => {
    expect(productStockMovementAvailability(metadata)).toEqual({ disponivel: true, unidade: "UN", ajusteDisponivel: true })
    expect(() => assertProductCommercialSaleSupported(metadata)).not.toThrow()
    expect(() => assertProductStockEntrySupported(metadata)).not.toThrow()
  })

  it.each([
    [{ comercial: kg }],
    [{ vendaPorPeso: true }],
    [{ vendaPorPeso: true, comercial: unit }],
  ])("KG: Entrada disponível, Ajuste não, venda continua bloqueada: %j", (metadata) => {
    const availability = productStockMovementAvailability(metadata)
    expect(availability).toMatchObject({ disponivel: true, unidade: "KG", ajusteDisponivel: false })
    if (!availability.disponivel || availability.unidade !== "KG") throw new Error("unreachable")
    expect(availability.ajusteOrientacao).toMatch(/Ajuste de saldo em KG ainda não está disponível/)
    expect(() => assertProductStockEntrySupported(metadata)).not.toThrow()
    // Entrada liberada não libera venda: quantidade, preço, pagamento e baixa seguem fora.
    expect(() => assertProductCommercialSaleSupported(metadata)).toThrow(expect.objectContaining({ code: "PRODUTO_POR_PESO_NAO_OPERACIONAL" }))
    expect(productCommercialCatalogProjection(metadata, 20)).toMatchObject({ vendaOperacional: false, estoqueFracionadoOperacional: true })
  })

  it("G: peso em preparação segue bloqueado para entrada e venda", () => {
    const metadata = { comercial: { version: 1, modoVenda: "peso", unidade: "G", basePreco: "G" } }
    const availability = productStockMovementAvailability(metadata)
    expect(availability).toMatchObject({ disponivel: false, motivo: "peso_em_preparacao", unidade: "G" })
    if (availability.disponivel) throw new Error("unreachable")
    expect(availability.titulo).toMatch(/peso em preparação/)
    expect(availability.orientacao).toContain("G")
    expect(() => assertProductStockEntrySupported(metadata)).toThrow(expect.objectContaining({ code: "ESTOQUE_UNIDADE_NAO_OPERACIONAL" }))
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
    expect(() => assertProductStockEntrySupported({ comercial })).toThrow(expect.objectContaining({ code: "PRODUTO_COMERCIAL_INVALIDO" }))
  })
})
