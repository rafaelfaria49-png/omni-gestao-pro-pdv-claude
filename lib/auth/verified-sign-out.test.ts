import { describe, expect, it, vi } from "vitest"
import { verifiedSignOut } from "./verified-sign-out"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const noWait = async () => {}
const fetchFrom = (responses: Array<Response | Promise<Response>>) =>
  vi.fn(() => Promise.resolve(responses.shift()!)) as unknown as typeof fetch

describe("verifiedSignOut (SEC-342)", () => {
  it("termina na 1ª tentativa quando duas leituras seguidas do servidor não têm sessão", async () => {
    const signOut = vi.fn(async () => undefined)
    const fetchImpl = vi.fn(async () => json({})) as unknown as typeof fetch
    expect(await verifiedSignOut({ signOut, fetchImpl, wait: noWait })).toEqual({ ok: true, attempts: 1 })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledWith({ redirect: false })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("cada sonda usa URL única (o cache NetworkFirst do SW não pode responder por ela)", async () => {
    const fetchImpl = vi.fn(async () => json({})) as unknown as typeof fetch
    await verifiedSignOut({ signOut: async () => undefined, fetchImpl, wait: noWait })
    const urls = vi.mocked(fetchImpl).mock.calls.map((c) => String(c[0]))
    expect(urls.every((u) => u.startsWith("/api/auth/session?confirmar="))).toBe(true)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it("cookie ressuscitado por resposta atrasada: repete o signout até o servidor confirmar", async () => {
    const signOut = vi.fn(async () => undefined)
    const fetchImpl = fetchFrom([json({ user: { id: "u1" } }), json(null), json(null)])
    expect(await verifiedSignOut({ signOut, fetchImpl, wait: noWait })).toEqual({ ok: true, attempts: 2 })
    expect(signOut).toHaveBeenCalledTimes(2)
  })

  it("sessão que volta logo depois da 1ª confirmação (outra aba) não conta como saída", async () => {
    const signOut = vi.fn(async () => undefined)
    const fetchImpl = fetchFrom([json({}), json({ user: { id: "u1" } }), json({}), json({})])
    expect(await verifiedSignOut({ signOut, fetchImpl, wait: noWait })).toEqual({ ok: true, attempts: 2 })
    expect(signOut).toHaveBeenCalledTimes(2)
  })

  it("sessão que continua viva em todas as tentativas é reportada, nunca tratada como saída", async () => {
    const signOut = vi.fn(async () => undefined)
    const fetchImpl = vi.fn(async () => json({ user: { id: "u1" } })) as unknown as typeof fetch
    expect(await verifiedSignOut({ signOut, fetchImpl, wait: noWait })).toEqual({ ok: false, attempts: 3, reason: "sessao-ainda-ativa" })
  })

  it("rede fora ou 5xx não confirmam o logout", async () => {
    const signOut = vi.fn(async () => { throw new TypeError("Failed to fetch") })
    const fails = [Promise.reject(new TypeError("Failed to fetch")), Promise.resolve(json({ error: "x" }, 503)), Promise.resolve(new Response("<html>", { status: 200 }))]
    const fetchImpl = vi.fn(() => fails.shift()!) as unknown as typeof fetch
    expect(await verifiedSignOut({ signOut, fetchImpl, wait: noWait })).toEqual({ ok: false, attempts: 3, reason: "sem-confirmacao" })
  })

  it("espera o silêncio antes do 1º signout e a pausa entre as duas confirmações", async () => {
    const order: string[] = []
    const wait = vi.fn(async (ms: number) => { order.push(`wait:${ms}`) })
    const signOut = vi.fn(async () => { order.push("signout") })
    const fetchImpl = vi.fn(async () => { order.push("probe"); return json({}) }) as unknown as typeof fetch
    await verifiedSignOut({ signOut, fetchImpl, wait, quietMs: 800, confirmMs: 1_000 })
    expect(order).toEqual(["wait:800", "signout", "wait:300", "probe", "wait:1000", "probe"])
  })
})
