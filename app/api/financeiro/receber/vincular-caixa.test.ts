import { describe, it, expect, beforeEach, vi } from "vitest"

// ============================================================================
// GOAL CAIXA-FIX-001 — op PATCH "vincular-caixa".
// ----------------------------------------------------------------------------
// Exercita o handler PATCH de PRODUÇÃO de /api/financeiro/receber sobre um Prisma
// EM MEMÓRIA. O helper real (lib/caixa/recebimento-cr-caixa) NÃO é mockado — roda
// contra o banco fake e cria a CaixaOperacao(recebimento_cr) na sessão aberta.
// Prova: com caixa aberto vincula (entra no fechamento); sem caixa avisa e não
// cria; idempotente por movimentoId.
// ============================================================================

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const sessoes: Row[] = []
  const operacoes: Row[] = []
  let seq = 0

  type SessaoWhere = { id?: string; storeId?: string; status?: string; terminalId?: string }
  type OpWhere = { storeId?: string; tipo?: string; payload?: { path?: string[]; equals?: unknown } }

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
        if (orderBy?.abertaEm === "desc") rows = rows.slice().sort((a, b) => Number(b.abertaEm) - Number(a.abertaEm))
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
    // Stubs: o módulo importa serviços que referenciam estes models, mas a op
    // "vincular-caixa" não os usa.
    contaReceberTitulo: {},
    carteiraFinanceira: {},
  }

  return {
    prisma,
    sessoes,
    operacoes,
    abrirCaixa: () => {
      sessoes.push({ id: `sess-${++seq}`, storeId: "loja-2", status: "ABERTA", abertaEm: Date.now(), terminalId: null })
    },
    reset: () => {
      sessoes.length = 0
      operacoes.length = 0
      seq = 0
    },
  }
})

const STORE = "loja-2"

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma, prismaEnsureConnected: vi.fn(async () => undefined) }))
vi.mock("@/lib/store-id-from-request", () => ({ storeIdFromAssistecRequestForWrite: vi.fn(() => STORE) }))
vi.mock("@/lib/ops-api-gate", () => ({ opsLojaIdFromRequest: vi.fn(() => STORE) }))
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", name: "Tester" } })) }))
vi.mock("@/lib/auth/session-operator", () => ({ getOperatorLabelFromSession: vi.fn(() => "Tester") }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({
  apiGuardFinanceiroEditEnterpriseOrLegacy: vi.fn(async () => null),
  apiGuardFinanceiroViewOrOps: vi.fn(async () => null),
}))
vi.mock("@/lib/financeiro/services/auditoria-actor", () => ({
  extractAuditoriaActor: vi.fn(() => ({})),
  logAuditoriaFinanceira: vi.fn(async () => undefined),
}))
vi.mock("@/lib/financeiro/services/movimentacoes-service", () => ({
  createMovimentacaoEntradaFromReceber: vi.fn(async () => ({ ok: true, action: "created" as const })),
  estornarMovimentacaoPorReferencia: vi.fn(async () => ({ ok: true, action: "created" as const })),
}))
vi.mock("@/lib/financeiro/services/fechamento-service", () => ({
  verificarPeriodoFechado: vi.fn(async () => ({ fechado: false })),
}))

import { PATCH } from "./route"

function patchReq(body: Record<string, unknown>) {
  return new Request("http://local/api/financeiro/receber", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-assistec-loja-id": STORE },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  h.reset()
})

describe("PATCH /api/financeiro/receber — op vincular-caixa", () => {
  it("com caixa aberto cria recebimento_cr e responde vinculadoCaixa:true", async () => {
    h.abrirCaixa()
    const res = await PATCH(
      patchReq({
        op: "vincular-caixa",
        valor: 120,
        formaPagamento: "dinheiro",
        movimentoId: "mov-cr-1",
        localKey: "receber:manual:loja-2:t-1",
        cliente: "Fulano",
      }),
    )
    const j = (await res.json()) as { ok?: boolean; vinculadoCaixa?: boolean; jaRegistrado?: boolean }
    expect(res.status).toBe(200)
    expect(j.ok).toBe(true)
    expect(j.vinculadoCaixa).toBe(true)
    expect(j.jaRegistrado).toBe(false)
    expect(h.operacoes).toHaveLength(1)
    expect(h.operacoes[0]!.tipo).toBe("recebimento_cr")
    expect((h.operacoes[0]!.payload as Row).origem).toBe("financeiro")
  })

  it("sem caixa aberto responde vinculadoCaixa:false (sem_caixa_aberto) e não cria operação", async () => {
    const res = await PATCH(patchReq({ op: "vincular-caixa", valor: 120, movimentoId: "mov-cr-1" }))
    const j = (await res.json()) as { ok?: boolean; vinculadoCaixa?: boolean; motivo?: string }
    expect(res.status).toBe(200)
    expect(j.ok).toBe(true)
    expect(j.vinculadoCaixa).toBe(false)
    expect(j.motivo).toBe("sem_caixa_aberto")
    expect(h.operacoes).toHaveLength(0)
  })

  it("idempotente: mesmo movimentoId não duplica CaixaOperacao", async () => {
    h.abrirCaixa()
    const body = { op: "vincular-caixa", valor: 50, movimentoId: "mov-dup", localKey: "t-2" }
    await PATCH(patchReq(body))
    const res2 = await PATCH(patchReq(body))
    const j2 = (await res2.json()) as { vinculadoCaixa?: boolean; jaRegistrado?: boolean }
    expect(j2.vinculadoCaixa).toBe(true)
    expect(j2.jaRegistrado).toBe(true)
    expect(h.operacoes).toHaveLength(1)
  })
})
