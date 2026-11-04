// @vitest-environment jsdom
/**
 * PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — tela real `TrocasDevolucao`
 * (handlers de produção) com rede e store sintéticos. Prova a ORDEM e os bloqueios:
 * busca no servidor → bipe do novo item → devolução CONFIRMADA → nova venda com vale.
 */
import { createElement } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const rt = vi.hoisted(() => ({
  finalize: vi.fn(),
  registrar: vi.fn(),
  toast: vi.fn(),
  fetch: vi.fn(),
  calls: [] as string[],
}))

const VENDA = {
  id: "VDA-2026-0042",
  at: "2026-11-01T12:00:00.000Z",
  total: 20,
  customerCpf: "52998224725",
  customerName: "Cliente Sintético",
  paymentBreakdown: { dinheiro: 20 },
  lines: [{ inventoryId: "CAM-P", name: "Camiseta P", quantity: 2, unitPrice: 10, lineTotal: 20, qtyReturned: 1 }],
}

vi.mock("@/lib/operations-store", () => ({
  nextDevolucaoId: () => `DEV-2026-0001-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
  useOperationsStore: () => ({
    sales: [],
    devolucoes: [],
    inventory: [
      { id: "CAM-P", name: "Camiseta P", price: 10, stock: 5, category: "Roupas", barcode: "7890000000017", sku: "CAM-P" },
      { id: "CAM-G", name: "Camiseta G", price: 15, stock: 5, category: "Roupas", barcode: "7890000000024", sku: "CAM-G" },
    ],
    caixa: { isOpen: true },
    registrarDevolucao: rt.registrar,
    finalizeSaleTransaction: rt.finalize,
  }),
}))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-sintetica" }) }))
vi.mock("@/components/dashboard/caixa/caixa-provider", () => ({ useCaixa: () => ({ sessaoId: "sessao-1" }) }))
vi.mock("@/lib/config-empresa", () => ({
  useConfigEmpresa: () => ({ config: { empresa: { nomeFantasia: "Loja Sintética" } } }),
  configPadrao: { empresa: { nomeFantasia: "Loja" } },
}))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: rt.toast }) }))
vi.mock("@/lib/audit-log", () => ({ appendAuditLog: vi.fn() }))
vi.mock("@/lib/thermal-print", () => ({
  sendEscPosViaProxy: vi.fn(async () => ({ ok: true })),
  downloadEscPosFile: vi.fn(),
  openThermalHtmlPrint: vi.fn(),
  escapeHtml: (s: string) => s,
}))

import { TrocasDevolucao } from "@/components/dashboard/vendas/trocas-devolucao"

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

function devOk(localId: string, valor = 10) {
  return {
    ok: true, idempotente: false, devolucaoId: "srv-1", localId, vendaLocalId: VENDA.id, tipo: "troca",
    valorTotal: valor, creditoEmitido: valor, saldoCreditoCliente: valor, operador: "Operador Sintético",
    itens: [{ inventoryId: "CAM-P", nome: "Camiseta P", quantidade: 1, valorUnitario: 10, valorTotal: valor }],
  }
}

let devolucaoResponder: (body: Record<string, unknown>) => Response | Promise<Response>

beforeEach(() => {
  rt.calls.length = 0
  rt.finalize.mockReset().mockImplementation(async () => {
    rt.calls.push("finalize")
    return { ok: true, saleId: "VDA-2026-0043" }
  })
  rt.registrar.mockReset().mockImplementation(() => ({ ok: true, devolucaoId: "x", creditIssued: 10 }))
  rt.toast.mockReset()
  devolucaoResponder = (b) => json(200, devOk(String(b.localId)))
  rt.fetch.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/ops/devolucao/elegibilidade")) {
      rt.calls.push("busca")
      return json(200, { criterio: "pedido", vendas: [VENDA] })
    }
    if (url === "/api/ops/devolucao") {
      const body = JSON.parse(String(init?.body))
      rt.calls.push(`devolucao:${body.localId}`)
      return devolucaoResponder(body)
    }
    throw new Error(`fetch inesperado ${url}`)
  })
  vi.stubGlobal("fetch", rt.fetch)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function abrirVendaPeloServidor() {
  render(createElement(TrocasDevolucao))
  const busca = screen.getByLabelText("Venda, cliente ou código de barras do produto")
  fireEvent.change(busca, { target: { value: VENDA.id } })
  await act(async () => { fireEvent.keyDown(busca, { key: "Enter" }) })
  await screen.findByText(/Disponível:/)
}

async function prepararTroca() {
  await abrirVendaPeloServidor()
  fireEvent.click(screen.getByText("Troca Imediata"))
  // + 1 unidade a devolver (máximo = 2 vendidas − 1 já devolvida no servidor)
  const linha = screen.getByText("Camiseta P", { selector: "p" }).closest("div")!.parentElement!
  fireEvent.click(linha.querySelectorAll("button")[1]!)
  const bipe = screen.getByLabelText("Bipe ou busca do novo produto")
  fireEvent.change(bipe, { target: { value: "7890000000024" } })
  fireEvent.keyDown(bipe, { key: "Enter" })
  await screen.findByText("Itens da Nova Compra")
}

describe("F8 — troca imediata na mesma tela", () => {
  it("busca no servidor e respeita o devolvível agregado (2 vendidas − 1 devolvida = 1)", async () => {
    await abrirVendaPeloServidor()
    expect(rt.calls).toEqual(["busca"])
    expect(screen.getByText(/Vendido: 2 · Devolvido: 1 · Disponível:/)).toBeTruthy()
  })

  it("bipe do código de barras adiciona o novo produto; diferença positiva cobrada após a devolução confirmada", async () => {
    await prepararTroca()
    expect(screen.getAllByText("Camiseta G").length).toBeGreaterThan(0)
    await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await waitFor(() => expect(rt.finalize).toHaveBeenCalledTimes(1))
    // ORDEM: devolução confirmada pelo servidor ANTES da nova venda
    expect(rt.calls[1]).toMatch(/^devolucao:DEV-/)
    expect(rt.calls[2]).toBe("finalize")
    expect(rt.finalize.mock.calls[0]![0]).toMatchObject({
      total: 15,
      customerCpf: VENDA.customerCpf,
      paymentBreakdown: { creditoVale: 10, dinheiro: 5 },
    })
    // espelho local usa o resultado do servidor (sem reenvio)
    expect(rt.registrar.mock.calls[0]![0]).toMatchObject({ serverConfirmed: { creditIssued: 10 } })
    await screen.findByText(/Comprovante/)
    expect(screen.getByText("Operador Sintético")).toBeTruthy()
  })

  it("sem resposta do servidor: nenhuma venda nova; o reenvio usa o MESMO localId", async () => {
    let first = true
    devolucaoResponder = (b) => {
      if (first) { first = false; throw new TypeError("Failed to fetch") }
      return json(200, devOk(String(b.localId)))
    }
    await prepararTroca()
    await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await waitFor(() => expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Sem confirmação do servidor" })))
    expect(rt.finalize).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await waitFor(() => expect(rt.finalize).toHaveBeenCalledTimes(1))
    const ids = rt.calls.filter((c) => c.startsWith("devolucao:"))
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })

  it("nova venda falha: vale preservado e 'Concluir nova venda' refaz SÓ a venda", async () => {
    rt.finalize.mockImplementationOnce(async () => { rt.calls.push("finalize"); return { ok: false, reason: "Estoque insuficiente." } })
    await prepararTroca()
    await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await screen.findByText("Concluir nova venda")
    expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Vale gerado — nova venda não concluída" }))
    await act(async () => { fireEvent.click(screen.getByText("Concluir nova venda")) })
    await waitFor(() => expect(rt.finalize).toHaveBeenCalledTimes(2))
    expect(rt.calls.filter((c) => c.startsWith("devolucao:"))).toHaveLength(1)
  })

  it("nova venda PENDENTE (offline após a devolução): sem comprovante, carrinho mantido, devolução já confirmada", async () => {
    rt.finalize.mockImplementationOnce(async () => { rt.calls.push("finalize"); return { ok: true, saleId: "VDA-2026-0043", pending: true } })
    await prepararTroca()
    await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await waitFor(() => expect(rt.finalize).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Comprovante/)).toBeNull()
    expect(screen.getAllByText("Camiseta G").length).toBeGreaterThan(0)
    expect(screen.getByRole("status").textContent).toMatch(/já gravada/)
    expect(rt.calls.filter((c) => c.startsWith("devolucao:"))).toHaveLength(1)
  })

  it("recusa do servidor (ex.: outra devolução simultânea levou o saldo) não faz venda", async () => {
    devolucaoResponder = () => json(409, { error: "Camiseta P: ainda devolvível 0, solicitado 1.", code: "QUANTIDADE_EXCEDE_DEVOLVIVEL" })
    await prepararTroca()
    await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await waitFor(() => expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Devolução recusada" })))
    expect(rt.finalize).not.toHaveBeenCalled()
    expect(rt.registrar).not.toHaveBeenCalled()
  })

  it("política: Reembolso desabilitado e sobra da troca sem opção de dinheiro", async () => {
    await abrirVendaPeloServidor()
    const reembolso = screen.getByRole("button", { name: "Reembolso (bloqueado)" }) as HTMLButtonElement
    expect(reembolso.disabled).toBe(true)
    expect(screen.queryByText("Devolver dinheiro")).toBeNull()
  })
})
