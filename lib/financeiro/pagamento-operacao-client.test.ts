import { describe, expect, it } from "vitest"
import { executarPagamentoPendente, type PagamentoPendenteInput } from "./pagamento-operacao-client"

function ambiente() {
  const values = new Map<string, string>()
  return { values, storage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) }, removeItem: (k: string) => { values.delete(k) } },
    trava: async <T>(_key: string, run: () => Promise<T>) => run() }
}
const input: PagamentoPendenteInput = { principalId: "U", storeId: "L", canal: "financeiro", tipo: "pagar", referencia: "T", op: "estornar",
  pedido: { op: "estornar", localKey: "T", motivo: "Correção sintética" } }
describe("G004 recibo do estorno no browser (sem simular atomicidade financeira)", () => {
  it("recusa 4xx definitiva libera a identidade e permite outra intenção", async () => {
    const env = ambiente(), keys: string[] = []
    await expect(executarPagamentoPendente(input, async key => {
      keys.push(key)
      return Response.json({ ok: false, operacaoId: key, operacaoRejeitada: true, error: "Período fechado" }, { status: 409 })
    }, env)).rejects.toThrow("Período fechado")
    expect(env.values.size).toBe(0)
    await executarPagamentoPendente({ ...input, pedido: { ...input.pedido, motivo: "Nova intenção após reabertura" } }, async key => {
      keys.push(key)
      return Response.json({ ok: true, operacaoId: key })
    }, env)
    expect(keys[0]).not.toBe(keys[1])
    expect(env.values.size).toBe(0)
  })
  it("5xx e recusa sem a identidade/flag exatas conservam a chave", async () => {
    const env = ambiente(), keys: string[] = []
    for (const status of [503, 409, 422]) await expect(executarPagamentoPendente(input, async key => {
      keys.push(key)
      return Response.json({ ok: false, operacaoId: status === 422 ? "outra" : key, operacaoRejeitada: status !== 409 }, { status })
    }, env)).rejects.toThrow()
    expect(new Set(keys).size).toBe(1)
    expect(env.values.size).toBe(1)
  })
  it("perda de resposta/500 conserva UUID e hashes; ACK exato limpa o recibo", async () => {
    const env = ambiente(), keys: string[] = []
    await expect(executarPagamentoPendente(input, async key => { keys.push(key); throw new Error("rede") }, env)).rejects.toThrow("rede")
    expect(env.values.size).toBe(1)
    expect([...env.values.values()][0]).not.toContain("Correção sintética")
    await expect(executarPagamentoPendente(input, async key => { keys.push(key); return Response.json({ ok: false }, { status: 500 }) }, env)).rejects.toThrow()
    await executarPagamentoPendente(input, async key => { keys.push(key); return Response.json({ ok: true, operacaoId: key }) }, env)
    expect(new Set(keys).size).toBe(1)
    expect(env.values.size).toBe(0)
  })
  it("outros dados/principal conflitam sem substituir uma identidade incerta", async () => {
    const env = ambiente()
    await expect(executarPagamentoPendente(input, async () => { throw new Error("perdida") }, env)).rejects.toThrow()
    const raw = [...env.values.values()][0]
    await expect(executarPagamentoPendente({ ...input, pedido: { ...input.pedido, motivo: "outro" } }, async () => { throw new Error("não enviar") }, env)).rejects.toThrow("outros dados")
    await expect(executarPagamentoPendente({ ...input, principalId: "OUTRO" }, async () => { throw new Error("não enviar") }, env)).rejects.toThrow("outra sessão")
    expect([...env.values.values()][0]).toBe(raw)
  })
  it("ACK divergente e JSON inválido conservam a intenção", async () => {
    const env = ambiente()
    await expect(executarPagamentoPendente(input, async () => Response.json({ ok: true, operacaoId: "errada" }), env)).rejects.toThrow("identidade")
    await expect(executarPagamentoPendente(input, async () => new Response("incompleta"), env)).rejects.toThrow()
    expect(env.values.size).toBe(1)
  })
  it("não estende o adaptador de estorno a receber ou PDV", async () => {
    for (const patch of [{ tipo: "receber" as const }, { canal: "pdv" as const, sessaoId: "S" }]) {
      const env = ambiente()
      await expect(executarPagamentoPendente({ ...input, ...patch }, async () => { throw new Error("não enviar") }, env)).rejects.toThrow("inválidos")
      expect(env.values.size).toBe(0)
    }
  })
})
