import { beforeEach, describe, expect, it, vi } from "vitest"
const h = vi.hoisted(() => ({ module: vi.fn(), access: vi.fn(), list: vi.fn() }))
vi.mock("@/lib/auth/module-access", () => ({ requireModuleAction: h.module }))
vi.mock("@/lib/cadastros/cadastros-action-access", () => ({ requireCadastrosActionAccess: h.access }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("./service", () => ({ listTargets: h.list }))
import { getIdentificacaoStatus, listIdentificacaoTargets } from "@/app/actions/identificacao-etiquetas"
describe("actions P03: sessão, módulo, loja e gate antes de serviço", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VESTUARIO_P03_ENABLED", "1"); vi.stubEnv("VESTUARIO_P03_STORE_ALLOWLIST", "a,b")
    h.module.mockResolvedValue(undefined)
    h.access.mockImplementation(async storeId => ({ storeId, session: { user: { id: "user-a", name: "QA" } } }))
    h.list.mockResolvedValue({ ok: true, value: { items: [], limited: false } })
  })
  it("Production não consulta sessão nem banco, mesmo com allowlist e opt-in P02", async () => {
    vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("VESTUARIO_CATALOG_PRODUCTION_ENABLED", "1")
    expect(await getIdentificacaoStatus("a")).toEqual({ enabled: false })
    expect(await listIdentificacaoTargets("a")).toMatchObject({ code: "UNTRUSTED" })
    expect(h.module).not.toHaveBeenCalled(); expect(h.access).not.toHaveBeenCalled(); expect(h.list).not.toHaveBeenCalled()
  })
  it("loja fora da allowlist não chega a sessão", async () => {
    expect(await getIdentificacaoStatus("a-prefixo")).toEqual({ enabled: false })
    expect(h.module).not.toHaveBeenCalled()
  })
  it("sem sessão, módulo ou permissão multiloja não chega ao serviço", async () => {
    h.access.mockRejectedValue(new Error("forbidden"))
    expect(await listIdentificacaoTargets("b")).toMatchObject({ code: "UNTRUSTED" })
    expect(h.list).not.toHaveBeenCalled()
    h.access.mockResolvedValue({ storeId: "a", session: null })
    expect(await getIdentificacaoStatus("a")).toEqual({ enabled: false })
    h.module.mockRejectedValue(new Error("catalog module denied"))
    expect(await getIdentificacaoStatus("a")).toEqual({ enabled: false })
  })
  it("serviço recebe só contexto derivado do servidor", async () => {
    expect(await listIdentificacaoTargets("a", "camiseta")).toMatchObject({ ok: true })
    expect(h.module).toHaveBeenCalledWith("a", "catalog")
    expect(h.access).toHaveBeenCalledWith("a", "hub")
    expect(h.list).toHaveBeenCalledWith({}, { storeId: "a", principal: { userId: "user-a", displayLabel: "QA" } }, "camiseta")
  })
})
