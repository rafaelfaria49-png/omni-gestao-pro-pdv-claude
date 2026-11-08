/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — autorização das rotas do catálogo por loja.
 *
 * Gates REAIS (`requireModuleApi`, `requireCadastrosHubApi`, permissões enterprise); só a sessão,
 * o selo de assinatura e a camada de dados são substituídos. Prova: A01/PLATFORM e STORE
 * autorizados gravam; STORE sem Cadastros/deviceCatalog recebe 403; loja cruzada recebe 403;
 * escrita sem loja explícita recebe 400; leitura sem loja cai para o catálogo global.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  session: null as unknown,
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  decide: vi.fn(),
  byKeys: vi.fn(),
  overrides: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth: async () => h.session }))
vi.mock("@/lib/api-auth", () => ({
  getVerifiedSubscriptionFromCookies: async () => ({ ok: true, vencimento: "2099-12-31", plano: "OURO", status: "ativa" }),
}))
vi.mock("@/lib/trusted-time", () => ({ getTrustedTimeMs: async () => Date.parse("2026-11-07T12:00:00Z") }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/catalogo-aparelhos/loja-catalogo-store", () => ({
  createLojaModelo: (...a: unknown[]) => h.create(...a),
  updateLojaModelo: (...a: unknown[]) => h.update(...a),
  listLojaModelos: (...a: unknown[]) => h.list(...a),
  setLojaCompatDecisao: (...a: unknown[]) => h.decide(...a),
  getLojaModelosByKeys: (...a: unknown[]) => h.byKeys(...a),
  listLojaCompatOverrides: (...a: unknown[]) => h.overrides(...a),
}))

import { GET as listGET, POST as createPOST } from "./route"
import { PATCH as updatePATCH } from "./[id]/route"
import { POST as compatPOST } from "../../peliculas/compat/route"
import { GET as searchGET } from "../search/route"

const LOJA_A = "loja-a"
const LOJA_B = "loja-b"
const STORE_MODULES = ["home", "pdv", "sales", "cash", "catalog", "stock", "service", "deviceCatalog"]

function platformAdmin() {
  return { user: { id: "u-platform", role: "ADMIN", platformAuthority: true, accessScope: "PLATFORM", allowedStoreIds: [] } }
}
function storeUser(role: string, modules = STORE_MODULES, stores = [LOJA_A]) {
  return {
    user: {
      id: `u-${role.toLowerCase()}`,
      role,
      accessScope: "STORE",
      lojaId: stores[0],
      storeAccess: "restricted",
      allowedStoreIds: stores,
      storeModules: Object.fromEntries(stores.map((s) => [s, modules])),
    },
  }
}

function post(url: string, body: unknown, loja: string | null = LOJA_A) {
  return new Request(`http://local${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(loja ? { "x-assistec-loja-id": loja } : {}) },
    body: JSON.stringify(body),
  })
}

const created = { ok: true, value: { id: "m1", modelKey: "manual_1", brand: "Marca", name: "G47", aliases: [], notes: "", active: true, version: 1, storeId: LOJA_A } }

beforeEach(() => {
  vi.clearAllMocks()
  h.create.mockResolvedValue(created)
  h.update.mockResolvedValue(created)
  h.list.mockResolvedValue([])
  h.decide.mockResolvedValue({ ok: true, value: { decisao: "adicionar", modelKeyA: "a", modelKeyB: "b" } })
  h.byKeys.mockResolvedValue([])
  h.overrides.mockResolvedValue([])
})

describe("POST /api/catalogo/aparelhos/modelos", () => {
  it("15. A01/PLATFORM autorizado cadastra na loja do header", async () => {
    h.session = platformAdmin()
    const res = await createPOST(post("/api/catalogo/aparelhos/modelos", { brand: "Marca", name: "G47" }))
    expect(res.status).toBe(201)
    expect(h.create.mock.calls[0][2]).toBe(LOJA_A)
    expect(h.create.mock.calls[0][3]).toBe("u-platform")
  })

  it("16. STORE autorizado (GERENTE com Cadastros + catálogo) cadastra na própria loja", async () => {
    h.session = storeUser("GERENTE")
    const res = await createPOST(post("/api/catalogo/aparelhos/modelos", { brand: "Marca", name: "G47" }))
    expect(res.status).toBe(201)
    expect(h.create.mock.calls[0][2]).toBe(LOJA_A)
  })

  it("17. STORE sem permissão (CAIXA, sem hub Cadastros) recebe 403 com orientação", async () => {
    h.session = storeUser("CAIXA")
    const res = await createPOST(post("/api/catalogo/aparelhos/modelos", { brand: "Marca", name: "G47" }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/gerente ou administrador/i)
    expect(h.create).not.toHaveBeenCalled()
  })

  it("17. STORE sem o módulo deviceCatalog recebe 403", async () => {
    h.session = storeUser("GERENTE", STORE_MODULES.filter((m) => m !== "deviceCatalog"))
    const res = await createPOST(post("/api/catalogo/aparelhos/modelos", { brand: "Marca", name: "G47" }))
    expect(res.status).toBe(403)
    expect(h.create).not.toHaveBeenCalled()
  })

  it("18. STORE da loja A não grava na loja B (header ou body)", async () => {
    h.session = storeUser("GERENTE")
    expect((await createPOST(post("/api/catalogo/aparelhos/modelos", { brand: "M", name: "G47" }, LOJA_B))).status).toBe(403)
    expect((await createPOST(post("/api/catalogo/aparelhos/modelos", { brand: "M", name: "G47", storeId: LOJA_B }))).status).toBe(403)
    expect(h.create).not.toHaveBeenCalled()
  })

  it("escrita sem loja explícita é recusada (sem fallback)", async () => {
    h.session = platformAdmin()
    const res = await createPOST(post("/api/catalogo/aparelhos/modelos", { brand: "M", name: "G47" }, null))
    expect(res.status).toBe(400)
    expect(h.create).not.toHaveBeenCalled()
  })

  it("sem sessão: 401", async () => {
    h.session = null
    expect((await createPOST(post("/api/catalogo/aparelhos/modelos", { brand: "M", name: "G47" }))).status).toBe(401)
  })
})

describe("PATCH /modelos/[id] e POST /peliculas/compat", () => {
  it("STORE autorizado edita e decide; CAIXA e loja cruzada não", async () => {
    const patch = (loja: string) =>
      updatePATCH(
        new Request("http://local/api/catalogo/aparelhos/modelos/m1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-assistec-loja-id": loja },
          body: JSON.stringify({ version: 1, active: false }),
        }),
        { params: Promise.resolve({ id: "m1" }) },
      )
    h.session = storeUser("GERENTE")
    expect((await patch(LOJA_A)).status).toBe(200)
    expect(h.update.mock.calls[0][2]).toBe(LOJA_A)
    expect((await patch(LOJA_B)).status).toBe(403)
    const decide = await compatPOST(post("/api/catalogo/peliculas/compat", { modelKey: "a", otherModelKey: "b", decisao: "suprimir", categoria: "capinha" }))
    expect(decide.status).toBe(200)
    // categoria é sempre forçada a película nesta rota
    expect((h.decide.mock.calls[0][4] as { categoria: string }).categoria).toBe("pelicula_tela")

    h.session = storeUser("CAIXA")
    expect((await patch(LOJA_A)).status).toBe(403)
    expect((await compatPOST(post("/api/catalogo/peliculas/compat", { modelKey: "a", otherModelKey: "b", decisao: "suprimir" }))).status).toBe(403)
    expect(h.update).toHaveBeenCalledTimes(1)
    expect(h.decide).toHaveBeenCalledTimes(1)
  })
})

describe("GET (leituras)", () => {
  it("busca usa os modelos da loja do header e cai para global sem loja", async () => {
    h.session = storeUser("VENDEDOR")
    const withStore = await searchGET(new Request("http://local/api/catalogo/aparelhos/search?q=G47", { headers: { "x-assistec-loja-id": LOJA_A } }))
    expect(withStore.status).toBe(200)
    expect(h.list.mock.calls[0][1]).toBe(LOJA_A)
    h.list.mockClear()
    h.session = platformAdmin()
    const noStore = await searchGET(new Request("http://local/api/catalogo/aparelhos/search?q=G47"))
    expect(noStore.status).toBe(200)
    expect(h.list).not.toHaveBeenCalled()
  })

  it("18. busca com header de loja não autorizada é negada (não vaza modelos)", async () => {
    h.session = storeUser("VENDEDOR")
    const res = await searchGET(new Request("http://local/api/catalogo/aparelhos/search?q=G47", { headers: { "x-assistec-loja-id": LOJA_B } }))
    expect(res.status).toBe(403)
    expect(h.list).not.toHaveBeenCalled()
  })

  it("lista de gestão exige Cadastros na loja", async () => {
    h.session = storeUser("CAIXA")
    const res = await listGET(new Request("http://local/api/catalogo/aparelhos/modelos?inativos=1", { headers: { "x-assistec-loja-id": LOJA_A } }))
    expect(res.status).toBe(403)
    h.session = storeUser("GERENTE")
    const ok = await listGET(new Request("http://local/api/catalogo/aparelhos/modelos?inativos=1", { headers: { "x-assistec-loja-id": LOJA_A } }))
    expect(ok.status).toBe(200)
    expect(h.list.mock.calls[0]).toEqual([{}, LOJA_A, { includeInactive: true }])
  })

  it("P3-2: corpo declarado acima de 16 KB é recusado antes de ler (400, nada gravado)", async () => {
    h.session = storeUser("GERENTE")
    const res = await createPOST(new Request("http://local/api/catalogo/aparelhos/modelos", {
      method: "POST",
      headers: { "x-assistec-loja-id": LOJA_A, "content-type": "application/json", "content-length": "20000" },
      body: JSON.stringify({ brand: "M", name: "G47" }),
    }))
    expect(res.status).toBe(400)
    expect(h.create).not.toHaveBeenCalled()
  })
})
