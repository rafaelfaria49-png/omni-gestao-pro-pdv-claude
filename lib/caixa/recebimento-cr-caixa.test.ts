import { describe, it, expect, beforeEach, vi } from "vitest"

// ============================================================================
// GOAL CAIXA-FIX-001 — recebimentos do Financeiro devem entrar no fechamento.
// ----------------------------------------------------------------------------
// O helper cria CaixaOperacao(recebimento_cr) na sessão de caixa ABERTA. Estes
// testes rodam o helper de PRODUÇÃO sobre um Prisma EM MEMÓRIA e provam que o
// `aggregateCaixaOperacoes` (mesmo agregador do fechamento) passa a enxergar o
// recebimento — sem alterar `computeFechamentoResumo`.
// ============================================================================

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const sessoes: Row[] = []
  const operacoes: Row[] = []
  let seq = 0

  type SessaoWhere = {
    id?: string
    storeId?: string
    status?: string
    terminalId?: string
  }
  type OpWhere = {
    storeId?: string
    tipo?: string
    payload?: { path?: string[]; equals?: unknown }
  }

  const prisma = {
    sessaoCaixa: {
      findFirst: async ({ where, orderBy }: { where: SessaoWhere; orderBy?: { abertaEm?: "asc" | "desc" } }) => {
        let rows = sessoes.filter((s) => {
          if (where.id && s.id !== where.id) return false
          if (where.storeId && s.storeId !== where.storeId) return false
          if (where.status && s.status !== where.status) return false
          if (where.terminalId && s.terminalId !== where.terminalId) return false
          return true
        })
        if (orderBy?.abertaEm === "desc") {
          rows = rows.slice().sort((a, b) => Number(b.abertaEm) - Number(a.abertaEm))
        }
        const r = rows[0]
        return r ? { id: r.id as string } : null
      },
    },
    caixaOperacao: {
      findFirst: async ({ where }: { where: OpWhere }) => {
        const r = operacoes.find((o) => {
          if (where.storeId && o.storeId !== where.storeId) return false
          if (where.tipo && o.tipo !== where.tipo) return false
          if (where.payload?.path && where.payload.path.length > 0) {
            const key = where.payload.path[0]!
            const pl = (o.payload ?? {}) as Row
            if (pl[key] !== where.payload.equals) return false
          }
          return true
        })
        return r ? { id: r.id as string, sessaoId: r.sessaoId as string } : null
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: `op-${++seq}`, ...data }
        operacoes.push(row)
        return row
      },
    },
  }

  return {
    prisma,
    sessoes,
    operacoes,
    abrirCaixa: (over?: Row) => {
      const s: Row = {
        id: `sess-${++seq}`,
        storeId: "loja-2",
        status: "ABERTA",
        abertaEm: Date.now(),
        terminalId: null,
        ...over,
      }
      sessoes.push(s)
      return s
    },
    reset: () => {
      sessoes.length = 0
      operacoes.length = 0
      seq = 0
    },
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))

import { registrarRecebimentoCrSeCaixaAberto } from "./recebimento-cr-caixa"
import { aggregateCaixaOperacoes, type CaixaOperacaoLinha } from "@/lib/caixa-fechamento-resumo"

const STORE = "loja-2"

function aggLinhas(): CaixaOperacaoLinha[] {
  return h.operacoes.map((o) => ({
    tipo: o.tipo as string,
    valor: o.valor as number,
    payload: o.payload,
  }))
}

beforeEach(() => {
  h.reset()
})

describe("registrarRecebimentoCrSeCaixaAberto", () => {
  it("com caixa aberto cria recebimento_cr e o recebimento entra no fechamento", async () => {
    h.abrirCaixa()
    const r = await registrarRecebimentoCrSeCaixaAberto({
      storeId: STORE,
      valor: 150,
      formaPagamento: "dinheiro",
      origem: "financeiro",
      localKey: "receber:manual:loja-2:t-1",
      cliente: "Fulano",
      idempotencyKey: "mov-cr-1",
    })
    expect(r).toEqual({ vinculado: true, sessaoId: expect.any(String), jaRegistrado: false })
    expect(h.operacoes).toHaveLength(1)
    expect(h.operacoes[0]!.tipo).toBe("recebimento_cr")

    // Mesmo agregador do fechamento agora soma o recebimento (sem alterar computeFechamentoResumo).
    const agg = aggregateCaixaOperacoes(aggLinhas())
    expect(agg.recebimentosContas).toBe(150)
    expect(agg.recebimentosContasDinheiro).toBe(150)
    expect(agg.qtdRecebimentosContas).toBe(1)
  })

  it("sem caixa aberto NÃO cria operação e avisa (sem_caixa_aberto)", async () => {
    const r = await registrarRecebimentoCrSeCaixaAberto({
      storeId: STORE,
      valor: 150,
      idempotencyKey: "mov-cr-1",
    })
    expect(r).toEqual({ vinculado: false, motivo: "sem_caixa_aberto" })
    expect(h.operacoes).toHaveLength(0)
  })

  it("é idempotente por idempotencyKey — não duplica CaixaOperacao em retry", async () => {
    h.abrirCaixa()
    const args = {
      storeId: STORE,
      valor: 80,
      formaPagamento: "pix",
      idempotencyKey: "mov-cr-X",
      localKey: "t-9",
    } as const
    const a = await registrarRecebimentoCrSeCaixaAberto({ ...args })
    const b = await registrarRecebimentoCrSeCaixaAberto({ ...args })
    expect(a).toMatchObject({ vinculado: true, jaRegistrado: false })
    expect(b).toMatchObject({ vinculado: true, jaRegistrado: true })
    expect(h.operacoes).toHaveLength(1)
  })

  it("forma não-dinheiro entra na receita mas NÃO na gaveta (parity com PDV F5)", async () => {
    h.abrirCaixa()
    await registrarRecebimentoCrSeCaixaAberto({
      storeId: STORE,
      valor: 200,
      formaPagamento: "pix",
      idempotencyKey: "mov-cr-pix",
    })
    const agg = aggregateCaixaOperacoes(aggLinhas())
    expect(agg.recebimentosContas).toBe(200)
    expect(agg.recebimentosContasDinheiro).toBe(0)
  })

  it("valor inválido (0) não cria operação", async () => {
    h.abrirCaixa()
    const r = await registrarRecebimentoCrSeCaixaAberto({
      storeId: STORE,
      valor: 0,
      idempotencyKey: "mov-cr-0",
    })
    expect(r).toEqual({ vinculado: false, motivo: "valor_invalido" })
    expect(h.operacoes).toHaveLength(0)
  })

  it("só vincula à sessão aberta solicitada (sessaoId fechada/inexistente → sem_caixa_aberto)", async () => {
    h.abrirCaixa({ id: "sess-fixa" })
    const ok = await registrarRecebimentoCrSeCaixaAberto({
      storeId: STORE,
      valor: 30,
      idempotencyKey: "mov-a",
      sessaoId: "sess-fixa",
    })
    expect(ok).toMatchObject({ vinculado: true })
    const miss = await registrarRecebimentoCrSeCaixaAberto({
      storeId: STORE,
      valor: 30,
      idempotencyKey: "mov-b",
      sessaoId: "sess-inexistente",
    })
    expect(miss).toEqual({ vinculado: false, motivo: "sem_caixa_aberto" })
  })
})
