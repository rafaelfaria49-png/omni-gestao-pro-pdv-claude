/**
 * Integração REAL com PostgreSQL descartável (GOAL PDV-PADARIA-HISTORICO-PAGAMENTO-G1-001).
 *
 * Roda o handler de produção `GET /api/vendas/historico` com o Prisma de verdade
 * contra um banco local com o schema do repositório: prova que o filtro JSONB,
 * o `count` e `take/skip` funcionam no SQL real, e não só no harness em memória.
 *
 * Só executa com `HISTORICO_PAGAMENTO_PG_URL` apontando para loopback
 * (127.0.0.1 / localhost / ::1). Qualquer outro host é recusado — nunca produção.
 *
 *   initdb + pg_ctl em diretório temporário; `prisma db push` com DATABASE_URL local;
 *   HISTORICO_PAGAMENTO_PG_URL=postgresql://user@127.0.0.1:<porta>/<db> npx vitest run lib/vendas/historico-pagamento.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const PG_URL = process.env.HISTORICO_PAGAMENTO_PG_URL?.trim() ?? ""

function isLoopback(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^\[|\]$/g, "")
    return host === "127.0.0.1" || host === "localhost" || host === "::1"
  } catch {
    return false
  }
}

if (PG_URL && !isLoopback(PG_URL)) {
  throw new Error("HISTORICO_PAGAMENTO_PG_URL precisa ser um PostgreSQL descartável em loopback.")
}

const RUN = Boolean(PG_URL)
const SUFIXO = Math.random().toString(36).slice(2, 8)
const LOJA_A = `g1pg-a-${SUFIXO}`
const LOJA_B = `g1pg-b-${SUFIXO}`

const auth = vi.hoisted(() => ({ session: null as unknown }))
vi.mock("@/auth", () => ({ auth: async () => auth.session }))

type Resp = { ok: boolean; vendas: Array<{ id: string; formaPagamento: string }>; total: number; kpis: Record<string, number> }
type Db = {
  store: { createMany: (a: unknown) => Promise<unknown>; deleteMany: (a: unknown) => Promise<unknown> }
  venda: { createMany: (a: unknown) => Promise<unknown>; deleteMany: (a: unknown) => Promise<unknown> }
  $disconnect: () => Promise<void>
}

describe.skipIf(!RUN)("historico × pagamento — PostgreSQL descartável real", () => {
  let GET: (req: Request) => Promise<Response>
  let coletar: typeof import("./historico-pagamento-export").coletarVendasHistoricoParaExportacao
  let db: Db
  const BASE = Date.UTC(2026, 9, 24, 12, 0, 0)
  let seq = 0

  function venda(storeId: string, pedidoId: string, payload: unknown, opts: { minutos?: number; status?: string } = {}) {
    return {
      id: `${storeId}-${pedidoId}`,
      storeId,
      pedidoId,
      payload,
      total: 10,
      status: opts.status ?? "concluida",
      at: new Date(BASE - (opts.minutos ?? seq++) * 60_000),
    }
  }

  async function listar(query: string, storeId = LOJA_A): Promise<Resp> {
    const res = await GET(new Request(`http://local/api/vendas/historico?${query}`, { headers: { "x-assistec-loja-id": storeId } }))
    expect(res.status).toBe(200)
    return (await res.json()) as Resp
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_URL
    auth.session = {
      user: {
        id: "g1-pg-user", role: "ADMIN", accessScope: "STORE", platformAuthority: false, mustChangePassword: false,
        allowedStoreIds: [LOJA_A, LOJA_B], storeAccess: "restricted",
        storeModules: { [LOJA_A]: ["sales"], [LOJA_B]: ["sales"] },
      },
    }
    const { PrismaClient } = await import("@/generated/prisma")
    db = new PrismaClient({ datasources: { db: { url: PG_URL } }, log: [] }) as unknown as Db
    ;({ GET } = await import("@/app/api/vendas/historico/route"))
    ;({ coletarVendasHistoricoParaExportacao: coletar } = await import("./historico-pagamento-export"))

    await db.store.createMany({ data: [{ id: LOJA_A, name: "G1 PG A" }, { id: LOJA_B, name: "G1 PG B" }] })
    const rows = []
    // Cenário obrigatório: 30 vendas, as 25 mais recentes em dinheiro e 5 Pix.
    for (let i = 0; i < 30; i++) rows.push(venda(LOJA_A, `R-${i}`, { paymentBreakdown: i >= 25 ? { pix: 10 } : { dinheiro: 10 } }, { minutos: i }))
    seq = 100
    // Tipos JSON e legado.
    rows.push(venda(LOJA_A, "T-num", { paymentBreakdown: { cartaoDebito: 7.5 } }))
    rows.push(venda(LOJA_A, "T-texto", { paymentBreakdown: { cartaoDebito: "7.5" } }))
    rows.push(venda(LOJA_A, "T-zero", { paymentBreakdown: { cartaoDebito: 0 } }))
    rows.push(venda(LOJA_A, "T-neg", { paymentBreakdown: { cartaoDebito: -1 } }))
    rows.push(venda(LOJA_A, "T-null", { paymentBreakdown: { cartaoDebito: null } }))
    rows.push(venda(LOJA_A, "T-bool", { paymentBreakdown: { cartaoDebito: true } }))
    rows.push(venda(LOJA_A, "T-sem", { paymentBreakdown: null }))
    rows.push(venda(LOJA_A, "L-debito", { formaPagamento: "Cartão de Débito", importadoEm: "2026-04-01" }))
    rows.push(venda(LOJA_A, "L-misto", { paymentBreakdown: { dinheiro: 5 }, formaPagamento: "Cartão de Débito" }))
    rows.push(venda(LOJA_A, "SPLIT", { paymentBreakdown: { dinheiro: 60, cartaoCredito: 40 } }))
    rows.push(venda(LOJA_A, "C-canc", { paymentBreakdown: { cartaoCredito: 10 } }, { status: "cancelada" }))
    // Volume para paginação/exportação: 650 vendas em carne, 300 primeiras em aPrazo.
    seq = 1000
    for (let i = 0; i < 650; i++) rows.push(venda(LOJA_A, `E-${i}`, { paymentBreakdown: i < 300 ? { aPrazo: 10 } : { carne: 10 } }))
    // Outra loja com Pix: nunca pode aparecer em LOJA_A.
    for (let i = 0; i < 9; i++) rows.push(venda(LOJA_B, `B-${i}`, { paymentBreakdown: { pix: 10 } }, { minutos: i }))
    await db.venda.createMany({ data: rows })
  }, 60_000)

  afterAll(async () => {
    if (!db) return
    await db.venda.deleteMany({ where: { storeId: { in: [LOJA_A, LOJA_B] } } })
    await db.store.deleteMany({ where: { id: { in: [LOJA_A, LOJA_B] } } })
    await db.$disconnect()
  })

  it("30 vendas com 5 Pix: página 1 traz as 5, total=5, página 2 vazia", async () => {
    const p1 = await listar("pagamento=pix&take=20&skip=0")
    expect(p1.vendas.map((v) => v.id)).toEqual(["R-25", "R-26", "R-27", "R-28", "R-29"])
    expect(p1.total).toBe(5)
    const p2 = await listar("pagamento=pix&take=20&skip=20")
    expect(p2.vendas).toEqual([])
    expect(p2.total).toBe(5)
  })

  it("JSONB real: só número positivo casa; texto/zero/negativo/null/booleano não; legado só sem breakdown", async () => {
    const r = await listar("pagamento=cartaoDebito&take=50")
    expect(r.vendas.map((v) => v.id).sort()).toEqual(["L-debito", "T-num"])
    expect(r.total).toBe(2)
  })

  it("pagamento dividido entra em cada forma positiva uma única vez", async () => {
    const credito = await listar("pagamento=cartaoCredito&status=concluida&take=50")
    expect(credito.vendas.map((v) => v.id)).toEqual(["SPLIT"])
    expect(credito.vendas[0]!.formaPagamento).toBe("Dinheiro + Crédito")
    const dinheiro = await listar("pagamento=dinheiro&q=split&take=50")
    expect(dinheiro.vendas.map((v) => v.id)).toEqual(["SPLIT"])
  })

  it("paginação real em 650 vendas: páginas sem repetição, total exato, última parcial", async () => {
    const vistos = new Set<string>()
    let skip = 0
    let total = -1
    for (;;) {
      const p = await listar(`pagamento=carne&take=200&skip=${skip}`)
      total = p.total
      if (p.vendas.length === 0) break
      for (const v of p.vendas) {
        expect(vistos.has(v.id)).toBe(false)
        vistos.add(v.id)
      }
      skip += 200
    }
    expect(total).toBe(350)
    expect(vistos.size).toBe(350)
  })

  it("exportação: a 1ª janela de 200 sem carnê não interrompe; 350 linhas, sem repetição", async () => {
    // As 300 mais recentes do bloco E são aPrazo: com o filtro antigo, a 1ª página
    // (200) vinha vazia e a exportação parava ali.
    const r = await coletar(async (skip, take) => {
      const p = await listar(`pagamento=carne&take=${take}&skip=${skip}`)
      return { vendas: p.vendas.map((v) => ({ ...v, dbId: v.id })), total: p.total }
    })
    expect(r.linhas).toHaveLength(350)
    expect(new Set(r.linhas.map((v) => v.id)).size).toBe(350)
    expect(r.truncado).toBe(false)
  })

  it("isolamento: Pix da outra loja nunca entra na lista nem no total", async () => {
    expect((await listar("pagamento=pix&take=50", LOJA_B)).total).toBe(9)
    const a = await listar("pagamento=pix&take=50", LOJA_A)
    expect(a.vendas.every((v) => v.id.startsWith("R-"))).toBe(true)
  })

  it("KPIs iguais com e sem filtro de pagamento", async () => {
    const com = await listar("pagamento=pix")
    const sem = await listar("")
    expect(com.kpis).toEqual(sem.kpis)
    expect(sem.kpis.cancelamentos).toBe(1)
  })
})
