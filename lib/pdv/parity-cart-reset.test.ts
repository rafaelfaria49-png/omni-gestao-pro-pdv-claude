/**
 * N5-A F-05 — Contrato do reset de carrinho/venda por superfície.
 *
 * Fonte: audit A.1 #06, §F-05, GAP-P1-01, GAP-P2-01.
 *
 * Cada superfície declara (via marcadores estáticos do componente) o que o
 * SEU fluxo de "limpar" considera estado de venda a limpar:
 *
 * - classic (F6 → Cancelar Venda): total — carrinho, seleção, bipe, busca,
 *   qty, cliente (volta a CONSUMIDOR);
 * - assistencia (Ctrl+L → AlertDialog): total — carrinho, draft local,
 *   desconto, busca, seleção;
 * - supermercado (Limpar, PIN-gated — GAP-P2-01 NÃO corrigido): total —
 *   carrinho, descontos, busca, nos 3 caminhos (modo-rápido/admin/PIN);
 * - venda-completa ("Limpar tudo"): TOTAL desde o N5-B1 R2 (GAP-P1-01
 *   CORRIGIDO) — carrinho, cliente, desconto, tipo, observação,
 *   endereço/entrega, busca/dropdowns, transientes e rascunho persistido.
 *   StoreSettings, preferências permanentes, holds e dados persistidos do
 *   cliente permanecem intactos.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { fixtureFor } from "./parity-fixtures"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

describe("F-05 — reset total nas superfícies do switcher", () => {
  it("classic (F6): Cancelar Venda limpa carrinho, cliente e buscas — reset total", () => {
    const source = read(fixtureFor("classic").componentPath)
    const block = source.slice(
      source.indexOf("onConfirmCancelSale={() => {"),
      source.indexOf("advancedOpen={shellAdvancedOpen}"),
    )
    expect(block, "carrinho limpo").toContain("setCart([])")
    expect(block, "cliente removido").toContain("setSelectedCustomer(null)")
    expect(block, "cliente volta a CONSUMIDOR").toContain('setShellCustomerField("CONSUMIDOR")')
    expect(block, "busca F3 limpa").toContain('setSearchTerm("")')
    expect(block, "qty padrão restaurada").toContain('setShellNextQty("1")')
    expect(block, "feedback honesto").toContain("Venda cancelada. Sistema limpo.")
  })

  it("assistencia (Ctrl+L): AlertDialog limpa carrinho, desconto, draft e busca", () => {
    const source = read(fixtureFor("assistencia").componentPath)
    const block = source.slice(
      source.indexOf('localStorage.removeItem(CART_STORAGE_KEY(storeIdKey))'),
      source.indexOf("<ItemAvulsoModal"),
    )
    expect(block, "carrinho limpo").toContain("setCart([])")
    expect(block, "desconto zerado").toContain("resetDiscountState()")
    expect(block, "busca limpa").toContain('setSearch("")')
    expect(block, "seleção limpa").toContain("setSelectedLineId(null)")
    expect(block, "draft local removido").toContain("localStorage.removeItem(CART_STORAGE_KEY(storeIdKey))")
    expect(block, "audit da limpeza").toContain("pdv_carrinho_limpo")
  })

  it("supermercado (Limpar): os 3 caminhos (modo-rápido/admin/PIN) zeram carrinho+desconto+busca", () => {
    const source = read(fixtureFor("supermercado").componentPath)
    // Três caminhos de limpeza auditados (modo-rápido, admin, PIN supervisor).
    expect(source.split("pdv_carrinho_limpo").length - 1).toBeGreaterThanOrEqual(3)
    // Cada caminho limpa desconto (reais + percentual) junto do carrinho.
    expect(source.split("setDiscountReais(0)").length - 1).toBeGreaterThanOrEqual(3)
    expect(source.split("setDiscountPercent(0)").length - 1).toBeGreaterThanOrEqual(3)
    // GAP-P2-01: PIN de supervisor CONTINUA no fluxo padrão (decisão pendente).
    expect(source).toContain('setSupervisorAction("clear_cart")')
  })
})

describe("F-05 — venda-completa: GAP-P1-01 CORRIGIDO no N5-B1 R2 (reset total)", () => {
  it("'Limpar tudo' chama o reset total (handleClearAllSale) — sem resíduo de venda anterior", () => {
    const source = read(fixtureFor("venda-completa").componentPath)
    const BUTTON = 'onClick={() => handleClearAllSale()}'
    expect(source.indexOf(BUTTON), "botão 'Limpar tudo' ligado ao reset total").toBeGreaterThan(-1)
    const fnIdx = source.indexOf("function handleClearAllSale()")
    expect(fnIdx, "handler do reset total existe").toBeGreaterThan(-1)
    const fnBlock = source.slice(fnIdx, source.indexOf("handleConfirmPayment"))
    // Reset TOTAL do estado operacional da venda (contrato R2).
    for (const marker of [
      "setCart([])",
      "setSelectedCliente(null)",
      "setClienteQuery(\"\")",
      "setDiscountReais(0)",
      'setTipoVenda("comum")',
      'setObservacaoGeral("")',
      "setEnderecoEntrega(EMPTY_ENDERECO)",
      "setShowEnderecoForm(false)",
      "setProductQuery(\"\")",
      "setShowProductDropdown(false)",
      "setAccessoryProduct(null)",
      "localStorage.removeItem(DRAFT_KEY(storeId))",
    ]) {
      expect(fnBlock, `Limpar tudo reseta ${marker}`).toContain(marker)
    }
    // Rascunho da venda atual sai; holds (armazenamento próprio) intocados.
    expect(fnBlock, "não toca holds").not.toContain("removeHeldSale")
  })

  it("hold na VC reseta total — contraste consistente com o novo 'Limpar tudo'", () => {
    const source = read(fixtureFor("venda-completa").componentPath)
    const holdIdx = source.indexOf("function handleHoldSale()")
    const resumeIdx = source.indexOf("function handleResumeSale(")
    const holdBlock = source.slice(holdIdx, resumeIdx)
    for (const marker of ["setCart([])", "setSelectedCliente(null)", "setDiscountReais(0)", 'setTipoVenda("comum")', "setObservacaoGeral(\"\")", "setEnderecoEntrega(EMPTY_ENDERECO)"]) {
      expect(holdBlock, `hold reseta ${marker}`).toContain(marker)
    }
  })

  it("CONFIRMED na VC reseta total — pós-venda não deixa resíduo (contraste)", () => {
    const source = read(fixtureFor("venda-completa").componentPath)
    const confirmedIdx = source.indexOf("// CONFIRMED: cupom definitivo")
    const confirmedBlock = source.slice(confirmedIdx, source.indexOf("const canFinalize ="))
    for (const marker of ["setCart([])", "setSelectedCliente(null)", "setDiscountReais(0)", 'setTipoVenda("comum")', "setEnderecoEntrega(EMPTY_ENDERECO)"]) {
      expect(confirmedBlock, `CONFIRMED reseta ${marker}`).toContain(marker)
    }
  })
})
