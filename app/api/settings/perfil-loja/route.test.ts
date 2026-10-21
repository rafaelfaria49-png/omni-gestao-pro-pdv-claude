import { beforeEach, describe, expect, it, vi } from "vitest"
const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  store: vi.fn(async (): Promise<unknown> => ({ profile: "ASSISTENCIA" })),
  settings: vi.fn(async (): Promise<unknown> => null),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({ prisma: { store: { findUnique: h.store }, storeSettings: { findUnique: h.settings } } }))
import { GET, PUT } from "./route"
const req = () => new Request("http://localhost/api/settings/perfil-loja", { headers: { "x-assistec-loja-id": "loja-a" } })
beforeEach(() => {
  vi.clearAllMocks()
  h.auth.mockResolvedValue({ user: { id: "u1", role: "ADMIN", storeAccess: "restricted", allowedStoreIds: ["loja-a"] } })
  h.store.mockResolvedValue({ profile: "ASSISTENCIA" })
  h.settings.mockResolvedValue(null)
})
describe("Adapter legado do ramo — mesma fonte e mesmo isolamento", () => {
  it("sem autenticação não consulta banco", async () => {
    h.auth.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
    expect(h.store).not.toHaveBeenCalled()
  })
  it("sem acesso à loja não consulta configurações", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1", role: "ADMIN", storeAccess: "restricted", allowedStoreIds: ["loja-b"] } })
    expect((await GET(req())).status).toBe(403)
    expect(h.settings).not.toHaveBeenCalled()
  })
  it("padaria canônica prevalece sobre perfil legado de assistência", async () => {
    h.settings.mockResolvedValue({ printerConfig: { capabilities: { version: 1, business: { primaryBranch: "padaria" } } } })
    expect(await (await GET(req())).json()).toMatchObject({ lojaId: "loja-a", perfilLoja: "variedades", mostraTecnicoLaudoOs: false })
    expect(h.settings).toHaveBeenCalledWith({ where: { storeId: "loja-a" } })
  })
  it("assistência é recurso independente do ramo", async () => {
    h.settings.mockResolvedValue({ printerConfig: { capabilities: { version: 1, business: { primaryBranch: "variedades" }, overrides: { "service.technical": true } } } })
    expect(await (await GET(req())).json()).toMatchObject({ perfilLoja: "variedades", mostraTecnicoLaudoOs: true })
  })
  it("ausência de configuração preserva assistência existente", async () => {
    expect(await (await GET(req())).json()).toMatchObject({ perfilLoja: "assistencia", mostraTecnicoLaudoOs: true })
  })
  it("ramo desconhecido fora do contrato usa o perfil legado em vez de 500", async () => {
    h.settings.mockResolvedValue({ printerConfig: { capabilities: { version: 1, business: { primaryBranch: "inventado" } } } })
    const result = await GET(req())
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ perfilLoja: "assistencia", mostraTecnicoLaudoOs: true })
  })
  it("falha de leitura não inventa loja ou perfil", async () => {
    h.settings.mockRejectedValueOnce(new Error("offline"))
    const result = await GET(req())
    expect(result.status).toBe(500)
    expect(await result.json()).not.toHaveProperty("perfilLoja")
  })
  it("loja inexistente não recebe um perfil de assistência inventado", async () => {
    h.store.mockResolvedValue(null)
    const result = await GET(req())
    expect(result.status).toBe(404)
    expect(await result.json()).not.toHaveProperty("perfilLoja")
    expect(h.settings).not.toHaveBeenCalled()
  })
  it("adapter não é outro editor de configuração", async () => {
    expect((await PUT(req())).status).toBe(405)
  })
})
