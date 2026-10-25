/**
 * ESTOQUE-MANUAL-KG-001 — orientação do PDV para produto por peso.
 * 1. O guard puro não manda repor estoque.
 * 2. O catálogo do PDV carrega a marca projetada por `/api/ops/inventory`.
 * 3. Estático: todo `addToCart` dos PDVs ativos chama o guard ANTES de olhar o estoque.
 */
import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  inventoryWeightSaleProjection,
  pdvWeightSaleBlockedNotice,
  pdvWeightSaleFlag,
  pdvWeightSaleRemovedNotice,
  splitWeightBlockedLines,
} from "@/lib/pdv-weight-sale-guard"
import { lookupPdvScanRemote } from "@/lib/pdv-scan-lookup"
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

  it.each(["app/api/ops/inventory/route.ts", "app/api/ops/inventory/lookup/route.ts"])("%s projeta a marca pela declaração comercial canônica", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8")
    expect(src).toMatch(/\.\.\.inventoryWeightSaleProjection\(row\.metadata\)/)
  })
})

describe("projeção, separação e aviso de remoção", () => {
  const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
  it("projeção: KG e legado vendaPorPeso marcados; UN e ausência sem marca", () => {
    expect(inventoryWeightSaleProjection(KG)).toEqual({ vendaPesoIndisponivel: true })
    expect(inventoryWeightSaleProjection({ vendaPorPeso: true })).toEqual({ vendaPesoIndisponivel: true })
    expect(inventoryWeightSaleProjection({})).toEqual({})
    expect(inventoryWeightSaleProjection(null)).toEqual({})
    expect(pdvWeightSaleFlag({ vendaPesoIndisponivel: true })).toEqual({ vendaPesoIndisponivel: true })
    expect(pdvWeightSaleFlag({})).toEqual({})
  })

  it("separa linhas por id operacional ou id do banco; mantém avulso, serviço e desconhecidos", () => {
    const catalog = [
      { id: "PAO", dbId: "cuid-pao", name: "Pão francês", vendaPesoIndisponivel: true },
      { id: "BOLO", name: "Bolo" },
    ]
    const lines = [{ inventoryId: "PAO" }, { inventoryId: "cuid-pao" }, { inventoryId: "BOLO" }, { inventoryId: "avulso-1" }, {}]
    const r = splitWeightBlockedLines(lines, catalog)
    expect(r.kept).toEqual([{ inventoryId: "BOLO" }, { inventoryId: "avulso-1" }, {}])
    expect(r.blockedNames).toEqual(["Pão francês"])
    expect(splitWeightBlockedLines(lines, [{ id: "BOLO", name: "Bolo" }]).kept).toHaveLength(5)
  })

  it("aviso de remoção também não manda repor estoque", () => {
    const n = pdvWeightSaleRemovedNotice(["Pão francês", "Queijo"])
    expect(n.description).toMatch(/^Pão francês, Queijo saíram do carrinho/)
    expect(n.description).not.toMatch(/sem saldo|sem estoque|repor/i)
  })
})

describe("bipe remoto (lookup) preserva a marca até o addToCart", () => {
  it.each([10, 0])("produto KG fora do snapshot local, saldo %s", async (stock) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [{ id: "PAO", dbId: "cuid-pao", name: "Pão francês", stock, price: 18.9, vendaPesoIndisponivel: true }] }), { status: 200 })))
    try {
      let inv: InventoryItem[] = []
      const r = await lookupPdvScanRemote({ code: "PAO", storeId: "loja-a", setInventory: (u) => { inv = typeof u === "function" ? u(inv) : u } })
      expect(r.kind).toBe("single")
      if (r.kind !== "single") return
      expect(r.product).toMatchObject({ id: "PAO", stock, vendaPesoIndisponivel: true })
      expect(inv[0]).toMatchObject({ vendaPesoIndisponivel: true })
      expect(pdvWeightSaleBlockedNotice(r.product)?.title).toBe("Venda por peso ainda não liberada")
    } finally { vi.unstubAllGlobals() }
  })
})
