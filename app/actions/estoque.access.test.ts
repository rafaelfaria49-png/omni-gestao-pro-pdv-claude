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
  // CAD-R2-009: o boundary canônico exige lock + depósito principal + ProdutoDeposito.
  queryRaw: vi.fn(async () => []),
  depositoFindFirst: vi.fn(async () => ({ id: "d1", storeId: "loja-a" })),
  depositoCreate: vi.fn(async () => ({ id: "d1", storeId: "loja-a" })),
  produtoDepositoFindMany: vi.fn(async () => [{ depositoId: "d1", quantidade: 1 }]),
  produtoDepositoUpsert: vi.fn(async () => ({})),
  movimentacaoFindFirst: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/auth/session-entitlement", () => ({ getSessionEntitlement: h.getSessionEntitlement }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    produto: {
      findFirst: h.produtoFindFirst,
      findUnique: h.produtoFindFirst,
      update: h.produtoUpdate,
    },
    deposito: { findFirst: h.depositoFindFirst, findUnique: h.depositoFindFirst, create: h.depositoCreate },
    produtoDeposito: { findMany: h.produtoDepositoFindMany, upsert: h.produtoDepositoUpsert },
    movimentacaoEstoque: {
      create: h.movimentacaoCreate,
      findFirst: h.movimentacaoFindFirst,
      findMany: vi.fn(async () => []),
    },
    $queryRaw: h.queryRaw,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: h.queryRaw,
        produto: {
          findFirst: h.produtoFindFirst,
          findUnique: h.produtoFindFirst,
          update: h.produtoUpdate,
        },
        deposito: {
          findFirst: h.depositoFindFirst,
          findUnique: h.depositoFindFirst,
          create: h.depositoCreate,
        },
        produtoDeposito: { findMany: h.produtoDepositoFindMany, upsert: h.produtoDepositoUpsert },
        movimentacaoEstoque: { create: h.movimentacaoCreate, findFirst: h.movimentacaoFindFirst },
      }),
  },
}))

import { registrarAjusteEstoque, registrarEntradaEstoque, diagnosticarSaldoEstoque } from "@/app/actions/estoque"

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
  h.produtoDepositoFindMany.mockReset()
  h.movimentacaoFindFirst.mockReset()
  h.auth.mockResolvedValue(null)
  h.getSessionEntitlement.mockResolvedValue({ ok: false })
  h.produtoFindFirst.mockResolvedValue(null)
  h.produtoDepositoFindMany.mockResolvedValue([{ depositoId: "d1", quantidade: 1 }])
  h.movimentacaoFindFirst.mockResolvedValue(null)
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

  it("entrada com SUM=4 stock=0 sem livro bloqueia e sugere ajuste", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    h.produtoFindFirst.mockResolvedValue({
      id: "p1",
      name: "fone de ouvido redmi",
      sku: "3817019322732",
      stock: 0,
      precoCusto: 12.5,
    })
    h.produtoDepositoFindMany.mockResolvedValue([{ depositoId: "d1", quantidade: 4 }])
    h.movimentacaoFindFirst.mockResolvedValue(null)
    const r = await registrarEntradaEstoque("loja-a", { produtoId: "p1", quantidade: 2 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.acaoSugerida).toBe("ajuste")
    expect(r.reason).toContain("Saldo do cadastro: 0")
    expect(r.reason).toContain("Saldo nos depósitos: 4")
    expect(h.produtoUpdate).not.toHaveBeenCalled()
    expect(h.movimentacaoCreate).not.toHaveBeenCalled()
  })

  it("entrada com SUM=4 stock=0 e livro=0 reconcilia e entra +2", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    h.produtoFindFirst.mockResolvedValue({
      id: "p1",
      name: "fone de ouvido redmi",
      sku: "3817019322732",
      stock: 0,
      precoCusto: 12.5,
    })
    h.produtoDepositoFindMany.mockResolvedValue([{ depositoId: "d1", quantidade: 4 }])
    h.movimentacaoFindFirst.mockResolvedValue({
      id: "m0",
      tipo: "saida",
      produtoId: "p1",
      quantidade: -1,
      documento: null,
      motivo: null,
      custoUnitario: 0,
      estoqueAntes: 1,
      estoqueDepois: 0,
      custoMedioAntes: 12.5,
      custoMedioDepois: 12.5,
    })
    const r = await registrarEntradaEstoque("loja-a", { produtoId: "p1", quantidade: 2, custoUnitario: 12.5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estoqueDepois).toBe(2)
    expect(r.reconciliado).toBe(true)
    expect(h.movimentacaoCreate).toHaveBeenCalledTimes(2)
    const origens = h.movimentacaoCreate.mock.calls.map((c) => (c[0].data as { origem: string }).origem)
    expect(origens).toContain("estoque-reconcile")
    expect(origens).toContain("manual")
  })

  it("diagnóstico read-only não escreve e classifica overhang sem livro como bloqueio de entrada", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    h.produtoFindFirst.mockResolvedValue({
      id: "p1",
      name: "fone de ouvido redmi",
      sku: "3817019322732",
      stock: 0,
      precoCusto: 12.5,
    })
    h.produtoDepositoFindMany.mockResolvedValue([{ depositoId: "d1", quantidade: 4 }])
    h.movimentacaoFindFirst.mockResolvedValue(null)
    const r = await diagnosticarSaldoEstoque("loja-a", "p1")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.aligned).toBe(false)
    expect(r.entradaPodeReconciliar).toBe(false)
    expect(r.stock).toBe(0)
    expect(r.somaDepositos).toBe(4)
    expect(h.produtoUpdate).not.toHaveBeenCalled()
    expect(h.movimentacaoCreate).not.toHaveBeenCalled()
  })
})
