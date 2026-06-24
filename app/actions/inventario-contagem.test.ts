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

  // matchWhere genérico: igualdade escalar + operadores in/notIn/gte/gt/lt/not/contains.
  const matchOp = (value: unknown, cond: unknown): boolean => {
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>
      if ("in" in c) return Array.isArray(c.in) && (c.in as unknown[]).includes(value)
      if ("notIn" in c) return !(Array.isArray(c.notIn) && (c.notIn as unknown[]).includes(value))
      if ("gte" in c) return (value as number) >= (c.gte as number)
      if ("gt" in c) return (value as number) > (c.gt as number)
      if ("lt" in c) return (value as number) < (c.lt as number)
      if ("not" in c) return c.not === null ? value != null : value !== c.not
      if ("contains" in c)
        return typeof value === "string" && value.toLowerCase().includes(String(c.contains).toLowerCase())
      return value === cond
    }
    return value === cond
  }
  // Filtro JSON do Prisma: { metadata: { path: [...], array_contains: code } } sobre JsonB.
  const matchJsonPath = (row: Row, cond: Record<string, unknown>): boolean => {
    let v: unknown = row.metadata
    for (const seg of (cond.path as string[]) ?? []) v = (v as Record<string, unknown> | null)?.[seg]
    return Array.isArray(v) && v.includes(cond.array_contains)
  }
  const matchWhere = (row: Row, where: Row): boolean => {
    for (const [k, cond] of Object.entries(where)) {
      if (cond === undefined) continue
      if (k === "OR") {
        if (!Array.isArray(cond) || !cond.some((sub) => matchWhere(row, sub as Row))) return false
        continue
      }
      if (k === "metadata" && cond && typeof cond === "object" && "array_contains" in (cond as object)) {
        if (!matchJsonPath(row, cond as Record<string, unknown>)) return false
        continue
      }
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
      findMany: async ({ where, orderBy, take, skip }: { where: Row; orderBy?: Row; take?: number; skip?: number }) => {
        let rows = sortBy(store.produtos.filter((p) => matchWhere(p, where)), orderBy)
        if (typeof skip === "number") rows = rows.slice(skip)
        if (typeof take === "number") rows = rows.slice(0, take)
        return rows
      },
      count: async ({ where }: { where: Row }) => store.produtos.filter((p) => matchWhere(p, where)).length,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const p = store.produtos.find((r) => r.id === where.id)
        if (!p) throw new Error("Produto não encontrado")
        Object.assign(p, data)
        return p
      },
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
  vincularPendenciaInventario,
  getConciliacaoInventario,
  getContextoContagemProduto,
  getInventarioProgresso,
  listProdutosNaoConferidos,
  getInventarioSaneamentoTimeline,
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

  it("editar quantidade já contada: substituir corrige o total para baixo (10 → 7) sem duplicar nem tocar stock", async () => {
    seedSessao()
    seedProduto("p1", { stock: 20 })
    await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 10, modo: "substituir" })
    // "Editar" reusa a mesma action em modo substituir com o novo total.
    const res = await registrarContagemProduto(STORE, { sessaoId: "s1", codigo: "789", produtoId: "p1", quantidade: 7, modo: "substituir" })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.contagem.quantidadeContada).toBe(7)
    expect(h.store.contagens.filter((c) => c.codigoBipado === "789")).toHaveLength(1)
    expect(h.registrarAjusteEstoque).not.toHaveBeenCalled()
    expect((h.store.produtos[0].stock as number)).toBe(20)
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

describe("reconciliação — vincular pendência (cadastrar / associar)", () => {
  it("vincula a um produto recém-cadastrado → sai da fila; reaplicar é rejeitado (idempotência)", async () => {
    seedSessao()
    seedProduto("pNovo", { stock: 0 }) // produto criado a partir da pendência
    const pend = await registrarPendenciaInventario(STORE, { sessaoId: "s1", codigo: "SEM-CAD", quantidade: 3, nomeRapido: "Capinha X" })
    expect(pend.ok).toBe(true)
    if (!pend.ok) return

    const res = await vincularPendenciaInventario(STORE, "s1", pend.contagem.id, "pNovo", "cadastrado")
    expect(res.ok).toBe(true)
    // não mexeu no estoque do produto vinculado.
    expect(h.registrarAjusteEstoque).not.toHaveBeenCalled()
    expect((h.store.produtos.find((p) => p.id === "pNovo")!.stock as number)).toBe(0)

    // segunda chamada: já resolvido → rejeita (não duplica vínculo).
    const res2 = await vincularPendenciaInventario(STORE, "s1", pend.contagem.id, "pNovo", "cadastrado")
    expect(res2.ok).toBe(false)
    if (res2.ok) return
    expect(res2.reason).toMatch(/resolvid/i)
  })

  it("vincula a um produto existente (associado)", async () => {
    seedSessao()
    seedProduto("pExist", { stock: 5 })
    const pend = await registrarPendenciaInventario(STORE, { sessaoId: "s1", codigo: "SEM-CAD2", quantidade: 1 })
    expect(pend.ok).toBe(true)
    if (!pend.ok) return
    const res = await vincularPendenciaInventario(STORE, "s1", pend.contagem.id, "pExist", "associado")
    expect(res.ok).toBe(true)
    expect((h.store.produtos.find((p) => p.id === "pExist")!.stock as number)).toBe(5) // estoque intacto
  })

  it("rejeita vínculo a produto de outra loja / inexistente", async () => {
    seedSessao()
    const pend = await registrarPendenciaInventario(STORE, { sessaoId: "s1", codigo: "SEM-CAD3", quantidade: 2 })
    expect(pend.ok).toBe(true)
    if (!pend.ok) return
    const res = await vincularPendenciaInventario(STORE, "s1", pend.contagem.id, "fantasma", "associado")
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toMatch(/não encontrado/i)
  })
})

// ─── GOAL_INVENTARIO_BARCODE_ALIAS_V01 ──────────────────────────────────────────
// Simula a resolução do lookup (mesma forma do OR de /api/ops/inventory/lookup).
function lookup(storeId: string, code: string) {
  return h.prisma.produto.findFirst({
    where: {
      storeId,
      OR: [
        { barcode: code },
        { sku: code },
        { id: code },
        { metadata: { path: ["codigosAlias"], array_contains: code } },
      ],
    },
  })
}

describe("alias de código reconciliado", () => {
  it("associar existente grava o código como alias → próxima bipagem resolve o produto", async () => {
    seedSessao()
    seedProduto("pExist", { stock: 5, barcode: "BAR-EXIST" })
    const CODE = "EAN-NOVO-1"
    // antes: o código não resolve ninguém (cai em pendência).
    expect(await lookup(STORE, CODE)).toBeNull()

    const pend = await registrarPendenciaInventario(STORE, { sessaoId: "s1", codigo: CODE, quantidade: 2 })
    if (!pend.ok) return
    const res = await vincularPendenciaInventario(STORE, "s1", pend.contagem.id, "pExist", "associado")
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.codigoVinculado).toBe(CODE)

    // alias persistido no metadata (sem tocar barcode/sku/estoque).
    const p = h.store.produtos.find((x) => x.id === "pExist")!
    expect((p.metadata as { codigosAlias: string[] }).codigosAlias).toContain(CODE)
    expect(p.barcode).toBe("BAR-EXIST")
    expect(p.stock).toBe(5)
    expect(h.registrarAjusteEstoque).not.toHaveBeenCalled()

    // depois: a mesma bipagem agora encontra o produto.
    expect((await lookup(STORE, CODE))?.id).toBe("pExist")
  })

  it("cadastrar produto que já tem o código como barcode → NÃO duplica alias", async () => {
    seedSessao()
    const CODE = "EAN-CAD-1"
    seedProduto("pNovo", { stock: 0, barcode: CODE }) // criado já com o código bipado como barcode
    const pend = await registrarPendenciaInventario(STORE, { sessaoId: "s1", codigo: CODE, quantidade: 1 })
    if (!pend.ok) return
    const res = await vincularPendenciaInventario(STORE, "s1", pend.contagem.id, "pNovo", "cadastrado")
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.codigoVinculado).toBeNull() // já resolvia por barcode → nada a adicionar
    const p = h.store.produtos.find((x) => x.id === "pNovo")!
    expect(p.metadata).toBeUndefined() // não criou codigosAlias à toa
    expect((await lookup(STORE, CODE))?.id).toBe("pNovo")
  })

  it("código que já pertence a OUTRO produto da loja bloqueia o vínculo (não resolve a pendência)", async () => {
    seedSessao()
    const CODE = "EAN-DUP"
    seedProduto("pDono", { stock: 1, barcode: CODE }) // já dono do código
    seedProduto("pOutro", { stock: 1 })
    const pend = await registrarPendenciaInventario(STORE, { sessaoId: "s1", codigo: CODE, quantidade: 1 })
    if (!pend.ok) return
    const res = await vincularPendenciaInventario(STORE, "s1", pend.contagem.id, "pOutro", "associado")
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toMatch(/já pertence/i)
    // pOutro NÃO recebeu alias e a pendência continua aberta.
    expect(h.store.produtos.find((x) => x.id === "pOutro")!.metadata).toBeUndefined()
    const contagem = h.store.contagens.find((c) => c.codigoBipado === CODE)!
    expect((contagem.payload as Record<string, unknown>).pendenciaVinculo).toBeUndefined()
  })

  it("código igual em OUTRA loja não bloqueia nem vaza (escopo por storeId)", async () => {
    const STORE2 = "loja-y"
    seedSessao()
    const CODE = "EAN-SHARED"
    seedProduto("pLojaY", { storeId: STORE2, stock: 9, barcode: CODE }) // dono do código na loja Y
    seedProduto("pLojaX", { stock: 3 }) // produto da loja X (STORE) sem o código

    const pend = await registrarPendenciaInventario(STORE, { sessaoId: "s1", codigo: CODE, quantidade: 1 })
    if (!pend.ok) return
    // associa na loja X: o dono na loja Y não conta (escopo por storeId) → permitido.
    const res = await vincularPendenciaInventario(STORE, "s1", pend.contagem.id, "pLojaX", "associado")
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.codigoVinculado).toBe(CODE)

    // cada loja resolve para o SEU produto; nada vaza entre lojas.
    expect((await lookup(STORE, CODE))?.id).toBe("pLojaX")
    expect((await lookup(STORE2, CODE))?.id).toBe("pLojaY")
  })
})

// ─── GOAL_INVENTARIO_CONTINUO_V01 — progresso / a conferir / saneamento ─────────
function seedContagem(over: Record<string, unknown>) {
  const now = new Date()
  h.store.contagens.push({
    id: h.nextId("c"),
    storeId: STORE,
    sessaoId: "s1",
    produtoId: null,
    codigoBipado: `auto-${h.store.contagens.length}`,
    produtoNomeSnapshot: null,
    produtoSkuSnapshot: null,
    estoqueSistemaSnapshot: null,
    quantidadeContada: 1,
    status: "encontrado",
    primeiroBipeEm: now,
    ultimoBipeEm: now,
    payload: null,
    ...over,
  })
}

describe("INVENTARIO CONTÍNUO — progresso", () => {
  it("total, conferidos, restantes e % do catálogo + novos/reconciliados", async () => {
    seedSessao()
    seedProduto("p1", { stock: 10, category: "Capas" })
    seedProduto("p2", { stock: 5, category: "Capas" })
    seedProduto("p3", { stock: 0, category: "Cabos" })
    seedProduto("p4", { stock: 3, category: "Cabos" })
    // conferidos: p1 e p2 (contado = estoque → sem divergência)
    seedContagem({ produtoId: "p1", codigoBipado: "c1", quantidadeContada: 10, estoqueSistemaSnapshot: 10, produtoNomeSnapshot: "Produto p1" })
    seedContagem({ produtoId: "p2", codigoBipado: "c2", quantidadeContada: 5, estoqueSistemaSnapshot: 5, produtoNomeSnapshot: "Produto p2" })
    // 1 pendência (novo encontrado) sem vínculo
    seedContagem({ status: "reconciliacao", codigoBipado: "ECX", quantidadeContada: 2 })

    const res = await getInventarioProgresso(STORE)
    expect(res.ok).toBe(true)
    if (!res.ok || !res.progresso) throw new Error("sem progresso")
    expect(res.progresso.totalCatalogo).toBe(4)
    expect(res.progresso.conferidos).toBe(2)
    expect(res.progresso.naoConferidos).toBe(2)
    expect(res.progresso.percentual).toBe(50)
    expect(res.progresso.divergencias).toBe(0)
    expect(res.progresso.novosEncontrados).toBe(1)
    expect(res.progresso.reconciliados).toBe(0)
    expect(res.progresso.ativa).toBe(true)
    expect(res.progresso.ultimoProduto).toBeTruthy()
  })

  it("progresso = null quando a loja nunca inventariou", async () => {
    const res = await getInventarioProgresso(STORE)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.progresso).toBeNull()
  })
})

describe("INVENTARIO CONTÍNUO — listProdutosNaoConferidos", () => {
  function seedCatalogo() {
    seedSessao()
    seedProduto("p1", { name: "Capa A", stock: 10, category: "Capas", brand: "ACME", supplierName: "Forn1" })
    seedProduto("p2", { name: "Capa B", stock: 0, category: "Capas", brand: "ACME", supplierName: "Forn1" })
    seedProduto("p3", { name: "Cabo C", stock: 3, category: "Cabos", brand: "Xpto", supplierName: "Forn2" })
    seedProduto("p4", { name: "Cabo D", stock: 7, category: "Cabos", brand: "Xpto", supplierName: "Forn2" })
    // p1 já conferido → sai da lista
    seedContagem({ produtoId: "p1", codigoBipado: "c1", status: "encontrado" })
  }

  it("exclui conferidos e expõe facetas do catálogo", async () => {
    seedCatalogo()
    const all = await listProdutosNaoConferidos(STORE, "s1")
    expect(all.ok).toBe(true)
    if (!all.ok) return
    expect(all.total).toBe(3)
    expect(all.itens.map((i) => i.produtoId).sort()).toEqual(["p2", "p3", "p4"])
    expect(all.facets.categorias).toEqual(["Cabos", "Capas"])
    expect(all.facets.marcas).toEqual(["ACME", "Xpto"])
    expect(all.facets.fornecedores).toEqual(["Forn1", "Forn2"])
  })

  it("filtra por categoria, estoque e busca; pagina", async () => {
    seedCatalogo()
    const cabos = await listProdutosNaoConferidos(STORE, "s1", { categoria: "Cabos" })
    if (!cabos.ok) return
    expect(cabos.total).toBe(2)

    const zero = await listProdutosNaoConferidos(STORE, "s1", { estoque: "zero" })
    if (!zero.ok) return
    expect(zero.itens.map((i) => i.produtoId)).toEqual(["p2"])

    const positivo = await listProdutosNaoConferidos(STORE, "s1", { estoque: "positivo" })
    if (!positivo.ok) return
    expect(positivo.itens.map((i) => i.produtoId).sort()).toEqual(["p3", "p4"])

    const busca = await listProdutosNaoConferidos(STORE, "s1", { busca: "cabo" })
    if (!busca.ok) return
    expect(busca.total).toBe(2)

    const pg = await listProdutosNaoConferidos(STORE, "s1", {}, { take: 2, skip: 0 })
    if (!pg.ok) return
    expect(pg.itens.length).toBe(2)
    expect(pg.total).toBe(3)
  })

  it("não vaza catálogo de outra loja (escopo por storeId)", async () => {
    seedCatalogo()
    seedProduto("zZ", { storeId: "loja-y", name: "Outra loja", stock: 1, category: "Capas" })
    const res = await listProdutosNaoConferidos(STORE, "s1")
    if (!res.ok) return
    expect(res.itens.some((i) => i.produtoId === "zZ")).toBe(false)
  })
})

describe("INVENTARIO CONTÍNUO — saneamento", () => {
  it("conferidos de hoje + reconciliados a partir do vínculo", async () => {
    seedSessao()
    seedProduto("p1", { stock: 5 })
    const hoje = new Date()
    seedContagem({ produtoId: "p1", codigoBipado: "c1", status: "encontrado", primeiroBipeEm: hoje })
    seedContagem({ produtoId: "p1", codigoBipado: "c2", status: "encontrado", primeiroBipeEm: hoje })
    seedContagem({
      status: "reconciliacao",
      codigoBipado: "ECX",
      payload: { pendenciaVinculo: { produtoId: "p1", tipo: "associado", vinculadoEm: hoje.toISOString(), operador: "Tester" } },
    })

    const res = await getInventarioSaneamentoTimeline(STORE)
    expect(res.ok).toBe(true)
    if (!res.ok || !res.saneamento) throw new Error("sem saneamento")
    expect(res.saneamento.hoje.conferidos).toBe(2)
    expect(res.saneamento.hoje.reconciliados).toBe(1)
    expect(res.saneamento.hoje.novos).toBe(0)
    expect(res.saneamento.semana.conferidos).toBe(2)
    expect(res.saneamento.ativa).toBe(true)
  })
})
