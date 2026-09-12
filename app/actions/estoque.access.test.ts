import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  getSessionEntitlement: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: false })),
  produtoFindFirst: vi.fn(
    async (
      _args?: unknown,
    ): Promise<{
      id: string
      name: string
      sku: string | null
      stock: number
      precoCusto: number | null
    } | null> => null,
  ),
  produtoUpdate: vi.fn(async () => ({})),
  movimentacaoCreate: vi.fn(async (args: { data: { usuario?: string | null } }) => ({
    id: "mov-1",
    ...args.data,
  })),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/auth/session-entitlement", () => ({ getSessionEntitlement: h.getSessionEntitlement }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    produto: { findFirst: h.produtoFindFirst, update: h.produtoUpdate },
    movimentacaoEstoque: { create: h.movimentacaoCreate, findMany: vi.fn(async () => []) },
    $transaction: async (fn: (tx: {
      produto: { findFirst: typeof h.produtoFindFirst; update: typeof h.produtoUpdate }
      movimentacaoEstoque: { create: typeof h.movimentacaoCreate }
    }) => Promise<unknown>) =>
      fn({
        produto: { findFirst: h.produtoFindFirst, update: h.produtoUpdate },
        movimentacaoEstoque: { create: h.movimentacaoCreate },
      }),
  },
}))

import { registrarAjusteEstoque, registrarEntradaEstoque } from "@/app/actions/estoque"

function sessionAtiva(role: string, stores: string[] | "all") {
  h.getSessionEntitlement.mockResolvedValue({ ok: true })
  h.auth.mockResolvedValue({
    user: {
      id: "user-1",
      email: "u@x.com",
      name: "U",
      role,
      storeAccess: stores === "all" ? "all" : "restricted",
      allowedStoreIds: stores === "all" ? undefined : stores,
    },
    expires: new Date().toISOString(),
  } as unknown as Session)
}

beforeEach(() => {
  h.auth.mockReset()
  h.getSessionEntitlement.mockReset()
  h.produtoFindFirst.mockReset()
  h.produtoUpdate.mockReset()
  h.movimentacaoCreate.mockReset()
  h.auth.mockResolvedValue(null)
  h.getSessionEntitlement.mockResolvedValue({ ok: false })
  h.produtoFindFirst.mockResolvedValue(null)
})

describe("estoque actions — só boundary", () => {
  it("entrada sem sessão → ok:false", async () => {
    const r = await registrarEntradaEstoque("loja-a", { produtoId: "p1", quantidade: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("Não autenticado")
  })

  it("ajuste outra loja → ok:false", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    const r = await registrarAjusteEstoque("loja-b", { produtoId: "p1", novoSaldo: 1, motivo: "contagem" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("Sem permissão para esta unidade")
  })

  it("usuario persistido vem da sessão, não de input.usuario", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    h.produtoFindFirst.mockResolvedValue({
      id: "p1",
      name: "Cabo",
      sku: "SKU1",
      stock: 1,
      precoCusto: 0,
    })
    const r = await registrarEntradaEstoque("loja-a", {
      produtoId: "p1",
      quantidade: 2,
      usuario: "Rafael",
    })
    expect(r.ok).toBe(true)
    expect(h.movimentacaoCreate).toHaveBeenCalled()
    const data = h.movimentacaoCreate.mock.calls.at(0)?.[0].data as { usuario: string | null }
    expect(data.usuario).toBe("U")
    expect(data.usuario).not.toBe("Rafael")
    expect(data.usuario).not.toBe("Operador")
  })
})
