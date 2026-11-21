import { beforeEach, describe, expect, it, vi } from "vitest"

const STORE = "loja-1"

const h = vi.hoisted(() => ({
  persist: vi.fn(),
  gate: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  vendaUpdate: vi.fn(),
  vendaCreate: vi.fn(),
  vendaDelete: vi.fn(),
  sessaoFindFirst: vi.fn(),
  sessaoFindMany: vi.fn(),
  produtoFindFirst: vi.fn(),
  ensureConnected: vi.fn(async () => undefined),
  requireAdmin: vi.fn(),
  canAccessStore: vi.fn(() => true),
}))

// `@/auth` real carrega next-auth → `next/server`, que o Node ESM não resolve fora do bundler do Next.
// A rota é de plataforma (requireModuleApi(req, "platform")); o ator é a autoridade da plataforma.
vi.mock("@/auth", async () => {
  const { platformSession } = await import("@/test/fixtures/store-session")
  return { auth: vi.fn(async () => platformSession()) }
})
vi.mock("@/lib/prisma", () => ({
  prisma: {
    venda: {
      findFirst: h.findFirst,
      findUnique: h.findUnique,
      findMany: vi.fn(async () => []),
      update: h.vendaUpdate,
      create: h.vendaCreate,
      delete: h.vendaDelete,
    },
    sessaoCaixa: { findFirst: h.sessaoFindFirst, findMany: h.sessaoFindMany },
    produto: { findFirst: h.produtoFindFirst },
  },
  prismaEnsureConnected: h.ensureConnected,
}))
vi.mock("@/lib/ops-api-gate", () => ({ opsLojaIdFromRequestForWrite: () => STORE }))
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }))
vi.mock("@/lib/auth/enterprise-permissions", () => ({ canAccessStore: h.canAccessStore }))
vi.mock("@/lib/vendas/sale-writer-v2", () => ({ persistSaleV2: h.persist }))
vi.mock("@/lib/vendas/sale-numbering-runtime-gate", () => ({
  resolveSaleNumberingWriter: h.gate,
}))

import { POST } from "./route"
import { auth } from "@/auth"
import { storeSession } from "@/test/fixtures/store-session"

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "VDA-2026-0615",
    clientSaleId: "cs_attempt_bbbbbb",
    syncBlockedCode: "PEDIDO_ID_CONFLITO_MESMA_LOJA",
    at: "2026-06-15T18:00:00.000Z",
    total: 18,
    sessaoId: "sess-original-1",
    customerName: "Consumidor",
    lines: [{ inventoryId: "p-tvbox", name: "CONTROLE TV BOX", quantity: 1, unitPrice: 18 }],
    paymentBreakdown: { dinheiro: 18 },
    ...overrides,
  }
}

function req(body: unknown) {
  return new Request("http://local/api/ops/vendas/quarantine-recovery/preview?storeId=loja-1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.gate.mockReturnValue({ writer: "v1", reason: "flag-absent" })
  h.requireAdmin.mockResolvedValue({ ok: true, session: { user: { id: "admin-1" } } })
  h.canAccessStore.mockReturnValue(true)
  h.findFirst.mockResolvedValue(null)
  h.findUnique.mockResolvedValue({ id: "venda-occ", storeId: STORE })
  h.sessaoFindFirst.mockResolvedValue({ id: "sess-original-1", status: "ABERTA" })
  h.sessaoFindMany.mockResolvedValue([])
  h.produtoFindFirst.mockResolvedValue({ id: "prod-tvbox", name: "CONTROLE TV BOX", stock: 9 })
})

describe("POST /api/ops/vendas/quarantine-recovery/preview", () => {
  it("classifica sem escrever nada — nem com o writer V1 ativo", async () => {
    const res = await POST(
      req({
        candidates: [
          candidate({ clientSaleId: "cs_attempt_111111" }),
          candidate({ clientSaleId: "cs_attempt_222222", lines: [] }),
        ],
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.dryRun).toBe(true)
    expect(json.occupantUntouched).toBe(true)
    // Preview funciona com a flag OFF: auditar precede executar.
    expect(json.writerEnabled).toBe(false)
    expect(json.summary).toMatchObject({ total: 2, ready: 1, blocked: 1 })

    // Prova de read-only: nenhum caminho de escrita foi exercido.
    expect(h.persist).not.toHaveBeenCalled()
    expect(h.vendaUpdate).not.toHaveBeenCalled()
    expect(h.vendaCreate).not.toHaveBeenCalled()
    expect(h.vendaDelete).not.toHaveBeenCalled()
  })

  it("reporta writerEnabled true quando o gate libera o writer V2", async () => {
    h.gate.mockReturnValue({ writer: "v2", reason: "enabled" })
    const res = await POST(req({ candidates: [candidate()] }))
    await expect(res.json()).resolves.toMatchObject({ writerEnabled: true })
    expect(h.persist).not.toHaveBeenCalled()
  })

  it("reconhece venda já recuperada sem propor nova escrita", async () => {
    h.findFirst.mockResolvedValue({ id: "venda-b", pedidoId: "VDA-RC02-2026-000099" })
    const res = await POST(req({ candidates: [candidate()] }))
    const json = await res.json()
    expect(json.summary).toMatchObject({ total: 1, alreadyRecovered: 1, ready: 0 })
    expect(json.items[0]).toMatchObject({
      klass: "ALREADY_RECOVERED",
      alreadyRecoveredPedidoId: "VDA-RC02-2026-000099",
      alreadyRecoveredVendaId: "venda-b",
    })
  })

  it("separa as vendas que exigem confirmação de caixa fechado", async () => {
    h.sessaoFindFirst.mockResolvedValue({ status: "FECHADA" })
    const res = await POST(req({ candidates: [candidate()] }))
    const json = await res.json()
    expect(json.summary).toMatchObject({ requiresConfirmation: 1, ready: 0 })
    expect(json.items[0].klass).toBe("REQUIRES_CLOSED_SESSION_CONFIRM")
  })

  it("estoque insuficiente no recovery histórico é READY, sem escrita", async () => {
    h.produtoFindFirst.mockResolvedValue({ id: "prod-tvbox", name: "CONTROLE TV BOX", stock: 0 })
    const res = await POST(req({ candidates: [candidate()] }))
    const json = await res.json()
    expect(json.items[0].klass).toBe("READY")
    expect(json.summary.ready).toBe(1)
    expect(h.persist).not.toHaveBeenCalled()
    expect(h.vendaUpdate).not.toHaveBeenCalled()
  })

  it("exige candidates e respeita o teto", async () => {
    await expect(POST(req({})).then((r) => r.status)).resolves.toBe(400)
    const tooMany = await POST(
      req({ candidates: Array.from({ length: 501 }, () => candidate()) }),
    )
    expect(tooMany.status).toBe(400)
    await expect(tooMany.json()).resolves.toMatchObject({ code: "TOO_MANY_CANDIDATES" })
  })

  it("nega loja fora do escopo da sessão", async () => {
    h.canAccessStore.mockReturnValue(false)
    const res = await POST(req({ candidates: [candidate()] }))
    expect(res.status).toBe(403)
  })
})

describe("guard de plataforma real (requireModuleApi(req, \"platform\")) — negativos", () => {
  it("usuário de loja, mesmo ADMIN com todos os módulos, recebe 403 sem persistir", async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      storeSession({ stores: ["loja-1"], modules: ["pdv", "sales", "cash", "settings"] }) as never,
    )
    const res = await POST(req({}))
    expect(res.status).toBe(403)
    expect(h.persist).not.toHaveBeenCalled()
  })
  it("sem sessão → 401 sem persistir", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const res = await POST(req({}))
    expect(res.status).toBe(401)
    expect(h.persist).not.toHaveBeenCalled()
  })
})
