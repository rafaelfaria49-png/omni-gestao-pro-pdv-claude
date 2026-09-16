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
 * - venda-completa ("Limpar tudo"): TOTAL desde o N5-B1 (GAP-P1-01=FIXED) —
 *   contrato único `resetFreshSaleState` compartilhado por "Limpar tudo"
 *   (confirmado), CONFIRMED e hold-save, sem três implementações divergentes.
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

describe("F-05 — venda-completa: GAP-P1-01=FIXED (contrato único de nova venda)", () => {
  const FRESH_MARKERS = [
    "setCart([])",
    "setSelectedCliente(null)",
    "setClienteQuery(",
    "setShowClienteDropdown(false)",
    "setProductQuery(",
    "setShowProductDropdown(false)",
    "setExpandedLineId(null)",
    "setDiscountReais(0)",
    'setTipoVenda("comum")',
    'setObservacaoGeral("")',
    "setEnderecoEntrega(EMPTY_ENDERECO)",
    "setShowEnderecoForm(false)",
  ]

  it("'Limpar tudo' pede confirmação e delega ao reset único (sem handler parcial inline)", () => {
    const source = read(fixtureFor("venda-completa").componentPath)
    // O botão abre o diálogo de confirmação — nada é limpo no clique.
    expect(source).toContain("onClick={() => setShowClearSaleConfirm(true)}")
    expect(source).toContain("Limpar tudo")
    // O handler parcial antigo (só carrinho + UI da busca) não existe mais.
    expect(source).not.toContain(
      'onClick={() => { setCart([]); setExpandedLineId(null); setProductQuery(""); setShowProductDropdown(false) }}',
    )
    // A confirmação executa o contrato único.
    const confirmIdx = source.indexOf("function confirmClearSale()")
    expect(confirmIdx).toBeGreaterThan(-1)
    expect(source.slice(confirmIdx, confirmIdx + 600)).toContain("resetFreshSaleState()")
  })

  it("resetFreshSaleState zera todo estado operacional da venda (e nada permanente)", () => {
    const source = read(fixtureFor("venda-completa").componentPath)
    const resetIdx = source.indexOf("function resetFreshSaleState()")
    expect(resetIdx, "contrato único presente").toBeGreaterThan(-1)
    const block = source.slice(resetIdx, source.indexOf("function confirmClearSale()"))
    for (const marker of FRESH_MARKERS) {
      expect(block, `reset contém ${marker}`).toContain(marker)
    }
    // Transitórios também zerados; permanentes/holds/cupom intocados.
    expect(block).toContain("setAccessoryProduct(null)")
    expect(block).toContain("scanFeedback.dismiss()")
    expect(block).toContain("localStorage.removeItem(DRAFT_KEY(storeId))")
    expect(block).not.toContain("removeHeldSale")
    expect(block).not.toContain("setCupomOpen")
    expect(block).not.toContain("useStoreSettings")
  })

  it("hold-save e CONFIRMED usam o mesmo reset (sem terceira implementação)", () => {
    const source = read(fixtureFor("venda-completa").componentPath)
    const holdIdx = source.indexOf("function handleHoldSale()")
    const resumeIdx = source.indexOf("function handleResumeSale(")
    expect(source.slice(holdIdx, resumeIdx)).toContain("resetFreshSaleState()")
    const confirmedIdx = source.indexOf("// CONFIRMED: cupom definitivo")
    const confirmedBlock = source.slice(confirmedIdx, source.indexOf("const canFinalize ="))
    expect(confirmedBlock).toContain("resetFreshSaleState()")
    // Uma única definição do contrato em todo o componente.
    expect(source.split("function resetFreshSaleState()").length - 1).toBe(1)
  })
})
