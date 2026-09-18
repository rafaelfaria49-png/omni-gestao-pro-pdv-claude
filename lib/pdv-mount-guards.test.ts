/**
 * Guards do mount do PDV (P0 PDV-RAFACELL-LOAD-CRASH-P0-001).
 *
 * Cobre `lib/pdv-mount-guards.ts` e `lib/pdv-mount-diagnostics.ts`:
 * - nenhum sanitizador lança, nunca;
 * - objetos legítimos são preservados (por cópia — o input nunca é mutado,
 *   pois pode ser state React);
 * - só entradas sem dado (`null`/primitivos) são quarentenadas;
 * - diagnóstico só carrega contagens (sem PII) e é limitado a 50 marcas.
 */
import { describe, expect, it } from "vitest"
import {
  compareSaleAtAsc,
  countNonRecords,
  isRecord,
  keepRecords,
  safeCategoryLower,
  sanitizeAtalhosRapidos,
  sanitizeCartLines,
  sanitizeGarantiaCategorias,
  sanitizeHeldSales,
  sanitizeInventoryItems,
  sanitizeMesas,
  sanitizeSaleRecords,
  sanitizeServicoRows,
  sanitizeStringList,
  sanitizeTerminalCards,
} from "@/lib/pdv-mount-guards"
import {
  getPdvMountSnapshot,
  markPdvMountStep,
} from "@/lib/pdv-mount-diagnostics"

describe("pdv-mount-guards", () => {
  it("isRecord/keepRecords/countNonRecords nunca lançam e filtram não-objetos", () => {
    expect(isRecord(null)).toBe(false)
    expect(isRecord("x")).toBe(false)
    expect(isRecord([1])).toBe(false)
    expect(isRecord({})).toBe(true)
    expect(keepRecords([null, { a: 1 }, "x", 42])).toEqual([{ a: 1 }])
    expect(keepRecords("nao-array" as any)).toEqual([])
    expect(keepRecords(null)).toEqual([])
    expect(countNonRecords([null, { a: 1 }, undefined])).toBe(2)
    expect(countNonRecords(null)).toBe(0)
  })

  it("sanitizeSaleRecords preserva pendings e normaliza at/lines sem mutar o input", () => {
    const pending = {
      id: "PEND-1",
      clientSaleId: "cs-1",
      syncPending: true,
      lines: [{ inventoryId: "p1", quantity: 2 }],
    }
    const legacy = { id: "VDA-1", syncPending: false }
    const input = [pending, legacy, null, "lixo"]
    const frozen = JSON.parse(JSON.stringify([pending, legacy]))
    const out = sanitizeSaleRecords<any>(input)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: "PEND-1", syncPending: true })
    expect(out[0].lines).toHaveLength(1)
    expect(out[1]).toMatchObject({ id: "VDA-1", at: "", lines: [] })
    // Sem mutação do input (pode ser state React).
    expect([pending, legacy]).toEqual(frozen)
    expect(input).toHaveLength(4)
  })

  it("compareSaleAtAsc ordena com `at` ausente sem lançar", () => {
    expect(() => [{}, { at: "b" }, null].sort(compareSaleAtAsc)).not.toThrow()
    const sorted = [{ at: "b" }, {}, { at: "a" }].sort(compareSaleAtAsc)
    expect(sorted.map((s: any) => s.at ?? "")).toEqual(["", "a", "b"])
  })

  it("sanitizeInventoryItems garante categoria string e não muta", () => {
    const item = { id: "p1", name: "X", stock: 3, price: 10, category: null }
    const out = sanitizeInventoryItems<any>([item, null, { id: "", name: "Y" }])
    expect(out).toHaveLength(2)
    expect(out[0].category).toBe("Outros")
    expect(out[1]).toMatchObject({ id: "", name: "Y", category: "Outros" })
    expect(item).toEqual({ id: "p1", name: "X", stock: 3, price: 10, category: null })
    for (const p of out) {
      expect(() => (p.category as string).toLowerCase()).not.toThrow()
    }
  })

  it("safeCategoryLower nunca lança", () => {
    expect(safeCategoryLower("Acessórios")).toBe("acessórios")
    expect(safeCategoryLower(null)).toBe("outros")
    expect(safeCategoryLower(undefined)).toBe("outros")
    expect(safeCategoryLower("")).toBe("outros")
    expect(safeCategoryLower(42)).toBe("outros")
  })

  it("sanitizeStringList mantém só strings não-vazias", () => {
    expect(sanitizeStringList(["a", null, "", 1, "b"])).toEqual(["a", "b"])
    expect(sanitizeStringList(null)).toEqual([])
  })

  it("sanitizeAtalhosRapidos/sanitizeGarantiaCategorias normalizam por cópia", () => {
    const atalhos = sanitizeAtalhosRapidos<any>([{ id: "a", nome: null, preco: NaN }, null])
    expect(atalhos).toHaveLength(1)
    expect(atalhos[0]).toMatchObject({ id: "a", nome: "", preco: 0 })
    const cats = sanitizeGarantiaCategorias<any>([{ id: 1, servico: null }, null])
    expect(cats).toHaveLength(1)
    expect(cats[0]).toMatchObject({ id: "", servico: "", detalhes: "" })
  })

  it("sanitizeServicoRows normaliza resposta parcial da API", () => {
    const out = sanitizeServicoRows<any>([
      { id: "s1", nome: "Troca de tela", categoria: "Reparo", preco: 120, active: true, status: "Ativo" },
      null,
      { id: null, nome: null, preco: "x" },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: "s1", nome: "Troca de tela" })
    expect(out[1]).toMatchObject({ id: "", nome: "", preco: 0 })
  })

  it("sanitizeTerminalCards cai para INATIVO com lock default", () => {
    const out = sanitizeTerminalCards<any>([
      { id: "t1", code: "PDV1", name: "PDV 1", status: "ACTIVE", lock: { status: "LIVRE" } },
      null,
      { id: "t2", code: "PDV2" },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].lock.status).toBe("LIVRE")
    expect(out[1]).toMatchObject({ status: "INACTIVE" })
    expect(out[1].lock).toMatchObject({
      status: "INATIVO",
      lockedByOperador: null,
      heartbeatAt: null,
      lockedAt: null,
      isMine: false,
    })
    // Render do TerminalSelector nunca lança com o cartão sanitizado.
    for (const t of out) {
      expect(() => t.lock.status).not.toThrow()
    }
  })

  it("sanitizeCartLines/sanitizeHeldSales/sanitizeMesas preservam objetos válidos", () => {
    const lines = sanitizeCartLines<any>([{ inventoryId: "p1", price: NaN, qty: 2, title: "X" }, null])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ inventoryId: "p1", price: 0, qty: 2, title: "X" })
    const holds = sanitizeHeldSales<any>([{ id: "h1", items: null }, null])
    expect(holds).toHaveLength(1)
    expect(holds[0]).toMatchObject({ id: "h1", items: [] })
    const mesas = sanitizeMesas<any>([{ id: "mesa-1", itens: null }, { id: "" }, null])
    expect(mesas).toHaveLength(1)
    expect(mesas[0]).toMatchObject({ id: "mesa-1", itens: [] })
  })
})

describe("pdv-mount-diagnostics", () => {
  it("marca etapas sem lançar e limita o buffer (sem PII)", () => {
    expect(() => markPdvMountStep("pending-restore", "loja-1", true, {
      counts: { sales: 3, pending: 2, quarantined: 1 },
    })).not.toThrow()
    expect(() => markPdvMountStep("catalog", "loja-1", false, { code: "HTTP_500" })).not.toThrow()
    for (let i = 0; i < 60; i++) markPdvMountStep("loja", `loja-${i}`, true)
    const snap = getPdvMountSnapshot()
    expect(snap.length).toBeLessThanOrEqual(50)
    for (const m of snap) {
      expect(typeof m.step).toBe("string")
      expect(typeof m.ok).toBe("boolean")
      // Nenhum item/valor/documento — só contagens numéricas.
      if (m.counts) {
        for (const v of Object.values(m.counts)) expect(typeof v).toBe("number")
      }
    }
  })
})
