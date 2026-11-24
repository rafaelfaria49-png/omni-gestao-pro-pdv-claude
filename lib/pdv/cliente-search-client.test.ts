import { describe, expect, it, vi } from "vitest"
import { buscarClientesPdv, mensagemErroBuscaClientes } from "./cliente-search-client"

const H = "x-assistec-loja-id"

function resp(status: number, body: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("buscarClientesPdv — POST /api/clientes/search", () => {
  it("usa POST com termo no BODY (nunca na URL), header da loja e credenciais", async () => {
    const fetchImpl = vi.fn(async () => resp(200, { clientes: [] }))
    await buscarClientesPdv({ fetchImpl, storeId: "loja-a", q: "  Ana Paula  ", lojaHeader: H })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/clientes/search")
    expect(url).not.toContain("Ana")
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({ q: "Ana Paula" })
    expect((init.headers as Record<string, string>)[H]).toBe("loja-a")
    expect(init.credentials).toBe("include")
  })

  it("normaliza clientes e descarta linhas sem id/nome", async () => {
    const fetchImpl = vi.fn(async () =>
      resp(200, { clientes: [{ id: "c1", name: "Ana", phone: "119", document: "" }, { id: "", name: "x" }, { name: "sem id" }] }),
    )
    const r = await buscarClientesPdv({ fetchImpl, storeId: "s", q: "a", lojaHeader: H })
    expect(r).toEqual({ kind: "ok", clientes: [{ id: "c1", name: "Ana", phone: "119", email: null, document: null }] })
  })

  it.each([
    [400, { error: "Busca inválida" }, "Busca inválida"],
    [401, {}, "Sessão expirada"],
    [403, { error: "Sem permissão para este módulo ou unidade." }, "Sem permissão para consultar clientes"],
    [500, {}, "HTTP 500"],
    [503, { error: "Falha ao listar clientes" }, "HTTP 503"],
  ])("HTTP %i vira erro legível — nunca lista vazia", async (status, body, trecho) => {
    const r = await buscarClientesPdv({ fetchImpl: vi.fn(async () => resp(status, body)), storeId: "s", q: "a", lojaHeader: H })
    expect(r.kind).toBe("erro")
    if (r.kind === "erro") {
      expect(r.status).toBe(status)
      expect(r.message).toContain(trecho)
    }
  })

  it("200 sem `clientes` é resposta inesperada (erro), não 'nenhum cliente'", async () => {
    const r = await buscarClientesPdv({ fetchImpl: vi.fn(async () => resp(200, { ok: true })), storeId: "s", q: "a", lojaHeader: H })
    expect(r.kind).toBe("erro")
  })

  it("falha de rede vira erro de conexão; abort vira `aborted` (sem mensagem)", async () => {
    const rede = await buscarClientesPdv({
      fetchImpl: vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      }),
      storeId: "s",
      q: "a",
      lojaHeader: H,
    })
    expect(rede).toEqual({ kind: "erro", status: null, message: mensagemErroBuscaClientes(null) })

    const ctrl = new AbortController()
    const fetchImpl = vi.fn(async () => {
      ctrl.abort()
      const e = new Error("aborted")
      e.name = "AbortError"
      throw e
    })
    expect(await buscarClientesPdv({ fetchImpl, storeId: "s", q: "a", lojaHeader: H, signal: ctrl.signal })).toEqual({ kind: "aborted" })
  })

  it("termo é cortado no limite do servidor (200)", async () => {
    const fetchImpl = vi.fn(async () => resp(200, { clientes: [] }))
    await buscarClientesPdv({ fetchImpl, storeId: "s", q: "x".repeat(500), lojaHeader: H })
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body)).q).toHaveLength(200)
  })
})

describe("fetch do navegador (this obrigatório)", () => {
  it("não invoca fetchImpl como método de params (window.fetch lançaria Illegal invocation)", async () => {
    // Igual ao navegador: fetch chamado com `this` que não é o global lança antes da rede.
    const fetchNavegador = function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation")
      return Promise.resolve(new Response(JSON.stringify({ clientes: [{ id: "c1", name: "Ana" }] }), { status: 200 }))
    } as unknown as typeof fetch
    const r = await buscarClientesPdv({ fetchImpl: fetchNavegador, storeId: "s", q: "ana", lojaHeader: H })
    expect(r.kind).toBe("ok")
  })
})
