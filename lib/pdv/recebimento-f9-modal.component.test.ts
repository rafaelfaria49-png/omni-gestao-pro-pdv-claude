// @vitest-environment jsdom
/**
 * OMNI-GESTAO-FINANCEIRO-RECEBIMENTOS-F9-PRINT-001 — PdvRecebimentoModal REAL montado.
 *
 * Só a rede e os provedores (loja, caixa, toast) são sintéticos. Prova: lista inicial de
 * devedores, busca por POST com erro HTTP honesto, caixa fechado, baixa única com clique
 * duplo, retry com a mesma chave, tela de sucesso, impressão/reimpressão SEM nova baixa e
 * impressão indisponível sem desfazer o recebimento.
 */
import { createElement } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultFormasPagamento } from "@/lib/pdv-formas-pagamento"
import { defaultPdvImpressaoConfig } from "@/lib/pdv-impressao-config"

const rt = vi.hoisted(() => ({
  caixaAberto: true,
  toast: vi.fn(),
  entrada: vi.fn(),
  calls: [] as Array<{ url: string; init?: RequestInit }>,
  search: null as null | ((body: { q: string }) => { status: number; body: unknown }),
  lote: null as null | ((body: Record<string, unknown>) => { status: number; body: unknown } | "network"),
  singular: null as null | ((body: Record<string, unknown>) => { status: number; body: unknown }),
}))

vi.mock("@/lib/loja-ativa", () => ({
  useLojaAtiva: () => ({ lojaAtivaId: "loja-qa", empresaDocumentos: { nomeFantasia: "Loja QA F9", razaoSocial: "" } }),
}))
vi.mock("@/components/dashboard/caixa/caixa-provider", () => ({
  useCaixa: () => ({ caixa: { isOpen: rt.caixaAberto }, sessaoId: rt.caixaAberto ? "sessao-qa" : null, adicionarEntrada: rt.entrada }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: rt.toast }) }))

import { PdvRecebimentoModal } from "@/components/dashboard/vendas/pdv-recebimento-modal"

const rows = [
  { id: "t1", descricao: "Crediário 1/2", cliente: "Ana QA", valor: 100, vencimento: "2026-12-01", status: "pendente", saldoAberto: 100, clienteId: "c-ana", tipo: "Manual" },
  { id: "t2", descricao: "Crediário 2/2", cliente: "Ana QA", valor: 50, vencimento: "2026-12-15", status: "parcial", saldoAberto: 30, clienteId: "c-ana", tipo: "Manual" },
]
const listaBody = {
  ok: true,
  rows,
  audit: rows.map((r) => ({ id: `db-${r.id}`, localKey: r.id, saldoAberto: r.saldoAberto, vencido: false })),
  nomesAmbiguos: [],
  clientesComAberto: [{ id: "c-ana", name: "Ana QA", phone: "11900000001", document: null, qtdAbertos: 2, totalAberto: 130 }],
}

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  rt.calls.push({ url, init })
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if (url.startsWith("/api/ops/contas-receber-list")) return jsonResp(200, listaBody)
  if (url === "/api/clientes/search") {
    const r = rt.search?.(body) ?? { status: 200, body: { clientes: [] } }
    return jsonResp(r.status, r.body)
  }
  if (url === "/api/pdv/receber-conta-lote") {
    const r = rt.lote?.(body)
    if (r === "network") throw new TypeError("Failed to fetch")
    return jsonResp(r?.status ?? 500, r?.body ?? {})
  }
  if (url === "/api/pdv/receber-conta") {
    const r = rt.singular?.(body) ?? { status: 500, body: {} }
    return jsonResp(r.status, r.body)
  }
  return jsonResp(404, {})
})

const printMock = vi.fn()
const impressao = { ...defaultPdvImpressaoConfig(), imprimirCrediario: false, bobinaTamanho: "58mm" as const }

function montar(props: Partial<Parameters<typeof PdvRecebimentoModal>[0]> = {}) {
  const onOpenChange = vi.fn()
  render(
    createElement(PdvRecebimentoModal, {
      open: true,
      onOpenChange,
      formasPagamento: defaultFormasPagamento(),
      impressaoConfig: impressao,
      hotkeyLabel: "F9",
      ...props,
    }),
  )
  return { onOpenChange }
}

const chamadas = (url: string) => rt.calls.filter((c) => c.url === url)

beforeEach(() => {
  rt.caixaAberto = true
  rt.calls = []
  rt.search = null
  rt.lote = null
  rt.singular = null
  rt.toast.mockClear()
  rt.entrada.mockClear()
  printMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  window.print = printMock as unknown as typeof window.print
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0)) as typeof window.requestAnimationFrame
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.getElementById("recibo-print-mount")?.remove()
})

async function abrirAna() {
  const lista = await screen.findByText("Clientes com contas em aberto")
  expect(lista).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: /Ana QA/ }))
  await screen.findByText("Crediário 1/2")
}

function okLote(itens: Array<{ localKey: string; valorRecebido: number; saldoDepois: number }>, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    body: {
      ok: true,
      jaRegistrado: false,
      totalRecebido: itens.reduce((s, i) => s + i.valorRecebido, 0),
      sessaoId: "sessao-qa",
      operacaoId: "op-servidor-1",
      recebidoEm: "2026-11-08T14:30:00.000Z",
      itens,
      ...extra,
    },
  }
}

describe("F9 · recebimento no PDV (modal real)", () => {
  it("caixa fechado: avisa e fecha sem consultar nem gravar", async () => {
    rt.caixaAberto = false
    const { onOpenChange } = montar()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Caixa fechado" }))
    expect(chamadas("/api/pdv/receber-conta-lote")).toHaveLength(0)
  })

  it("ao abrir lista os clientes com conta em aberto (sem digitar) e foca a busca", async () => {
    montar()
    await screen.findByText("Clientes com contas em aberto")
    const botao = screen.getByRole("button", { name: /Ana QA/ })
    expect(within(botao).getByText("2 em aberto")).toBeTruthy()
    expect(within(botao).getByText(/130,00/)).toBeTruthy()
    await waitFor(() => expect(document.activeElement?.id).toBe("pdv-receber-busca"))
  })

  it("busca usa POST com o termo no body; 403 vira erro com Tentar de novo (não 'nenhum cliente')", async () => {
    let falhar = true
    rt.search = ({ q }) =>
      falhar
        ? { status: 403, body: { ok: false, error: "Sem permissão para este módulo ou unidade." } }
        : { status: 200, body: { clientes: [{ id: "c-bia", name: `Bia ${q}`, phone: null, document: "123" }] } }
    montar()
    await screen.findByText("Clientes com contas em aberto")
    fireEvent.change(screen.getByLabelText(/Cliente \(nome, telefone ou CPF\)/), { target: { value: "Bia" } })
    const alerta = await screen.findByText("Sem permissão para consultar clientes nesta loja.", {}, { timeout: 3000 })
    expect(screen.queryByText(/Nenhum cliente encontrado/)).toBeNull()
    const req = chamadas("/api/clientes/search")[0]!
    expect(req.init?.method).toBe("POST")
    expect(JSON.parse(String(req.init?.body))).toEqual({ q: "Bia" })
    expect((req.init?.headers as Record<string, string>)["x-assistec-loja-id"]).toBe("loja-qa")
    falhar = false
    fireEvent.click(within(alerta.parentElement!).getByRole("button", { name: /Tentar de novo/ }))
    const achado = await screen.findByRole("button", { name: /Bia Bia/ }, { timeout: 3000 })
    expect(within(achado).getByText("sem títulos em aberto")).toBeTruthy()
  })

  it("busca vazia responde 'Nenhum cliente encontrado' só depois da resposta do servidor", async () => {
    rt.search = () => ({ status: 200, body: { clientes: [] } })
    montar()
    await screen.findByText("Clientes com contas em aberto")
    fireEvent.change(screen.getByLabelText(/Cliente \(nome, telefone ou CPF\)/), { target: { value: "Zzz" } })
    expect(screen.getByText(/Buscando clientes/)).toBeTruthy()
    await screen.findByText(/Nenhum cliente encontrado para “Zzz” nesta loja/, {}, { timeout: 3000 })
  })

  it("lote: clique duplo grava UMA vez; sucesso oferece imprimir/concluir; reimprimir não gera nova baixa", async () => {
    rt.lote = () => okLote([{ localKey: "t1", valorRecebido: 100, saldoDepois: 0 }, { localKey: "t2", valorRecebido: 30, saldoDepois: 0 }])
    montar()
    await abrirAna()
    fireEvent.click(screen.getByLabelText("Selecionar Crediário 1/2"))
    fireEvent.click(screen.getByLabelText("Selecionar Crediário 2/2"))
    fireEvent.click(screen.getByRole("button", { name: /Receber 2 títulos/ }))
    const gravar = await screen.findByRole("button", { name: /Gravar R\$/ })
    await act(async () => {
      fireEvent.click(gravar)
      fireEvent.click(gravar)
    })
    await screen.findByText("Recebimento confirmado")
    expect(chamadas("/api/pdv/receber-conta-lote")).toHaveLength(1)
    const enviado = JSON.parse(String(chamadas("/api/pdv/receber-conta-lote")[0]!.init?.body))
    expect(enviado).toMatchObject({ sessaoId: "sessao-qa", formaPagamento: "dinheiro" })
    expect(enviado.itens).toEqual([
      expect.objectContaining({ localKey: "t1", saldoEsperado: 100, valorReceber: 100 }),
      expect.objectContaining({ localKey: "t2", saldoEsperado: 30, valorReceber: 30 }),
    ])
    expect(rt.entrada).toHaveBeenCalledTimes(1)
    expect(rt.entrada).toHaveBeenCalledWith(130)
    // Auto-impressão desligada na config: aviso explícito + botões manuais.
    expect(screen.getByText(/Impressão automática de comprovante desligada/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /Concluir sem imprimir/ })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /^Imprimir comprovante/ }))
    await waitFor(() => expect(printMock).toHaveBeenCalledTimes(1))
    const html = document.getElementById("recibo-print-mount")?.innerHTML ?? ""
    expect(html).toContain("COMPROVANTE NÃO FISCAL")
    expect(html).toContain("op-servidor-1")
    expect(html).toContain("Loja QA F9")
    expect(html).toContain("Ana QA")
    expect(html).toContain("size: 58mm")
    await screen.findByRole("button", { name: /Reimprimir comprovante/ })
    fireEvent.click(screen.getByRole("button", { name: /Reimprimir comprovante/ }))
    await waitFor(() => expect(printMock).toHaveBeenCalledTimes(2))
    expect(chamadas("/api/pdv/receber-conta-lote")).toHaveLength(1)
  })

  it("rede caiu: aviso honesto e o retry reenvia a MESMA chave de operação", async () => {
    let n = 0
    rt.lote = () => (++n === 1 ? "network" : okLote([{ localKey: "t1", valorRecebido: 100, saldoDepois: 0 }], { jaRegistrado: true }))
    montar()
    await abrirAna()
    fireEvent.click(screen.getByLabelText("Selecionar Crediário 1/2"))
    fireEvent.click(screen.getByRole("button", { name: /Receber 1 título/ }))
    fireEvent.click(await screen.findByRole("button", { name: /Gravar R\$/ }))
    await screen.findByText(/a operação não será duplicada/)
    expect(screen.queryByText("Recebimento confirmado")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Receber 1 título/ }))
    fireEvent.click(await screen.findByRole("button", { name: /Gravar R\$/ }))
    await screen.findByText("Recebimento já estava registrado")
    const [a, b] = chamadas("/api/pdv/receber-conta-lote").map((c) => JSON.parse(String(c.init?.body)).idempotencyKey)
    expect(a).toBeTruthy()
    expect(b).toBe(a)
  })

  it("conflito 409 do servidor: nada de sucesso, lista recarregada", async () => {
    rt.lote = () => ({ status: 409, body: { ok: false, code: "saldo_divergente", error: "x", detalhes: [{ localKey: "t1" }] } })
    montar()
    await abrirAna()
    fireEvent.click(screen.getByLabelText("Selecionar Crediário 1/2"))
    fireEvent.click(screen.getByRole("button", { name: /Receber 1 título/ }))
    const antes = chamadas("/api/ops/contas-receber-list").length
    fireEvent.click(await screen.findByRole("button", { name: /Gravar R\$/ }))
    await waitFor(() => expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Recebimento não gravado" })))
    expect(screen.queryByText("Recebimento confirmado")).toBeNull()
    expect(chamadas("/api/ops/contas-receber-list").length).toBeGreaterThan(antes)
  })

  it("impressão indisponível não desfaz o recebimento: aviso e botão de nova tentativa", async () => {
    rt.lote = () => okLote([{ localKey: "t1", valorRecebido: 100, saldoDepois: 0 }])
    printMock.mockImplementation(() => {
      throw new Error("printer offline")
    })
    montar()
    await abrirAna()
    fireEvent.click(screen.getByLabelText("Selecionar Crediário 1/2"))
    fireEvent.click(screen.getByRole("button", { name: /Receber 1 título/ }))
    fireEvent.click(await screen.findByRole("button", { name: /Gravar R\$/ }))
    await screen.findByText("Recebimento confirmado")
    fireEvent.click(screen.getByRole("button", { name: /^Imprimir comprovante/ }))
    await screen.findByText(/Não foi possível abrir a impressão do comprovante/)
    expect(screen.getByText("Recebimento confirmado")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Reimprimir comprovante/ })).toBeTruthy()
    expect(chamadas("/api/pdv/receber-conta-lote")).toHaveLength(1)
  })

  it("auto-impressão ligada (Crediário): imprime sozinho uma vez após a confirmação", async () => {
    rt.lote = () => okLote([{ localKey: "t1", valorRecebido: 100, saldoDepois: 0 }])
    montar({ impressaoConfig: { ...impressao, imprimirCrediario: true } })
    await abrirAna()
    fireEvent.click(screen.getByLabelText("Selecionar Crediário 1/2"))
    fireEvent.click(screen.getByRole("button", { name: /Receber 1 título/ }))
    fireEvent.click(await screen.findByRole("button", { name: /Gravar R\$/ }))
    await screen.findByText("Recebimento confirmado")
    await waitFor(() => expect(printMock).toHaveBeenCalledTimes(1))
  })

  it("'Quitar este título' (singular) também termina na tela de sucesso com o valor do servidor", async () => {
    rt.singular = (b) => ({
      status: 200,
      body: { ok: true, op: "liquidar", valorRecebido: 30, jaRegistrado: false, operacaoId: b.idempotencyKey, recebidoEm: "2026-11-08T15:00:00.000Z", audit: { saldoAberto: 0 } },
    })
    montar()
    await abrirAna()
    const linha = screen.getByText("Crediário 2/2").closest("li") ?? document.body
    const quitar = within(linha as HTMLElement).queryByRole("button", { name: /Quitar este título/ }) ?? screen.getAllByRole("button", { name: /Quitar este título/ })[1]!
    fireEvent.click(quitar)
    await screen.findByText("Recebimento confirmado")
    expect(chamadas("/api/pdv/receber-conta")).toHaveLength(1)
    expect(screen.getByRole("button", { name: /Concluir sem imprimir/ })).toBeTruthy()
    // Saldo do cliente = outro título (100) — este quitou.
    expect(screen.getByText(/Saldo devedor do cliente nesta loja/).textContent).toContain("100,00")
  })
})
