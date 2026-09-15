/**
 * CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 §24/§29 — estorno pela Conferência.
 *
 * Prova o que ESTA camada acrescenta ao motor existente: idempotência de UI, tratamento
 * de "já cancelada" como estado terminal, fluxo de confirmação quando há devoluções, e
 * o registro do autorizador na trilha. O motor em si (estoque/ledger/CR/vale) é
 * exercido por `app/api/vendas/[id]/cancelar/route.test.ts`.
 */
import { describe, expect, it, vi } from "vitest"
import { estornarVendaConferencia } from "./conferencia-estorno"

const base = {
  pedidoId: "VDA-L01-2026-000407",
  storeId: "loja-1",
  motivo: "Cliente desistiu",
  operador: "Ana",
  autorizadoPor: "Carla",
}

function resposta(status: number, body: unknown) {
  return {
    status,
    json: async () => body,
  } as unknown as Response
}

/** `fetch` tipado para que `mock.calls[i]` preserve (url, init) na asserção. */
function fetchFake(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => resposta(status, body))
}

function initDe(chamada: Parameters<typeof fetch>): RequestInit {
  return (chamada[1] ?? {}) as RequestInit
}

function corpoDe(chamada: Parameters<typeof fetch>): Record<string, unknown> {
  return JSON.parse(String(initDe(chamada).body)) as Record<string, unknown>
}

describe("estornarVendaConferencia · sucesso", () => {
  it("POSTa para a rota ÚNICA de cancelamento, com loja no header", async () => {
    const f = fetchFake(200, { ok: true, estoqueReposto: 2, estornoFinanceiro: true })
    const r = await estornarVendaConferencia(base, { current: false }, { fetch: f })
    expect(r).toEqual({
      status: "estornada",
      pedidoId: base.pedidoId,
      estoqueReposto: 2,
      estornoFinanceiro: true,
    })
    const chamada = f.mock.calls[0]!
    expect(chamada[0]).toBe("/api/vendas/VDA-L01-2026-000407/cancelar")
    const init = initDe(chamada)
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>)["x-assistec-loja-id"]).toBe("loja-1")
  })

  it("registra o AUTORIZADOR na trilha enviada ao servidor (§25/§32)", async () => {
    const f = fetchFake(200, { ok: true })
    await estornarVendaConferencia(base, { current: false }, { fetch: f })
    const body = corpoDe(f.mock.calls[0]!)
    expect(body.motivo).toBe("Cliente desistiu [autorizado por Carla]")
    expect(body.canceladaPor).toBe("Ana")
    expect(body.forcar).toBe(false)
  })

  it("não vaza PIN: o corpo enviado só tem motivo, operador e forcar", async () => {
    const f = fetchFake(200, { ok: true })
    await estornarVendaConferencia(base, { current: false }, { fetch: f })
    const body = corpoDe(f.mock.calls[0]!)
    expect(Object.keys(body).sort()).toEqual(["canceladaPor", "forcar", "motivo"])
  })

  it("o número da venda vai percent-encoded na URL", async () => {
    const f = fetchFake(200, { ok: true })
    await estornarVendaConferencia({ ...base, pedidoId: "VDA 1/2" }, { current: false }, { fetch: f })
    expect(f.mock.calls[0]![0]).toBe("/api/vendas/VDA%201%2F2/cancelar")
  })
})

describe("estornarVendaConferencia · idempotência (§24)", () => {
  it("duplo clique: a segunda chamada é recusada sem tocar a rede", async () => {
    const lock = { current: false }
    let solta: (() => void) | null = null
    const f = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((res) => {
          solta = () => res(resposta(200, { ok: true }))
        }),
    )
    const primeira = estornarVendaConferencia(base, lock, { fetch: f })
    const segunda = await estornarVendaConferencia(base, lock, { fetch: f })
    expect(segunda).toEqual({ status: "in_flight" })
    expect(f).toHaveBeenCalledTimes(1)
    solta!()
    await primeira
    expect(lock.current).toBe(false)
  })

  it("o lock é liberado mesmo quando a rede falha — não trava o botão", async () => {
    const lock = { current: false }
    const f = vi.fn<typeof fetch>(async () => {
      throw new Error("offline")
    })
    const r = await estornarVendaConferencia(base, lock, { fetch: f })
    expect(r.status).toBe("erro")
    expect(lock.current).toBe(false)
  })

  it("409 'já foi cancelada' é estado TERMINAL, não erro (retry/refresh)", async () => {
    const f = fetchFake(409, { ok: false, error: "Esta venda já foi cancelada anteriormente" })
    const r = await estornarVendaConferencia(base, { current: false }, { fetch: f })
    expect(r).toEqual({ status: "ja_estornada", pedidoId: base.pedidoId })
  })
})

describe("estornarVendaConferencia · venda com devoluções (§13/§18)", () => {
  it("409 requireConfirm pede a segunda confirmação em vez de forçar sozinho", async () => {
    const f = fetchFake(409, { ok: false, requireConfirm: true, devolucoes: 2 })
    const r = await estornarVendaConferencia(base, { current: false }, { fetch: f })
    expect(r).toEqual({ status: "require_confirm", devolucoes: 2 })
    expect(corpoDe(f.mock.calls[0]!).forcar).toBe(false)
  })

  it("com forcar=true o mesmo 409 deixa de ser confirmação e vira erro real", async () => {
    const f = fetchFake(409, { ok: false, requireConfirm: true, devolucoes: 2, error: "conflito" })
    const r = await estornarVendaConferencia({ ...base, forcar: true }, { current: false }, { fetch: f })
    expect(r.status).toBe("erro")
  })

  it("forcar só é enviado quando o chamador pediu explicitamente", async () => {
    const f = fetchFake(200, { ok: true })
    await estornarVendaConferencia({ ...base, forcar: true }, { current: false }, { fetch: f })
    expect(corpoDe(f.mock.calls[0]!).forcar).toBe(true)
  })
})

describe("estornarVendaConferencia · bloqueios propagados do servidor", () => {
  it("bloqueio fiscal chega com mensagem e código reais (§20)", async () => {
    const f = fetchFake(409, {
      ok: false,
      error: "Nota fiscal autorizada — use o cancelamento fiscal (evento) em vez do cancelamento operacional.",
      code: "fiscal_bloqueio_autorizada",
    })
    const r = await estornarVendaConferencia(base, { current: false }, { fetch: f })
    expect(r).toMatchObject({ status: "erro", code: "fiscal_bloqueio_autorizada", httpStatus: 409 })
    expect(r.status === "erro" && r.error).toMatch(/cancelamento fiscal/)
  })

  it("período financeiro fechado propaga o código do servidor", async () => {
    const f = fetchFake(409, { ok: false, error: "Período financeiro fechado.", code: "periodo_fechado" })
    const r = await estornarVendaConferencia(base, { current: false }, { fetch: f })
    expect(r).toMatchObject({ status: "erro", code: "periodo_fechado" })
  })

  it("403 sem permissão não é confundido com sucesso", async () => {
    const f = fetchFake(403, { ok: false, error: "Sem permissão para cancelar vendas." })
    const r = await estornarVendaConferencia(base, { current: false }, { fetch: f })
    expect(r).toMatchObject({ status: "erro", httpStatus: 403 })
  })

  it("resposta sem JSON não quebra e vira erro legível", async () => {
    const f = vi.fn<typeof fetch>(
      async () =>
        ({
          status: 500,
          json: async () => {
            throw new Error("no json")
          },
        }) as unknown as Response,
    )
    const r = await estornarVendaConferencia(base, { current: false }, { fetch: f })
    expect(r).toMatchObject({ status: "erro", httpStatus: 500 })
  })
})

describe("estornarVendaConferencia · guardas de entrada (§8)", () => {
  it.each(["", "   "])("motivo %p nem chega a chamar a rede", async (motivo) => {
    const f = fetchFake(200, { ok: true })
    const r = await estornarVendaConferencia({ ...base, motivo }, { current: false }, { fetch: f })
    expect(r.status).toBe("erro")
    expect(f).not.toHaveBeenCalled()
  })

  it("pedidoId vazio não dispara POST", async () => {
    const f = fetchFake(200, { ok: true })
    const r = await estornarVendaConferencia({ ...base, pedidoId: " " }, { current: false }, { fetch: f })
    expect(r.status).toBe("erro")
    expect(f).not.toHaveBeenCalled()
  })
})
