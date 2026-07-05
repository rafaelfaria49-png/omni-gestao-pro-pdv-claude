import { describe, it, expect, beforeEach, vi } from "vitest"

// ============================================================================
// GOAL CAIXA-SESSAO-DETALHE-VENDAS-003 — endpoint passa a devolver `vendas`.
// ----------------------------------------------------------------------------
// Exercita o handler GET de PRODUÇÃO sobre um Prisma EM MEMÓRIA. Prova que:
//  - o retorno continua trazendo `sessao`/`operacoes`/`totais` como antes;
//  - `vendas` aparece como lista vazia quando não há venda na sessão;
//  - vendas com `payload.sessaoId` igual à sessão entram na lista;
//  - sem `payload.sessaoId` (legado), cai para terminalId + janela de tempo.
// ============================================================================

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const sessoes: Row[] = []
  const operacoes: Row[] = []
  const devolucoes: Row[] = []
  const vendas: Row[] = []
  const movimentacoes: Row[] = []
  let seq = 0

  function matchJsonPath(payload: unknown, path?: string[], equals?: unknown): boolean {
    if (!path || path.length === 0) return true
    const key = path[0]!
    const pl = (payload ?? {}) as Row
    return pl[key] === equals
  }

  const prisma = {
    sessaoCaixa: {
      findFirst: async ({ where }: { where: { id?: string; storeId?: string } }) => {
        const s = sessoes.find((r) => {
          if (where.id && r.id !== where.id) return false
          if (where.storeId && r.storeId !== where.storeId) return false
          return true
        })
        if (!s) return null
        return {
          ...s,
          operacoes: operacoes
            .filter((o) => o.sessaoId === s.id)
            .slice()
            .sort((a, b) => Number(a.at) - Number(b.at)),
          devolucoes: devolucoes.filter((d) => d.sessaoId === s.id),
        }
      },
    },
    movimentacaoFinanceira: {
      aggregate: async ({
        where,
      }: {
        where: { storeId?: string; createdAt?: { gte?: Date; lte?: Date } }
      }) => {
        const rows = movimentacoes.filter((m) => {
          if (where.storeId && m.storeId !== where.storeId) return false
          const at = (m.createdAt as Date).getTime()
          if (where.createdAt?.gte && at < where.createdAt.gte.getTime()) return false
          if (where.createdAt?.lte && at > where.createdAt.lte.getTime()) return false
          return true
        })
        return {
          _sum: { valor: rows.reduce((s, r) => s + (r.valor as number), 0) },
          _count: rows.length,
        }
      },
    },
    venda: {
      aggregate: async ({
        where,
      }: {
        where: {
          storeId?: string
          terminalId?: string
          status?: { not?: string }
          at?: { gte?: Date; lte?: Date }
        }
      }) => {
        const rows = filtrarVendas(where)
        return {
          _sum: { total: rows.reduce((s, r) => s + (r.total as number), 0) },
          _count: { id: rows.length },
        }
      },
      findMany: async ({
        where,
      }: {
        where: {
          storeId?: string
          terminalId?: string
          at?: { gte?: Date; lte?: Date }
          payload?: { path?: string[]; equals?: unknown }
        }
      }) => {
        return filtrarVendas(where)
          .filter((r) => matchJsonPath(r.payload, where.payload?.path, where.payload?.equals))
          .map((r) => ({ ...r, itens: r.itens }))
      },
    },
    pdvTerminal: {
      findFirst: async () => null,
    },
  }

  function filtrarVendas(where: {
    storeId?: string
    terminalId?: string
    status?: { not?: string }
    at?: { gte?: Date; lte?: Date }
  }): Row[] {
    return vendas.filter((v) => {
      if (where.storeId && v.storeId !== where.storeId) return false
      if (where.terminalId && v.terminalId !== where.terminalId) return false
      if (where.status?.not && v.status === where.status.not) return false
      const at = (v.at as Date).getTime()
      if (where.at?.gte && at < where.at.gte.getTime()) return false
      if (where.at?.lte && at > where.at.lte.getTime()) return false
      return true
    })
  }

  return {
    prisma,
    sessoes,
    operacoes,
    vendas,
    reset: () => {
      sessoes.length = 0
      operacoes.length = 0
      devolucoes.length = 0
      vendas.length = 0
      movimentacoes.length = 0
      seq = 0
    },
    abrirCaixa: (opts?: { terminalId?: string | null }) => {
      const id = `sess-${++seq}`
      sessoes.push({
        id,
        storeId: STORE,
        status: "ABERTA",
        abertaEm: new Date(Date.now() - 60_000),
        fechadaEm: null,
        terminalId: opts?.terminalId ?? null,
      })
      return id
    },
    criarVenda: (opts: {
      sessaoId?: string
      terminalId?: string | null
      total: number
      status?: string
      inventoryId?: string
      pedidoId?: string
    }) => {
      const id = `v-${++seq}`
      vendas.push({
        id,
        pedidoId: opts.pedidoId ?? id,
        storeId: STORE,
        total: opts.total,
        at: new Date(),
        clienteNome: "Cliente Teste",
        status: opts.status ?? "concluida",
        terminalId: opts.terminalId ?? null,
        payload: {
          id: opts.pedidoId ?? id,
          sessaoId: opts.sessaoId,
          customerCpf: "111.222.333-44",
          paymentBreakdown: { dinheiro: opts.total, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 },
        },
        itens: [{ inventoryId: opts.inventoryId ?? "prod-1", lineTotal: opts.total }],
      })
      return id
    },
  }
})

const STORE = "loja-2"

vi.mock("@/lib/prisma", () => ({
  prisma: h.prisma,
  withPrismaSafe: async (op: (db: unknown) => Promise<unknown>, fallback: unknown) => {
    try {
      return await op(h.prisma)
    } catch {
      return fallback
    }
  },
}))
vi.mock("@/lib/ops-api-gate", () => ({ opsLojaIdFromRequest: vi.fn(() => STORE) }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({
  apiGuardEnterpriseOrOps: vi.fn(async () => null),
}))

import { GET } from "./route"

function getReq(sessaoId: string) {
  return new Request(`http://local/api/ops/caixa/sessao-detalhe?sessaoId=${sessaoId}`, {
    headers: { "x-assistec-loja-id": STORE },
  })
}

beforeEach(() => {
  h.reset()
})

describe("GET /api/ops/caixa/sessao-detalhe — inclui vendas (GOAL CAIXA-SESSAO-DETALHE-VENDAS-003)", () => {
  it("continua retornando sessao/operacoes/totais como antes", async () => {
    const sessaoId = h.abrirCaixa()
    const res = await GET(getReq(sessaoId))
    const j = (await res.json()) as { ok: boolean; sessao: { id: string; operacoes: unknown[] }; totais: Row }
    expect(res.status).toBe(200)
    expect(j.ok).toBe(true)
    expect(j.sessao.id).toBe(sessaoId)
    expect(Array.isArray(j.sessao.operacoes)).toBe(true)
    expect(j.totais).toBeDefined()
  })

  it("retorna vendas: [] quando não há venda na sessão", async () => {
    const sessaoId = h.abrirCaixa()
    const res = await GET(getReq(sessaoId))
    const j = (await res.json()) as { vendas: unknown[] }
    expect(j.vendas).toEqual([])
  })

  it("retorna vendas vinculadas por payload.sessaoId", async () => {
    const sessaoId = h.abrirCaixa()
    h.criarVenda({ sessaoId, total: 150, pedidoId: "VDA-1" })
    const res = await GET(getReq(sessaoId))
    const j = (await res.json()) as { vendas: Array<Row> }
    expect(j.vendas).toHaveLength(1)
    expect(j.vendas[0]).toMatchObject({
      numero: "VDA-1",
      total: 150,
      origem: "pdv",
      formaPagamento: "dinheiro",
      clienteNome: "Cliente Teste",
      clienteCpf: "111.222.333-44",
      status: "concluida",
    })
  })

  it("sem payload.sessaoId (legado), cai para terminalId + janela de tempo", async () => {
    const sessaoId = h.abrirCaixa({ terminalId: "term-1" })
    h.criarVenda({ terminalId: "term-1", total: 80, pedidoId: "VDA-legado" })
    const res = await GET(getReq(sessaoId))
    const j = (await res.json()) as { vendas: Array<Row> }
    expect(j.vendas).toHaveLength(1)
    expect(j.vendas[0]).toMatchObject({ numero: "VDA-legado", total: 80 })
  })

  it("não mistura venda de outro terminal quando a sessão tem terminalId e a venda não tem sessaoId", async () => {
    const sessaoId = h.abrirCaixa({ terminalId: "term-1" })
    h.criarVenda({ terminalId: "term-2", total: 999, pedidoId: "VDA-outro-terminal" })
    const res = await GET(getReq(sessaoId))
    const j = (await res.json()) as { vendas: Array<Row> }
    expect(j.vendas).toEqual([])
  })
})
