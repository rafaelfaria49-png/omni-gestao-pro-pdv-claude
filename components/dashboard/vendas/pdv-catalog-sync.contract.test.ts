/**
 * PDV-CADASTROS-SYNC-AUTOMATICO-001 — painel de revisão (render) e contrato estático da
 * integração no PDV Clássico e no operations-store (o provider não tem harness de runtime).
 */
import React from "react"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PdvCatalogDivergencePanel, stockAdjustTarget } from "./pdv-catalog-divergence-panel"
import type { CartCatalogDivergence } from "@/lib/pdv/cart-catalog-reconcile"

const REPO_ROOT = resolve(__dirname, "..", "..", "..")
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8")

function between(source: string, start: string, end: string): string {
  const i = source.indexOf(start)
  const j = source.indexOf(end, i + start.length)
  expect(i, `marcador ausente: ${start}`).toBeGreaterThanOrEqual(0)
  expect(j, `marcador ausente: ${end}`).toBeGreaterThan(i)
  return source.slice(i, j)
}

const noop = () => {}
function render(divergences: CartCatalogDivergence[]) {
  return renderToStaticMarkup(
    React.createElement(PdvCatalogDivergencePanel, {
      divergences,
      onApplyCatalogPrice: noop,
      onKeepCartPrice: noop,
      onAdjustQuantity: noop,
      onRemoveLine: noop,
    }),
  )
}

describe("PdvCatalogDivergencePanel", () => {
  it("sem divergência não renderiza nada", () => {
    expect(render([])).toBe("")
  })

  it("preço: oferece usar o novo ou manter o do carrinho", () => {
    const html = render([{ kind: "price", lineId: "l1", produtoId: "p", name: "KIT", cartPrice: 59.99, previousCatalogPrice: 59.99, catalogPrice: 64.9 }])
    expect(html).toContain('role="alert"')
    expect(html).toContain("Revise antes de cobrar")
    expect(html).toMatch(/Usar R\$\s?64,90/)
    expect(html).toMatch(/Manter R\$\s?59,99/)
    expect(html).toContain("Remover item")
  })

  it("excluído: só remover (não há como manter o item)", () => {
    const html = render([{ kind: "removed", lineId: "l1", produtoId: "p", name: "KIT" }])
    expect(html).toContain("excluído do cadastro")
    expect(html).not.toContain("Usar ")
    expect(html).not.toContain("Ciente")
    expect(html).toContain("Remover item")
  })

  it("saldo: ajustar ao que cabe (descontando as outras linhas do produto) ou remover", () => {
    const d = { kind: "stock" as const, lineId: "l2", produtoId: "p", name: "KIT", inCart: 3, available: 2, lineQuantity: 2 }
    expect(stockAdjustTarget(d)).toBe(1)
    expect(render([d])).toContain("Ajustar para 1")
    const semSaldo = { ...d, available: 1, lineQuantity: 2, inCart: 3 }
    expect(stockAdjustTarget(semSaldo)).toBe(0)
    const html = render([semSaldo])
    expect(html).not.toContain("Ajustar para")
    expect(html).toContain("Remover item")
  })
})

describe("PDV Clássico — contrato da sincronização do catálogo", () => {
  const classic = read("components/dashboard/vendas/pdv-classic.tsx")
  const openPayment = between(classic, "const openPaymentFlow = useCallback(", "const openPaymentModal")

  it("linha nasce com Produto.id e preço de catálogo; finalização envia produtoId", () => {
    expect(classic).toContain("produtoId: catalogProduct.dbId, catalogUnitPrice: catalogProduct.price")
    expect(classic).toContain("...(item.produtoId ? { produtoId: item.produtoId } : {}),")
  })

  it("reconciliação usa o estado mais novo do carrinho (não perde linha incluída no meio)", () => {
    expect(classic).toContain("setCart((prev) => reconcileCartWithCatalog(prev, inventory,")
  })

  it("pagamento bloqueado enquanto houver divergência (abrir e confirmar)", () => {
    expect(openPayment).toContain("if (catalogDivergences.length > 0) {")
    const confirm = between(classic, "onConfirm={async (payments, meta) => {", "const unresolvedClassic")
    expect(confirm).toContain("if (catalogDivergences.length > 0) {")
  })

  it("abrir o PDV liga os checks automáticos e confere a versão do catálogo", () => {
    expect(classic).toContain("const stop = watchCatalogSync()")
    expect(classic).toContain("void checkCatalog()")
    expect(classic).toContain("return stop")
  })

  it("venda em espera leva identidade e base de preço", () => {
    expect(classic.match(/produtoId: i\.produtoId,/g)?.length).toBe(2)
  })
})

describe("operations-store — contrato da sincronização do catálogo", () => {
  const store = read("lib/operations-store.tsx")
  const effect = between(store, "const catalogSyncRef = useRef", "setOpsDbReady(false)")

  it("checks automáticos só com uma superfície de venda montada; aviso de cadastro vale sempre", () => {
    expect(effect).toContain("if (catalogWatchersRef.current > 0) sync(false)")
    expect(effect).toContain("subscribeCatalogChanged(lj, () => sync(true))")
  })

  it("chamadas do sync são NetworkOnly no service worker e não saem offline", () => {
    expect(effect).toContain("&catalogSync=1")
    expect(effect).toContain('navigator.onLine === false) return null')
    const next = read("next.config.mjs")
    expect(next).toContain('url.pathname === "/api/ops/inventory" && url.searchParams.get("catalogSync") === "1"')
  })

  it("volta da rede não recarrega a página (o next-pwa recarrega por padrão e apaga o carrinho)", () => {
    expect(read("next.config.mjs")).toMatch(/withPWAInit\(\{[\s\S]*?reloadOnOnline: false,[\s\S]*?\}\)/)
    expect(effect).toContain('window.addEventListener("online", onOnline)')
    // Offline nem tenta: não gasta o intervalo mínimo que atrasaria o check da volta.
    expect(effect).toMatch(/if \(navigator\.onLine === false\) return\r?\n\s*if \(catalogWatchersRef\.current > 0\) sync\(false\)/)
  })

  it("catálogo novo não reenvia ordens (o PUT legado só reage a ordens)", () => {
    expect(store).toContain("const snap = JSON.stringify({ ord: state.ordens })")
    expect(store).toContain("}, [opsDbReady, state.ordens, storageKey, canReadOperations])")
    expect(store).not.toMatch(/JSON\.stringify\(\{\s*inv:/)
  })

  it("gatilhos: foco, volta da aba, volta da rede, aviso de cadastro e intervalo só com aba visível", () => {
    expect(effect).toContain('window.addEventListener("focus", onFocus)')
    expect(effect).toContain('window.addEventListener("online", onOnline)')
    expect(effect).toContain('document.addEventListener("visibilitychange", onVisibility)')
    expect(effect).toContain("subscribeCatalogChanged(lj, () => sync(true))")
    expect(effect).toContain("window.setInterval(onVisibility, CATALOG_SYNC_INTERVAL_MS)")
    expect(effect).toContain('if (document.visibilityState === "visible") autoSync()')
  })

  it("resposta de outra loja nunca vira catálogo desta", () => {
    expect(effect).toContain("if (body._lojaIdRecebido !== lj) return null")
    expect(effect).toContain("body.storeId === lj")
  })

  it("atualização só troca `inventory` (carrinho, pendências e caixa intactos)", () => {
    expect(effect).toContain("setState((prev) => ({ ...prev, inventory: withPendingDevolucaoStock(snapshot.items, prev.devolucoes) }))")
  })

  it("limpa tudo ao trocar de loja", () => {
    expect(effect).toContain("controller.dispose()")
    expect(effect).toContain("unsubscribe()")
    expect(effect).toContain("window.clearInterval(timer)")
  })

  it("recusa definitiva em venda nova vira FAILED pela taxonomia, nunca PENDING", () => {
    expect(store).toContain('if (disposition === "FAILED" && code) {')
  })
})
