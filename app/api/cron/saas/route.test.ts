import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Rota /api/cron/saas: requisição não autorizada não toca o banco; autorizada roda em modo registro.
const h = vi.hoisted(() => ({ executar: vi.fn(), prisma: { marcador: true } }))
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))
vi.mock("@/lib/saas/cron", () => ({ executarCronSaas: h.executar }))
import { GET } from "./route"

const S = "c".repeat(40)
const req = (auth?: string) => new Request("http://localhost/api/cron/saas", { headers: auth ? { authorization: auth } : {} })

beforeEach(() => {
  vi.clearAllMocks()
  h.executar.mockResolvedValue({ execucao: "cron-x", emailModo: "registro", outbox: { reivindicadas: 0 } })
})
afterEach(() => vi.unstubAllEnvs())

describe("GET /api/cron/saas", () => {
  it("sem CRON_SECRET → 503 e nada executa", async () => {
    vi.stubEnv("CRON_SECRET", "")
    const r = await GET(req(`Bearer ${S}`))
    expect(r.status).toBe(503)
    expect(h.executar).not.toHaveBeenCalled()
    expect(r.headers.get("cache-control")).toContain("no-store")
  })
  it("segredo errado ou ausente → 401 e nada executa", async () => {
    vi.stubEnv("CRON_SECRET", S)
    for (const a of [undefined, "Bearer errado", `Bearer ${S}0`]) {
      const r = await GET(req(a))
      expect(r.status).toBe(401)
      expect(await r.json()).toEqual({ ok: false, erro: "nao_autorizado" })
    }
    expect(h.executar).not.toHaveBeenCalled()
  })
  it("autorizado → executa com o prisma do app e devolve só contagens", async () => {
    vi.stubEnv("CRON_SECRET", S)
    const r = await GET(req(`Bearer ${S}`))
    expect(r.status).toBe(200)
    expect(h.executar).toHaveBeenCalledWith(h.prisma)
    expect(await r.json()).toEqual({ ok: true, execucao: "cron-x", emailModo: "registro", outbox: { reivindicadas: 0 } })
  })
  it("falha interna → 500 sem detalhes", async () => {
    vi.stubEnv("CRON_SECRET", S)
    vi.spyOn(console, "error").mockImplementation(() => {})
    h.executar.mockRejectedValue(new Error("Failing row contains (dado pessoal)"))
    const r = await GET(req(`Bearer ${S}`))
    expect(r.status).toBe(500)
    expect(JSON.stringify(await r.json())).not.toContain("dado pessoal")
  })
})
