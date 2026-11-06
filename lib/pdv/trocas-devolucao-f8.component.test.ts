// @vitest-environment jsdom
/**
 * PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — tela real `TrocasDevolucao`
 * (handlers de produção) com rede e store sintéticos. Prova a ORDEM e os bloqueios:
 * busca no servidor → bipe do novo item → devolução CONFIRMADA → nova venda com vale.
 */
import { createElement } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const rt = vi.hoisted(() => ({
  finalize: vi.fn(),
  registrar: vi.fn(),
  toast: vi.fn(),
  fetch: vi.fn(),
  calls: [] as string[],
  devolucoes: [] as unknown[],
  retomar: vi.fn(),
  encaminhar: vi.fn(),
  bodies: [] as Array<Record<string, unknown>>,
  venda: undefined as unknown,
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

vi.mock("@/lib/operations-store", async (orig) => ({
  // Classificação real da resposta (recusa definitiva × transitória) — é regra, não estado.
  classificarRespostaDevolucao: (await orig<typeof import("@/lib/operations-store")>()).classificarRespostaDevolucao,
  nextDevolucaoId:() => `DEV-2026-0001-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
  useOperationsStore: () => ({
    sales: [],
    devolucoes: rt.devolucoes,
    inventory: [
      { id: "CAM-P", name: "Camiseta P", price: 10, stock: 5, category: "Roupas", barcode: "7890000000017", sku: "CAM-P" },
      { id: "CAM-G", name: "Camiseta G", price: 15, stock: 5, category: "Roupas", barcode: "7890000000024", sku: "CAM-G" },
    ],
    caixa: { isOpen: true },
    registrarDevolucao: rt.registrar,
    finalizeSaleTransaction: rt.finalize,
    retomarDevolucaoPendente: rt.retomar,
    registrarEncaminhamentoDevolucao: rt.encaminhar,
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

import { TrocasDevolucao, fundirLinhasPorItem } from "@/components/dashboard/vendas/trocas-devolucao"

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
  rt.devolucoes.length = 0
  rt.bodies.length = 0
  rt.venda = VENDA
  rt.retomar.mockReset()
  rt.encaminhar.mockReset()
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
      return json(200, { criterio: "pedido", vendas: [rt.venda] })
    }
    if (url === "/api/ops/devolucao") {
      const body = JSON.parse(String(init?.body))
      rt.bodies.push(body)
      rt.calls.push(`devolucao:${body.localId}`)
      return devolucaoResponder(body)
    }
    if (url === "/api/ops/devolucao/pendencias") {
      const body = JSON.parse(String(init?.body))
      rt.calls.push(`pendencia:${body.localId}`)
      rt.bodies.push(body)
      return json(200, { ok: true, ref: "AUD-REF-1", at: "2026-11-04T12:00:00.000Z", operador: "Supervisor Sintético", idempotente: false })
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
  await screen.findAllByText(/Disponível:/)
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
  it("recusa definitiva da fila offline aparece no painel (reembolso legado → Financeiro)", async () => {
    rt.devolucoes.push({ id: "DEV-2026-0003", saleId: "VDA-1", tipo: "devolucao", mode: "somente_estoque", creditIssued: 0, lines: [{ inventoryId: "CAM-P", name: "Camiseta P", quantity: 1, valor: 10 }], syncRejectedCode: "REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA", syncRejectedReason: "Reembolso bloqueado" })
    render(createElement(TrocasDevolucao))
    const alerta = screen.getByTestId("devolucoes-pendencias")
    expect(alerta.textContent).toMatch(/DEV-2026-0003/)
    expect(alerta.textContent).toMatch(/reembolso em dinheiro já entregue/)
    expect(alerta.textContent).toMatch(/Nenhuma saída é criada automaticamente/)
    expect(alerta.textContent).toMatch(/1 exige\(m\) conciliação manual/)
  })

  it("encaminhar ao Financeiro exige justificativa, registra a referência e NUNCA grava devolução", async () => {
    rt.devolucoes.push({ id: "DEV-2026-0004", saleId: "VDA-1", tipo: "vale_credito", mode: "vale_credito", creditIssued: 10, lines: [{ inventoryId: "CAM-P", produtoId: "prod-cuid-1", name: "Camiseta P", quantity: 1, valor: 10 }], syncRejectedCode: "ITEM_NAO_CONSTA_NA_VENDA", syncRejectedReason: "não consta" })
    render(createElement(TrocasDevolucao))
    fireEvent.click(screen.getByRole("button", { name: "Encaminhar ao Financeiro" }))
    expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Justificativa obrigatória" }))
    expect(rt.calls).toEqual([])
    fireEvent.change(screen.getByLabelText("Justificativa da pendência DEV-2026-0004"), { target: { value: "Cliente levou o vale impresso" } })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Encaminhar ao Financeiro" })) })
    expect(rt.calls).toEqual(["pendencia:DEV-2026-0004"])
    expect(rt.bodies[0]).toMatchObject({ categoria: "VALE_EMITIDO", estado: "RECUSA_DEFINITIVA", valorDeclarado: 10, itens: [{ inventoryId: "CAM-P", produtoId: "prod-cuid-1", quantidade: 1 }] })
    expect(rt.encaminhar).toHaveBeenCalledWith("DEV-2026-0004", expect.objectContaining({ ref: "AUD-REF-1", categoria: "VALE_EMITIDO", valorDeclarado: 10 }))
  })

  it("AGUARDANDO_VENDA_ORIGEM e bloqueio persistente: motivo visível, retomada controlada e reconciliação só no bloqueio", async () => {
    const base = { saleId: "VDA-LOCAL-9", tipo: "vale_credito", mode: "vale_credito", creditIssued: 10, lines: [{ inventoryId: "CAM-P", name: "Camiseta P", quantity: 1, valor: 10 }], syncPending: true, syncWaitingCode: "AGUARDANDO_VENDA_ORIGEM", syncWaitingSince: "2026-11-04T10:00:00.000Z", syncAttempts: 2 }
    rt.devolucoes.push({ ...base, id: "DEV-ESPERA" }, { ...base, id: "DEV-BLOQ", syncBlocked: true, syncAttempts: 6 })
    render(createElement(TrocasDevolucao))
    const itens = screen.getAllByTestId("pendencia-devolucao")
    const espera = itens.find((el) => el.textContent?.includes("DEV-ESPERA"))!
    const bloq = itens.find((el) => el.textContent?.includes("DEV-BLOQ"))!
    expect(espera.dataset.estado).toBe("AGUARDANDO_VENDA_ORIGEM")
    expect(espera.textContent).toMatch(/venda de origem ainda não chegou/)
    expect(espera.querySelector("input")).toBeNull() // sem reconciliação enquanto espera
    expect(bloq.dataset.estado).toBe("BLOQUEIO_PERSISTENTE")
    expect(bloq.textContent).toMatch(/retentativa automática parou/)
    expect(bloq.textContent).toMatch(/6 tentativa/)
    fireEvent.click(within(bloq).getByRole("button", { name: "Tentar novamente" }))
    expect(rt.retomar).toHaveBeenCalledWith("DEV-BLOQ")
    expect(within(bloq).getByRole("button", { name: "Encaminhar ao Financeiro" })).toBeTruthy()
  })

  it("linha de SERVIÇO vinda do servidor: bloqueada com motivo, + desabilitado; produto real envia produtoId", async () => {
    rt.venda = {
      ...VENDA,
      lines: [
        { inventoryId: "__servico__instalacao", produtoId: "__servico__instalacao", name: "Instalação", quantity: 1, unitPrice: 50, lineTotal: 50, qtyReturned: 0, bloqueioDevolucao: "Não devolvível: serviço sem política" },
        { inventoryId: "CAM-P", produtoId: "prod-cuid-1", name: "Camiseta P", quantity: 2, unitPrice: 10, lineTotal: 20, qtyReturned: 0 },
      ],
    }
    await abrirVendaPeloServidor()
    expect(screen.getByTestId("linha-bloqueada-devolucao").textContent).toMatch(/serviço sem política/)
    expect((screen.getByRole("button", { name: "Devolver mais uma unidade de Instalação" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Devolver mais uma unidade de Camiseta P" }))
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Confirmar/ })) })
    await waitFor(() => expect(rt.bodies).toHaveLength(1))
    expect(rt.bodies[0]!.itens).toEqual([{ inventoryId: "CAM-P", produtoId: "prod-cuid-1", nome: "Camiseta P", quantidade: 1 }])
  })

  it("linhas repetidas do mesmo item (uma por bipe) viram UMA linha com totais somados", () => {
    const l = (q: number, r = 0) => ({ inventoryId: "CAM-P", name: "Camiseta P", quantity: q, unitPrice: 10, lineTotal: q * 10, qtyReturned: r })
    expect(fundirLinhasPorItem([l(1), l(1, 1), { ...l(1), inventoryId: "MEIA", name: "Meia" }])).toEqual([
      { ...l(2), qtyReturned: 1, produtoId: undefined, bloqueioDevolucao: undefined },
      { ...l(1), inventoryId: "MEIA", name: "Meia" },
    ])
  })

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

  it("recusa TRANSITÓRIA (período fechado): o reenvio usa o MESMO localId; recusa definitiva gera intenção nova (R2 P1)", async () => {
    let n = 0
    devolucaoResponder = (b) => {
      n += 1
      if (n === 1) return json(409, { error: "Período financeiro fechado.", code: "periodo_fechado" })
      if (n === 2) return json(409, { error: "Camiseta P: ainda devolvível 0, solicitado 1.", code: "QUANTIDADE_EXCEDE_DEVOLVIVEL" })
      return json(200, devOk(String(b.localId)))
    }
    await prepararTroca()
    for (let i = 0; i < 3; i++) await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await waitFor(() => expect(rt.finalize).toHaveBeenCalledTimes(1))
    const ids = rt.calls.filter((c) => c.startsWith("devolucao:"))
    expect(ids).toHaveLength(3)
    expect(ids[1]).toBe(ids[0]) // transitória: mesma identidade (replay se já gravada)
    expect(ids[2]).not.toBe(ids[1]) // definitiva: nada gravado com aquele id → intenção nova
  })

  it("tentativa incerta + 403 no reenvio: a anterior NÃO é descartada nem vira outro localId (R3 P3)", async () => {
    let n = 0
    devolucaoResponder = (b) => {
      n += 1
      if (n === 1) throw new TypeError("Failed to fetch") // gravada? resposta perdida
      if (n === 2) return json(403, { error: "Sem permissão para registrar devoluções." })
      return json(200, { ...devOk(String(b.localId)), idempotente: true })
    }
    await prepararTroca()
    await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await waitFor(() => expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Sem confirmação do servidor" })))
    // Intenção diferente: o reenvio da ORIGINAL recebe 403 (antes da checagem de replay).
    fireEvent.click(screen.getByText("Vale-Troca"))
    await act(async () => { fireEvent.click(screen.getByText("Confirmar Devolução")) })
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
    // Permissão volta: o próximo envio ainda é a ORIGINAL (confirmada como replay), nunca um localId novo.
    await act(async () => { fireEvent.click(screen.getByText("Confirmar Devolução")) })
    await waitFor(() => expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/FOI gravada/) })))
    const ids = rt.calls.filter((c) => c.startsWith("devolucao:"))
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(1)
    expect(rt.finalize).not.toHaveBeenCalled()
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

  it("tentativa sem resposta + formulário editado: reenvia a ORIGINAL primeiro e não cria outra", async () => {
    let n = 0
    devolucaoResponder = (b) => {
      n += 1
      if (n === 1) throw new TypeError("Failed to fetch") // 1ª: servidor gravou, resposta perdida
      return json(200, { ...devOk(String(b.localId)), idempotente: true })
    }
    await prepararTroca()
    await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await waitFor(() => expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Sem confirmação do servidor" })))
    // operador muda de ideia: Vale-Troca em vez de troca imediata (intenção diferente)
    fireEvent.click(screen.getByText("Vale-Troca"))
    await act(async () => { fireEvent.click(screen.getByText("Confirmar Devolução")) })
    await waitFor(() => expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Devolução recusada", description: expect.stringMatching(/FOI gravada/) })))
    const ids = rt.calls.filter((c) => c.startsWith("devolucao:"))
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1]) // só a original foi reenviada
    expect(rt.finalize).not.toHaveBeenCalled()
  })

  it("venda nova pendente: 'Concluir' não registra outra venda", async () => {
    rt.finalize.mockImplementationOnce(async () => { rt.calls.push("finalize"); return { ok: true, saleId: "VDA-2026-0043", pending: true } })
    await prepararTroca()
    await act(async () => { fireEvent.click(screen.getByText("Finalizar Troca Imediata")) })
    await waitFor(() => expect(rt.finalize).toHaveBeenCalledTimes(1))
    await act(async () => { fireEvent.click(screen.getByText("Concluir nova venda")) })
    expect(rt.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Nova venda já registrada" }))
    expect(rt.finalize).toHaveBeenCalledTimes(1)
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
