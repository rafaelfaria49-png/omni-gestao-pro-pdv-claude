import { beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"
import { guardWhatsAppApiRead, guardWhatsAppApiWrite } from "./whatsapp-api-guard"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: {
  adminUser: { findUnique: vi.fn() }, adminUserStore: { findUnique: vi.fn() },
  store: { findUnique: vi.fn() },
} }))

function request(source: "header" | "query" | "cookie", storeId: string) {
  return new Request(`http://localhost/api/whatsapp/contacts${source === "query" ? `?storeId=${storeId}` : ""}`, {
    headers: source === "header" ? { "x-assistec-loja-id": storeId }
      : source === "cookie" ? { cookie: `${ASSISTEC_ACTIVE_STORE_COOKIE}=${storeId}` } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: {
    id: "u1", role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["L1"],
  } } as never)
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ active: true, role: "VENDEDOR" } as never)
  vi.mocked(prisma.adminUserStore.findUnique).mockResolvedValue({ id: "m1" } as never)
  vi.mocked(prisma.store.findUnique).mockResolvedValue({ id: "L1" } as never)
})

describe("E24 — autorização WhatsApp HUB", () => {
  it.each(["header", "query", "cookie"] as const)("nega loja forjada por %s", async (source) => {
    const result = await guardWhatsAppApiRead(request(source, "L2"))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it.each([guardWhatsAppApiRead, guardWhatsAppApiWrite])("preserva usuário autorizado no guard %s", async (guard) => {
    expect(await guard(request("header", "L1"))).toEqual({ ok: true, storeId: "L1", userId: "u1" })
  })

  it("não usa cookie sozinho para escrita e não inventa unidade", async () => {
    expect((await guardWhatsAppApiWrite(request("cookie", "L1"))).ok).toBe(false)
    expect((await guardWhatsAppApiRead(new Request("http://localhost/api/whatsapp/contacts"))).ok).toBe(false)
  })

  it.each([null, { user: { role: "ADMIN" } }])("nega sessão sem identidade: %j", async (session) => {
    vi.mocked(auth).mockResolvedValue(session as never)
    const result = await guardWhatsAppApiRead(request("header", "L1"))
    if (result.ok) throw new Error("Sessão sem ID foi aceita")
    expect(result.response.status).toBe(401)
  })

  it("nega membership revogada mesmo com JWT irrestrito e lojaId primária", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "GERENTE", lojaId: "L1", storeAccess: "all" } } as never)
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ active: true, role: "GERENTE" } as never)
    vi.mocked(prisma.adminUserStore.findUnique).mockResolvedValue(null)
    expect((await guardWhatsAppApiRead(request("header", "L1"))).ok).toBe(false)
    expect((await guardWhatsAppApiWrite(request("header", "L1"))).ok).toBe(false)
  })

  it.each([{ active: false, role: "ADMIN" }, { active: true, role: "TECNICO" }])("nega usuário/permissão revogada no banco: %j", async (user) => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(user as never)
    expect((await guardWhatsAppApiRead(request("header", "L1"))).ok).toBe(false)
  })

  it("preserva ADMIN global atual, mas exige loja real", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN", storeAccess: "all", platformAuthority: true } } as never)
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ active: true, role: "ADMIN" } as never)
    expect((await guardWhatsAppApiRead(request("header", "L1"))).ok).toBe(true)
    vi.mocked(prisma.store.findUnique).mockResolvedValue(null)
    expect((await guardWhatsAppApiRead(request("header", "inventada"))).ok).toBe(false)
  })

  it("falha fechada na indisponibilidade do banco", async () => {
    vi.mocked(prisma.adminUserStore.findUnique).mockRejectedValue(new Error("credencial"))
    const result = await guardWhatsAppApiRead(request("header", "L1"))
    if (result.ok) throw new Error("Falha do banco autorizou")
    expect(result.response.status).toBe(503)
    expect(await result.response.text()).not.toContain("credencial")
  })
})
