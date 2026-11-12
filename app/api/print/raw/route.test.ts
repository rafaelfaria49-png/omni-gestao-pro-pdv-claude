import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ destinations: [] as Array<{ host: string; port: number }>, writes: [] as Buffer[], denied: false }))
vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: async () => h.denied ? new Response(null, { status: 403 }) : null }))
vi.mock("net", async original => ({ ...await original<typeof import("net")>(), Socket: class extends EventEmitter {
  connect(port: number, host: string, ready: () => void) { h.destinations.push({ host, port }); queueMicrotask(ready) }
  write(bytes: Buffer, done: () => void) { h.writes.push(bytes); done() }
  end() { this.emit("close") }
  destroy() { this.emit("close") }
} }))

import { POST } from "./route"

const request = (extra: Record<string, unknown> = {}) => new Request("https://app.example/api/print/raw", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: Buffer.from("cupom").toString("base64"), ...extra }),
})

beforeEach(() => {
  h.destinations = []; h.writes = []; h.denied = false
  for (const key of ["THERMAL_PRINT_HOST", "THERMAL_PRINT_PORT", "THERMAL_PRINT_HTTP_URL", "VERCEL", "VERCEL_ENV"]) vi.stubEnv(key, "")
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe("destino explícito do transporte legado", () => {
  it("sem destino no servidor não tenta localhost nem aceita host do navegador", async () => {
    for (const extra of [{}, { host: "169.254.169.254", port: 80 }]) {
      expect((await POST(request(extra))).status).toBe(503)
    }
    expect(h.destinations).toEqual([])
  })
  it("mantém uma impressora de rede explicitamente configurada", async () => {
    vi.stubEnv("THERMAL_PRINT_HOST", "192.168.0.50")
    vi.stubEnv("THERMAL_PRINT_PORT", "9100")
    expect((await POST(request({ host: "192.168.0.50", port: 9100 }))).status).toBe(200)
    expect(h.destinations).toEqual([{ host: "192.168.0.50", port: 9100 }])
    expect(h.writes).toEqual([Buffer.from("cupom")])
  })
  it.each([{ host: "169.254.169.254", port: 80 }, { host: "192.168.0.50", port: 22 }])("recusa sobrescrever o destino fixado: %j", async extra => {
    vi.stubEnv("THERMAL_PRINT_HOST", "192.168.0.50")
    expect((await POST(request(extra))).status).toBe(403)
    expect(h.destinations).toEqual([])
  })
  it.each(["127.0.0.1", "localhost", "::1", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2130706433", "0.0.0.0"])("recusa loopback %s no runtime Vercel", async host => {
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("THERMAL_PRINT_HOST", host)
    expect((await POST(request())).status).toBe(503)
    expect(h.destinations).toEqual([])
  })
  it.each(["http://[::ffff:127.0.0.1]:9100/print", "http://[::ffff:7f00:1]:9100/print", "http://2130706433:9100/print"])("recusa bridge loopback normalizada: %s", async bridge => {
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("THERMAL_PRINT_HTTP_URL", bridge)
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
    expect((await POST(request())).status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("preserva bridge configurada, sem seguir redirect ou expor resposta privada", async () => {
    vi.stubEnv("THERMAL_PRINT_HTTP_URL", "https://bridge.example/print")
    const fetchMock = vi.fn(async () => new Response("private bridge details", { status: 502 }))
    vi.stubGlobal("fetch", fetchMock)
    const res = await POST(request())
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain("private bridge details")
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://bridge.example/print", expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }))
    expect(h.destinations).toEqual([])
  })
  it.each(["file:///etc/passwd", "https://user:password@bridge.example/print"])("recusa URL de bridge inválida", async url => {
    vi.stubEnv("THERMAL_PRINT_HTTP_URL", url)
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
    expect((await POST(request())).status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("recusa payload inválido antes de qualquer transporte", async () => {
    vi.stubEnv("THERMAL_PRINT_HOST", "192.168.0.50")
    expect((await POST(request({ data: "!!!!" }))).status).toBe(400)
    expect((await POST(request({ data: Buffer.alloc(65_537).toString("base64") }))).status).toBe(413)
    expect(h.destinations).toEqual([])
  })
  it("mantém a autorização de plataforma antes de qualquer envio", async () => {
    h.denied = true; vi.stubEnv("THERMAL_PRINT_HOST", "192.168.0.50")
    expect((await POST(request())).status).toBe(403)
    expect(h.destinations).toEqual([])
  })
  it("recusa formulário e requisição de outra origem antes do transporte", async () => {
    vi.stubEnv("THERMAL_PRINT_HOST", "192.168.0.50")
    const form = request(); form.headers.set("content-type", "text/plain")
    expect((await POST(form)).status).toBe(415)
    const crossSite = request(); crossSite.headers.set("origin", "https://other.example")
    expect((await POST(crossSite)).status).toBe(403)
    expect(h.destinations).toEqual([])
  })
})
