/**
 * REGRESSÃO P0 — PDV-RAFACELL-LOAD-CRASH-P0-001
 *
 * A loja RafaCell não abre `/dashboard/vendas` enquanto outra loja abre.
 * Hipótese sob teste: UM único registro com formato inesperado, escopado à
 * loja (pending local, retorno da API, settings, terminal, hold, carrinho),
 * derruba a rota inteira porque o mount do PDV acessa os dados sem validar
 * os ELEMENTOS dos arrays (só checa `Array.isArray`).
 *
 * Estes testes usam fixtures "RafaCell" (registro problemático) × "controle"
 * (registro limpo) e exigem: nenhum throw, nenhum dado legítimo perdido.
 *
 * RED (pré-fix): cada teste "rafacell" falha com TypeError.
 * GREEN (pós-fix): todos passam.
 */
import { describe, expect, it } from "vitest"
import { mergeSalesById } from "@/lib/operations-sales-merge"
import { mergePdvCatalogWithInventory } from "@/lib/pdv-catalog"
import { preserveSaleIdentityConflictCodes } from "@/lib/vendas/sale-identity-conflict"
import { resolveSaleLineItemType } from "@/lib/sale-line-classification"
import {
  isServicoDisponivelParaVenda,
} from "@/lib/servicos/servico-pdv"
import { normalizeServicoRow } from "@/lib/pdv-assistencia-shortcuts"

// ── Fixtures ────────────────────────────────────────────────────────────────

function vendaBase(over: Record<string, unknown> = {}) {
  return {
    id: "VDA-2026-0001",
    at: "2026-09-17T10:00:00.000Z",
    lines: [],
    total: 0,
    paymentBreakdown: {},
    ...over,
  } as any
}

// Pending legítima da RafaCell: sincronização ainda não confirmada.
const PENDING_OK = vendaBase({ id: "PEND-cs_rafacell_01", clientSaleId: "cs_rafacell_01", syncPending: true })
// Registro problemático: pending antiga sem `at` (payload legado / restore parcial).
const PENDING_SEM_AT = vendaBase({ id: "PEND-cs_rafacell_02", clientSaleId: "cs_rafacell_02", syncPending: true, at: undefined })

const INVENTARIO_OK = [
  { id: "p1", name: "Capa Silicone", stock: 10, cost: 5, price: 25, category: "Acessórios" },
] as any[]

describe("PDV-RAFACELL-LOAD-CRASH-P0-001 — um registro ruim não derruba a rota", () => {
  it("controle: merge de vendas limpas não lança", () => {
    expect(() => mergeSalesById([PENDING_OK], [])).not.toThrow()
  })

  it("rafacell: pending legítima sem `at` não derruba o merge (preserva a pendência)", () => {
    let merged: any[] = []
    expect(() => {
      merged = mergeSalesById([PENDING_OK, PENDING_SEM_AT], [])
    }).not.toThrow()
    // Nenhuma venda legítima pode ser perdida na sanitização.
    expect(merged.map((s) => s.id).sort()).toEqual(
      ["PEND-cs_rafacell_01", "PEND-cs_rafacell_02"].sort(),
    )
    expect(merged.find((s) => s.id === "PEND-cs_rafacell_02")?.syncPending).toBe(true)
  })

  it("rafacell: venda remota sem `at` não derruba o merge", () => {
    const remoteSemAt = vendaBase({ id: "VDA-2026-0099", at: undefined })
    let merged: any[] = []
    expect(() => {
      merged = mergeSalesById([PENDING_OK], [remoteSemAt])
    }).not.toThrow()
    expect(merged.length).toBeGreaterThanOrEqual(2)
  })

  it("rafacell: entradas nulas no array de vendas não derrubam o merge", () => {
    let merged: any[] = []
    expect(() => {
      merged = mergeSalesById([PENDING_OK, null, undefined] as any, [null] as any)
    }).not.toThrow()
    expect(merged.map((s) => s?.id)).toContain("PEND-cs_rafacell_01")
  })

  it("controle: catálogo limpo faz merge sem lançar", () => {
    expect(() => mergePdvCatalogWithInventory([], INVENTARIO_OK)).not.toThrow()
  })

  it("rafacell: item nulo no inventário não derruba o catálogo (quarentena localizada)", () => {
    let products: any[] = []
    expect(() => {
      products = mergePdvCatalogWithInventory([], [...INVENTARIO_OK, null, undefined] as any)
    }).not.toThrow()
    // O item legítimo continua vendável.
    expect(products.map((p) => p.id)).toContain("p1")
    // Todo produto resultante precisa ter categoria string (o render faz `p.category.toLowerCase()`).
    for (const p of products) {
      expect(typeof p.category).toBe("string")
      expect(() => (p.category as string).toLowerCase()).not.toThrow()
    }
  })

  it("rafacell: item sem categoria normaliza para default seguro", () => {
    const semCategoria = { id: "p2", name: "Película", stock: 5, cost: 2, price: 15 } as any
    let products: any[] = []
    expect(() => {
      products = mergePdvCatalogWithInventory([], [semCategoria])
    }).not.toThrow()
    expect(typeof products[0]?.category).toBe("string")
  })

  it("rafacell: códigos de quarentena com entradas nulas não derrubam a persistência", () => {
    expect(() =>
      preserveSaleIdentityConflictCodes(
        [PENDING_OK, null] as any,
        [{ id: "VDA-2026-0001", syncPending: true, syncBlockedCode: "PEDIDO_ID_DE_OUTRA_LOJA" }, null] as any,
      ),
    ).not.toThrow()
  })

  it("rafacell: classificação de linha tolera entrada nula (default produto)", () => {
    expect(() => resolveSaleLineItemType(null as any)).not.toThrow()
    expect(resolveSaleLineItemType(null as any)).toBe("produto")
    expect(resolveSaleLineItemType(undefined as any)).toBe("produto")
  })

  it("rafacell: linha de serviço com campos nulos não derruba o catálogo de serviços", () => {
    expect(() => isServicoDisponivelParaVenda(null as any)).not.toThrow()
    expect(isServicoDisponivelParaVenda(null as any)).toBe(false)
    expect(() =>
      normalizeServicoRow({ id: null, nome: null, categoria: null, custo: NaN, preco: NaN, garantia: null, termo: null, active: true, status: "Ativo" } as any),
    ).not.toThrow()
  })
})
