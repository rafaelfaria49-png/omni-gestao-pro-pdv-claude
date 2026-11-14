/**
 * COMPAT-PROFISSIONAL-001 — autorização e isolamento das rotas do Compat.
 *
 * Gates REAIS (`requireModuleApi`, `requireCadastrosHubApi`, permissões enterprise); só a sessão,
 * o selo de assinatura e a camada de dados são substituídos. Prova: gerente com Cadastros +
 * `deviceCatalog` grava na própria loja; CAIXA, loja cruzada e sem módulo recebem 403; escrita sem
 * loja explícita recebe 400; relatório exige também o módulo de Relatórios.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

const h = vi.hoisted(() => ({
  session: null as unknown,
  store: {} as Record<string, Mock<(...a: unknown[]) => unknown>>,
  decide: vi.fn(),
  overrides: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth: async () => h.session }))
vi.mock("@/lib/api-auth", () => ({
  getVerifiedSubscriptionFromCookies: async () => ({ ok: true, vencimento: "2099-12-31", plano: "OURO", status: "ativa" }),
}))
vi.mock("@/lib/trusted-time", () => ({ getTrustedTimeMs: async () => Date.parse("2026-11-13T12:00:00Z") }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    venda: { findMany: vi.fn(async () => []) },
    movimentacaoEstoque: { findMany: vi.fn(async () => []) },
    produto: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock("@/lib/catalogo-aparelhos/loja-catalogo-store", () => ({
  setLojaCompatDecisao: (...a: unknown[]) => h.decide(...a),
  listLojaCompatOverrides: (...a: unknown[]) => h.overrides(...a),
  getLojaModelosByKeys: async () => [],
  errorCode: () => "",
  isUnavailable: () => false,
}))
vi.mock("@/lib/compat/compat-store", () => {
  const names = [
    "createPainel", "createFileira", "updateLocal", "deleteLocal", "moverLocal", "listOrganizacao", "getPreferencias",
    "setPreferencias", "listCoresLoja", "createCorLoja", "updateCorLoja", "setCorPadraoAtiva", "addLocalizacao",
    "listLocalizacoes", "removeLocalizacao", "setLocalizacaoPrincipal", "listProdutosCapinha", "listDevolucoesPorVenda",
  ]
  return Object.fromEntries(names.map((n) => [n, (...a: unknown[]) => h.store[n](...a)]))
})

import { GET as orgGET, POST as orgPOST } from "./organizacao/route"
import { DELETE as localDELETE } from "./organizacao/[tipo]/[id]/route"
import { GET as coresGET, POST as coresPOST } from "./cores/route"
import { POST as locPOST } from "./localizacoes/route"
import { POST as vincPOST } from "./vinculos/route"
import { GET as relGET } from "./relatorio/route"
import { GET as consultaGET } from "./consulta/route"

const LOJA_A = "loja-a"
const LOJA_B = "loja-b"
const MODS = ["home", "pdv", "sales", "cash", "catalog", "stock", "service", "deviceCatalog", "reports"]

function storeUser(role: string, modules = MODS, stores = [LOJA_A]) {
  return {
    user: {
      id: `u-${role.toLowerCase()}`, role, accessScope: "STORE", lojaId: stores[0], storeAccess: "restricted",
      allowedStoreIds: stores, storeModules: Object.fromEntries(stores.map((s) => [s, modules])),
    },
  }
}

function req(url: string, method = "GET", body?: unknown, loja: string | null = LOJA_A) {
  return new Request(`http://local${url}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(loja ? { "x-assistec-loja-id": loja } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

const ok = (value: object) => ({ ok: true, value })

beforeEach(() => {
  vi.clearAllMocks()
  for (const n of ["createPainel", "createFileira", "createCorLoja", "addLocalizacao", "updateLocal", "deleteLocal", "moverLocal",
    "updateCorLoja", "setCorPadraoAtiva", "setPreferencias", "removeLocalizacao", "setLocalizacaoPrincipal"]) {
    h.store[n] = vi.fn(async () => ok({ id: "x" }))
  }
  h.store.listOrganizacao = vi.fn(async () => [])
  h.store.getPreferencias = vi.fn(async () => ({ posicoesHabilitadas: false, modoModeloPadrao: "opcional", modoCorPadrao: "opcional", version: 0 }))
  h.store.listCoresLoja = vi.fn(async () => [])
  h.store.listLocalizacoes = vi.fn(async () => [])
  h.store.listProdutosCapinha = vi.fn(async () => [])
  h.store.listDevolucoesPorVenda = vi.fn(async () => new Map())
  h.decide.mockResolvedValue({ ok: true, value: { decisao: "adicionar", modelKeyA: "a", modelKeyB: "b" } })
  h.overrides.mockResolvedValue([])
})

describe("escrita do Compat", () => {
  it("GERENTE com Cadastros + deviceCatalog grava na própria loja (painel, cor, localização, vínculo)", async () => {
    h.session = storeUser("GERENTE")
    expect((await orgPOST(req("/api/catalogo/compat/organizacao", "POST", { tipo: "painel", nome: "Painel 1" }))).status).toBe(201)
    expect(h.store.createPainel.mock.calls[0][1]).toBe(LOJA_A)
    expect((await coresPOST(req("/api/catalogo/compat/cores", "POST", { label: "Azul bebê" }))).status).toBe(201)
    expect((await locPOST(req("/api/catalogo/compat/localizacoes", "POST", { modelKey: "m", painelId: "p" }))).status).toBe(201)
    const v = await vincPOST(req("/api/catalogo/compat/vinculos", "POST", { categoria: "capinha", modelKey: "a", otherModelKeys: ["b", "c"], decisao: "adicionar" }))
    expect(v.status).toBe(200)
    expect(h.decide).toHaveBeenCalledTimes(2)
    expect(h.decide.mock.calls[0][2]).toBe(LOJA_A)
    expect(h.decide.mock.calls[0][4]).toMatchObject({ categoria: "capinha" })
  })

  it("CAIXA (sem Cadastros) recebe 403 e nada é gravado", async () => {
    h.session = storeUser("CAIXA")
    expect((await orgPOST(req("/api/catalogo/compat/organizacao", "POST", { tipo: "painel", nome: "P" }))).status).toBe(403)
    expect((await coresPOST(req("/api/catalogo/compat/cores", "POST", { label: "X" }))).status).toBe(403)
    expect(h.store.createPainel).not.toHaveBeenCalled()
    expect(h.store.createCorLoja).not.toHaveBeenCalled()
  })

  it("sem módulo deviceCatalog: 403", async () => {
    h.session = storeUser("GERENTE", MODS.filter((m) => m !== "deviceCatalog"))
    expect((await locPOST(req("/api/catalogo/compat/localizacoes", "POST", { modelKey: "m", painelId: "p" }))).status).toBe(403)
    expect(h.store.addLocalizacao).not.toHaveBeenCalled()
  })

  it("loja cruzada (header ou body) recebe 403", async () => {
    h.session = storeUser("GERENTE")
    expect((await orgPOST(req("/api/catalogo/compat/organizacao", "POST", { tipo: "painel", nome: "P" }, LOJA_B))).status).toBe(403)
    expect((await orgPOST(req("/api/catalogo/compat/organizacao", "POST", { tipo: "painel", nome: "P", storeId: LOJA_B }))).status).toBe(403)
    expect(
      (await localDELETE(req("/api/catalogo/compat/organizacao/painel/p1", "DELETE", undefined, LOJA_B), { params: Promise.resolve({ tipo: "painel", id: "p1" }) })).status,
    ).toBe(403)
    expect(h.store.createPainel).not.toHaveBeenCalled()
    expect(h.store.deleteLocal).not.toHaveBeenCalled()
  })

  it("escrita sem loja explícita: 400 (sem fallback)", async () => {
    h.session = storeUser("GERENTE")
    expect((await coresPOST(req("/api/catalogo/compat/cores", "POST", { label: "X" }, null))).status).toBe(400)
    expect(h.store.createCorLoja).not.toHaveBeenCalled()
  })

  it("vínculos: categoria inválida e lote vazio recusados antes de gravar", async () => {
    h.session = storeUser("GERENTE")
    expect((await vincPOST(req("/api/catalogo/compat/vinculos", "POST", { categoria: "tela", modelKey: "a", otherModelKeys: ["b"], decisao: "adicionar" }))).status).toBe(400)
    expect((await vincPOST(req("/api/catalogo/compat/vinculos", "POST", { categoria: "capinha", modelKey: "a", otherModelKeys: [], decisao: "adicionar" }))).status).toBe(400)
    expect(h.decide).not.toHaveBeenCalled()
  })

  it("sem sessão: 401", async () => {
    h.session = null
    expect((await orgPOST(req("/api/catalogo/compat/organizacao", "POST", { tipo: "painel", nome: "P" }))).status).toBe(401)
  })
})

describe("leitura do Compat", () => {
  it("gestão lê só a própria loja; loja cruzada 403", async () => {
    h.session = storeUser("GERENTE")
    expect((await orgGET(req("/api/catalogo/compat/organizacao"))).status).toBe(200)
    expect(h.store.listOrganizacao.mock.calls[0][1]).toBe(LOJA_A)
    expect((await orgGET(req("/api/catalogo/compat/organizacao", "GET", undefined, LOJA_B))).status).toBe(403)
  })

  it("PDV (cores): VENDEDOR lê a própria loja; loja não autorizada é negada (não vaza)", async () => {
    h.session = storeUser("VENDEDOR", MODS, [LOJA_A])
    const r = await coresGET(req("/api/catalogo/compat/cores", "GET", undefined, LOJA_B))
    // `requireModuleApi` recusa identificador de loja não autorizado
    expect(r.status).toBe(403)
    const own = await coresGET(req("/api/catalogo/compat/cores"))
    expect(own.status).toBe(200)
    expect((await own.json()).cores.length).toBe(18)
  })

  it("PDV (cores): CAIXA sem deviceCatalog lê as cores da própria loja, mas não grava nem lê outra loja", async () => {
    h.session = storeUser("CAIXA", ["home", "pdv", "sales", "cash"], [LOJA_A])
    const own = await coresGET(req("/api/catalogo/compat/cores"))
    expect(own.status).toBe(200)
    expect(h.store.listCoresLoja.mock.calls[0][1]).toBe(LOJA_A)
    expect((await coresGET(req("/api/catalogo/compat/cores", "GET", undefined, LOJA_B))).status).toBe(403)
    expect((await coresPOST(req("/api/catalogo/compat/cores", "POST", { label: "X" }))).status).toBe(403)
    expect(h.store.createCorLoja).not.toHaveBeenCalled()
  })

  it("relatório exige o módulo de Relatórios", async () => {
    h.session = storeUser("GERENTE", MODS.filter((m) => m !== "reports"))
    expect((await relGET(req("/api/catalogo/compat/relatorio?dias=30"))).status).toBe(403)
    h.session = storeUser("GERENTE")
    expect((await relGET(req("/api/catalogo/compat/relatorio?dias=30"))).status).toBe(200)
  })

  it("consulta exige modelo existente", async () => {
    h.session = storeUser("GERENTE")
    expect((await consultaGET(req("/api/catalogo/compat/consulta"))).status).toBe(400)
    expect((await consultaGET(req("/api/catalogo/compat/consulta?modelKey=nao_existe"))).status).toBe(404)
    const okRes = await consultaGET(req("/api/catalogo/compat/consulta?modelKey=samsung_galaxy_a05"))
    expect(okRes.status).toBe(200)
    expect((await okRes.json()).modelo.hierarquia).toEqual({ fabricante: "Samsung", marca: "Galaxy", linha: "A" })
  })
})
