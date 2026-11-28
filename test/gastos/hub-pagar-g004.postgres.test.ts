/**
 * Prova do NAVEGADOR: o HUB real (FinanceiroRealProvider) usa a integração HUB→G004 só com a flag LIGADA.
 * O fetch do componente é ligado aos handlers reais de GET/POST/PATCH /api/financeiro/pagar sobre PostgreSQL;
 * só a sessão (auth) é fixture. Ligado: o PATCH leva a chave de idempotência, o dinheiro sai pelo motor G004
 * (pagamento + alocação + movimento da operação) e o recibo local some após o ACK. Desligado: PATCH sem chave,
 * caminho da main/#397, nenhum pagamento G004.
 */
import "./g005-fixtures"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { createElement, useEffect } from "react"
import { createRequire } from "node:module"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { prisma } from "@/lib/prisma"
import { GET, PATCH, POST } from "@/app/api/financeiro/pagar/route"
import { FinanceiroRealProvider, useFinanceiroReal } from "@/components/financeiro/lovable/context/FinanceiroRealContext"
import { fixtureG005 } from "./g005-fixtures"

const browser = vi.hoisted(() => ({ user: "", store: "" }))
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis }
}
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: browser.user } }, status: "authenticated" }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: browser.store }) }))
afterEach(async () => {
  cleanup(); for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r))
  vi.unstubAllGlobals(); vi.unstubAllEnvs()
})
afterAll(async () => { await prisma.$disconnect() })

type Estado = ReturnType<typeof useFinanceiroReal>
async function montarHub(storeId: string, userId: string) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" })
  for (const key of ["window", "document", "HTMLElement"] as const) vi.stubGlobal(key, dom.window[key])
  // Web Locks não existe no JSDOM: trava local equivalente (uma aba).
  vi.stubGlobal("navigator", Object.assign(Object.create(dom.window.navigator), { locks: { request: (_n: string, fn: () => unknown) => fn() } }))
  browser.user = userId; browser.store = storeId; dom.window.document.cookie = `assistec-active-store=${storeId}; path=/`
  const patches: Array<Record<string, unknown>> = []
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), "http://localhost")
    if (url.pathname === "/api/auth/session") return Response.json({ user: { id: userId } })
    if (url.pathname === "/api/financeiro/pagar") {
      const req = new Request(url, { method: init?.method ?? "GET", headers: init?.headers, body: init?.body })
      if (req.method === "PATCH") patches.push(JSON.parse(String(init?.body)))
      return req.method === "PATCH" ? PATCH(req) : req.method === "POST" ? POST(req) : GET(req)
    }
    return Response.json({ ok: true, rows: [] })
  }))
  const atual: { estado: Estado | null } = { estado: null }
  function View() { const e = useFinanceiroReal(); useEffect(() => { atual.estado = e }); return null }
  render(createElement(FinanceiroRealProvider, null, createElement(View)))
  return { dom, patches, estado: () => atual.estado! }
}
async function criarTitulo(storeId: string, conta: string, descricao: string) {
  const r = await POST(new Request("http://localhost/api/financeiro/pagar", { method: "POST",
    headers: { "content-type": "application/json", "x-assistec-loja-id": storeId },
    body: JSON.stringify({ fornecedor: "Fornecedor sintético", descricao, valor: 200, vencimento: "2026-12-10", formaPagamento: "pix", carteiraId: conta }) }))
  expect(r.status).toBe(201)
  return ((await r.json()) as { localKey: string }).localKey
}
const recibosLocais = (dom: { window: Window }) => Object.keys(dom.window.localStorage).filter((k) => k.startsWith("omni:financeiro:pagamento:"))

describe("HUB do navegador × motor G004 (PostgreSQL real)", () => {
  it("LIGADO: parcial do HUB sai com chave de idempotência e vira pagamento G004; repetir não paga de novo", async () => {
    vi.stubEnv("GESTOR_MONEY_ENABLED", "true")
    const f = await fixtureG005(), localKey = await criarTitulo(f.L1, f.conta(), "HUB G004 ligado")
    const hub = await montarHub(f.L1, f.U1)
    await waitFor(() => expect(hub.estado().pagar.some((p) => p.id === localKey)).toBe(true), { timeout: 15000 })
    await act(async () => { await hub.estado().pagarParcial(localKey, 50) })
    expect(hub.patches).toHaveLength(1)
    expect(typeof hub.patches[0].idempotencyKey).toBe("string")
    expect(hub.patches[0]).toMatchObject({ op: "parcial", localKey, valor: 50, restanteEsperado: 200 })
    const pagamentos = await prisma.pagamentoFinanceiro.findMany({ where: { perfilId: f.E1 }, include: { alocacoes: true } })
    expect(pagamentos.map((p) => [p.tipo, p.valorCentavos.toString(), p.formaPagamento, p.carteiraId])).toEqual([["PAGAMENTO", "5000", "pix", f.conta()]])
    expect(await prisma.movimentacaoFinanceira.count({ where: { operacaoFinanceiraId: pagamentos[0].operacaoId } })).toBe(1)
    expect(recibosLocais(hub.dom)).toEqual([]) // ACK da mesma identidade: recibo local removido
    // Mesmo pedido de novo, com o estado que o operador vê agora (restante 150): nova intenção legítima.
    await act(async () => { await hub.estado().pagarParcial(localKey, 50) })
    expect(hub.patches[1].idempotencyKey).not.toBe(hub.patches[0].idempotencyKey)
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.E1 } })).toBe(2)
    // Reenvio da 1ª chave (resposta perdida): devolve a MESMA operação, sem novo pagamento nem movimento.
    const replay = await PATCH(new Request("http://localhost/api/financeiro/pagar", { method: "PATCH",
      headers: { "content-type": "application/json", "x-assistec-loja-id": f.L1 }, body: JSON.stringify(hub.patches[0]) }))
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ ok: true, operacaoId: hub.patches[0].idempotencyKey, resultado: { pagamentoId: pagamentos[0].id } })
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.E1 } })).toBe(2)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("90000")
  }, 60000)

  it("DESLIGADO: o mesmo HUB segue o caminho da main, sem chave e sem pagamento G004", async () => {
    vi.stubEnv("GESTOR_MONEY_ENABLED", "")
    const f = await fixtureG005(), localKey = await criarTitulo(f.L1, f.conta(), "HUB main desligado")
    const hub = await montarHub(f.L1, f.U1)
    await waitFor(() => expect(hub.estado().pagar.some((p) => p.id === localKey)).toBe(true), { timeout: 15000 })
    await act(async () => { await hub.estado().pagarParcial(localKey, 50) })
    expect(hub.patches).toHaveLength(1)
    expect(hub.patches[0]).not.toHaveProperty("idempotencyKey")
    expect(await prisma.pagamentoFinanceiro.count({ where: { storeId: f.L1 } })).toBe(0)
    expect(await prisma.financeiroOperacao.count({ where: { storeId: f.L1 } })).toBe(0)
    const t = await prisma.contaPagarTitulo.findFirstOrThrow({ where: { storeId: f.L1, localKey } })
    expect(JSON.stringify(t.payload)).toContain("\"valor\":50") // histórico da main/#397
    expect(recibosLocais(hub.dom)).toEqual([])
  }, 60000)
})
