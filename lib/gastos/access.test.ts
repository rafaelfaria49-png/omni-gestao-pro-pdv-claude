import { beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { requireFinanceiroPerfilAccess, revalidateFinanceiroContexto } from "./access"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => {
  // RLS: o perfil PESSOAL é lido numa transação que declara o dono (set_config local).
  const prisma: Record<string, unknown> = {
    adminUser: { findUnique: vi.fn() }, financeiroPerfil: { findFirst: vi.fn() }, $queryRaw: vi.fn(async () => []),
  }
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})

const login = (userId = "u1", allowedStoreIds = ["L1"]) => vi.mocked(auth).mockResolvedValue({
  user: { id: userId, role: "ADMIN", storeAccess: "restricted", allowedStoreIds },
} as never)
const pessoal = { tipo: "PESSOAL", perfilId: "P1" }

beforeEach(() => {
  vi.clearAllMocks()
  login()
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ active: true, role: "ADMIN" } as never)
  vi.mocked(prisma.financeiroPerfil.findFirst).mockResolvedValue({
    id: "P1", tipo: "PESSOAL", storeId: null, ownerAdminUserId: "u1",
  } as never)
})

describe("contexto financeiro privado", () => {
  it("exige sessão com identidade, mesmo com ID fornecido pelo cliente", async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await requireFinanceiroPerfilAccess({ ...pessoal, userId: "u1" })).toMatchObject({ ok: false, status: 401 })
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    { ...pessoal, ownerAdminUserId: "u1" }, { ...pessoal, storeId: "L1" },
    { ...pessoal, userId: "u1" }, { tipo: "EMPRESA", perfilId: "E1" },
    { tipo: "EMPRESA", perfilId: "E1", storeId: "" }, null,
  ])("nega seletores forjados/incompletos: %j", async (input) => {
    expect(await requireFinanceiroPerfilAccess(input)).toMatchObject({ ok: false, status: 403 })
    expect(prisma.financeiroPerfil.findFirst).not.toHaveBeenCalled()
  })

  it("PESSOAL continua válido sem acesso a qualquer loja", async () => {
    login("u1", [])
    const result = await requireFinanceiroPerfilAccess(pessoal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("Esperado contexto pessoal")
    expect(result.contexto).toMatchObject({ tipo: "PESSOAL", ownerAdminUserId: "u1" })
    expect("storeId" in result.contexto).toBe(false)
    expect(Object.isFrozen(result.contexto)).toBe(true)
    expect((await revalidateFinanceiroContexto(result.contexto)).ok).toBe(true)
    expect((await revalidateFinanceiroContexto({ ...result.contexto })).ok).toBe(false)
    expect((await revalidateFinanceiroContexto(JSON.parse(JSON.stringify(result.contexto)))).ok).toBe(false)
  })

  it("nega contexto emitido para outra sessão, mesmo se ambos têm acesso ao perfil", async () => {
    const result = await requireFinanceiroPerfilAccess(pessoal)
    if (!result.ok) throw new Error("Esperado contexto")
    login("u2")
    expect((await revalidateFinanceiroContexto(result.contexto)).ok).toBe(false)
  })

  it("recarrega atividade e papel do banco, sem confiar em ADMIN antigo no JWT", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({ active: false, role: "ADMIN" } as never)
    expect((await requireFinanceiroPerfilAccess(pessoal)).ok).toBe(false)
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce({ active: true, role: "VENDEDOR" } as never)
    expect((await requireFinanceiroPerfilAccess(pessoal, "edit")).ok).toBe(false)
  })

  it("mantém a restrição de loja da sessão para EMPRESA", async () => {
    expect((await requireFinanceiroPerfilAccess({ tipo: "EMPRESA", perfilId: "E2", storeId: "L2" })).ok).toBe(false)
    expect(prisma.financeiroPerfil.findFirst).not.toHaveBeenCalled()
  })

  it("reconciliação main: EMPRESA exige o módulo finance contratado para a loja", async () => {
    const empresa = { tipo: "EMPRESA", perfilId: "E1", storeId: "L1" }
    vi.mocked(prisma.financeiroPerfil.findFirst).mockResolvedValue({
      id: "E1", tipo: "EMPRESA", storeId: "L1", ownerAdminUserId: null,
    } as never)
    vi.mocked(auth).mockResolvedValue({ user: {
      id: "u1", role: "ADMIN", storeAccess: "restricted", allowedStoreIds: ["L1"], storeModules: { L1: ["home", "pdv"] },
    } } as never)
    expect((await requireFinanceiroPerfilAccess(empresa)).ok).toBe(false)
    expect(prisma.financeiroPerfil.findFirst).not.toHaveBeenCalled()
    vi.mocked(auth).mockResolvedValue({ user: {
      id: "u1", role: "ADMIN", storeAccess: "restricted", allowedStoreIds: ["L1"], storeModules: { L1: ["home", "finance"] },
    } } as never)
    expect((await requireFinanceiroPerfilAccess(empresa)).ok).toBe(true)
  })

  it("RLS: o perfil PESSOAL é lido declarando como dono o usuário da SESSÃO; EMPRESA não declara", async () => {
    const raw = (prisma as unknown as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw
    raw.mockClear()
    await requireFinanceiroPerfilAccess({ ...pessoal, perfilId: "P1" })
    const chamada = raw.mock.calls.find(c => String((c[0] as TemplateStringsArray).join("?")).includes("app.gm_owner_user"))
    expect(chamada?.slice(1)).toEqual(["u1"])
    raw.mockClear()
    vi.mocked(prisma.financeiroPerfil.findFirst).mockResolvedValue({ id: "E1", tipo: "EMPRESA", storeId: "L1", ownerAdminUserId: null } as never)
    vi.mocked(auth).mockResolvedValue({ user: {
      id: "u1", role: "ADMIN", storeAccess: "restricted", allowedStoreIds: ["L1"], storeModules: { L1: ["finance"] },
    } } as never)
    expect((await requireFinanceiroPerfilAccess({ tipo: "EMPRESA", perfilId: "E1", storeId: "L1" })).ok).toBe(true)
    expect(raw).not.toHaveBeenCalled()
  })

  it("não diferencia perfil ausente de perfil privado de outro dono", async () => {
    vi.mocked(prisma.financeiroPerfil.findFirst).mockResolvedValue(null)
    expect(await requireFinanceiroPerfilAccess(pessoal)).toEqual(
      await requireFinanceiroPerfilAccess({ tipo: "PESSOAL", perfilId: "outro-id" }),
    )
  })

  it("falha fechada quando o banco está indisponível, sem detalhes internos", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockRejectedValue(new Error("segredo de conexão"))
    const result = await requireFinanceiroPerfilAccess(pessoal)
    expect(result).toMatchObject({ ok: false, status: 503 })
    expect(JSON.stringify(result)).not.toContain("segredo")
  })
})
