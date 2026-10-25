/**
 * ESTOQUE-MANUAL-KG-001 — orientação do PDV para produto por peso.
 * 1. O guard puro não manda repor estoque.
 * 2. O catálogo do PDV carrega a marca projetada por `/api/ops/inventory`.
 * 3. Estático: todo `addToCart` dos PDVs ativos chama o guard ANTES de olhar o estoque.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pdvWeightSaleBlockedNotice } from "@/lib/pdv-weight-sale-guard"
import { mergePdvCatalogWithInventory } from "@/lib/pdv-catalog"
import type { InventoryItem } from "@/lib/operations-store"

const ROOT = resolve(__dirname, "..")

describe("pdvWeightSaleBlockedNotice", () => {
  it("sem marca: segue o fluxo normal", () => {
    expect(pdvWeightSaleBlockedNotice({ name: "Coca 2L" })).toBeNull()
  })

  it("com marca: explica que a venda por kg não está liberada, sem mandar repor estoque", () => {
    const n = pdvWeightSaleBlockedNotice({ name: "PAO FRANCES", vendaPesoIndisponivel: true })
    expect(n?.title).toBe("Venda por peso ainda não liberada")
    expect(n?.description).toMatch(/PAO FRANCES é vendido por kg/)
    expect(n?.description).toMatch(/Não venda como unidade nem como item avulso/)
    expect(`${n?.title} ${n?.description}`).not.toMatch(/sem saldo|sem estoque|adicione|dar entrada|repor/i)
  })
})

describe("mergePdvCatalogWithInventory", () => {
  const inv = (over: Partial<InventoryItem>): InventoryItem =>
    ({ id: "p1", name: "PAO FRANCES", stock: 3.25, cost: 0, price: 20, category: "Padaria", ...over }) as InventoryItem

  it("carrega a marca nos itens novos e a remove quando o servidor deixa de enviá-la", () => {
    const [novo] = mergePdvCatalogWithInventory([], [inv({ vendaPesoIndisponivel: true })])
    expect(novo).toMatchObject({ id: "p1", stock: 3.25, vendaPesoIndisponivel: true })
    const [atualizado] = mergePdvCatalogWithInventory([novo], [inv({})])
    expect(atualizado).not.toHaveProperty("vendaPesoIndisponivel")
    const [remarcado] = mergePdvCatalogWithInventory([atualizado], [inv({ vendaPesoIndisponivel: true })])
    expect(remarcado.vendaPesoIndisponivel).toBe(true)
  })
})

describe("todo addToCart dos PDVs recusa peso antes de checar estoque", () => {
  it.each([
    ["components/dashboard/vendas/pdv-classic.tsx", "const addToCart = (product: Product"],
    ["components/dashboard/vendas/pdv-supermercado.tsx", "const addToCart = useCallback("],
    ["components/dashboard/vendas/pdv-venda-completa-enterprise.tsx", "const addToCart = useCallback("],
    ["components/dashboard/vendas/venda-completa-enterprise.tsx", "const addToCart = useCallback("],
    ["components/dashboard/vendas/controle-consumo.tsx", "const addProduct = (product: PdvCatalogProduct"],
    ["components/dashboard/vendas/pdv-assistencia-enterprise.tsx", "const addItem = (item: PdvCatalogProduct"],
    ["components/pdv-next/PdvBlackEdition.tsx", "const addProduct = useCallback("],
  ])("%s", (file, start) => {
    const src = readFileSync(join(ROOT, file), "utf8")
    const i = src.indexOf(start)
    expect(i).toBeGreaterThan(-1)
    const body = src.slice(i)
    const guard = body.indexOf("pdvWeightSaleBlockedNotice(")
    // Primeira checagem de estoque — ou, no Black (sem checagem), a primeira mutação do carrinho.
    const stock = body.search(/\.stock\b|stock <= 0|Sem estoque|servicoMetaById|setCartRows\(|setCart\(/)
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(stock)
  })

  it("a rota de inventário projeta a marca a partir da declaração comercial canônica", () => {
    const src = readFileSync(join(ROOT, "app/api/ops/inventory/route.ts"), "utf8")
    expect(src).toMatch(/isProductWeightDeclared\(row\.metadata\) \? \{ vendaPesoIndisponivel: true as const \}/)
  })
})
