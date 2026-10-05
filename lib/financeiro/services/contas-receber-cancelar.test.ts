import { describe, it, expect, beforeEach, vi } from "vitest"

// ============================================================================
// OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 (R4) — `exigirSemRecebimento` vale também para o
// título JÁ cancelado. O Financeiro cancela sem a flag e conserva o ledger; o cancelamento da
// OS (flag) não pode tratar esse título como sucesso idempotente enquanto houver recebido.
// Prisma EM MEMÓRIA (único I/O mockado): trava `FOR UPDATE`, leitura e `update` do título.
// ============================================================================

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = { row: null as Row | null }
  const update = vi.fn(async ({ data }: { where: { id: string }; data: Row }) => {
    state.row = { ...state.row!, ...data, updatedAt: new Date("2026-10-05T12:00:01.000Z") }
    return { ...state.row }
  })
  const db = {
    $queryRaw: vi.fn(async () => (state.row ? [{ id: state.row.id }] : [])),
    contaReceberTitulo: {
      findUnique: vi.fn(async () => (state.row ? { ...state.row } : null)),
      findFirst: vi.fn(async () => (state.row ? { ...state.row } : null)),
      update,
    },
  }
  const prisma = { ...db, $transaction: vi.fn(async (fn: (tx: typeof db) => unknown) => fn(db)) }
  return { state, db, prisma, update }
})

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))

import { cancelContaReceber } from "./contas-receber-service"

const LK = "os-faturamento:loja-1:os-1"

function titulo(status: string, historico: Array<Record<string, unknown>>) {
  h.state.row = {
    id: "cr-1",
    storeId: "loja-1",
    localKey: LK,
    descricao: "OS",
    cliente: "Cliente",
    valor: 400,
    vencimento: "30/11/2026",
    status,
    payload: { historico },
    createdAt: new Date("2026-10-05T12:00:00.000Z"),
    updatedAt: new Date("2026-10-05T12:00:00.000Z"),
  }
  return { ...h.state.row }
}

const K350 = [
  { tipo: "pagamento", valor: 350, at: "2026-10-05T12:00:00.000Z" },
  { tipo: "a_prazo_autorizado", valor: 50, at: "2026-10-05T12:00:00.000Z" },
]

beforeEach(() => {
  h.state.row = null
  h.update.mockClear()
  h.db.$queryRaw.mockClear()
  h.prisma.$transaction.mockClear()
})

describe("cancelContaReceber · título já cancelado × exigirSemRecebimento", () => {
  it("cancelado com recebido + flag: recusa titulo_com_recebimento, sem nenhuma escrita", async () => {
    const antes = titulo("cancelado", K350)
    const res = await cancelContaReceber({ storeId: "loja-1", localKey: LK, motivo: "OS", exigirSemRecebimento: true })
    expect(res).toEqual({ ok: false, reason: "titulo_com_recebimento" })
    expect(h.update).not.toHaveBeenCalled()
    expect(h.state.row).toEqual(antes)
    // Decisão sobre a linha travada: a trava precede a leitura.
    expect(h.db.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it("cancelado com recebido + flag, na transação do chamador (db): mesma recusa, sem escrita", async () => {
    titulo("cancelado", K350)
    const res = await cancelContaReceber({ storeId: "loja-1", localKey: LK, exigirSemRecebimento: true, db: h.db as never })
    expect(res).toEqual({ ok: false, reason: "titulo_com_recebimento" })
    expect(h.update).not.toHaveBeenCalled()
    expect(h.prisma.$transaction).not.toHaveBeenCalled()
  })

  it("cancelado com recebido TOTALMENTE estornado + flag: líquido 0 ⇒ sucesso idempotente", async () => {
    const antes = titulo("cancelado", [...K350, { tipo: "estorno_pagamento", valor: 350 }])
    const res = await cancelContaReceber({ storeId: "loja-1", localKey: LK, exigirSemRecebimento: true })
    expect(res).toEqual({ ok: true, data: antes })
    expect(h.update).not.toHaveBeenCalled()
  })

  it("cancelado SEM recebido + flag: segue sucesso idempotente, sem escrita", async () => {
    const antes = titulo("cancelado", [])
    const res = await cancelContaReceber({ storeId: "loja-1", localKey: LK, exigirSemRecebimento: true })
    expect(res).toEqual({ ok: true, data: antes })
    expect(h.update).not.toHaveBeenCalled()
  })

  it("SEM flag (Financeiro): cancelado com recebido segue idempotente; parcial é cancelado conservando o ledger", async () => {
    const cancelado = titulo("cancelado", K350)
    expect(await cancelContaReceber({ storeId: "loja-1", localKey: LK })).toEqual({ ok: true, data: cancelado })
    expect(h.update).not.toHaveBeenCalled()

    titulo("parcial", K350)
    const res = await cancelContaReceber({ storeId: "loja-1", localKey: LK, motivo: "Financeiro" })
    expect(res.ok).toBe(true)
    expect(h.update).toHaveBeenCalledTimes(1)
    const hist = (h.state.row!.payload as { historico: Array<Record<string, unknown>> }).historico
    expect(h.state.row!.status).toBe("cancelado")
    expect(hist.slice(0, 2)).toEqual(K350)
    expect(hist[2]).toMatchObject({ tipo: "cancelamento" })
  })

  it("recusas existentes preservadas com a flag: parcial ⇒ titulo_com_recebimento; pago/estornado ⇒ razões próprias", async () => {
    titulo("parcial", K350)
    expect(await cancelContaReceber({ storeId: "loja-1", localKey: LK, exigirSemRecebimento: true })).toEqual({ ok: false, reason: "titulo_com_recebimento" })
    titulo("pago", [{ tipo: "liquidacao", valor: 400 }])
    expect(await cancelContaReceber({ storeId: "loja-1", localKey: LK, exigirSemRecebimento: true })).toEqual({ ok: false, reason: "titulo_pago_nao_cancela_aqui" })
    titulo("estornado", [])
    expect(await cancelContaReceber({ storeId: "loja-1", localKey: LK, exigirSemRecebimento: true })).toEqual({ ok: false, reason: "titulo_estornado" })
    expect(h.update).not.toHaveBeenCalled()
  })
})
