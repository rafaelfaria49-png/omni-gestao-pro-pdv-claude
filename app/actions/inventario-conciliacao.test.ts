/**
 * INVENTARIO_INTELIGENTE_V01 — Testes de AÇÃO da conciliação (Prisma EM MEMÓRIA).
 *
 * Cobre os cenários do GOAL que vivem na camada de orquestração (não no núcleo puro):
 *   8.  simulação NÃO altera estoque (registrarAjusteEstoque nunca é chamado);
 *   9.  aplicar conciliação altera estoque (grava o saldo esperado hoje);
 *   10. aplicar duas vezes NÃO duplica (idempotência via flag de payload F4).
 *
 * Só auth/guards/store-id e o motor de ledger (`registrarAjusteEstoque`) são mockados; o
 * cálculo da conciliação (núcleo puro + montagem) roda sobre o banco fake.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

const STORE = "loja-x"
const T0 = new Date("2026-06-01T10:00:00.000Z") // contagem

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const store = {
    sessoes: new Map<string, Row>(),
    contagens: [] as Row[],
    produtos: [] as Row[],
    movimentacoes: [] as Row[],
  }
  const reset = () => {
    store.sessoes.clear()
    store.contagens = []
    store.produtos = []
    store.movimentacoes = []
  }

  // Spy do motor de ledger: aplica o novoSaldo absoluto no produto em memória.
  const registrarAjusteEstoque = vi.fn(async (storeId: string, input: { produtoId: string; novoSaldo: number }) => {
    const p = store.produtos.find((r) => r.id === input.produtoId && r.storeId === storeId)
    if (!p) return { ok: false as const, reason: "Produto não encontrado nesta loja" }
    if ((p.stock as number) === input.novoSaldo) {
      return { ok: false as const, reason: "Novo saldo igual ao atual — nada a ajustar" }
    }
    p.stock = input.novoSaldo
    return { ok: true as const, movimentacaoId: `mov-${input.produtoId}`, estoqueDepois: input.novoSaldo, custoMedioDepois: 0 }
  })

  const prisma = {
    inventarioSessao: {
      findFirst: async ({ where }: { where: { id: string; storeId: string } }) => {
        const s = store.sessoes.get(where.id)
        return s && s.storeId === where.storeId ? s : null
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const s = store.sessoes.get(where.id)
        if (!s) throw new Error("Sessão não encontrada")
        if (data.payload !== undefined) s.payload = data.payload
        return s
      },
    },
    inventarioContagem: {
      findMany: async ({ where }: { where: Row }) =>
        store.contagens.filter(
          (c) =>
            c.storeId === where.storeId &&
            c.sessaoId === where.sessaoId &&
            (where.status === undefined || c.status === where.status) &&
            c.produtoId != null
        ),
      findFirst: async ({ where }: { where: Row }) =>
        store.contagens.find(
          (c) =>
            c.storeId === where.storeId &&
            c.sessaoId === where.sessaoId &&
            c.produtoId === where.produtoId &&
            (where.status === undefined || c.status === where.status)
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const c = store.contagens.find((r) => r.id === where.id)
        if (!c) throw new Error("Contagem não encontrada")
        if (data.payload !== undefined) c.payload = data.payload
        return c
      },
    },
    produto: {
      findMany: async ({ where }: { where: Row }) =>
        store.produtos.filter((p) => p.storeId === where.storeId && (where.active === undefined || p.active === where.active)),
    },
    movimentacaoEstoque: {
      findMany: async ({ where }: { where: Row }) => {
        const inIds = (where.produtoId as { in?: string[] })?.in
        const gte = (where.createdAt as { gte?: Date })?.gte
        return store.movimentacoes.filter(
          (m) =>
            m.storeId === where.storeId &&
            (!inIds || inIds.includes(m.produtoId as string)) &&
            (!gte || (m.createdAt as Date) >= gte)
        )
      },
      // Sem candidatos a "não encontrado" nestes testes → agregados vazios.
      groupBy: async () => [],
    },
  }

  return { store, reset, prisma, registrarAjusteEstoque }
})

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { name: "Tester", email: "t@t.com" } })) }))
vi.mock("@/lib/auth/enterprise-permissions", () => ({ canAccessStore: () => true }))
vi.mock("@/app/actions/estoque", () => ({ registrarAjusteEstoque: h.registrarAjusteEstoque }))

import {
  simularConciliacaoInventario,
  aplicarConciliacaoInventario,
} from "./inventario"

function seedDivergencia() {
  // Sessão finalizada + 1 produto contado (7) com sistema em 5 e sem movimentação pós-contagem
  // → divergência real +2 (faltam 2 no sistema). saldoEsperadoHoje = 7.
  h.store.sessoes.set("s1", {
    id: "s1",
    storeId: STORE,
    status: "finalizada",
    operador: "Tester",
    nome: "Conferência",
    observacao: null,
    iniciadoEm: T0,
    finalizadoEm: new Date("2026-06-02T10:00:00.000Z"),
    payload: {},
  })
  h.store.produtos.push({
    id: "p1",
    storeId: STORE,
    name: "Capinha",
    sku: "CAP-1",
    stock: 5,
    precoCusto: 10,
    price: 30,
    category: "Acessórios",
    active: true,
  })
  h.store.contagens.push({
    id: "c1",
    storeId: STORE,
    sessaoId: "s1",
    produtoId: "p1",
    codigoBipado: "789",
    quantidadeContada: 7,
    estoqueSistemaSnapshot: 5,
    status: "encontrado",
    ultimoBipeEm: new Date("2026-06-01T11:00:00.000Z"),
    payload: {},
  })
}

beforeEach(() => {
  h.reset()
  h.registrarAjusteEstoque.mockClear()
})

describe("conciliação — simulação (cenário 8)", () => {
  it("NÃO altera estoque: registrarAjusteEstoque nunca é chamado e o stock fica intacto", async () => {
    seedDivergencia()
    const res = await simularConciliacaoInventario(STORE, "s1", {
      divergenciaProdutoIds: ["p1"],
      naoEncontradoProdutoIds: [],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.simulacao.produtosAlterados).toBe(1)
    expect(res.simulacao.unidadesAdicionadas).toBe(2)
    expect(res.simulacao.custoImpactado).toBe(20)
    expect(h.registrarAjusteEstoque).not.toHaveBeenCalled()
    expect((h.store.produtos[0].stock as number)).toBe(5) // intacto
  })
})

describe("conciliação — aplicar (cenários 9 e 10)", () => {
  it("9) aplicar grava o saldo esperado hoje no estoque (5 → 7)", async () => {
    seedDivergencia()
    const res = await aplicarConciliacaoInventario(STORE, "s1", {
      divergenciaProdutoIds: ["p1"],
      naoEncontradoProdutoIds: [],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.resumo.divergenciasAplicadas).toBe(1)
    expect(h.registrarAjusteEstoque).toHaveBeenCalledTimes(1)
    expect(h.registrarAjusteEstoque).toHaveBeenCalledWith(STORE, expect.objectContaining({ produtoId: "p1", novoSaldo: 7 }))
    expect((h.store.produtos[0].stock as number)).toBe(7)
    // A contagem foi marcada como ajustada (flag F4).
    expect((h.store.contagens[0].payload as Record<string, unknown>).ajusteAplicado).toBe(true)
  })

  it("10) aplicar de novo NÃO duplica: nenhum novo ajuste, estoque permanece em 7", async () => {
    seedDivergencia()
    await aplicarConciliacaoInventario(STORE, "s1", { divergenciaProdutoIds: ["p1"], naoEncontradoProdutoIds: [] })
    h.registrarAjusteEstoque.mockClear()

    const res2 = await aplicarConciliacaoInventario(STORE, "s1", {
      divergenciaProdutoIds: ["p1"],
      naoEncontradoProdutoIds: [],
    })
    expect(res2.ok).toBe(true)
    if (!res2.ok) return
    expect(res2.resumo.divergenciasAplicadas).toBe(0)
    expect(h.registrarAjusteEstoque).not.toHaveBeenCalled()
    expect((h.store.produtos[0].stock as number)).toBe(7) // sem dupla baixa/ajuste
  })

  it("bloqueia aplicação com a sessão ainda aberta", async () => {
    seedDivergencia()
    h.store.sessoes.get("s1")!.status = "aberta"
    const res = await aplicarConciliacaoInventario(STORE, "s1", {
      divergenciaProdutoIds: ["p1"],
      naoEncontradoProdutoIds: [],
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toMatch(/encerre a sessão/i)
    expect(h.registrarAjusteEstoque).not.toHaveBeenCalled()
  })
})
