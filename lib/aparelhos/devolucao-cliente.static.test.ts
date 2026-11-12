/**
 * Devolução/troca de aparelho por IMEI no TERMINAL (F8 não integrado) — revisão pré-merge GOAL 002.
 *
 * O fluxo de devolução é local-first: `registrarDevolucao` grava estoque e crédito locais e só depois
 * sincroniza. Sem a recusa no cliente, o servidor responde 409 e o terminal fica com crédito/estoque
 * que nunca chegam ao servidor. A recusa precisa vir ANTES de qualquer mutação local.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { APARELHO_REVERSAO_NAO_INTEGRADA } from "./sale-reversal"

const store = readFileSync(join(process.cwd(), "lib/operations-store.tsx"), "utf8")
const fn = (() => {
  const a = store.indexOf("const registrarDevolucao = useCallback")
  const b = store.indexOf("const devolucaoId = nextDevolucaoId", a)
  expect(a).toBeGreaterThan(0)
  expect(b).toBeGreaterThan(a)
  return store.slice(a, b)
})()

describe("devolução de aparelho no terminal", () => {
  it("recusa linha com deviceSale usando a mesma mensagem do servidor", () => {
    expect(fn).toContain("if (saleLine.deviceSale) return { ok: false, reason: APARELHO_REVERSAO_NAO_INTEGRADA.message }")
    expect(store).toContain(`import { APARELHO_REVERSAO_NAO_INTEGRADA } from "@/lib/aparelhos/sale-reversal"`)
    expect(APARELHO_REVERSAO_NAO_INTEGRADA.message).toMatch(/Devolução e correção de itens de aparelho ainda não estão integradas/)
  })
  it("a recusa vem antes de mexer no estoque e no crédito locais", () => {
    const guard = fn.indexOf("if (saleLine.deviceSale)")
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(fn.indexOf("inv.stock += req.quantity"))
    expect(guard).toBeLessThan(fn.indexOf("creditIssued +="))
  })
  it("troca e devolução usam o mesmo registrarDevolucao (uma recusa cobre as duas)", () => {
    const ui = readFileSync(join(process.cwd(), "components/dashboard/vendas/trocas-devolucao.tsx"), "utf8")
    expect((ui.match(/registrarDevolucao\(/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})
