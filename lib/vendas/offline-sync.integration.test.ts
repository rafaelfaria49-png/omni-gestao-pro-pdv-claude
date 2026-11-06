/**
 * PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001 — idempotência econômica em PostgreSQL REAL.
 *
 * As rotas reais (`POST /api/ops/venda-persist/v2` e `GET /api/ops/vendas/by-client-sale-id`)
 * rodam contra um banco descartável; só autenticação/autorização são substituídas. Prova o
 * que o cliente pressupõe: a mesma `(storeId, clientSaleId)` é UMA venda, UMA baixa de estoque
 * e UM lançamento de caixa — em replay sequencial, em concorrência real (conexões distintas),
 * depois de resposta perdida — e recusa de negócio não grava nada.
 *
 * Banco: na CI, o serviço descartável do job (guard `assertIsolatedCadastrosDatabase`); fora
 * dela, SOMENTE `PDV_OFFLINE_SYNC_PG_URL` apontando para loopback e banco
 * `pdv_offline_sync_disposable`. Sem as duas, a suíte é pulada. Sem .env.
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { assertIsolatedCadastrosDatabase } from "../../scripts/cadastros/isolated-postgres-guard.mjs"
import type { SalePayload } from "@/lib/ops-upsert-venda"

const h = vi.hoisted(() => ({ db: undefined as unknown }))
vi.mock("@/lib/prisma", () => ({ get prisma() { return h.db }, prismaEnsureConnected: async () => {} }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "fixture", role: "ADMIN", name: "CI", platformAuthority: true } }) }))
vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: async () => null }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({ apiGuardEnterpriseOrOps: async () => null }))
vi.mock("@/lib/automation/automation-engine", () => ({ handleEvent: vi.fn() }))
vi.mock("@/lib/vendas/sale-numbering-runtime-gate", () => ({ resolveSaleNumberingWriter: () => ({ writer: "v2", reason: "flag" }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { POST as postV2 } from "@/app/api/ops/venda-persist/v2/route"
import { GET as byClientSaleId } from "@/app/api/ops/vendas/by-client-sale-id/route"

function resolveUrl(): string | undefined {
  if (process.env.RAMOS_TEST_DATABASE_URL) {
    const url = process.env.RAMOS_TEST_DATABASE_URL
    if (assertIsolatedCadastrosDatabase(process.env) !== url) throw new Error("ISOLATED_DATABASE_REQUIRED")
    return url
  }
  const local = process.env.PDV_OFFLINE_SYNC_PG_URL
  if (!local) return undefined
  const u = new URL(local)
  if (u.hostname !== "127.0.0.1" || u.pathname !== "/pdv_offline_sync_disposable" || u.port === "5432") {
    throw new Error("PDV_OFFLINE_SYNC_PG_URL deve ser loopback, porta própria e banco pdv_offline_sync_disposable")
  }
  return local
}
const url = resolveUrl()

describe.skipIf(!url)("PDV offline sync — idempotência econômica em PostgreSQL real", () => {
  let db: PrismaClient
  let storeA: string, storeB: string, sessionA: string, produtoId: string

  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: url })
    h.db = db
  })
  afterAll(async () => { await db?.$disconnect() })
  beforeEach(async () => {
    storeA = `off-a-${randomUUID()}`
    storeB = `off-b-${randomUUID()}`
    for (const id of [storeA, storeB]) {
      await db.store.create({ data: { id, name: "Loja sintética offline", codigoNumeracaoVenda: randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase() } })
    }
    produtoId = (await db.produto.create({ data: { storeId: storeA, name: "Pão sintético", sku: "PAO", price: 10, stock: 5 } })).id
    await db.produto.create({ data: { storeId: storeB, name: "Pão sintético B", sku: "PAO", price: 10, stock: 5 } })
    sessionA = (await db.sessaoCaixa.create({ data: { storeId: storeA, operador: "CI" } })).id
    await db.sessaoCaixa.create({ data: { storeId: storeB, operador: "CI" } })
  })

  const cs = () => `cs_${randomUUID().replaceAll("-", "")}`
  function sale(over: Partial<SalePayload> = {}, quantity = 1): SalePayload {
    return {
      id: `PEND-${randomUUID()}`, at: new Date().toISOString(), total: 10 * quantity, sessaoId: sessionA,
      lines: [{ inventoryId: "PAO", produtoId, name: "Pão sintético", quantity, unitPrice: 10, lineTotal: 10 * quantity }],
      paymentBreakdown: { dinheiro: 10 * quantity },
      ...over,
    } as SalePayload
  }
  async function post(storeId: string, payload: SalePayload, clientSaleId: string) {
    const req = new Request(`http://localhost/api/ops/venda-persist/v2?storeId=${storeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
      body: JSON.stringify({ sale: { ...payload, clientSaleId }, clientSaleId }),
    })
    const res = await postV2(req)
    return { status: res.status, body: await res.json() as { venda?: { id: string; pedidoId: string; clientSaleId: string; storeId: string }; replayed?: boolean; code?: string } }
  }
  async function lookup(storeId: string, clientSaleId: string) {
    const req = new Request(`http://localhost/api/ops/vendas/by-client-sale-id?storeId=${storeId}&clientSaleId=${clientSaleId}`, {
      headers: { "x-assistec-loja-id": storeId },
    })
    const res = await byClientSaleId(req)
    return { status: res.status, body: await res.json() as { venda?: { pedidoId: string } } }
  }
  async function snapshot(storeId: string) {
    return {
      vendas: await db.venda.count({ where: { storeId } }),
      itens: await db.itemVenda.count({ where: { venda: { storeId } } }),
      financeiro: await db.movimentacaoFinanceira.count({ where: { storeId } }),
      ledger: await db.movimentacaoEstoque.count({ where: { storeId } }),
      stock: (await db.produto.findMany({ where: { storeId }, select: { stock: true } })).map((p) => p.stock),
      series: await db.serieVenda.findMany({ where: { storeId } }),
    }
  }

  it("T12 — dez reenvios sequenciais da mesma identidade: uma venda, uma baixa, um lançamento", async () => {
    const id = cs()
    const payload = sale()
    const first = await post(storeA, payload, id)
    expect(first.status).toBe(200)
    expect(first.body.replayed).toBe(false)
    const after = await snapshot(storeA)
    expect(after.vendas).toBe(1)
    expect(after.stock).toEqual([4])
    for (let i = 0; i < 9; i += 1) {
      const again = await post(storeA, payload, id)
      expect(again.status).toBe(200)
      expect(again.body.replayed).toBe(true)
      expect(again.body.venda?.pedidoId).toBe(first.body.venda?.pedidoId)
    }
    expect(await snapshot(storeA)).toEqual(after)
  })

  it("T14 — dez envios CONCORRENTES (abas/terminais) da mesma identidade: uma venda", async () => {
    const id = cs()
    const payload = sale()
    const results = await Promise.all(Array.from({ length: 10 }, () => post(storeA, payload, id)))
    expect(results.every((r) => r.status === 200)).toBe(true)
    expect(new Set(results.map((r) => r.body.venda?.pedidoId)).size).toBe(1)
    expect(results.filter((r) => r.body.replayed === false)).toHaveLength(1)
    const snap = await snapshot(storeA)
    expect(snap.vendas).toBe(1)
    expect(snap.stock).toEqual([4])
    expect(snap.ledger).toBe(1)
  })

  it("T16/T17 — resposta perdida após o commit: a consulta pela clientSaleId acha a MESMA venda; outra loja não vê", async () => {
    const id = cs()
    const sent = await post(storeA, sale(), id)
    const found = await lookup(storeA, id)
    expect(found.status).toBe(200)
    expect(found.body.venda?.pedidoId).toBe(sent.body.venda?.pedidoId)
    expect((await lookup(storeB, id)).status).toBe(404)
    expect((await lookup(storeA, cs())).status).toBe(404)
  })

  it("T34 — vendas offline distintas e idênticas no conteúdo, com identidades distintas, são vendas distintas", async () => {
    const r1 = await post(storeA, sale(), cs())
    const r2 = await post(storeA, sale(), cs())
    expect(r1.body.venda?.pedidoId).not.toBe(r2.body.venda?.pedidoId)
    expect((await snapshot(storeA)).stock).toEqual([3])
  })

  it("T19/T21 — produto não resolvido: nada gravado; após o cadastro legítimo, a MESMA venda entra uma vez", async () => {
    const id = cs()
    const payload = sale({ lines: [{ inventoryId: "SKU-ANTIGO", name: "Item renomeado", quantity: 1, unitPrice: 10, lineTotal: 10 }] } as Partial<SalePayload>)
    const before = await snapshot(storeA)
    const rejected = await post(storeA, payload, id)
    expect(rejected.status).toBe(409)
    expect(rejected.body.code).toBe("PRODUTO_NAO_RESOLVIDO")
    expect(await snapshot(storeA)).toEqual(before)
    await db.produto.create({ data: { storeId: storeA, name: "Item renomeado", sku: "SKU-ANTIGO", price: 10, stock: 2 } })
    const ok = await post(storeA, payload, id)
    expect(ok.status).toBe(200)
    expect((await snapshot(storeA)).vendas).toBe(1)
  })

  it("T23 — estoque insuficiente na volta: nada gravado, nada confirmado", async () => {
    const before = await snapshot(storeA)
    const r = await post(storeA, sale({}, 9), cs())
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("ESTOQUE_INSUFICIENTE")
    expect(await snapshot(storeA)).toEqual(before)
  })

  it("T25 — caixa original fechado: recusa sem lançar no caixa atual", async () => {
    await db.sessaoCaixa.update({ where: { id: sessionA }, data: { status: "FECHADA", fechadaEm: new Date() } })
    const before = await snapshot(storeA)
    const r = await post(storeA, sale(), cs())
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("CAIXA_ORIGINAL_FECHADO")
    expect(await snapshot(storeA)).toEqual(before)
  })

  it("T27 — pagamento divergente do total: nada gravado", async () => {
    const before = await snapshot(storeA)
    const r = await post(storeA, sale({ paymentBreakdown: { dinheiro: 3 } } as Partial<SalePayload>), cs())
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("PAGAMENTOS_TOTAL_DIVERGENTE")
    expect(await snapshot(storeA)).toEqual(before)
  })

  it("T29 — mesma identidade com outro conteúdo: recusada, a original intacta", async () => {
    const id = cs()
    expect((await post(storeA, sale(), id)).status).toBe(200)
    const after = await snapshot(storeA)
    const reused = await post(storeA, sale({}, 2), id)
    expect(reused.status).toBe(409)
    expect(reused.body.code).toBe("IDEMPOTENCY_KEY_REUSED")
    expect(await snapshot(storeA)).toEqual(after)
  })

  it("T30/T43 — a mesma clientSaleId em outra loja é independente e não toca a loja A", async () => {
    const id = cs()
    expect((await post(storeA, sale(), id)).status).toBe(200)
    const a = await snapshot(storeA)
    const sessionB = (await db.sessaoCaixa.findFirstOrThrow({ where: { storeId: storeB } })).id
    const produtoB = (await db.produto.findFirstOrThrow({ where: { storeId: storeB } })).id
    const r = await post(storeB, sale({ sessaoId: sessionB, lines: [{ inventoryId: "PAO", produtoId: produtoB, name: "Pão B", quantity: 1, unitPrice: 10, lineTotal: 10 }] } as Partial<SalePayload>), id)
    expect(r.status).toBe(200)
    expect(r.body.venda?.storeId).toBe(storeB)
    expect(await snapshot(storeA)).toEqual(a)
  })
})
