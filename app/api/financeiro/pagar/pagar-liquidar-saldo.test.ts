import { describe, it, expect, beforeEach, vi } from "vitest"

// ============================================================================
// GOAL_FIX_CONTAS_PAGAR_PARCIAL_V01 — bug espelhado de Contas a Pagar.
// ----------------------------------------------------------------------------
// PATCH /api/financeiro/pagar op="liquidar" usava `res.data.valor` (coluna
// BRUTA, que NÃO diminui em baixas parciais via backend) como valor da SAÍDA de
// caixa e da auditoria. Em um título já parcialmente pago, isso lançaria mais
// que o devido. O fix usa o saldo restante REAL
// (buildContaPagarAuditTrail(...).restante) calculado ANTES de quitar.
//
// Exercita o handler PATCH de PRODUÇÃO sobre um Prisma EM MEMÓRIA. Apenas
// auth/guards/store-id/movimentação/fechamento são mockados; o cálculo de saldo
// (services reais) roda sobre o banco fake.
// ============================================================================

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const titulos = new Map<string, Row>()
  const byId = new Map<string, Row>()
  let seq = 0

  const ck = (storeId: string, localKey: string) => `${storeId}::${localKey}`

  function put(row: Row): Row {
    titulos.set(ck(String(row.storeId), String(row.localKey)), row)
    byId.set(String(row.id), row)
    return row
  }
  function makeRow(data: Row): Row {
    return {
      id: `cp-${++seq}`,
      storeId: data.storeId,
      localKey: data.localKey,
      descricao: data.descricao ?? "",
      fornecedorId: data.fornecedorId ?? null,
      valor: data.valor ?? 0,
      vencimento: data.vencimento ?? "",
      status: data.status ?? "pendente",
      numeroDocumento: data.numeroDocumento ?? "",
      payload: data.payload ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  function applyScalars(row: Row, data: Row): Row {
    for (const k of ["descricao", "fornecedorId", "valor", "vencimento", "status", "numeroDocumento", "payload"]) {
      if (data[k] !== undefined) row[k] = data[k]
    }
    row.updatedAt = new Date()
    return row
  }

  const prisma = {
    contaPagarTitulo: {
      findUnique: async ({ where }: { where: { storeId_localKey: { storeId: string; localKey: string } } }) => {
        const { storeId, localKey } = where.storeId_localKey
        return titulos.get(ck(storeId, localKey)) ?? null
      },
      findFirst: async ({ where }: { where: { id?: string; storeId?: string } }) => {
        if (where?.id) {
          const r = byId.get(where.id)
          if (r && (!where.storeId || r.storeId === where.storeId)) return r
          return null
        }
        for (const r of titulos.values()) if (!where?.storeId || r.storeId === where.storeId) return r
        return null
      },
      findMany: async ({ where }: { where?: { storeId?: string } }) =>
        [...titulos.values()].filter((r) => !where?.storeId || r.storeId === where.storeId),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { storeId_localKey: { storeId: string; localKey: string } }
        create: Row
        update: Row
      }) => {
        const { storeId, localKey } = where.storeId_localKey
        const existing = titulos.get(ck(storeId, localKey))
        if (existing) return applyScalars(existing, update)
        return put(makeRow(create))
      },
      update: async ({ where, data }: { where: { id?: string }; data: Row }) => {
        const row = where.id ? byId.get(where.id) : undefined
        if (!row) throw new Error("Record to update not found.")
        return applyScalars(row, data)
      },
      create: async ({ data }: { data: Row }) => put(makeRow(data)),
    },
    carteiraFinanceira: {
      findFirst: async () => null,
    },
    movimentacaoFinanceira: {
      findFirst: async () => null,
      aggregate: async () => ({ _sum: { valor: 0 } }),
      create: async ({ data }: { data: Row }) => ({ id: `mov-${++seq}`, ...data }),
    },
  }

  return {
    prisma,
    titulos,
    saidaSpy: vi.fn(
      async (_titulo: unknown, _valor: number, _opts?: Record<string, unknown>) =>
        ({ ok: true, action: "created" as const }),
    ),
    estornoSpy: vi.fn(async (_storeId: string, _ref: string, _origem: string) => ({ ok: true, action: "created" as const })),
    auditSpy: vi.fn(async (_arg: { acao?: string; depois?: { valor?: number } }) => undefined),
    reset: () => {
      titulos.clear()
      byId.clear()
      seq = 0
    },
  }
})

const STORE = "loja-2"

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma, prismaEnsureConnected: vi.fn(async () => undefined) }))
vi.mock("@/lib/store-id-from-request", () => ({
  storeIdFromAssistecRequestForWrite: vi.fn(() => STORE),
}))
vi.mock("@/lib/ops-api-gate", () => ({ opsLojaIdFromRequest: vi.fn(() => STORE) }))
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", name: "Tester" } })) }))
vi.mock("@/lib/auth/session-operator", () => ({ getOperatorLabelFromSession: vi.fn(() => "Tester") }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({
  apiGuardFinanceiroEditEnterpriseOrLegacy: vi.fn(async () => null),
  apiGuardFinanceiroViewOrOps: vi.fn(async () => null),
}))
vi.mock("@/lib/financeiro/services/auditoria-actor", () => ({
  extractAuditoriaActor: vi.fn(() => ({})),
  logAuditoriaFinanceira: h.auditSpy,
}))
vi.mock("@/lib/financeiro/services/movimentacoes-service", () => ({
  createMovimentacaoSaidaFromPagar: h.saidaSpy,
  estornarMovimentacaoPorReferencia: h.estornoSpy,
}))
vi.mock("@/lib/financeiro/services/fechamento-service", () => ({
  verificarPeriodoFechado: vi.fn(async () => ({ fechado: false })),
}))

import { PATCH } from "./route"
import {
  upsertContaPagar,
  registrarPagamentoParcialContaPagar,
  getContaPagarByLocalKey,
  buildContaPagarAuditTrail,
} from "@/lib/financeiro/services/contas-pagar-service"

const LOCAL_KEY = `pagar:manual:${STORE}:t-001`

async function seedTitulo(valor = 365.01) {
  await upsertContaPagar({
    storeId: STORE,
    localKey: LOCAL_KEY,
    descricao: "Fornecedor X - duplicata",
    fornecedorNome: "Fornecedor X",
    valor,
    vencimento: "2026-01-10",
    status: "pendente",
    numeroDocumento: "DUP-001",
  })
}

function patchReq(body: Record<string, unknown>) {
  return new Request("http://local/api/financeiro/pagar", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-assistec-loja-id": STORE },
    body: JSON.stringify(body),
  })
}

/** Saldo restante real do título (helper canônico de Contas a Pagar). */
function restanteDoTitulo(row: Parameters<typeof buildContaPagarAuditTrail>[0][number]): number {
  return buildContaPagarAuditTrail([row])[0]!.restante
}

/** Valor que o handler passou à saída de caixa na última chamada. */
function lastSaidaValor(): number {
  const calls = h.saidaSpy.mock.calls
  return calls.length ? Number(calls[calls.length - 1]![1]) : NaN
}

beforeEach(() => {
  h.reset()
  h.saidaSpy.mockClear()
  h.estornoSpy.mockClear()
  h.auditSpy.mockClear()
})

describe("PATCH /api/financeiro/pagar — liquidação usa saldo restante real", () => {
  it("liquidar APÓS baixa parcial lança SOMENTE o saldo restante (165,01), não o bruto (365,01)", async () => {
    await seedTitulo(365.01)
    const p = await registrarPagamentoParcialContaPagar({ storeId: STORE, localKey: LOCAL_KEY, valorPago: 200 })
    expect(p.ok).toBe(true)

    const res = await PATCH(patchReq({ op: "liquidar", localKey: LOCAL_KEY }))
    const json = (await res.json()) as { ok?: boolean; op?: string }
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)

    // saída de caixa recebeu o saldo restante, não o valor bruto
    expect(h.saidaSpy).toHaveBeenCalledTimes(1)
    expect(lastSaidaValor()).toBe(165.01)

    // auditoria registra o mesmo valor real
    const auditLiq = h.auditSpy.mock.calls.map((c) => c[0]).find((a) => a?.acao === "liquidar")
    expect(auditLiq?.depois?.valor).toBe(165.01)

    // título quitado e sem saldo
    const t = await getContaPagarByLocalKey(STORE, LOCAL_KEY)
    expect(t!.status).toBe("pago")
    expect(restanteDoTitulo(t!)).toBe(0)
  })

  it("liquidação direta (sem parcial) continua lançando o valor cheio (365,01) — sem regressão", async () => {
    await seedTitulo(365.01)
    const res = await PATCH(patchReq({ op: "liquidar", localKey: LOCAL_KEY }))
    expect(res.status).toBe(200)
    expect(h.saidaSpy).toHaveBeenCalledTimes(1)
    expect(lastSaidaValor()).toBe(365.01)

    const t = await getContaPagarByLocalKey(STORE, LOCAL_KEY)
    expect(t!.status).toBe("pago")
  })

  it("baixa parcial continua lançando exatamente o valor pago (200) com flag parcial", async () => {
    await seedTitulo(365.01)
    const res = await PATCH(patchReq({ op: "parcial", localKey: LOCAL_KEY, valor: 200 }))
    const json = (await res.json()) as { op?: string }
    expect(res.status).toBe(200)
    expect(json.op).toBe("parcial")

    expect(h.saidaSpy).toHaveBeenCalledTimes(1)
    expect(lastSaidaValor()).toBe(200)
    const opts = h.saidaSpy.mock.calls.at(-1)?.[2]
    expect(opts?.parcial).toBe(true)

    const t = await getContaPagarByLocalKey(STORE, LOCAL_KEY)
    expect(t!.status).toBe("parcial")
    expect(restanteDoTitulo(t!)).toBe(165.01)
  })

  it("liquidar com várias parciais lança a soma correta no total (parciais + restante = bruto)", async () => {
    await seedTitulo(365.01)
    await registrarPagamentoParcialContaPagar({ storeId: STORE, localKey: LOCAL_KEY, valorPago: 100 })
    await registrarPagamentoParcialContaPagar({ storeId: STORE, localKey: LOCAL_KEY, valorPago: 65 })

    const res = await PATCH(patchReq({ op: "liquidar", localKey: LOCAL_KEY }))
    expect(res.status).toBe(200)
    // saldo restante = 365,01 − 100 − 65 = 200,01
    expect(lastSaidaValor()).toBe(200.01)
  })

  it("estorno após liquidação reverte a movimentação por referência e reabre o título", async () => {
    await seedTitulo(365.01)
    await PATCH(patchReq({ op: "liquidar", localKey: LOCAL_KEY }))

    const res = await PATCH(patchReq({ op: "estornar", localKey: LOCAL_KEY, motivo: "Correção" }))
    const json = (await res.json()) as { ok?: boolean; op?: string }
    expect(res.status).toBe(200)
    expect(json.op).toBe("estornar")

    // a reversão da saída é delegada à movimentação por referência (soma os movimentos originais)
    expect(h.estornoSpy).toHaveBeenCalledTimes(1)
    expect(h.estornoSpy.mock.calls.at(-1)).toEqual([STORE, expect.any(String), "pagar"])

    // título reaberto, saldo de volta ao total
    const t = await getContaPagarByLocalKey(STORE, LOCAL_KEY)
    expect(t!.status).not.toBe("pago")
    expect(restanteDoTitulo(t!)).toBe(365.01)
  })
})

describe("idempotência da saída de caixa (não duplica em retry)", () => {
  it("parcial de R$ 200 repetido com mesma referência soma apenas uma vez (skipped_idempotent)", async () => {
    const movs: Array<Record<string, unknown>> = []
    ;(h.prisma as Record<string, unknown>).movimentacaoFinanceira = {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        movs.find(
          (m) =>
            m.storeId === where.storeId &&
            m.referenciaId === where.referenciaId &&
            m.tipo === where.tipo &&
            m.origem === where.origem,
        ) ?? null,
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        const origem = where.origem as { startsWith?: string } | string | undefined
        const total = movs
          .filter((m) => {
            if (m.storeId !== where.storeId || m.referenciaId !== where.referenciaId || m.tipo !== where.tipo)
              return false
            if (origem && typeof origem === "object" && origem.startsWith)
              return String(m.origem).startsWith(origem.startsWith)
            return true
          })
          .reduce((s, m) => s + Number(m.valor ?? 0), 0)
        return { _sum: { valor: total } }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `mov-${movs.length + 1}`, ...data }
        movs.push(row)
        return row
      },
    }

    // O módulo está mockado no topo (spy da rota); aqui exercitamos a função REAL.
    const { createMovimentacaoSaidaFromPagar } = await vi.importActual<
      typeof import("@/lib/financeiro/services/movimentacoes-service")
    >("@/lib/financeiro/services/movimentacoes-service")
    const titulo = { id: "cp-x", storeId: STORE, descricao: "Duplicata" }

    const r1 = await createMovimentacaoSaidaFromPagar(titulo, 200, { parcial: true, carteiraId: null })
    expect(r1.ok && r1.action).toBe("created")

    const r2 = await createMovimentacaoSaidaFromPagar(titulo, 200, { parcial: true, carteiraId: null })
    expect(r2.ok && r2.action).toBe("skipped_idempotent")

    expect(movs).toHaveLength(1)
    expect(movs[0]!.valor).toBe(200)
  })
})
