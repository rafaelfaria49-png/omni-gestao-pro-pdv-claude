/** 004C item 13: the legacy /api/print/raw TCP relay stays closed to STORE users (platform authority only). */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ session: null as unknown, sockets: 0 }))
vi.mock("@/auth", () => ({ auth: async () => h.session }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("net", async (orig) => {
  const actual = await orig<typeof import("net")>()
  return { ...actual, Socket: class { constructor() { h.sockets++ } } }
})

import { POST } from "@/app/api/print/raw/route"

const req = (storeId = "loja-a") => new Request("http://localhost/api/print/raw", { method: "POST",
  headers: { "content-type": "application/json", "x-assistec-loja-id": storeId }, body: JSON.stringify({ data: Buffer.from("x").toString("base64"), host: "10.0.0.5", port: 9100 }) })

describe("/api/print/raw legado", () => {
  beforeEach(() => { h.sockets = 0 })
  it("anônimo → 401; nenhum socket aberto", async () => {
    h.session = null
    expect((await POST(req())).status).toBe(401)
    expect(h.sockets).toBe(0)
  })
  it("ADMIN/CAIXA de loja (STORE) → 403; nenhum socket aberto (sem relay TCP/SSRF)", async () => {
    for (const role of ["ADMIN", "CAIXA", "GERENTE"]) {
      h.session = { user: { id: "u", role, accessScope: "STORE", platformAuthority: false, allowedStoreIds: ["loja-a"], lojaId: "loja-a", storeModules: { "loja-a": ["pdv", "sales", "settings"] } }, expires: "2999-01-01" }
      expect((await POST(req())).status).toBe(403)
    }
    expect(h.sockets).toBe(0)
  })
})
