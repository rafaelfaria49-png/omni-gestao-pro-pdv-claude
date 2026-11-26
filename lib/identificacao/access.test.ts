import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const h = vi.hoisted(() => ({ module: vi.fn(), access: vi.fn(), list: vi.fn(), job: vi.fn(), pdf: vi.fn() }))
vi.mock("@/lib/auth/module-access", () => ({ requireModuleAction: h.module }))
vi.mock("@/lib/cadastros/cadastros-action-access", () => ({ requireCadastrosActionAccess: h.access }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("./service", () => ({ listTargets: h.list, getJob: h.job }))
vi.mock("./label-renderer.server", () => ({ renderLabelsPdf: h.pdf }))
import { getIdentificacaoStatus, listIdentificacaoTargets } from "@/app/actions/identificacao-etiquetas"
import { GET as getEtiquetasPdf } from "@/app/api/identificacao/etiquetas/[loteId]/route"

function enableProductionPilot() {
  vi.stubEnv("VERCEL_ENV", "production")
  vi.stubEnv("VESTUARIO_P03_ENABLED", "1")
  vi.stubEnv("VESTUARIO_P03_PRODUCTION_ENABLED", "1")
  vi.stubEnv("VESTUARIO_P03_STORE_ALLOWLIST", "a")
  vi.stubEnv("VESTUARIO_CATALOG_ENABLED", "1")
  vi.stubEnv("VESTUARIO_CATALOG_PRODUCTION_ENABLED", "1")
  vi.stubEnv("VESTUARIO_STORE_ALLOWLIST", "a,b")
}

function pdfRequest(storeId: string, loteId = "lote-a") {
  const url = new URL(`http://localhost/api/identificacao/etiquetas/${loteId}`)
  url.searchParams.set("storeId", storeId)
  return getEtiquetasPdf(new Request(url), { params: Promise.resolve({ loteId }) })
}

describe("actions P03: sessão, módulo, loja e gate antes de serviço", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VESTUARIO_P03_ENABLED", "1"); vi.stubEnv("VESTUARIO_P03_STORE_ALLOWLIST", "a,b")
    h.module.mockResolvedValue(undefined)
    h.access.mockImplementation(async storeId => ({ storeId, session: { user: { id: "user-a", name: "QA" } } }))
    h.list.mockResolvedValue({ ok: true, value: { items: [], limited: false } })
    h.job.mockResolvedValue({ ok: true, value: { id: "lote-a", snapshot: { items: [] } } })
    h.pdf.mockResolvedValue(Buffer.from("%PDF-synthetic"))
  })
  afterEach(() => vi.unstubAllEnvs())
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

  it("libera action e PDF privado somente para o piloto com sessão autorizada", async () => {
    enableProductionPilot()
    expect(await getIdentificacaoStatus("a")).toEqual({ enabled: true })
    expect(await listIdentificacaoTargets("a")).toMatchObject({ ok: true })
    const response = await pdfRequest("a")
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/pdf")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(h.job).toHaveBeenCalledWith({}, expect.objectContaining({ storeId: "a" }), "lote-a")
    expect(h.pdf).toHaveBeenCalledOnce()
  })

  it("recusa outra loja elegível à P02 antes de sessão, serviço e PDF", async () => {
    enableProductionPilot()
    expect(await listIdentificacaoTargets("b")).toMatchObject({ code: "UNTRUSTED" })
    const response = await pdfRequest("b")
    expect(response.status).toBe(403)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(h.module).not.toHaveBeenCalled()
    expect(h.access).not.toHaveBeenCalled()
    expect(h.list).not.toHaveBeenCalled()
    expect(h.job).not.toHaveBeenCalled()
    expect(h.pdf).not.toHaveBeenCalled()
  })

  it("recusa sessão sem autorização na loja piloto antes de serviço e PDF", async () => {
    enableProductionPilot()
    h.access.mockRejectedValue(new Error("store forbidden"))
    expect(await listIdentificacaoTargets("a")).toMatchObject({ code: "UNTRUSTED" })
    expect((await pdfRequest("a")).status).toBe(403)
    expect(h.list).not.toHaveBeenCalled()
    expect(h.job).not.toHaveBeenCalled()
    expect(h.pdf).not.toHaveBeenCalled()
  })

  it("consulta lote pelo contexto piloto e mantém 404 privado sem renderizar lote ausente", async () => {
    enableProductionPilot()
    h.job.mockResolvedValue({ ok: false, code: "NOT_FOUND" })
    const response = await pdfRequest("a", "lote-b")
    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(h.job).toHaveBeenCalledWith({}, expect.objectContaining({ storeId: "a" }), "lote-b")
    expect(h.pdf).not.toHaveBeenCalled()
  })

  it("desativar o opt-in recusa a mesma loja antes de sessão ou serviço", async () => {
    enableProductionPilot()
    expect(await getIdentificacaoStatus("a")).toEqual({ enabled: true })
    vi.clearAllMocks()
    vi.stubEnv("VESTUARIO_P03_PRODUCTION_ENABLED", "0")
    expect(await getIdentificacaoStatus("a")).toEqual({ enabled: false })
    expect((await pdfRequest("a")).status).toBe(403)
    expect(h.module).not.toHaveBeenCalled()
    expect(h.access).not.toHaveBeenCalled()
    expect(h.job).not.toHaveBeenCalled()
    expect(h.pdf).not.toHaveBeenCalled()
  })
})
