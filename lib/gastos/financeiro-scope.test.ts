import { describe, expect, it, vi } from "vitest"
import { persistirSnapshotFinanceiro, precisaoLegada, registroFinanceiroDaEmpresa, validarCentavos } from "./financeiro-scope"
import { executarPagamentoPendente, principalPagamentoBrowser } from "@/lib/financeiro/pagamento-operacao-client"
vi.mock("@/auth", () => ({ auth: vi.fn() }))

describe("G002 precisão e ponte legada", () => {
  it("aceita centavos inteiros e preserva limite explícito", () => {
    expect(validarCentavos("36501").toString()).toBe("36501")
    expect(validarCentavos("9000000000000").toString()).toBe("9000000000000")
    expect(validarCentavos("-1", true).toString()).toBe("-1")
  })
  it.each([1.5, "1.5", "1e2", "9000000000001", "-1", null, {}, Number.NaN, Infinity])("recusa centavos não canônicos: %j", (value) => {
    expect(() => validarCentavos(value)).toThrow()
  })
  it("não converte anomalia histórica em centavos inventados", () => {
    expect(precisaoLegada(0.005)).toEqual({ valorCentavos: null, valorOriginalLegado: 0.005, precisaoStatus: "ANOMALIA_LEGADO" })
    expect(precisaoLegada(100000000000)).toMatchObject({ valorCentavos: null, precisaoStatus: "ANOMALIA_LEGADO" })
  })
  it("tolera somente ruído binário da projeção Float de centavos exatos", () => {
    expect(precisaoLegada(0.1 + 0.2)).toEqual({ valorCentavos: "30", valorOriginalLegado: null, precisaoStatus: "CENTAVOS" })
    expect(precisaoLegada(365.01).valorCentavos).toBe("36501")
    expect(precisaoLegada(134999999.86).valorCentavos).toBe("13499999986")
    expect(() => precisaoLegada(Number.NaN)).toThrow()
  })
  it("refina resultado empresarial somente após validar a loja exata, sem fallback de NULL", () => {
    expect(registroFinanceiroDaEmpresa({ id: "titulo", storeId: "L1" }, "L1")).toEqual({ id: "titulo", storeId: "L1" })
    expect(() => registroFinanceiroDaEmpresa({ storeId: null }, "L1")).toThrow()
    expect(() => registroFinanceiroDaEmpresa({ storeId: "L2" }, "L1")).toThrow()
    expect(() => registroFinanceiroDaEmpresa({ storeId: null }, "")).toThrow()
  })

  it("snapshot limita concorrência e preserva a ordem de todas as repetições da mesma chave", async () => {
    const itens = ["a", "b", "a", "c", "d", "a", "e"].map((chave, i) => ({ chave, item: { chave, i } }))
    let ativos = 0, pico = 0
    const ordem: number[] = []
    expect(await persistirSnapshotFinanceiro(itens, async row => {
      ativos++; pico = Math.max(pico, ativos)
      await new Promise(resolve => setTimeout(resolve, 2))
      ordem.push(row.i); ativos--
    })).toBe(7)
    expect(pico).toBeGreaterThan(1)
    expect(pico).toBeLessThanOrEqual(4)
    expect(ordem.filter(i => itens[i].chave === "a")).toEqual([0, 2, 5])
  })

  it("falha do lote aguarda todas as gravações iniciadas e impede despachos seguintes", async () => {
    let liberar!: () => void
    const bloqueio = new Promise<void>(resolve => { liberar = resolve })
    const iniciados: number[] = [], concluidos: number[] = []
    let terminou = false
    const result = persistirSnapshotFinanceiro(Array.from({ length: 8 }, (_, item) => ({ chave: String(item), item })), async item => {
      iniciados.push(item)
      if (item === 0) throw new Error("G002_SNAPSHOT_FAILURE")
      await bloqueio
      concluidos.push(item)
    }).then(() => { terminou = true; return null }, e => { terminou = true; return e })
    await Promise.resolve(); await Promise.resolve()
    expect(iniciados).toEqual([0, 1, 2, 3])
    expect(terminou).toBe(false)
    liberar()
    expect(await result).toMatchObject({ message: "G002_SNAPSHOT_FAILURE" })
    expect(concluidos).toEqual([1, 2, 3])
    expect(iniciados).toEqual([0, 1, 2, 3])
  })
})

describe("M1 recibo cliente é identidade, sem persistência financeira no navegador", () => {
  const input = { principalId: "U1", storeId: "L1", canal: "financeiro" as const, tipo: "pagar" as const,
    referencia: "titulo", op: "parcial" as const, pedido: { op: "parcial", localKey: "titulo", valor: 40 },
  }
  function ambiente() {
    const rows = new Map<string, string>(), filas = new Map<string, Promise<void>>()
    return { rows, storage: { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => { rows.set(k, v) }, removeItem: (k: string) => { rows.delete(k) } },
      trava: async <T>(nome: string, fn: () => Promise<T>) => {
        const anterior = filas.get(nome) ?? Promise.resolve()
        let liberar!: () => void
        const atual = new Promise<void>(r => { liberar = r })
        filas.set(nome, anterior.then(() => atual))
        await anterior
        try { return await fn() } finally { liberar() }
      },
    }
  }
  const ack = (key: string) => Promise.resolve(Response.json({ ok: true, operacaoId: key }))
  it("pagamentos iguais confirmados são intenções distintas; erro de rede conserva a chave", async () => {
    const a = ambiente(), keys: string[] = []
    const enviar = async (key: string) => { keys.push(key); return ack(key) }
    await executarPagamentoPendente(input, enviar, a)
    await executarPagamentoPendente(input, enviar, a)
    expect(keys[0]).not.toBe(keys[1])
    await expect(executarPagamentoPendente(input, async key => { keys.push(key); throw new Error("rede") }, a)).rejects.toThrow("rede")
    expect(a.rows.size).toBe(1)
    expect([...a.rows.values()][0]).not.toContain('"valor"')
    await executarPagamentoPendente({ ...input }, enviar, a)
    expect(keys[2]).toBe(keys[3])
    expect(a.rows.size).toBe(0)
  })
  it("reserva entre chamadas concorrentes reutiliza a chave, sem serializar seus envios", async () => {
    const a = ambiente(), keys: string[] = []
    let liberar!: () => void, todos!: () => void
    const bloqueio = new Promise<void>(r => { liberar = r }), chegaram = new Promise<void>(r => { todos = r })
    const enviar = async (key: string) => {
      keys.push(key)
      if (keys.length === 3) todos()
      await bloqueio
      return ack(key)
    }
    const requests = Promise.all([1, 2, 3].map(() => executarPagamentoPendente(input, enviar, a)))
    try { await chegaram; expect(new Set(keys).size).toBe(1) } finally { liberar() }
    await requests
    expect(a.rows.size).toBe(0)
  })
  it("operação incerta não muda de conteúdo ou principal; outra loja tem namespace próprio", async () => {
    const a = ambiente(), enviar = vi.fn(ack)
    await expect(executarPagamentoPendente(input, async () => { throw new Error("incerto") }, a)).rejects.toThrow("incerto")
    await expect(executarPagamentoPendente({ ...input, pedido: { ...input.pedido, valor: 41 } }, enviar, a)).rejects.toThrow("outros dados")
    await expect(executarPagamentoPendente({ ...input, principalId: "U2" }, enviar, a)).rejects.toThrow("outra sessão")
    expect(enviar).not.toHaveBeenCalled()
    await executarPagamentoPendente({ ...input, storeId: "L2" }, enviar, a)
    expect(a.rows.size).toBe(1)
  })
  it("falha de armazenamento impede o envio; resposta sem identidade não confirma", async () => {
    const a = ambiente(), enviar = vi.fn(ack)
    a.storage.setItem = () => { throw new Error("storage indisponível") }
    await expect(executarPagamentoPendente(input, enviar, a)).rejects.toThrow("storage indisponível")
    expect(enviar).not.toHaveBeenCalled()
    const b = ambiente()
    await expect(executarPagamentoPendente(input, async () => Response.json({ ok: true }), b)).rejects.toThrow("identidade")
    expect(b.rows.size).toBe(1)
  })
  it("rejeição atômica confirmada permite corrigir; 503 e conflito conservam a identidade", async () => {
    const a = ambiente(), keys: string[] = []
    await expect(executarPagamentoPendente(input, async key => {
      keys.push(key); return Response.json({ ok: false, operacaoId: key, operacaoRejeitada: true, error: "valor_maior_que_aberto" }, { status: 422 })
    }, a)).rejects.toThrow("valor_maior_que_aberto")
    expect(a.rows.size).toBe(0)
    await expect(executarPagamentoPendente(input, async key => { keys.push(key); return Response.json({ ok: false, error: "incerto" }, { status: 503 }) }, a)).rejects.toThrow("incerto")
    await expect(executarPagamentoPendente(input, async key => { keys.push(key); return Response.json({ ok: false, error: "conflito" }, { status: 409 }) }, a)).rejects.toThrow("conflito")
    expect(keys[0]).not.toBe(keys[1])
    expect(keys[1]).toBe(keys[2])
    expect(a.rows.size).toBe(1)
  })
  it.each([400, 409, 422])("rejeição sem efeito %s com a mesma identidade libera uma nova intenção", async status => {
    const a = ambiente(), keys: string[] = []
    await expect(executarPagamentoPendente(input, async key => {
      keys.push(key)
      return Response.json({ ok: false, operacaoId: key, operacaoRejeitada: true, error: "recusado" }, { status })
    }, a)).rejects.toThrow("recusado")
    expect(a.rows.size).toBe(0)
    await executarPagamentoPendente(input, async key => { keys.push(key); return ack(key) }, a)
    expect(keys[0]).not.toBe(keys[1])
  })
  it.each(["5xx", "outra identidade"])("flag de rejeição não libera recibo em %s", async caso => {
    const a = ambiente(), keys: string[] = []
    await expect(executarPagamentoPendente(input, async key => {
      keys.push(key)
      return Response.json({ ok: false, operacaoId: caso === "5xx" ? key : "outra", operacaoRejeitada: true, error: "incerto" }, { status: caso === "5xx" ? 503 : 409 })
    }, a)).rejects.toThrow("incerto")
    expect(a.rows.size).toBe(1)
    await executarPagamentoPendente(input, async key => { keys.push(key); return ack(key) }, a)
    expect(keys[0]).toBe(keys[1])
  })
  it.each([
    { observacao: "x".repeat(2001) }, { valor: 0 }, { valor: Number.NaN },
    { localKey: "x".repeat(261) }, { formaPagamento: "x".repeat(81) },
  ])("dados inválidos conhecidos são recusados antes de reservar ou enviar a intenção %#", async invalido => {
    const a = ambiente(), enviar = vi.fn(ack)
    await expect(executarPagamentoPendente({ ...input, tipo: "receber", pedido: { ...input.pedido, ...invalido } }, enviar, a)).rejects.toThrow("Dados do pagamento inválidos")
    expect(enviar).not.toHaveBeenCalled()
    expect(a.rows.size).toBe(0)
  })
  it("checagem de sessão distingue erro de rede de administrador legado, sem conceder autorização", async () => {
    try {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ user: { id: "U1" } })))
      expect(await principalPagamentoBrowser()).toBe("usuario:U1")
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({})))
      expect(await principalPagamentoBrowser()).toBe("admin-legado")
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 503 })))
      await expect(principalPagamentoBrowser()).rejects.toThrow("sessão")
    } finally { vi.unstubAllGlobals() }
  })
})
