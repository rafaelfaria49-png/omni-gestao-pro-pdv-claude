import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  payload: {} as Record<string, unknown>,
  write: vi.fn(),
  fiscal: vi.fn(() => ({ ok: false, status: 422, error: "GATE_FISCAL_QA", code: "QA" })),
}))
vi.mock("@/lib/prisma", () => ({ prismaEnsureConnected: async () => {}, prisma: {
  venda: { findFirst: async () => ({ id: "venda-qa", status: "concluida", payload: h.payload, itens: [] }), update: h.write },
  contaReceberTitulo: { update: h.write, upsert: h.write }, $transaction: h.write,
} }))
vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: async () => null }))
vi.mock("@/lib/ops-api-gate", () => ({ opsLojaIdFromRequest: () => "loja-qa" }))
vi.mock("@/lib/vendas/guard-correcao-venda", () => ({ requireCorrecaoVendaAuth: async () => ({ ok: true, session: { user: { id: "admin-qa" } } }) }))
vi.mock("@/lib/fiscal/venda-fiscal-state-machine", () => ({ assertVendaFiscalEditavel: h.fiscal }))
vi.mock("@/lib/auth/session-operator", () => ({ getOperatorLabelFromSession: () => "Admin QA" }))
import { POST as corrigir } from "./[id]/corrigir/route"
import { POST as parcelas } from "./[id]/corrigir-parcelas/route"
import { POST as titulo } from "./[id]/corrigir-titulo/route"
import { POST as itemMeta } from "./[id]/corrigir-item-meta/route"

beforeEach(() => { h.payload = {}; h.write.mockClear(); h.fiscal.mockClear() })

describe.each([
  ["pagamento/cliente", corrigir], ["parcelas", parcelas], ["título", titulo], ["metadados do item", itemMeta],
] as const)("Correção de %s de venda com aparelho", (_name, handler) => {
  const req = () => new Request("http://local/api/vendas/venda-qa/corrigir", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo: "QA", novaObservacao: "Observação QA", tituloId: "titulo-qa", itemIndex: 0, parcelas: 2 }) })
  it("bloqueia antes de alterar venda, snapshot, títulos ou dinheiro", async () => {
    h.payload = { lines: [{ produtoId: "modelo", inventoryId: "modelo", deviceSale: { version: 1, aparelhoId: "unidade" } }] }
    const result = await handler(req(), { params: Promise.resolve({ id: "venda-qa" }) })
    expect(result.status).toBe(409)
    expect(await result.json()).toMatchObject({ ok: false, code: "APARELHO_CORRECAO_NAO_INTEGRADA" })
    expect(h.write).not.toHaveBeenCalled()
    expect(h.fiscal).not.toHaveBeenCalled()
  })
  it("venda comum continua para os guards existentes", async () => {
    const result = await handler(req(), { params: Promise.resolve({ id: "venda-qa" }) })
    expect(result.status).toBe(422)
    expect(await result.json()).toMatchObject({ code: "QA" })
    expect(h.fiscal).toHaveBeenCalledTimes(1)
  })
})
