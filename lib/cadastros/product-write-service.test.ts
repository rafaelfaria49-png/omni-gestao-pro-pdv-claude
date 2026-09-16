/**
 * CAD-R2-005 — Testes focados do ProductWriteService (contract/core).
 * CAD-R2-009 — estoque inicial via Stock/Ledger; PATCH de saldo bloqueado.
 *
 * Sem banco: fake em memória injetado via `deps.db`. Cobre ownership/IDOR,
 * normalização determinística, duplicidade por loja, PATCH safety, audit com
 * principal server-derived, estoque inicial com ledger (origem `cadastro`),
 * bloqueio de PATCH de saldo, ausência de IA e ausência de dependência de browser.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { Prisma } from "@/generated/prisma"
import type { CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"
import type { ProductWriteDb, ProductWriteFoundRow } from "@/lib/cadastros/product-write-service"
import {
  createProduct,
  PRODUCT_WRITE_AUDIT_SOURCE,
  updateProduct,
} from "@/lib/cadastros/product-write-service"
import type {
  ProductWriteContext,
  ProductWriteInput,
} from "@/lib/cadastros/product-write-contract"

vi.mock("@/lib/prisma", () => ({
  prisma: {},
  prismaEnsureConnected: async () => {},
}))

// ─── Fake DB ────────────────────────────────────────────────────────────────

type FakeRow = {
  id: string
  storeId: string
  name: string
  sku: string | null
  barcode: string | null
  category: string | null
  brand: string
  supplierName: string
  stock: number
  precoCusto: number
  price: number
  warrantyDays: number
  active: boolean
  status: string
  metadata: Record<string, unknown> | null
}

type AuditRow = {
  action: string
  userLabel: string
  detail: string
  metadata: string
  source: string
}

type MovRow = {
  id: string
  storeId: string
  produtoId: string | null
  tipo: string
  quantidade: number
  documento: string | null
  motivo: string | null
  origem: string
  custoUnitario: number
  estoqueAntes: number
  estoqueDepois: number
  idempotencyKey: string | null
}

function seedRow(partial: Partial<FakeRow> & { id: string; storeId: string }): FakeRow {
  return {
    name: "Produto",
    sku: null,
    barcode: null,
    category: null,
    brand: "",
    supplierName: "",
    stock: 0,
    precoCusto: 0,
    price: 0,
    warrantyDays: 0,
    active: true,
    status: "Ativo",
    metadata: null,
    ...partial,
  }
}

function matchWhere(row: FakeRow, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true
  if (where.storeId !== undefined && row.storeId !== where.storeId) return false
  const idCond = where.id as string | { not?: string } | undefined
  if (typeof idCond === "string" && row.id !== idCond) return false
  if (idCond && typeof idCond === "object" && idCond.not !== undefined && row.id === idCond.not) {
    return false
  }
  if (Array.isArray(where.OR)) {
    const hit = (where.OR as Array<Record<string, unknown>>).some((cond) => {
      if (cond.sku !== undefined) return row.sku !== null && row.sku === cond.sku
      if (cond.barcode !== undefined) return row.barcode !== null && row.barcode === cond.barcode
      return false
    })
    if (!hit) return false
  }
  return true
}

function prismaKnownError(code: "P2002" | "P2025"): unknown {
  return new Prisma.PrismaClientKnownRequestError("fake prisma error", {
    code,
    clientVersion: "test",
  })
}

function makeFakeDb(seed: FakeRow[] = []) {
  const rows = new Map<string, FakeRow>(seed.map((r) => [r.id, { ...r }]))
  const audits: AuditRow[] = []
  const calls: string[] = []
  let idSeq = 1
  /** Quando > 0, os próximos findFirst retornam null (simula corrida pré-check). */
  const state = { blindFindFirst: 0 }
  // ── CAD-R2-009: estado do boundary (depósito principal, saldos, ledger) ──
  const depositos = new Map<string, { id: string; storeId: string; codigo: string; principal: boolean }>()
  const pds = new Map<string, { storeId: string; produtoId: string; depositoId: string; quantidade: number }>()
  const movs = new Map<string, MovRow>()
  let depSeq = 1
  let movSeq = 1

  function checkUnique(dataStoreId: string, sku: unknown, barcode: unknown, excludeId?: string) {
    for (const row of rows.values()) {
      if (row.storeId !== dataStoreId || (excludeId && row.id === excludeId)) continue
      if (typeof sku === "string" && sku && row.sku === sku) return true
      if (typeof barcode === "string" && barcode && row.barcode === barcode) return true
    }
    return false
  }

  const produto = {
    findFirst: async (args: Prisma.ProdutoFindFirstArgs): Promise<ProductWriteFoundRow | null> => {
      calls.push("produto.findFirst")
      if (state.blindFindFirst > 0) {
        state.blindFindFirst -= 1
        return null
      }
      for (const row of rows.values()) {
        if (matchWhere(row, args.where as Record<string, unknown> | undefined)) {
          return { ...row, metadata: (row.metadata ? { ...row.metadata } : null) as Prisma.JsonValue | null }
        }
      }
      return null
    },
    findUnique: async (args: Prisma.ProdutoFindUniqueArgs): Promise<{ id: string; storeId: string } | null> => {
      calls.push("produto.findUnique")
      const where = args.where as { id?: string }
      const row = where.id ? rows.get(where.id) : undefined
      return row ? { id: row.id, storeId: row.storeId } : null
    },
  }

  const tx = {
    produto: {
      findFirst: async (args: Prisma.ProdutoFindFirstArgs): Promise<FakeRow | null> => {
        calls.push("tx.produto.findFirst")
        for (const row of rows.values()) {
          if (matchWhere(row, args.where as Record<string, unknown> | undefined)) return { ...row }
        }
        return null
      },
      findUnique: async (args: Prisma.ProdutoFindUniqueArgs): Promise<{ id: string; storeId: string } | null> => {
        calls.push("tx.produto.findUnique")
        const where = args.where as { id?: string }
        const row = where.id ? rows.get(where.id) : undefined
        return row ? { id: row.id, storeId: row.storeId } : null
      },
      create: async (args: Prisma.ProdutoCreateArgs): Promise<{ id: string }> => {
        calls.push("tx.produto.create")
        const data = args.data as Record<string, unknown> & { storeId: string }
        if (checkUnique(data.storeId, data.sku, data.barcode)) throw prismaKnownError("P2002")
        const id = `fake-${idSeq++}`
        rows.set(id, {
          id,
          storeId: data.storeId,
          name: data.name as string,
          sku: (data.sku as string | null) ?? null,
          barcode: (data.barcode as string | null) ?? null,
          category: (data.category as string | null) ?? null,
          brand: (data.brand as string) ?? "",
          supplierName: (data.supplierName as string) ?? "",
          stock: (data.stock as number) ?? 0,
          precoCusto: (data.precoCusto as number) ?? 0,
          price: (data.price as number) ?? 0,
          warrantyDays: (data.warrantyDays as number) ?? 0,
          active: (data.active as boolean) ?? true,
          status: (data.status as string) ?? "Ativo",
          metadata: (data.metadata as Record<string, unknown> | undefined) ?? null,
        })
        return { id }
      },
      update: async (args: Prisma.ProdutoUpdateArgs): Promise<{ id: string }> => {
        calls.push("tx.produto.update")
        const where = args.where as { id: string }
        const row = rows.get(where.id)
        if (!row) throw prismaKnownError("P2025")
        const data = args.data as Record<string, unknown>
        if (checkUnique(row.storeId, data.sku, data.barcode, row.id)) throw prismaKnownError("P2002")
        for (const [key, value] of Object.entries(data)) {
          ;(row as unknown as Record<string, unknown>)[key] = value
        }
        return { id: row.id }
      },
    },
    logsAuditoria: {
      create: async (args: Prisma.LogsAuditoriaCreateArgs): Promise<unknown> => {
        calls.push("tx.logsAuditoria.create")
        const data = args.data as unknown as AuditRow
        audits.push({ ...data })
        return { id: `audit-${audits.length}` }
      },
    },
    // ── CAD-R2-009: membros do boundary Stock/Ledger (falsificáveis) ──
    $queryRaw: async (): Promise<unknown[]> => {
      calls.push("tx.$queryRaw")
      return []
    },
    deposito: {
      findFirst: async (args: { where: { storeId?: string } }): Promise<{ id: string; storeId: string; codigo: string; principal: boolean } | null> => {
        calls.push("tx.deposito.findFirst")
        for (const d of depositos.values()) {
          if (args.where?.storeId !== undefined && d.storeId !== args.where.storeId) continue
          return { ...d }
        }
        return null
      },
      findUnique: async (args: { where: { id?: string } }): Promise<{ id: string; storeId: string } | null> => {
        calls.push("tx.deposito.findUnique")
        const d = args.where?.id ? depositos.get(args.where.id) : undefined
        return d ? { id: d.id, storeId: d.storeId } : null
      },
      create: async (args: { data: { storeId: string } }): Promise<{ id: string; storeId: string; codigo: string; principal: boolean }> => {
        calls.push("tx.deposito.create")
        const id = `dep-${depSeq++}`
        const row = { id, storeId: args.data.storeId, codigo: "PRINCIPAL", principal: true }
        depositos.set(id, row)
        return { ...row }
      },
    },
    produtoDeposito: {
      findMany: async (args: { where: { storeId?: string; produtoId?: string } }): Promise<Array<{ depositoId: string; quantidade: number }>> => {
        calls.push("tx.produtoDeposito.findMany")
        const out: Array<{ depositoId: string; quantidade: number }> = []
        for (const r of pds.values()) {
          if (args.where?.storeId !== undefined && r.storeId !== args.where.storeId) continue
          if (args.where?.produtoId !== undefined && r.produtoId !== args.where.produtoId) continue
          out.push({ depositoId: r.depositoId, quantidade: r.quantidade })
        }
        return out
      },
      upsert: async (args: {
        where: { produtoId_depositoId: { produtoId: string; depositoId: string } }
        create: { storeId: string; produtoId: string; depositoId: string; quantidade: number }
        update: { quantidade: number }
      }): Promise<unknown> => {
        calls.push("tx.produtoDeposito.upsert")
        const k = `${args.where.produtoId_depositoId.produtoId}|${args.where.produtoId_depositoId.depositoId}`
        const ex = pds.get(k)
        if (ex) ex.quantidade = args.update.quantidade
        else {
          pds.set(k, {
            storeId: args.create.storeId,
            produtoId: args.create.produtoId,
            depositoId: args.create.depositoId,
            quantidade: args.create.quantidade ?? args.update.quantidade,
          })
        }
        return {}
      },
    },
    movimentacaoEstoque: {
      findFirst: async (args: { where: { storeId?: string; idempotencyKey?: string | null } }): Promise<MovRow | null> => {
        calls.push("tx.movimentacaoEstoque.findFirst")
        for (const m of movs.values()) {
          if (args.where?.storeId !== undefined && m.storeId !== args.where.storeId) continue
          if (args.where?.idempotencyKey !== undefined && m.idempotencyKey !== args.where.idempotencyKey) continue
          return { ...m }
        }
        return null
      },
      create: async (args: { data: Record<string, unknown> }): Promise<{ id: string }> => {
        calls.push("tx.movimentacaoEstoque.create")
        const data = args.data
        const key = (data.idempotencyKey ?? null) as string | null
        if (key) {
          for (const m of movs.values()) {
            if (m.storeId === data.storeId && m.idempotencyKey === key) throw prismaKnownError("P2002")
          }
        }
        const id = `mov-${movSeq++}`
        movs.set(id, {
          id,
          storeId: String(data.storeId),
          produtoId: (data.produtoId ?? null) as string | null,
          tipo: String(data.tipo),
          quantidade: Number(data.quantidade),
          documento: (data.documento ?? null) as string | null,
          motivo: (data.motivo ?? null) as string | null,
          origem: String(data.origem ?? "manual"),
          custoUnitario: Number(data.custoUnitario ?? 0),
          estoqueAntes: Number(data.estoqueAntes),
          estoqueDepois: Number(data.estoqueDepois),
          idempotencyKey: key,
        })
        return { id }
      },
    },
  }

  // Fake estrutural: cobre ProductWriteTx (inclui StockLedgerTx). Cast via
  // unknown porque os membros usam args Prisma concretos (runtime equivalente).
  const db = {
    produto,
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      calls.push("$transaction")
      return fn(tx)
    },
  } as unknown as ProductWriteDb

  return {
    db,
    rows,
    audits,
    calls,
    state,
    depositos,
    pds,
    movs,
  }
}

const PRINCIPAL: CadastrosAuditPrincipal = {
  userId: "user-1",
  email: "ops@loja.com",
  role: "ADMIN",
  displayLabel: "Operador",
}

function ctx(storeId = "loja-a", principal: CadastrosAuditPrincipal | null = PRINCIPAL): ProductWriteContext {
  return { storeId, principal }
}

function auditMeta(audits: AuditRow[], index = 0): Record<string, unknown> {
  return JSON.parse(audits[index].metadata) as Record<string, unknown>
}

// ─── 1–2. Create/update válidos ─────────────────────────────────────────────

describe("ProductWriteService — create/update válidos", () => {
  it("1. create válido persiste na store do contexto com defaults seguros", async () => {
    const fake = makeFakeDb()
    const res = await createProduct(ctx(), { nome: "  Camisa  ", preco: 99.9 }, { db: fake.db })
    expect(res).toEqual({ ok: true, id: expect.any(String), operacao: "create" })
    if (!res.ok) return
    const row = fake.rows.get(res.id)
    expect(row?.storeId).toBe("loja-a")
    expect(row?.name).toBe("Camisa")
    expect(row?.stock).toBe(0)
    expect(row?.price).toBe(99.9)
    expect(row?.sku).toBeNull()
    expect(row?.active).toBe(true)
    expect(row?.status).toBe("Ativo")
    expect(fake.calls).toContain("$transaction")
    expect(fake.calls).toContain("tx.produto.create")
    expect(fake.calls).toContain("tx.logsAuditoria.create")
  })

  it("2. update válido na store correta aplica patch parcial", async () => {
    const fake = makeFakeDb([seedRow({ id: "p1", storeId: "loja-a", name: "Antigo", price: 10, stock: 5 })])
    const res = await updateProduct(ctx(), "p1", { preco: 20 }, { db: fake.db })
    expect(res).toEqual({ ok: true, id: "p1", operacao: "update" })
    const row = fake.rows.get("p1")
    expect(row?.price).toBe(20)
    expect(row?.name).toBe("Antigo")
    expect(row?.stock).toBe(5)
  })

  it("update sem estoque explícito preserva o saldo (regressão do bug histórico)", async () => {
    const fake = makeFakeDb([seedRow({ id: "p1", storeId: "loja-a", stock: 7 })])
    const res = await updateProduct(ctx(), "p1", { nome: "Novo nome" }, { db: fake.db })
    expect(res.ok).toBe(true)
    expect(fake.rows.get("p1")?.stock).toBe(7)
  })

  it("audit + mutação ocorrem dentro da mesma transação", async () => {
    const fake = makeFakeDb()
    await createProduct(ctx(), { nome: "X" }, { db: fake.db })
    const txIdx = fake.calls.indexOf("$transaction")
    const createIdx = fake.calls.indexOf("tx.produto.create")
    const auditIdx = fake.calls.indexOf("tx.logsAuditoria.create")
    expect(txIdx).toBeGreaterThanOrEqual(0)
    expect(createIdx).toBeGreaterThan(txIdx)
    expect(auditIdx).toBeGreaterThan(createIdx)
  })
})

// ─── 3–5. Ownership / IDOR ──────────────────────────────────────────────────

describe("ProductWriteService — ownership/IDOR", () => {
  it("3. update cross-store é bloqueado fail-closed (CROSS_STORE, sem write/audit)", async () => {
    const fake = makeFakeDb([seedRow({ id: "p9", storeId: "loja-b", name: "Outra loja" })])
    const res = await updateProduct(ctx("loja-a"), "p9", { nome: "Invadir" }, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("CROSS_STORE")
    expect(fake.rows.get("p9")?.name).toBe("Outra loja")
    expect(fake.calls).not.toContain("tx.produto.update")
    expect(fake.calls).not.toContain("tx.logsAuditoria.create")
  })

  it("4. produto inexistente retorna NOT_FOUND", async () => {
    const fake = makeFakeDb()
    const res = await updateProduct(ctx(), "nao-existe", { nome: "X" }, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("NOT_FOUND")
  })

  it("5. storeId/id do payload não trocam ownership nem fixam id", async () => {
    const fake = makeFakeDb()
    const res = await createProduct(
      ctx("loja-a"),
      { nome: "Y", storeId: "loja-evil", lojaId: "loja-evil", id: "id-fixo" } as unknown as ProductWriteInput,
      { db: fake.db },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.id).not.toBe("id-fixo")
    expect(fake.rows.get(res.id)?.storeId).toBe("loja-a")
  })

  it("contexto sem loja provada é UNTRUSTED_CONTEXT sem tocar o banco", async () => {
    const fake = makeFakeDb()
    const res = await createProduct({ storeId: "   ", principal: PRINCIPAL }, { nome: "X" }, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("UNTRUSTED_CONTEXT")
    expect(fake.calls).toHaveLength(0)
  })
})

// ─── 6/13. Audit usa principal server-derived ───────────────────────────────

describe("ProductWriteService — audit principal canônico", () => {
  it("6. userLabel/revisadoPor/actor do caller nunca substituem o principal", async () => {
    const fake = makeFakeDb()
    const res = await createProduct(
      ctx(),
      {
        nome: "Z",
        userLabel: "Hacker",
        revisadoPor: "Hacker",
        criadoPor: "Hacker",
        actor: "Hacker",
        owner: "Hacker",
      } as unknown as ProductWriteInput,
      { db: fake.db },
    )
    expect(res.ok).toBe(true)
    expect(fake.audits).toHaveLength(1)
    expect(fake.audits[0].userLabel).toBe("Operador")
    const meta = auditMeta(fake.audits)
    expect((meta.actor as Record<string, unknown>).userId).toBe("user-1")
    expect(JSON.stringify(meta)).not.toContain("Hacker")
    expect(fake.audits[0].detail).toContain("Operador")
  })

  it("13. audit registra operação/produto/store/principal de forma rastreável", async () => {
    const fake = makeFakeDb([seedRow({ id: "p1", storeId: "loja-a", name: "A" })])
    await createProduct(ctx(), { nome: "B" }, { db: fake.db })
    await updateProduct(ctx(), "p1", { preco: 5 }, { db: fake.db })
    expect(fake.audits).toHaveLength(2)
    expect(fake.audits[0].action).toBe("produto.create")
    expect(fake.audits[0].source).toBe(PRODUCT_WRITE_AUDIT_SOURCE)
    const m0 = auditMeta(fake.audits, 0)
    expect(m0.entidade).toBe("Produto")
    expect(m0.operacao).toBe("create")
    expect(m0.storeId).toBe("loja-a")
    expect(typeof m0.produtoId).toBe("string")
    expect(fake.audits[1].action).toBe("produto.update")
    const m1 = auditMeta(fake.audits, 1)
    expect(m1.operacao).toBe("update")
    expect(m1.produtoId).toBe("p1")
    expect(m1.campos).toContain("preco")
  })
})

// ─── 7–9. Duplicidade por loja ──────────────────────────────────────────────

describe("ProductWriteService — duplicate policy por loja", () => {
  it("7. duplicate SKU na mesma store é tratado (DUPLICATE field sku)", async () => {
    const fake = makeFakeDb([seedRow({ id: "e1", storeId: "loja-a", sku: "ABC", name: "Existente" })])
    const res = await createProduct(ctx(), { nome: "Novo", sku: " ABC " }, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("DUPLICATE")
    expect(res.field).toBe("sku")
    expect(res.produto?.id).toBe("e1")
    expect(fake.rows.size).toBe(1)
  })

  it("8. duplicate EAN na mesma store é tratado (DUPLICATE field barcode)", async () => {
    const fake = makeFakeDb([seedRow({ id: "e1", storeId: "loja-a", barcode: "789123", name: "Existente" })])
    const res = await createProduct(ctx(), { nome: "Novo", barras: "789123" }, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("DUPLICATE")
    expect(res.field).toBe("barcode")
  })

  it("update para SKU de OUTRO produto da mesma loja bloqueia; manter o próprio permite", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "p1", storeId: "loja-a", sku: "S1" }),
      seedRow({ id: "p2", storeId: "loja-a", sku: "S2" }),
    ])
    const blocked = await updateProduct(ctx(), "p1", { sku: "S2" }, { db: fake.db })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.code).toBe("DUPLICATE")
    const own = await updateProduct(ctx(), "p1", { sku: "S1", nome: "P1" }, { db: fake.db })
    expect(own).toEqual({ ok: true, id: "p1", operacao: "update" })
  })

  it("9. mesma SKU/EAN em outra store NÃO bloqueia (regra multi-loja)", async () => {
    const fake = makeFakeDb([seedRow({ id: "e1", storeId: "loja-b", sku: "ABC", barcode: "789", name: "Outra" })])
    const res = await createProduct(ctx("loja-a"), { nome: "Novo", sku: "ABC", barras: "789" }, { db: fake.db })
    expect(res.ok).toBe(true)
  })

  it("corrida (P2002 após pré-check) vira DUPLICATE, nunca 503 cru", async () => {
    const fake = makeFakeDb([seedRow({ id: "e1", storeId: "loja-a", sku: "RACE", name: "Concorrente" })])
    fake.state.blindFindFirst = 1
    const res = await createProduct(ctx(), { nome: "Tarde", sku: "RACE" }, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("DUPLICATE")
    expect(res.produto?.id).toBe("e1")
  })
})

// ─── 10. Normalização determinística ────────────────────────────────────────

describe("ProductWriteService — normalização determinística", () => {
  it("10. mesma entrada (aliases/espaços) gera o mesmo resultado", async () => {
    const run = async (input: ProductWriteInput): Promise<Record<string, unknown>> => {
      const fake = makeFakeDb()
      const res = await createProduct(ctx(), input, { db: fake.db })
      expect(res.ok).toBe(true)
      if (!res.ok) throw new Error("create falhou")
      const row = fake.rows.get(res.id)
      if (!row) throw new Error("linha ausente")
      const { id: _id, ...rest } = row
      void _id
      return rest as unknown as Record<string, unknown>
    }
    const a = await run({
      nome: "  Camisa Polo ",
      sku: "  SKU-1 ",
      barras: "  789  ",
      categoria: " Roupas ",
      marca: " Nike ",
      fornecedor: " Forn ",
      estoque: 3,
      custo: 10,
      preco: 20,
      garantia: 12,
    })
    const b = await run({
      name: "Camisa Polo",
      codigo: "SKU-1",
      barcode: "789",
      category: "Roupas",
      brand: "Nike",
      supplierName: "Forn",
      stock: 3,
      precoCusto: 10,
      price: 20,
      warrantyDays: 12,
    })
    expect(a).toEqual(b)
    expect(a.sku).toBe("SKU-1")
    expect(a.barcode).toBe("789")
  })

  it("strings vazias de SKU/EAN viram null (nunca batem na unique)", async () => {
    const fake = makeFakeDb()
    const r1 = await createProduct(ctx(), { nome: "A", sku: "   ", barras: "" }, { db: fake.db })
    const r2 = await createProduct(ctx(), { nome: "B" }, { db: fake.db })
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (!r1.ok || !r2.ok) return
    expect(fake.rows.get(r1.id)?.sku).toBeNull()
    expect(fake.rows.get(r2.id)?.barcode).toBeNull()
  })
})

// ─── 11–12. PATCH safety / metadata ─────────────────────────────────────────

describe("ProductWriteService — PATCH safety e metadata", () => {
  it("11. PATCH parcial não apaga campos ausentes", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "p1", storeId: "loja-a", name: "A", sku: "S", category: "Cat", brand: "B", price: 10 }),
    ])
    const res = await updateProduct(ctx(), "p1", { price: 15 }, { db: fake.db })
    expect(res.ok).toBe(true)
    const row = fake.rows.get("p1")
    expect(row?.price).toBe(15)
    expect(row?.name).toBe("A")
    expect(row?.sku).toBe("S")
    expect(row?.category).toBe("Cat")
    expect(row?.brand).toBe("B")
  })

  it("12. metadata ausente/nula preserva o JSON; merge é aditivo em 2 níveis", async () => {
    const fake = makeFakeDb([
      seedRow({
        id: "p1",
        storeId: "loja-a",
        metadata: { fiscal: { ncm: "84713012" }, importacao: { lote: "L1" } },
      }),
    ])
    const r1 = await updateProduct(ctx(), "p1", { nome: "A1" }, { db: fake.db })
    expect(r1.ok).toBe(true)
    expect(fake.rows.get("p1")?.metadata).toEqual({
      fiscal: { ncm: "84713012" },
      importacao: { lote: "L1" },
    })
    const r2 = await updateProduct(ctx(), "p1", { nome: "A2", metadata: null }, { db: fake.db })
    expect(r2.ok).toBe(true)
    expect(fake.rows.get("p1")?.metadata).toEqual({
      fiscal: { ncm: "84713012" },
      importacao: { lote: "L1" },
    })
    const r3 = await updateProduct(
      ctx(),
      "p1",
      { metadata: { fiscal: { cest: "1234567" } } },
      { db: fake.db },
    )
    expect(r3.ok).toBe(true)
    const meta = fake.rows.get("p1")?.metadata as Record<string, Record<string, string>>
    expect(meta.fiscal.ncm).toBe("84713012")
    expect(meta.importacao).toEqual({ lote: "L1" })
  })

  it("sinal fiscal top-level canoniza sem destruir namespaces", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "p1", storeId: "loja-a", metadata: { fiscal: { ncm: "84713012" }, acessorios: { x: 1 } } }),
    ])
    const res = await updateProduct(ctx(), "p1", { cest: "7654321" }, { db: fake.db })
    expect(res.ok).toBe(true)
    const meta = fake.rows.get("p1")?.metadata as Record<string, Record<string, unknown>>
    expect(meta.fiscal).toMatchObject({ ncm: "84713012", cest: "7654321" })
    expect(meta.acessorios).toEqual({ x: 1 })
  })

  it("top-level catalogoAparelhos usa o contrato canônico (ausente preserva, null limpa)", async () => {
    const fake = makeFakeDb([
      seedRow({
        id: "p1",
        storeId: "loja-a",
        metadata: { catalogoAparelhos: { version: 1, deviceModelKeys: ["m1"] }, fiscal: { ncm: "1" } },
      }),
    ])
    const r1 = await updateProduct(ctx(), "p1", { nome: "A1" }, { db: fake.db })
    expect(r1.ok).toBe(true)
    expect(
      (fake.rows.get("p1")?.metadata as Record<string, unknown>).catalogoAparelhos,
    ).toMatchObject({ deviceModelKeys: ["m1"] })
    const r2 = await updateProduct(
      ctx(),
      "p1",
      { catalogoAparelhos: { deviceModelKeys: ["m1", "m2"] } },
      { db: fake.db },
    )
    expect(r2.ok).toBe(true)
    const meta = fake.rows.get("p1")?.metadata as Record<string, Record<string, unknown>>
    expect(meta.catalogoAparelhos).toMatchObject({ deviceModelKeys: ["m1", "m2"] })
    expect(meta.fiscal).toMatchObject({ ncm: "1" })
    const r3 = await updateProduct(ctx(), "p1", { catalogoAparelhos: null }, { db: fake.db })
    expect(r3.ok).toBe(true)
    const cleared = fake.rows.get("p1")?.metadata as Record<string, unknown>
    expect(cleared.catalogoAparelhos).toBeUndefined()
    expect(cleared.fiscal).toMatchObject({ ncm: "1" })
  })

  it("update vazio retorna VALIDATION sem write/audit", async () => {
    const fake = makeFakeDb([seedRow({ id: "p1", storeId: "loja-a" })])
    const res = await updateProduct(ctx(), "p1", {}, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("VALIDATION")
    expect(fake.calls).not.toContain("tx.produto.update")
    expect(fake.calls).not.toContain("tx.logsAuditoria.create")
  })
})

// ─── 14. Estoque inicial via Stock/Ledger; PATCH de saldo bloqueado (009) ────

describe("ProductWriteService — estoque via boundary (CAD-R2-009)", () => {
  it("14. create sem estoque nasce zerado e sem ledger", async () => {
    const fake = makeFakeDb()
    const c = await createProduct(ctx(), { nome: "C" }, { db: fake.db })
    expect(c.ok).toBe(true)
    if (!c.ok) return
    expect(fake.rows.get(c.id)?.stock).toBe(0)
    expect(fake.movs.size).toBe(0)
    expect(fake.calls).not.toContain("tx.movimentacaoEstoque.create")
  })

  it("14b. create com estoque inicial aplica entrada `cadastro` (stock + depósito + ledger)", async () => {
    const fake = makeFakeDb()
    const c = await createProduct(ctx(), { nome: "C", estoque: 10, custo: 4 }, { db: fake.db })
    expect(c.ok).toBe(true)
    if (!c.ok) return
    expect(fake.rows.get(c.id)?.stock).toBe(10)
    expect(fake.rows.get(c.id)?.precoCusto).toBe(4)
    // Depósito principal materializado com o saldo.
    let soma = 0
    for (const r of fake.pds.values()) {
      if (r.produtoId === c.id) soma += r.quantidade
    }
    expect(soma).toBe(10)
    // Ledger: 1 entrada compensatória de cadastro.
    expect(fake.movs.size).toBe(1)
    const mov = [...fake.movs.values()][0]
    expect(mov.produtoId).toBe(c.id)
    expect(mov.tipo).toBe("entrada")
    expect(mov.quantidade).toBe(10)
    expect(mov.origem).toBe("cadastro")
    expect(mov.estoqueAntes).toBe(0)
    expect(mov.estoqueDepois).toBe(10)
    expect(mov.idempotencyKey).toContain(c.id)
    expect(fake.calls).toContain("tx.$queryRaw")
  })

  it("14c. update com estoque/stock explícito falha VALIDATION (saldo só pelo ledger)", async () => {
    const fake = makeFakeDb([seedRow({ id: "p1", storeId: "loja-a", stock: 4 })])
    for (const input of [{ estoque: 9 }, { stock: 9 }]) {
      const u = await updateProduct(ctx(), "p1", input, { db: fake.db })
      expect(u.ok).toBe(false)
      if (u.ok) continue
      expect(u.code).toBe("VALIDATION")
    }
    expect(fake.rows.get("p1")?.stock).toBe(4)
    expect(fake.movs.size).toBe(0)
    expect(fake.calls).not.toContain("tx.produto.update")
  })

  it("14d. fonte só toca estoque pelo boundary canônico (sem write direto)", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/cadastros/product-write-service.ts"), "utf8")
    expect(src).toMatch(/["']server-only["']/)
    // Boundary canônico: única ponte para saldo/ledger.
    expect(src).toMatch(/from\s+["']@\/lib\/estoque\/stock-ledger-service["']/)
    expect(src).toMatch(/applyStockMutationTx/)
    // Sem writes diretos de saldo/ledger fora do boundary.
    for (const pattern of [
      /(tx|db|prisma)\s*\.\s*movimentacaoEstoque/i,
      /(tx|db|prisma)\s*\.\s*produtoDeposito/i,
      /(tx|db|prisma)\s*\.\s*inventario/i,
      /stock\s*:\s*\{\s*(increment|decrement)/i,
    ]) {
      expect(src, String(pattern)).not.toMatch(pattern)
    }
  })
})

// ─── 15–16. Sem IA / sem browser ────────────────────────────────────────────

describe("ProductWriteService — sem IA, sem rede, sem browser", () => {
  const srcFiles = [
    "lib/cadastros/product-write-service.ts",
    "lib/cadastros/product-write-contract.ts",
  ]

  it("15. create/update não chamam IA (source-scan)", () => {
    for (const file of srcFiles) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8")
      for (const pattern of [
        /openai/i,
        /anthropic/i,
        /barcode-lookup/,
        /produto-ia/,
        /whatsapp/i,
        /fetch\s*\(/,
        /\baxios\b/i,
      ]) {
        expect(src, `${file}: ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it("16. nenhuma dependência de browser/localStorage; camada de domínio sem HTTP", () => {
    for (const file of srcFiles) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8")
      for (const pattern of [
        /localStorage/,
        /sessionStorage/,
        /\bwindow\./,
        /\bdocument\./,
        /\bnavigator\./,
        /NextResponse/,
        /["']use server["']/,
      ]) {
        expect(src, `${file}: ${pattern}`).not.toMatch(pattern)
      }
    }
    const svc = readFileSync(resolve(process.cwd(), "lib/cadastros/product-write-service.ts"), "utf8")
    expect(svc).toMatch(/import\s+["']server-only["']/)
  })
})

// ─── Validação canônica ─────────────────────────────────────────────────────

describe("ProductWriteService — validação canônica", () => {
  it("rejeita nome ausente/vazio, estoque negativo, preço negativo, active inválido", async () => {
    const fake = makeFakeDb()
    for (const input of [
      {},
      { nome: "   " },
      { nome: "X", estoque: -1 },
      { nome: "X", preco: -0.5 },
      { nome: "X", custo: -2 },
      { nome: "X", active: "sim" },
      { nome: "X", metadata: ["lista"] },
      { nome: "X", sku: { codigo: 1 } },
    ] as ProductWriteInput[]) {
      const res = await createProduct(ctx(), input, { db: fake.db })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.code).toBe("VALIDATION")
    }
    expect(fake.rows.size).toBe(0)
    expect(fake.audits).toHaveLength(0)
  })

  it("update com productId vazio é VALIDATION", async () => {
    const fake = makeFakeDb()
    const res = await updateProduct(ctx(), "  ", { nome: "X" }, { db: fake.db })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe("VALIDATION")
      expect(res.field).toBe("productId")
    }
  })

  it("active:false deriva status Inativo; status explícito prevalece", async () => {
    const fake = makeFakeDb()
    const r1 = await createProduct(ctx(), { nome: "A", active: false }, { db: fake.db })
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(fake.rows.get(r1.id)?.status).toBe("Inativo")
    const r2 = await createProduct(ctx(), { nome: "B", active: false, status: "Rascunho" }, { db: fake.db })
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(fake.rows.get(r2.id)?.status).toBe("Rascunho")
  })
})
