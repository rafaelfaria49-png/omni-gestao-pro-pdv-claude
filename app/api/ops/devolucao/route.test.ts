/**
 * PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — contrato HTTP de POST /api/ops/devolucao.
 *
 * Unitário (sem banco): mapeamento de política, validação, erros de negócio e corrida
 * de unique. O comportamento transacional real (lock, teto por item, crédito único,
 * concorrência, sem saída financeira) é provado em PostgreSQL real em
 * `lib/pdv/devolucao/troca-imediata.pg.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  transaction: vi.fn(),
  registrar: vi.fn(),
  classify: vi.fn(),
  periodoFechado: false,
}))

vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: async () => null }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({ apiGuardEnterpriseOrOps: async () => null }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u1", name: "Operador" } }) }))
vi.mock("@/lib/auth/session-operator", () => ({ getOperatorLabelFromSession: () => "Operador Sessão" }))
vi.mock("@/lib/financeiro/services/fechamento-service", () => ({
  verificarPeriodoFechado: async () => ({ fechado: h.periodoFechado }),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => h.transaction(fn),
    sessaoCaixa: { findFirst: async ({ where }: { where: { id: string } }) => (where.id === "s-ok" ? { id: "s-ok" } : null) },
  },
}))
vi.mock("@/lib/pdv/devolucao/registrar-devolucao", async (orig) => {
  const real = await orig<typeof import("@/lib/pdv/devolucao/registrar-devolucao")>()
  return {
    ...real,
    registrarDevolucaoInTransaction: (...a: unknown[]) => h.registrar(...a),
    classifyDevolucaoAfterUniqueConflict: (...a: unknown[]) => h.classify(...a),
  }
})

import { POST } from "./route"
import { DevolucaoBusinessError } from "@/lib/pdv/devolucao/registrar-devolucao"

const req = (body: unknown) =>
  new Request("http://localhost/api/ops/devolucao", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-assistec-loja-id": "loja-1" },
    body: JSON.stringify(body),
  })

const base = {
  localId: "DEV-2026-0001-AB12CD34",
  vendaLocalId: "VDA-1",
  tipo: "vale_credito",
  clienteNome: "Cliente",
  clienteDoc: "52998224725",
  itens: [{ inventoryId: "SKU-1", quantidade: 1 }],
}

const ok = {
  ok: true,
  idempotente: false,
  devolucaoId: "dev-1",
  localId: base.localId,
  vendaLocalId: "VDA-1",
  tipo: "vale_credito",
  valorTotal: 10,
  creditoEmitido: 10,
  saldoCreditoCliente: 10,
  operador: "Operador Sessão",
  itens: [],
}

beforeEach(() => {
  h.periodoFechado = false
  h.transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}))
  h.registrar.mockReset().mockResolvedValue(ok)
  h.classify.mockReset()
})

describe("POST /api/ops/devolucao — contrato", () => {
  it("reembolso em dinheiro é bloqueado por política ANTES de qualquer IO", async () => {
    const res = await POST(req({ ...base, tipo: "devolucao" }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA")
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it("valores do client não chegam ao serviço como autoridade; operador do ledger vem da sessão", async () => {
    const res = await POST(req({ ...base, valorTotal: 999, creditoEmitido: 999, operador: "" }))
    expect(res.status).toBe(200)
    const input = h.registrar.mock.calls[0]![1] as Record<string, unknown>
    expect(input).not.toHaveProperty("valorTotal")
    expect(input).not.toHaveProperty("creditoEmitido")
    expect(input).toMatchObject({ storeId: "loja-1", ledgerOperator: "Operador Sessão", operador: "Operador Sessão" })
  })

  it("erro de negócio vira 409/422 com code, sem 500", async () => {
    h.registrar.mockRejectedValueOnce(
      new DevolucaoBusinessError("QUANTIDADE_EXCEDE_DEVOLVIVEL", "excede", { disponivel: 0, solicitado: 1 }),
    )
    const r1 = await POST(req(base))
    expect(r1.status).toBe(409)
    expect(await r1.json()).toMatchObject({ code: "QUANTIDADE_EXCEDE_DEVOLVIVEL", detail: { disponivel: 0 } })

    h.registrar.mockRejectedValueOnce(new DevolucaoBusinessError("CLIENTE_DOC_OBRIGATORIO", "doc"))
    expect((await POST(req(base))).status).toBe(422)
  })

  it("corrida na unique do localId: relê fora da transação e devolve o replay", async () => {
    h.registrar.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }))
    h.classify.mockResolvedValueOnce({ ...ok, idempotente: true })
    const res = await POST(req(base))
    expect(res.status).toBe(200)
    expect((await res.json()).idempotente).toBe(true)
  })

  it("corrida com conteúdo diferente no mesmo localId vira LOCAL_ID_CONFLITO", async () => {
    h.registrar.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }))
    h.classify.mockRejectedValueOnce(new DevolucaoBusinessError("LOCAL_ID_CONFLITO", "conflito"))
    const res = await POST(req(base))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("LOCAL_ID_CONFLITO")
  })

  it("período fechado e sessão de outra loja bloqueiam sem gravar", async () => {
    h.periodoFechado = true
    expect((await POST(req(base))).status).toBe(409)
    h.periodoFechado = false
    expect((await POST(req({ ...base, sessaoId: "s-outra" }))).status).toBe(404)
    expect(h.transaction).not.toHaveBeenCalled()
  })

  it("payload inválido → 422", async () => {
    expect((await POST(req({ ...base, itens: [] }))).status).toBe(422)
    expect((await POST(req({ ...base, itens: [{ inventoryId: "x", quantidade: 0.5 }] }))).status).toBe(422)
  })
})
