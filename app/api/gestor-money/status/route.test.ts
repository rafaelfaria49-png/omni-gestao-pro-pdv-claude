import { describe, expect, it } from "vitest"
import { GET } from "@/app/api/gestor-money/status/route"

describe("GET /api/gestor-money/status", () => {
  it("retorna status honesto de prontidão com Cache-Control privado sem fabricar dados", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")

    const body = (await res.json()) as {
      ok: boolean
      foundationMerged: boolean
      state: string
      contratos: Array<{ id: string }>
    }
    expect(body.ok).toBe(true)
    expect(body.foundationMerged).toBe(false)
    expect(body.state).toBe("FOUNDATION_PENDING_PR405")
    expect(body.contratos.map((c) => c.id)).toEqual([
      "G001",
      "G002",
      "G003",
      "G004",
      "G005",
      "G006",
      "G007",
    ])
  })
})
