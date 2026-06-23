/**
 * GOAL_INVENTARIO_CONTAGEM_QUANTIDADE_CADASTRADO_V01 — Testes de AÇÃO (Prisma EM MEMÓRIA).
 *
 * Cobre o que a orquestração de `registrarContagemProduto` faz (informar quantidade de produto
 * JÁ CADASTRADO com modo substituir/somar) e a integração com a conciliação dinâmica:
 *   - substituir 13 → total vira 13;
 *   - somar +5 sobre 10 → 15;
 *   - NÃO altera Produto.stock na bipagem (registrarAjusteEstoque nunca é chamado);
 *   - mantém ultimoBipeEm confiável (avança a cada registro);
 *   - promove uma linha de reconciliação (código antes sem produto) para encontrado;
 *   - contou 10 e vendeu 2 depois → conciliação projeta saldo esperado 8;
 *   - múltiplos produtos com countedAt diferentes → cada um projetado individualmente;
 *   - o fluxo de produto NÃO cadastrado (pendência) continua intacto.
 *
 * Só auth/guards/store-id e o motor de ledger (`registrarAjusteEstoque`) são mockados; o resto roda
 * sobre um banco fake genérico (matchWhere) que entende os operadores usados (in/gte/not:null).
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

const STORE = "loja-x"

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

  let seq = 0
  const nextId = (p: string) => `${p}-${++seq}`

  // matchWhere genérico: igualdade escalar + operadores { in } / { gte } / { not: null }.
  const matchOp = (value: unknown, cond: unknown): boolean => {
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>
      if ("in" in c) return Array.isArray(c.in) && (c.in as unknown[]).includes(value)
      if ("gte" in c) return (value as number) >= (c.gte as number)
      if ("not" in c) return c.not === null ? value != null : value !== c.not
      return value === cond
    }
    return value === cond
  }
  const matchWhere = (row: Row, where: Row): boolean => {
    for (const [k, cond] of Object.entries(where)) {
      if (cond === undefined) continue
      if (!matchOp(row[k], cond)) return false
    }
    return true
  }
  const sortBy = (rows: Row[], orderBy?: Row): Row[] => {
    if (!orderBy) return rows
    const [field, dir] = Object.entries(orderBy)[0] ?? []
    if (!field) return rows
    return [...rows].sort((a, b) => {
      const av = (a[field] as { valueOf(): number })?.valueOf?.() ?? 0
      const bv = (b[field] as { valueOf(): number })?.valueOf?.() ?? 0
      return dir === "desc" ? bv - av : av - bv
    })
  }

  // Motor de ledger: spy. Se for chamado durante a bipagem, o teste falha (não deve mexer estoque).
  const registrarAjusteEstoque = vi.fn(async () => ({ ok: true as const, movimentacaoId: "x", estoqueDepois: 0, custoMedioDepois: 0 }))

  const prisma = {
    inventarioSessao: {
      findFirst: async ({ where }: { where: Row }) => {
        for (const s of store.sessoes.values()) if (matchWhere(s, where)) return s
        return null
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const s = store.sessoes.get(where.id as string)
        if (!s) throw new Error("Sessão não encontrada")
        Object.assign(s, data)
        return s
      },
    },
    inventarioContagem: {
      findFirst: async ({ where }: { where: Row }) => store.contagens.find((c) => matchWhere(c, where)) ?? null,
      findMany: async ({ where, orderBy }: { where: Row; orderBy?: Row }) =>
        sortBy(store.contagens.filter((c) => matchWhere(c, where)), orderBy),
      create: async ({ data }: { data: Row }) => {
        const now = new Date()
        const row: Row = {
          id: nextId("c"),
          produtoId: null,
          produtoNomeSnapshot: null,
          produtoSkuSnapshot: null,
          estoqueSistemaSnapshot: null,
          quantidadeContada: 0,
          status: "encontrado",
          primeiroBipeEm: now,
          ultimoBipeEm: now,
          payload: null,
          ...data,
        }
        store.contagens.push(row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const c = store.contagens.find((r) => r.id === where.id)
        if (!c) throw new Error("Contagem não encontrada")
        Object.assign(c, data)
        return c
      },
      upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const key = where.sessaoId_codigoBipado as { sessaoId: string; codigoBipado: string }
        const existing = store.contagens.find(
          (c) => c.sessaoId === key.sessaoId && c.codigoBipado === key.codigoBipado
        )
        if (existing) {
          Object.assign(existing, update)
          return existing
        }
        const now = new Date()
        const row: Row = {
          id: nextId("c"),
          produtoId: null,
          produtoNomeSnapshot: null,
          produtoSkuSnapshot: null,
          estoqueSistemaSnapshot: null,
          quantidadeContada: 0,
          status: "encontrado",
          primeiroBipeEm: now,
          ultimoBipeEm: now,
          payload: null,
          sessaoId: key.sessaoId,
          codigoBipado: key.codigoBipado,
          ...create,
        }
        store.contagens.push(row)
        return row
      },
    },
    produto: {
      findFirst: async ({ where }: { where: Row }) => store.produtos.find((p) => matchWhere(p, where)) ?? null,
      findMany: async ({ where }: { where: Row }) => store.produtos.filter((p) => matchWhere(p, where)),
    },
    movimentacaoEstoque: {
      findMany: async ({ where }: { where: Row }) => store.movimentacoes.filter((m) => matchWhere(m, where)),
      // Agrega _max.createdAt por produtoId respeitando o where (storeId / produtoId in / tipo).
      groupBy: async ({ where }: { where: Row }) => {
        const byProd = new Map<string, Date>()
        for (const m of store.movimentacoes.filter((r) => matchWhere(r, where))) {
          const pid = m.produtoId as string
          const d = m.createdAt as Date
          const cur = byProd.get(pid)
          if (!cur || d > cur) byProd.set(pid, d)
        }
        return [...byProd.entries()].map(([produtoId, createdAt]) => ({ produtoId, _max: { createdAt } }))
      },
    },
  }

  return { store, reset, prisma, registrarAjusteEstoque, nextId }
})

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { name: "Tester", email: "t@t.com" } })) }))
vi.mock("@/lib/auth/enterprise-permissions", () => ({ canAccessStore: () => true }))
vi.mock("@/app/actions/estoque", () => ({ registrarAjusteEstoque: h.registrarAjusteEstoque }))

import {
  registrarContagemProduto,
  registrarPendenciaInventario,
  getConciliacaoInventario,
  getContextoContagemProduto,
} from "./inventario"

function seedSessao(status: "aberta" | "finalizada" = "aberta") {
  h.store.sessoes.set("s1", {
    id: "s1",
    storeId: STORE,
    status,
    operador: "Tester",
    nome: "Conferência",
    observacao: null,
    iniciadoEm: new Date("2026-06-01T10:00:00.000Z"),
    finalizadoEm: null,
    payload: {},
  })
}

function seedProduto(id: string, over: Record<string, unknown> = {}) {
  h.store.produtos.push({
    id,
    storeId: STORE,
    name: `Produto ${id}`,
    sku: `SKU-${id}`,
    stock: 20,
    precoCusto: 10,
    price: 30,
    category: "Acessórios",
    active: true,
    ...over,
  })
}

beforeEach(() => {
  h.reset()
  h.registrarAjusteEstoque.mockClear()
})

describe("registrarContagemProduto — substituir × somar", () => {
  it("substituir: a quantidade informada vira o total contado (13)", async () => {
    seedSessao()
    seedProduto("p1", { stock: 20 })
    const res = await registrarContagemProduto(STORE, {
      sessaoId: "s1",
      codigo: "789",
      produtoId: "p1",
      quantidade: 13,
      modo: "substituir",
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.contagem.quantidadeContada).toBe(13)
    expect(res.contagem.produtoId).toBe("p1")
    expect(res.contagem.status).toBe("encontrado")
    // estoque do sistema fica como referência (snapshot), não é alterado.
    expect(res.contagem.estoqueSistema).toBe(20)
    expect((h.store.produtos[0].stock as number)).toBe(20)
  })

  it("somar: +5 sobre uma contagem anterior de 10 → 15", async () => {
    seedSessao()
    seedProduto("p1", { stock: 20 })
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 10, modo: "substituir" })
    const res = await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 5, modo: "somar" })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.contagem.quantidadeContada).toBe(15)
    // continua a MESMA linha (unicidade por sessão+código), não duplicou.
    expect(h.store.contagens.filter((c) => c.codigoBipado === "789")).toHaveLength(1)
  })

  it("NÃO altera Produto.stock na bipagem (registrarAjusteEstoque nunca é chamado)", async () => {
    seedSessao()
    seedProduto("p1", { stock: 20 })
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 13, modo: "substituir" })
    expect(h.registrarAjusteEstoque).not.toHaveBeenCalled()
    expect((h.store.produtos[0].stock as number)).toBe(20) // intacto
  })

  it("mantém ultimoBipeEm confiável: avança a cada registro", async () => {
    seedSessao()
    seedProduto("p1", { stock: 20 })
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 10, modo: "substituir" })
    const t1 = new Date((h.store.contagens[0].ultimoBipeEm as Date).getTime())
    // força o relógio adiante para o 2º registro
    h.store.contagens[0].ultimoBipeEm = new Date(t1.getTime() - 5000)
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 5, modo: "somar" })
    const t2 = h.store.contagens[0].ultimoBipeEm as Date
    expect(t2.getTime()).toBeGreaterThan(t1.getTime() - 5000)
  })

  it("promove uma linha de reconciliação (código antes sem produto) para encontrado", async () => {
    seedSessao()
    seedProduto("p1", { stock: 8 })
    // linha pré-existente sem produto (fila de reconciliação).
    h.store.contagens.push({
      id: "c-rec",
      storeId: STORE,
      sessaoId: "s1",
      produtoId: null,
      codigoBipado: "789",
      produtoNomeSnapshot: null,
      produtoSkuSnapshot: null,
      estoqueSistemaSnapshot: null,
      quantidadeContada: 3,
      status: "reconciliacao",
      primeiroBipeEm: new Date("2026-06-01T10:00:00.000Z"),
      ultimoBipeEm: new Date("2026-06-01T10:00:00.000Z"),
      payload: null,
    })
    const res = await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 5, modo: "substituir" })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.contagem.status).toBe("encontrado")
    expect(res.contagem.produtoId).toBe("p1")
    expect(res.contagem.quantidadeContada).toBe(5) // substituir ignora os 3 antigos
    expect(res.contagem.estoqueSistema).toBe(8) // snapshot preenchido na promoção
    expect(h.store.contagens.filter((c) => c.codigoBipado === "789")).toHaveLength(1)
  })

  it("rejeita produto de outra loja / inexistente", async () => {
    seedSessao()
    const res = await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "fantasma", quantidade: 5, modo: "substituir" })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toMatch(/não encontrado/i)
  })

  it("rejeita registro com a sessão já encerrada", async () => {
    seedSessao("finalizada")
    seedProduto("p1")
    const res = await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 5, modo: "substituir" })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toMatch(/encerrada/i)
  })
})

describe("conciliação a partir da contagem por quantidade", () => {
  it("contou 10 e vendeu 2 depois → saldo esperado hoje 8 (conciliado)", async () => {
    seedSessao()
    seedProduto("p1", { stock: 10, precoCusto: 10, price: 30 })
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 10, modo: "substituir" })

    // venda de 2 unidades DEPOIS da contagem: delta −2 no ledger + estoque do sistema cai p/ 8.
    const contadoEm = h.store.contagens[0].ultimoBipeEm as Date
    h.store.movimentacoes.push({
      storeId: STORE,
      produtoId: "p1",
      quantidade: -2,
      tipo: "saida",
      createdAt: new Date(contadoEm.getTime() + 1000),
    })
    h.store.produtos[0].stock = 8

    const res = await getConciliacaoInventario(STORE, "s1")
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const item = res.conciliacao.itens.find((i) => i.produtoId === "p1")!
    expect(item.movimentacaoPosContagem).toBe(-2)
    expect(item.saldoEsperadoHoje).toBe(8)
    expect(item.divergenciaReal).toBe(0)
    expect(item.grupo).toBe("com_movimentacao")
  })

  it("múltiplos produtos com countedAt diferentes são projetados individualmente", async () => {
    seedSessao()
    seedProduto("pA", { stock: 7 })
    seedProduto("pB", { stock: 8 })
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "AAA", produtoId: "pA", quantidade: 10, modo: "substituir" })
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "BBB", produtoId: "pB", quantidade: 8, modo: "substituir" })

    const T0 = new Date("2026-06-01T10:00:00.000Z") // pA contado no dia 01
    const T1 = new Date("2026-06-03T10:00:00.000Z") // venda no dia 03
    const T2 = new Date("2026-06-05T10:00:00.000Z") // pB contado no dia 05
    const rowA = h.store.contagens.find((c) => c.produtoId === "pA")!
    const rowB = h.store.contagens.find((c) => c.produtoId === "pB")!
    rowA.ultimoBipeEm = T0
    rowB.ultimoBipeEm = T2
    // pA: venda −3 DEPOIS da sua contagem (conta) → 10 −3 = 7 = sistema.
    // pB: venda −3 ANTES da sua contagem (não conta) → 8 = sistema.
    h.store.movimentacoes.push({ storeId: STORE, produtoId: "pA", quantidade: -3, tipo: "saida", createdAt: T1 })
    h.store.movimentacoes.push({ storeId: STORE, produtoId: "pB", quantidade: -3, tipo: "saida", createdAt: T1 })

    const res = await getConciliacaoInventario(STORE, "s1")
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const a = res.conciliacao.itens.find((i) => i.produtoId === "pA")!
    const b = res.conciliacao.itens.find((i) => i.produtoId === "pB")!
    expect(a.saldoEsperadoHoje).toBe(7)
    expect(a.divergenciaReal).toBe(0)
    expect(b.movimentacaoPosContagem).toBe(0) // venda foi antes da contagem dele
    expect(b.saldoEsperadoHoje).toBe(8)
    expect(b.divergenciaReal).toBe(0)
  })

  it("produto com estoque > 0 não bipado aparece em 'não encontrado'", async () => {
    seedSessao()
    seedProduto("p1", { stock: 10 }) // será contado
    seedProduto("p2", { stock: 4, precoCusto: 10, price: 25 }) // NÃO bipado, estoque > 0
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "AAA", produtoId: "p1", quantidade: 10, modo: "substituir" })
    // movimentação recente de p2 → classifica como "não encontrado" (não suspeito antigo).
    h.store.movimentacoes.push({ storeId: STORE, produtoId: "p2", quantidade: -1, tipo: "saida", createdAt: new Date() })

    const res = await getConciliacaoInventario(STORE, "s1")
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const p2 = res.conciliacao.naoEncontrados.find((n) => n.produtoId === "p2")
    expect(p2).toBeDefined()
    expect(p2!.grupo).toBe("nao_encontrado")
    expect(p2!.estoqueAtual).toBe(4)
    // p1 (contado) não entra em não encontrados.
    expect(res.conciliacao.naoEncontrados.some((n) => n.produtoId === "p1")).toBe(false)
  })
})

describe("getContextoContagemProduto — observabilidade do modal", () => {
  it("produto ainda não contado → contexto zerado", async () => {
    seedSessao()
    seedProduto("p1", { stock: 20 })
    const res = await getContextoContagemProduto(STORE, "s1", "p1")
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.contexto).toEqual({ jaContado: 0, ultimaContagemEm: null, movimentacaoPosContagem: 0, temMovimentacaoPos: false })
  })

  it("contou e vendeu depois → detecta movimentação pós-contagem (com sinal)", async () => {
    seedSessao()
    seedProduto("p1", { stock: 10 })
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 10, modo: "substituir" })
    const contadoEm = h.store.contagens[0].ultimoBipeEm as Date
    h.store.movimentacoes.push({ storeId: STORE, produtoId: "p1", quantidade: -2, tipo: "saida", createdAt: new Date(contadoEm.getTime() + 1000) })

    const res = await getContextoContagemProduto(STORE, "s1", "p1")
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.contexto.jaContado).toBe(10)
    expect(res.contexto.ultimaContagemEm).not.toBeNull()
    expect(res.contexto.movimentacaoPosContagem).toBe(-2)
    expect(res.contexto.temMovimentacaoPos).toBe(true)
  })

  it("movimentação ANTES da contagem não conta", async () => {
    seedSessao()
    seedProduto("p1", { stock: 10 })
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 10, modo: "substituir" })
    const contadoEm = h.store.contagens[0].ultimoBipeEm as Date
    h.store.movimentacoes.push({ storeId: STORE, produtoId: "p1", quantidade: -2, tipo: "saida", createdAt: new Date(contadoEm.getTime() - 60000) })

    const res = await getContextoContagemProduto(STORE, "s1", "p1")
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.contexto.movimentacaoPosContagem).toBe(0)
    expect(res.contexto.temMovimentacaoPos).toBe(false)
  })
})

describe("fluxo de produto NÃO cadastrado (pendência) continua intacto", () => {
  it("código sem produto → linha de reconciliação com a quantidade informada", async () => {
    seedSessao()
    const res = await registrarPendenciaInventario(STORE, {
      sessaoId: "s1",
      codigo: "SEM-CADASTRO",
      quantidade: 4,
      nomeRapido: "Capinha avulsa",
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.contagem.status).toBe("reconciliacao")
    expect(res.contagem.produtoId).toBeNull()
    expect(res.contagem.quantidadeContada).toBe(4)
    expect(h.registrarAjusteEstoque).not.toHaveBeenCalled()
  })
})
