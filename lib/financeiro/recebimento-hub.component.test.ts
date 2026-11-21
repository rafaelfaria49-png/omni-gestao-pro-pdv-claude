// @vitest-environment jsdom
/**
 * OMNI-GESTAO-FINANCEIRO-RECEBIMENTOS-F9-PRINT-001 — Financeiro HUB: envio idempotente,
 * tela de sucesso com comprovante e 2ª via a partir do ledger. Rede e provedores sintéticos.
 */
import { createElement, useEffect } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultPdvImpressaoConfig } from "@/lib/pdv-impressao-config"
import type { EnvioRecebimentoHub, RecebimentoHubPedido, RecebimentoHubResultado } from "@/lib/financeiro/recebimento-hub-client"

vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ empresaDocumentos: { nomeFantasia: "Loja HUB QA", razaoSocial: "" } }) }))
vi.mock("@/lib/store-settings-provider", () => ({
  useStoreSettings: () => ({ impressaoConfig: { ...defaultPdvImpressaoConfig(), bobinaTamanho: "80mm" } }),
}))

import { ComprovanteRecebimentoPainel, SegundaViaRecebimentoDialog } from "@/components/financeiro/recebimento/comprovante-recebimento"
import { useEnvioRecebimento } from "@/components/financeiro/recebimento/use-envio-recebimento"

const resultado: RecebimentoHubResultado = {
  jaRegistrado: false,
  operacaoId: "op-hub-0001",
  recebidoEm: "2026-11-08T16:20:00.000Z",
  cliente: "Bruno QA",
  formaPagamento: "pix",
  totalRecebido: 131.82,
  itens: [{ localKey: "lk", descricao: "Crediário 1/1", saldoAntes: 180, valorRecebido: 131.82, saldoDepois: 48.18, statusFinal: "parcial" }],
  saldoDevedorCliente: 98.18,
}

const printMock = vi.fn()
beforeEach(() => {
  printMock.mockReset()
  window.print = printMock as unknown as typeof window.print
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0)) as typeof window.requestAnimationFrame
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.getElementById("recibo-print-mount")?.remove()
})

describe("ComprovanteRecebimentoPainel", () => {
  it("mostra o que o servidor confirmou e imprime o cupom não fiscal real; reimpressão disponível", async () => {
    const onConcluir = vi.fn()
    render(createElement(ComprovanteRecebimentoPainel, { resultado, onConcluir }))
    expect(screen.getByText("Recebimento confirmado")).toBeTruthy()
    expect(screen.getByText(/abatido — resta R\$\s?48,18/)).toBeTruthy()
    expect(screen.getByText(/98,18/)).toBeTruthy()
    expect(screen.getByText(/PIX/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /^Imprimir comprovante/ }))
    await waitFor(() => expect(printMock).toHaveBeenCalledTimes(1))
    const html = document.getElementById("recibo-print-mount")?.innerHTML ?? ""
    for (const t of ["COMPROVANTE NÃO FISCAL", "op-hub-0001", "Loja HUB QA", "Bruno QA", "PIX", "48,18", "size: 80mm"]) expect(html).toContain(t)
    for (const fixo of ["Banco Inter", "plena quitação"]) expect(html).not.toContain(fixo)
    await screen.findByRole("button", { name: /Reimprimir comprovante/ })
    fireEvent.click(screen.getByRole("button", { name: /^Concluir$/ }))
    expect(onConcluir).toHaveBeenCalledTimes(1)
  })

  it("'Concluir sem imprimir' existe antes de qualquer impressão; falha de impressão é explícita", async () => {
    printMock.mockImplementation(() => { throw new Error("sem impressora") })
    render(createElement(ComprovanteRecebimentoPainel, { resultado: { ...resultado, saldoDevedorCliente: null }, onConcluir: vi.fn() }))
    expect(screen.getByRole("button", { name: /Concluir sem imprimir/ })).toBeTruthy()
    expect(screen.getByText(/Títulos sem vínculo de cadastro/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /^Imprimir comprovante/ }))
    await screen.findByText(/Não foi possível abrir a impressão/)
  })
})

describe("SegundaViaRecebimentoDialog", () => {
  it("lista pagamentos reais, bloqueia estornado e reimprime a 2ª via sem nova baixa", async () => {
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u)
      calls.push(`${init?.method ?? "GET"} ${url}`)
      if (url.includes("&index=3")) {
        return new Response(JSON.stringify({ ok: true, recibo: { operacaoId: "op-x", cliente: "Bruno QA", recebidoEm: "2026-11-01T10:00:00.000Z", formaPagamento: "dinheiro", itens: [{ localKey: "lk", descricao: "Crediário", valorRecebido: 20, saldoRestante: 10 }], totalRecebido: 20 } }), { status: 200 })
      }
      return new Response(JSON.stringify({ ok: true, pagamentos: [
        { index: 3, loteId: "op-x", valor: 20, at: "2026-11-01T10:00:00.000Z", estornado: false },
        { index: 1, loteId: null, valor: 5, at: "2026-10-01T10:00:00.000Z", estornado: true },
      ] }), { status: 200 })
    }))
    render(createElement(SegundaViaRecebimentoDialog, { open: true, onOpenChange: vi.fn(), localKey: "lk", titulo: "Crediário · Bruno", storeId: "loja-hub" }))
    const botoes = await screen.findAllByRole("button", { name: /Reimprimir/ })
    expect((botoes[1] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(botoes[0]!)
    await waitFor(() => expect(printMock).toHaveBeenCalledTimes(1))
    const html = document.getElementById("recibo-print-mount")?.innerHTML ?? ""
    expect(html).toContain("2ª VIA — REIMPRESSÃO")
    expect(html).toContain("Dinheiro")
    expect(html).not.toContain("SALDO DEVEDOR ATUAL")
    expect(calls.every((c) => c.startsWith("GET "))).toBe(true)
  })

  it("erro do servidor aparece com Tentar de novo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "Título não encontrado" }), { status: 404 })))
    render(createElement(SegundaViaRecebimentoDialog, { open: true, onOpenChange: vi.fn(), localKey: "lk", titulo: "T", storeId: "loja" }))
    await screen.findByText("Título não encontrado")
    expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeTruthy()
  })
})

describe("useEnvioRecebimento", () => {
  type Api = ReturnType<typeof useEnvioRecebimento>
  function Harness({ enviar, onApi }: { enviar: (p: RecebimentoHubPedido) => Promise<EnvioRecebimentoHub>; onApi: (a: Api) => void }) {
    const api = useEnvioRecebimento(enviar)
    useEffect(() => onApi(api))
    return null
  }
  const pedido = { formaPagamento: "pix", itens: [{ localKey: "lk", saldoEsperado: 10, valorReceber: 10 }] }

  it("clique duplo no mesmo tick: um envio; incerto mantém a chave; confirmado descarta", async () => {
    let api!: Api
    const respostas: EnvioRecebimentoHub[] = [
      { kind: "incerto", mensagem: "x" },
      { kind: "ok", resultado },
      { kind: "ok", resultado },
    ]
    const enviar = vi.fn(async (_p: RecebimentoHubPedido) => {
      await new Promise((r) => setTimeout(r, 5))
      return respostas.shift()!
    })
    render(createElement(Harness, { enviar, onApi: (a) => { api = a } }))
    await act(async () => {
      await Promise.all([api.submeter(pedido), api.submeter(pedido)])
    })
    expect(enviar).toHaveBeenCalledTimes(1)
    await act(async () => { await api.submeter(pedido) })
    expect(enviar.mock.calls[1]![0].idempotencyKey).toBe(enviar.mock.calls[0]![0].idempotencyKey)
    await act(async () => { await api.submeter(pedido) })
    expect(enviar.mock.calls[2]![0].idempotencyKey).not.toBe(enviar.mock.calls[0]![0].idempotencyKey)
  })

  it("sem forma de pagamento não envia nada", async () => {
    let api!: Api
    const enviar = vi.fn()
    render(createElement(Harness, { enviar, onApi: (a) => { api = a } }))
    await act(async () => { await api.submeter({ ...pedido, formaPagamento: "" }) })
    expect(enviar).not.toHaveBeenCalled()
  })
})
