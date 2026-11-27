import { afterEach, describe, expect, it } from "vitest"
import { GET } from "@/app/api/gestor-money/status/route"

describe("GET /api/gestor-money/status", () => {
  const prev = process.env.GESTOR_MONEY_ENABLED

  afterEach(() => {
    if (prev === undefined) delete process.env.GESTOR_MONEY_ENABLED
    else process.env.GESTOR_MONEY_ENABLED = prev
  })

  it("retorna MODULE_DISABLED com Cache-Control privado quando GESTOR_MONEY_ENABLED está desligada", async () => {
    delete process.env.GESTOR_MONEY_ENABLED
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")

    const body = (await res.json()) as {
      ok: boolean
      foundationMerged: boolean
      moduleEnabled: boolean
      state: string
      contratos: Array<{ id: string; disponivelNoRuntime: boolean }>
    }
    expect(body.ok).toBe(true)
    expect(body.foundationMerged).toBe(true)
    expect(body.moduleEnabled).toBe(false)
    expect(body.state).toBe("MODULE_DISABLED")
    expect(body.contratos.map((c) => c.id)).toEqual([
      "G001",
      "G002",
      "G003",
      "G004",
      "G005",
      "G006",
      "G007",
    ])
    expect(body.contratos.every((c) => c.disponivelNoRuntime === false)).toBe(true)
  })

  it("retorna READY para G001–G005 mantendo G006/G007 desligados quando GESTOR_MONEY_ENABLED=true", async () => {
    process.env.GESTOR_MONEY_ENABLED = "true"
    const res = await GET()
    const body = (await res.json()) as {
      ok: boolean
      moduleEnabled: boolean
      state: string
      contratos: Array<{ id: string; disponivelNoRuntime: boolean }>
    }
    expect(body.ok).toBe(true)
    expect(body.moduleEnabled).toBe(true)
    expect(body.state).toBe("READY")
    const byId = Object.fromEntries(body.contratos.map((c) => [c.id, c.disponivelNoRuntime]))
    expect(byId.G001).toBe(true)
    expect(byId.G002).toBe(true)
    expect(byId.G004).toBe(true)
    expect(byId.G005).toBe(true)
    expect(byId.G006).toBe(false)
    expect(byId.G007).toBe(false)
  })
})
