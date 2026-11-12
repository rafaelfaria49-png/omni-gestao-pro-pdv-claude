import { describe, expect, it, vi } from "vitest"
import { chaveClienteTitulo, enviarRecebimentoHub, type RecebimentoHubPedido } from "./recebimento-hub-client"
import { rotuloFormaRecebimento } from "./formas-recebimento-hub"

const H = "x-assistec-loja-id"
const pedido: RecebimentoHubPedido = {
  formaPagamento: "pix",
  idempotencyKey: "11111111-2222-3333-4444-555555555555",
  itens: [{ localKey: "lk", saldoEsperado: 100, valorReceber: 40 }],
}
const ok = {
  ok: true,
  jaRegistrado: false,
  operacaoId: pedido.idempotencyKey,
  recebidoEm: "2026-11-08T12:00:00.000Z",
  cliente: "Ana",
  formaPagamento: "pix",
  totalRecebido: 40,
  itens: [{ localKey: "lk", descricao: "T", saldoAntes: 100, valorRecebido: 40, saldoDepois: 60, statusFinal: "parcial" }],
  saldoDevedorCliente: 60,
}

function resp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

describe("enviarRecebimentoHub", () => {
  it("POST com loja no header e no body; sucesso só com corpo coerente do servidor", async () => {
    const fetchImpl = vi.fn(async () => resp(200, ok))
    const r = await enviarRecebimentoHub({ fetchImpl, storeId: "loja-a", lojaHeader: H, pedido })
    expect(r.kind).toBe("ok")
    if (r.kind === "ok") expect(r.resultado).toMatchObject({ totalRecebido: 40, saldoDevedorCliente: 60, itens: [{ saldoDepois: 60 }] })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/financeiro/receber-lote")
    expect((init.headers as Record<string, string>)[H]).toBe("loja-a")
    expect(JSON.parse(String(init.body))).toMatchObject({ lojaId: "loja-a", idempotencyKey: pedido.idempotencyKey })
  })

  it("200 com corpo incoerente NÃO é sucesso: é incerto (mantém a chave)", async () => {
    const r = await enviarRecebimentoHub({ fetchImpl: vi.fn(async () => resp(200, { ok: true })), storeId: "s", lojaHeader: H, pedido })
    expect(r.kind).toBe("incerto")
  })

  it("rede e 5xx genérico = incerto; 5xx de movimentação = recusado (nada gravado)", async () => {
    const rede = await enviarRecebimentoHub({ fetchImpl: vi.fn(async () => { throw new TypeError("x") }), storeId: "s", lojaHeader: H, pedido })
    expect(rede.kind).toBe("incerto")
    const g = await enviarRecebimentoHub({ fetchImpl: vi.fn(async () => resp(503, { ok: false, code: "db_error" })), storeId: "s", lojaHeader: H, pedido })
    expect(g.kind).toBe("incerto")
    const m = await enviarRecebimentoHub({ fetchImpl: vi.fn(async () => resp(503, { ok: false, code: "movimentacao_financeira_falhou" })), storeId: "s", lojaHeader: H, pedido })
    expect(m.kind).toBe("recusado")
  })

  it.each([
    [409, "saldo_divergente", "mudou"],
    [422, "cliente_divergente", "mesmo cliente"],
    [409, "periodo_fechado", "Período financeiro fechado"],
    [403, "", "Sem permissão"],
    [400, "validation_error", "Dados inválidos"],
  ])("HTTP %i %s = recusado com mensagem honesta", async (status, code, trecho) => {
    const r = await enviarRecebimentoHub({ fetchImpl: vi.fn(async () => resp(status, { ok: false, code, error: "Dados inválidos" })), storeId: "s", lojaHeader: H, pedido })
    expect(r.kind).toBe("recusado")
    if (r.kind === "recusado") expect(r.mensagem).toContain(trecho)
  })
})

describe("chaveClienteTitulo", () => {
  it("Cliente.id manda; sem id, nome normalizado; homônimo da loja fica marcado", () => {
    const amb = new Set(["maria silva"])
    expect(chaveClienteTitulo({ clienteId: "c1", cliente: "Maria Silva" }, amb)).toEqual({ chave: "id:c1", ambiguo: false })
    expect(chaveClienteTitulo({ cliente: "MARIA  Sílva" }, amb)).toEqual({ chave: "nome:maria silva", ambiguo: true })
    expect(chaveClienteTitulo({ cliente: "Ana" }, amb)).toEqual({ chave: "nome:ana", ambiguo: false })
  })
})

describe("rotuloFormaRecebimento", () => {
  it("rótulo legível para ids conhecidos; desconhecido aparece como veio; vazio fica vazio", () => {
    expect(rotuloFormaRecebimento("pix")).toBe("PIX")
    expect(rotuloFormaRecebimento("cartao_debito")).toBe("Cartão de débito")
    expect(rotuloFormaRecebimento("pix + dinheiro")).toBe("PIX + Dinheiro")
    expect(rotuloFormaRecebimento("vale_x")).toBe("vale_x")
    expect(rotuloFormaRecebimento(null)).toBe("")
  })
})

describe("fetch do navegador (this obrigatório)", () => {
  it("envio e 2ª via não chamam fetchImpl como método (Illegal invocation no navegador)", async () => {
    const fetchNavegador = function (this: unknown, u: RequestInfo | URL) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation")
      const url = String(u)
      if (url.includes("recibo-recebimento")) return Promise.resolve(resp(200, { ok: true, pagamentos: [] }))
      return Promise.resolve(resp(200, ok))
    } as unknown as typeof fetch
    expect((await enviarRecebimentoHub({ fetchImpl: fetchNavegador, storeId: "s", lojaHeader: H, pedido })).kind).toBe("ok")
    const { listarPagamentosTitulo } = await import("./recebimento-hub-client")
    expect((await listarPagamentosTitulo({ fetchImpl: fetchNavegador, storeId: "s", lojaHeader: H, localKey: "lk" })).ok).toBe(true)
  })
})
