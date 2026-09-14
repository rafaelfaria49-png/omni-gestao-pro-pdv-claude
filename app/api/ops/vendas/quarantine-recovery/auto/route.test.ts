import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const STORE = "loja-2"
const SALE_AT = "2026-06-15T18:42:07.123Z"
const CLIENT_SALE_ID = "lq_0123456789abcdef0123456789abcdef"

const h = vi.hoisted(() => ({
  persist: vi.fn(),
  gate: vi.fn(),
  guard: vi.fn(),
  auth: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  vendaUpdate: vi.fn(),
  vendaUpdateMany: vi.fn(),
  vendaDelete: vi.fn(),
  vendaDeleteMany: vi.fn(),
  vendaUpsert: vi.fn(),
  vendaCreate: vi.fn(),
  sessaoFindFirst: vi.fn(),
  sessaoFindMany: vi.fn(),
  produtoFindFirst: vi.fn(),
  ensureConnected: vi.fn(async () => undefined),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    venda: {
      findFirst: h.findFirst,
      findUnique: h.findUnique,
      findMany: h.findMany,
      update: h.vendaUpdate,
      updateMany: h.vendaUpdateMany,
      delete: h.vendaDelete,
      deleteMany: h.vendaDeleteMany,
      upsert: h.vendaUpsert,
      create: h.vendaCreate,
    },
    sessaoCaixa: { findFirst: h.sessaoFindFirst, findMany: h.sessaoFindMany },
    produto: { findFirst: h.produtoFindFirst },
  },
  prismaEnsureConnected: h.ensureConnected,
}))
vi.mock("@/lib/ops-api-gate", () => ({ opsLojaIdFromRequestForWrite: () => STORE }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({ apiGuardEnterpriseOrOps: h.guard }))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/auth/session-operator", () => ({ getOperatorLabelFromSession: () => "Operador PDV" }))
vi.mock("@/lib/vendas/sale-writer-v2", () => ({ persistSaleV2: h.persist }))
vi.mock("@/lib/vendas/sale-numbering-runtime-gate", () => ({ resolveSaleNumberingWriter: h.gate }))

import { POST } from "./route"

/** Venda de 15/06 preservada no PDV da loja-2 — número antigo colidiu com a loja-1. */
function preservada(overrides: Record<string, unknown> = {}) {
  return {
    id: "VDA-2026-0412",
    clientSaleId: CLIENT_SALE_ID,
    syncPending: true,
    syncBlockedCode: "PEDIDO_ID_DE_OUTRA_LOJA",
    at: SALE_AT,
    total: 59.9,
    sessaoId: "sess-15-06",
    terminalId: "PDV1",
    customerName: "Consumidor",
    cashierId: "Rafa",
    lines: [{ inventoryId: "prod-1", name: "Boneca", quantity: 2, unitPrice: 29.95 }],
    paymentBreakdown: { dinheiro: 59.9 },
    ...overrides,
  }
}

/** Venda de OUTRA loja que ocupa o número antigo — nunca é tocada. */
function ocupanteLoja1(pedidoId: string) {
  return {
    id: "venda-loja-1",
    storeId: "loja-1",
    pedidoId,
    clientSaleId: null,
    payload: {
      id: pedidoId,
      at: "2026-06-10T12:00:00.000Z",
      total: 25,
      lines: [{ inventoryId: "p-x", name: "Capinha", quantity: 1, unitPrice: 25 }],
      paymentBreakdown: { pix: 25 },
    },
    total: 25,
    at: new Date("2026-06-10T12:00:00.000Z"),
    clienteNome: null,
    clienteId: null,
    terminalId: null,
    status: "concluida",
  }
}

function vendaGravada(overrides: Record<string, unknown> = {}) {
  return {
    id: "venda-731",
    storeId: STORE,
    pedidoId: "VDA-L02-2026-000731",
    clientSaleId: CLIENT_SALE_ID,
    payload: preservada(),
    total: 59.9,
    at: new Date(SALE_AT),
    clienteNome: "Consumidor",
    clienteId: null,
    terminalId: "PDV1",
    status: "concluida",
    fiscalStatus: "NAO_FISCAL",
    ...overrides,
  }
}

function req(body: unknown) {
  return new Request("http://local/api/ops/vendas/quarantine-recovery/auto?storeId=loja-2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/** Aloca número server-side novo a cada chamada e devolve a data recebida. */
function persistAllocating() {
  let seq = 730
  return async (input: { storeId: string; clientSaleId: string; sale: { at?: string; total?: number } }) => {
    seq += 1
    return {
      replayed: false,
      fingerprint: `fp-${seq}`,
      venda: {
        id: `venda-${seq}`,
        storeId: input.storeId,
        pedidoId: `VDA-L02-2026-${String(seq).padStart(6, "0")}`,
        clientSaleId: input.clientSaleId,
        total: input.sale.total ?? 0,
        at: input.sale.at ?? "",
        clienteNome: "Consumidor",
        clienteId: null,
        terminalId: "PDV1",
        status: "concluida",
      },
    }
  }
}

/** Nenhuma escrita direta em `Venda` fora do motor de persistência. */
function expectNoDirectVendaWrites() {
  expect(h.vendaUpdate).not.toHaveBeenCalled()
  expect(h.vendaUpdateMany).not.toHaveBeenCalled()
  expect(h.vendaDelete).not.toHaveBeenCalled()
  expect(h.vendaDeleteMany).not.toHaveBeenCalled()
  expect(h.vendaUpsert).not.toHaveBeenCalled()
  expect(h.vendaCreate).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  h.guard.mockResolvedValue(null)
  h.auth.mockResolvedValue({ user: { id: "op-1" } })
  h.gate.mockReturnValue({ writer: "v2", reason: "enabled" })
  h.findFirst.mockResolvedValue(null)
  h.findMany.mockResolvedValue([])
  h.findUnique.mockImplementation(async ({ where }: { where: { pedidoId: string } }) =>
    ocupanteLoja1(where.pedidoId),
  )
  h.sessaoFindFirst.mockResolvedValue({ id: "sess-15-06", status: "FECHADA" })
  h.sessaoFindMany.mockResolvedValue([])
  h.produtoFindFirst.mockResolvedValue({ id: "prod-1", name: "Boneca", stock: 30 })
  h.persist.mockImplementation(persistAllocating())
})

describe("POST /api/ops/vendas/quarantine-recovery/auto", () => {
  it("venda ausente no servidor: cria UMA vez, na data e na sessão originais, sem confirmação manual", async () => {
    const res = await POST(req({ candidates: [preservada()] }))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.summary).toMatchObject({ total: 1, recovered: 1, requiresConfirmation: 0, blocked: 0, failed: 0 })
    expect(h.persist).toHaveBeenCalledTimes(1)
    const call = h.persist.mock.calls[0][0]
    expect(call.storeId).toBe(STORE)
    expect(call.clientSaleId).toBe(CLIENT_SALE_ID)
    // Data e sessão ORIGINAIS — nunca "agora", nunca a sessão aberta de hoje.
    expect(call.sale.at).toBe(SALE_AT)
    expect(call.sale.sessaoId).toBe("sess-15-06")
    expect(call.options).toMatchObject({
      enforceStock: false,
      requireCaixaSession: true,
      allowClosedOriginalSession: true,
      historicalRecovery: true,
    })
    expect(call.sale.recovery).toMatchObject({
      trigger: "auto",
      mode: "auto-reconcile",
      recoveredFromPedidoId: "VDA-2026-0412",
      conflictCode: "PEDIDO_ID_DE_OUTRA_LOJA",
      occupantStoreId: "loja-1",
      caixaPolicy: "original-session",
    })
    expect(json.results[0]).toMatchObject({ status: "RECOVERED", clientSaleId: CLIENT_SALE_ID })
    expect(json.results[0].venda).toMatchObject({ at: SALE_AT })
    expect(json.results[0].venda.pedidoId).not.toBe("VDA-2026-0412")

    // A sessão consultada foi só a original, por id — sem fallback para caixa aberto.
    for (const [args] of h.sessaoFindFirst.mock.calls) {
      expect(args.where).toMatchObject({ id: "sess-15-06", storeId: STORE })
      expect(args.where.status).toBeUndefined()
    }
    expectNoDirectVendaWrites()
  })

  it("venda que já existe no servidor com a mesma identidade técnica: só reconcilia", async () => {
    h.findFirst.mockResolvedValue(vendaGravada())
    const res = await POST(req({ candidates: [preservada()] }))
    const json = await res.json()
    expect(json.summary).toMatchObject({ total: 1, alreadyRecovered: 1, recovered: 0 })
    expect(json.results[0]).toMatchObject({
      status: "ALREADY_RECOVERED",
      replayed: true,
      venda: { id: "venda-731", pedidoId: "VDA-L02-2026-000731", at: SALE_AT },
    })
    expect(h.persist).not.toHaveBeenCalled()
    expectNoDirectVendaWrites()
  })

  it("execução repetida: a segunda passada reconhece a venda criada e não cria outra", async () => {
    let criada: ReturnType<typeof vendaGravada> | null = null
    h.findFirst.mockImplementation(async ({ where }: { where: { clientSaleId?: string } }) =>
      criada && where.clientSaleId === criada.clientSaleId ? criada : null,
    )
    h.persist.mockImplementation(async (input: { clientSaleId: string }) => {
      criada = vendaGravada({ clientSaleId: input.clientSaleId })
      return { replayed: false, fingerprint: "fp", venda: { ...criada, at: SALE_AT } }
    })

    const first = await (await POST(req({ candidates: [preservada()] }))).json()
    const second = await (await POST(req({ candidates: [preservada()] }))).json()

    expect(first.summary).toMatchObject({ recovered: 1 })
    expect(second.summary).toMatchObject({ alreadyRecovered: 1, recovered: 0 })
    expect(second.results[0].venda.pedidoId).toBe(first.results[0].venda.pedidoId)
    expect(h.persist).toHaveBeenCalledTimes(1)
  })

  it("mesma venda já gravada sob OUTRA identidade (chave local perdida): reconcilia, não duplica", async () => {
    const anterior = vendaGravada({
      id: "venda-500",
      pedidoId: "VDA-L02-2026-000500",
      clientSaleId: "cs_perdido_no_navegador",
      payload: { ...preservada(), clientSaleId: "cs_perdido_no_navegador", recovery: { recoveredFromPedidoId: "VDA-2026-0412" } },
    })
    h.findMany.mockResolvedValue([anterior])
    h.findFirst.mockImplementation(async ({ where }: { where: { id?: string } }) =>
      where.id === "venda-500" ? anterior : null,
    )

    const json = await (await POST(req({ candidates: [preservada()] }))).json()
    expect(json.results[0]).toMatchObject({
      status: "ALREADY_RECOVERED",
      clientSaleId: CLIENT_SALE_ID,
      venda: { id: "venda-500", pedidoId: "VDA-L02-2026-000500" },
    })
    expect(h.persist).not.toHaveBeenCalled()
    expectNoDirectVendaWrites()
  })

  it("colisão de número na mesma loja: recebe número novo e a ocupante fica intacta", async () => {
    h.findUnique.mockImplementation(async ({ where }: { where: { pedidoId: string } }) => ({
      ...ocupanteLoja1(where.pedidoId),
      storeId: STORE,
      clientSaleId: "cs_ocupante_aaaaaa",
    }))
    const json = await (
      await POST(req({ candidates: [preservada({ syncBlockedCode: "PEDIDO_ID_CONFLITO_MESMA_LOJA" })] }))
    ).json()

    expect(json.results[0].status).toBe("RECOVERED")
    expect(json.results[0].venda.pedidoId).toMatch(/^VDA-L02-2026-\d{6}$/)
    const call = h.persist.mock.calls[0][0]
    expect(call.sale.recovery).toMatchObject({
      recoveredFromPedidoId: "VDA-2026-0412",
      conflictCode: "PEDIDO_ID_CONFLITO_MESMA_LOJA",
      occupantStoreId: STORE,
    })
    expect(call).not.toHaveProperty("pedidoId")
    expectNoDirectVendaWrites()
  })

  it("número antigo livre: grava com número novo em vez de prender a venda para sempre", async () => {
    h.findUnique.mockResolvedValue(null)
    const json = await (await POST(req({ candidates: [preservada()] }))).json()
    expect(json.results[0].status).toBe("RECOVERED")
    expect(h.persist.mock.calls[0][0].sale.recovery).toMatchObject({ occupantStoreId: null, trigger: "auto" })
  })

  it("mesmo instante com dados diferentes: fica para revisão do administrador", async () => {
    h.findMany.mockResolvedValue([
      vendaGravada({
        id: "venda-650",
        pedidoId: "VDA-L02-2026-000650",
        clientSaleId: null,
        total: 10,
        payload: {
          ...preservada(),
          total: 10,
          lines: [{ inventoryId: "prod-9", name: "Outro", quantity: 1, unitPrice: 10 }],
          paymentBreakdown: { pix: 10 },
        },
      }),
    ])
    const json = await (await POST(req({ candidates: [preservada()] }))).json()
    expect(json.results[0]).toMatchObject({ status: "BLOCKED", code: "AMBIGUOUS_EXISTING_SALE", venda: null })
    expect(h.persist).not.toHaveBeenCalled()
  })

  it("venda com documento fiscal já no servidor: reconcilia sem regravar nem reemitir", async () => {
    h.findFirst.mockResolvedValue(vendaGravada({ fiscalStatus: "AUTORIZADA" }))
    const json = await (await POST(req({ candidates: [preservada()] }))).json()
    expect(json.results[0]).toMatchObject({ status: "ALREADY_RECOVERED", replayed: true })
    expect(h.persist).not.toHaveBeenCalled()
    expectNoDirectVendaWrites()
  })

  it("lote das 12 vendas preservadas (R$ 957,18): 12 vendas, datas e valores originais", async () => {
    const totais = [...Array.from({ length: 11 }, () => 79.77), 79.71]
    const candidates = totais.map((total, index) =>
      preservada({
        id: `VDA-2026-${String(400 + index).padStart(4, "0")}`,
        clientSaleId: `lq_${String(index).padStart(32, "0")}`,
        at: new Date(Date.UTC(2026, 5 + (index % 2), 10 + index, 15, 0, index)).toISOString(),
        total,
        lines: [{ inventoryId: "prod-1", name: "Boneca", quantity: 1, unitPrice: total }],
        paymentBreakdown: { dinheiro: total },
      }),
    )

    const json = await (await POST(req({ candidates }))).json()

    expect(json.summary).toMatchObject({ total: 12, recovered: 12, requiresConfirmation: 0, blocked: 0, failed: 0 })
    expect(h.persist).toHaveBeenCalledTimes(12)
    const soma = h.persist.mock.calls.reduce((acc, [input]) => acc + input.sale.total, 0)
    expect(Math.round(soma * 100) / 100).toBe(957.18)
    h.persist.mock.calls.forEach(([input], index) => {
      expect(input.sale.at).toBe(candidates[index].at)
      expect(input.options.allowClosedOriginalSession).toBe(true)
    })
    expect(new Set(json.results.map((r: { venda: { pedidoId: string } }) => r.venda.pedidoId)).size).toBe(12)
  })

  // ── Gates ─────────────────────────────────────────────────────────────────

  it("exige a mesma permissão de registrar venda", async () => {
    h.guard.mockResolvedValue(new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403 }))
    const res = await POST(req({ candidates: [preservada()] }))
    expect(res.status).toBe(403)
    expect(h.guard).toHaveBeenCalledWith(STORE, expect.any(Function), "Sem permissão para registrar vendas.")
    expect(h.persist).not.toHaveBeenCalled()
  })

  it("com o writer V1 ativo não grava nada", async () => {
    h.gate.mockReturnValue({ writer: "v1", reason: "flag-absent" })
    const res = await POST(req({ candidates: [preservada()] }))
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "SALE_WRITER_V1_ACTIVE" })
    expect(h.persist).not.toHaveBeenCalled()
  })

  it("exige candidates e respeita o teto por requisição", async () => {
    expect((await POST(req({ candidates: [] }))).status).toBe(400)
    const tooMany = await POST(
      req({ candidates: Array.from({ length: 51 }, (_, i) => preservada({ clientSaleId: `lq_${String(i).padStart(32, "0")}` })) }),
    )
    expect(tooMany.status).toBe(400)
    await expect(tooMany.json()).resolves.toMatchObject({ code: "TOO_MANY_CANDIDATES" })
    expect(h.persist).not.toHaveBeenCalled()
  })

  it("recuperação histórica não despacha automação pós-venda nem aciona o fiscal", () => {
    const route = readFileSync(join(__dirname, "route.ts"), "utf8")
    const service = readFileSync(join(__dirname, "../../../../../../lib/vendas/quarantine-recovery-service.ts"), "utf8")
    for (const source of [route, service]) {
      expect(source).not.toMatch(/dispatchSaleAutomationIfCreated|handleEvent|@\/lib\/fiscal/)
    }
  })
})
