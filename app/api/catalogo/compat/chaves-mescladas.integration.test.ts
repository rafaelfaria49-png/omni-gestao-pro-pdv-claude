/**
 * COMPAT-CATALOGO-BRASIL-2023-2026-002 — linhas MESCLADAS do catálogo (ex.: "iPhone 17 Air" → "iPhone Air",
 * "iPhone 7 Branco" → "iPhone 7") não podem esconder o que a loja gravou com a chave antiga.
 *
 * Rotas REAIS (consulta de capinha, vínculos, busca de películas) contra PostgreSQL descartável:
 * só a sessão e o selo de assinatura são substituídos; o Prisma aponta para o banco de teste.
 * Gateado por `COMPAT_TEST_DATABASE_URL` (pula sem banco; recusa host que não seja 127.0.0.1/compat_*).
 * Os registros "antigos" são inseridos direto no banco, como estariam antes da mescla. Nada cria venda.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const TEST_URL = process.env.COMPAT_TEST_DATABASE_URL ?? ""
if (TEST_URL && !/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/compat_[a-z0-9_]+$/.test(TEST_URL)) {
  throw new Error("COMPAT_TEST_DATABASE_URL precisa ser um banco descartável local (compat_*).")
}

const h = vi.hoisted(() => ({ session: null as unknown }))
vi.mock("@/auth", () => ({ auth: async () => h.session }))
vi.mock("@/lib/api-auth", () => ({
  getVerifiedSubscriptionFromCookies: async () => ({ ok: true, vencimento: "2099-12-31", plano: "OURO", status: "ativa" }),
}))
vi.mock("@/lib/trusted-time", () => ({ getTrustedTimeMs: async () => Date.parse("2026-11-14T12:00:00Z") }))
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@/generated/prisma")
  const url = process.env.COMPAT_TEST_DATABASE_URL || "postgresql://nobody@127.0.0.1:1/compat_skip"
  return { prisma: new PrismaClient({ datasourceUrl: url }) }
})

import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { setLojaCompatDecisao } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import { addLocalizacao, createFileira, createPainel, setLocalizacaoPrincipal } from "@/lib/compat/compat-store"
import { GET as consultaGET } from "./consulta/route"
import { GET as vinculosGET } from "./vinculos/route"
import { GET as peliculasGET } from "../peliculas/search/route"

const MODS = ["home", "pdv", "sales", "cash", "catalog", "stock", "service", "deviceCatalog", "reports"]
const AIR = "apple_iphone_air"
const AIR_ANTIGO = "apple_iphone_17_air"
const P16 = "apple_iphone_16_pro"

describe.skipIf(!TEST_URL)("chaves mescladas — rotas reais em PostgreSQL descartável", () => {
  const run = `cm-${Date.now()}`
  const A = `${run}-a`
  const B = `${run}-b`
  const global = loadCatalogoIndex()
  let painelId = ""
  let fileiraId = ""
  const get = async (handler: (r: Request) => Promise<Response>, url: string, loja = A) => {
    const res = await handler(new Request(`http://local${url}`, { headers: { "x-assistec-loja-id": loja } }))
    return { status: res.status, body: (await res.json()) as Record<string, unknown> & { [k: string]: any } }
  }

  beforeAll(async () => {
    h.session = {
      user: {
        id: "u-gerente", role: "GERENTE", accessScope: "STORE", lojaId: A, storeAccess: "restricted",
        allowedStoreIds: [A, B], storeModules: { [A]: MODS, [B]: MODS },
      },
    }
    for (const id of [A, B]) {
      await prisma.store.create({ data: { id, name: `Loja ${id}`, cnpj: "00.000.000/0000-00", phone: "(00) 0000-0000" } })
    }
    // Produto detalhado vinculado à chave ANTIGA (antes da mescla).
    await prisma.produto.create({
      data: {
        id: `${run}-air`, storeId: A, name: "Capinha 17 Air azul", sku: `${run}-AIR`, price: 40, stock: 2,
        metadata: {
          acessorios: { version: 1, tipo: "capinha", exigeModelo: true, exigeCor: false, usaCoresPadrao: true, controle: "detalhado" },
          catalogoAparelhos: { version: 1, deviceModelKeys: [AIR_ANTIGO], deviceAliases: [], compatibilityStatus: "precisa_testar", compatibilityTypes: ["capinha"], reviewRequired: true, source: "manual", notes: "" },
        },
      },
    })
    // Vínculo de capinha e supressão de película gravados com chaves antigas.
    await prisma.catalogoAparelhoLojaCompat.createMany({
      data: [
        { storeId: A, categoria: "capinha", modelKeyA: P16, modelKeyB: AIR_ANTIGO, acao: "adicionar", status: "precisa_testar", notes: "antigo", origem: "", createdBy: "u", updatedBy: "u" },
        { storeId: A, categoria: "pelicula_tela", modelKeyA: "apple_iphone_7_branco", modelKeyB: "apple_iphone_8_branco", acao: "suprimir", status: "precisa_testar", notes: "", origem: "", createdBy: "u", updatedBy: "u" },
      ],
    })
    const painel = await createPainel(prisma, A, "u", { nome: "Painel M" })
    if (!painel.ok) throw new Error("painel")
    const fileira = await createFileira(prisma, A, "u", { painelId: painel.value.id, nome: "Fileira M" })
    if (!fileira.ok) throw new Error("fileira")
    painelId = painel.value.id
    fileiraId = fileira.value.id
    await prisma.compatLocalizacao.create({
      data: { storeId: A, modelKey: AIR_ANTIGO, painelId: painel.value.id, fileiraId: fileira.value.id, posicao: "", principal: true, createdBy: "u", updatedBy: "u" },
    })
  })

  afterAll(async () => {
    await prisma.compatLocalizacao.deleteMany({ where: { storeId: { in: [A, B] } } })
    await prisma.compatFileira.deleteMany({ where: { storeId: { in: [A, B] } } })
    await prisma.compatPainel.deleteMany({ where: { storeId: { in: [A, B] } } })
    await prisma.catalogoAparelhoLojaCompat.deleteMany({ where: { storeId: { in: [A, B] } } })
    await prisma.produto.deleteMany({ where: { storeId: { in: [A, B] } } })
    await prisma.compatPreferenciasLoja.deleteMany({ where: { storeId: { in: [A, B] } } })
    await prisma.store.deleteMany({ where: { id: { in: [A, B] } } })
    await prisma.$disconnect()
  })

  it("consulta de capinha pelo canônico acha produto, vínculo e localização gravados com a chave antiga", async () => {
    for (const chave of [AIR, AIR_ANTIGO]) {
      const { status, body } = await get(consultaGET, `/api/catalogo/compat/consulta?modelKey=${chave}`)
      expect(status).toBe(200)
      expect(body.modelo.modelKey).toBe(AIR)
      expect(body.produtos.detalhados.map((p: { id: string; vinculo: string }) => [p.id, p.vinculo])).toEqual([[`${run}-air`, "modelo"]])
      expect(body.capinhaGroups.flatMap((g: { members: { modelKey: string }[] }) => g.members.map((m) => m.modelKey))).toContain(P16)
      expect(body.localizacoes.map((l: { alvo: string; modelKey: string }) => [l.alvo, l.modelKey])).toEqual([["modelo", AIR]])
    }
    // A outra ponta do vínculo antigo enxerga o canônico (não a chave mesclada).
    const p16 = await get(consultaGET, `/api/catalogo/compat/consulta?modelKey=${P16}`)
    const membros = p16.body.capinhaGroups.flatMap((g: { members: { modelKey: string }[] }) => g.members.map((m) => m.modelKey))
    expect(membros).toContain(AIR)
    expect(membros).not.toContain(AIR_ANTIGO)
    expect(p16.body.produtos.detalhados.map((p: { viaModelo: string }) => p.viaModelo)).toEqual(["Apple iPhone Air"])
  })

  it("outra loja não herda nada disso", async () => {
    const { body } = await get(consultaGET, `/api/catalogo/compat/consulta?modelKey=${AIR}`, B)
    expect(body.produtos.detalhados).toEqual([])
    expect(body.localizacoes).toEqual([])
    expect(body.capinhaGroups).toEqual([])
  })

  it("vínculos: decisão antiga aparece no canônico", async () => {
    const cap = await get(vinculosGET, `/api/catalogo/compat/vinculos?categoria=capinha&modelKey=${AIR}`)
    expect(cap.body.vinculos.map((v: { modelKey: string; notes: string }) => [v.modelKey, v.notes])).toEqual([[P16, "antigo"]])
    const pel = await get(vinculosGET, `/api/catalogo/compat/vinculos?categoria=pelicula_tela&modelKey=apple_iphone_7`)
    expect(pel.body.vinculos.map((v: { modelKey: string; acao: string }) => [v.modelKey, v.acao])).toEqual([["apple_iphone_8", "suprimir"]])
  })

  it("película: supressão gravada nas linhas mescladas continua valendo; restaurar no canônico desfaz", async () => {
    const membros = (b: any) =>
      b.results[0].peliculaGroups.flatMap((g: { members: { modelKey: string }[] }) => g.members.map((m) => m.modelKey))
    const antes = await get(peliculasGET, `/api/catalogo/peliculas/search?modelKey=apple_iphone_7`)
    expect(antes.body.results[0].model.modelKey).toBe("apple_iphone_7")
    expect(membros(antes.body)).not.toContain("apple_iphone_8")
    expect(antes.body.results[0].suprimidosPelaLoja.map((m: { modelKey: string }) => m.modelKey)).toContain("apple_iphone_8")
    // chave mesclada abre o canônico
    const pelaAntiga = await get(peliculasGET, `/api/catalogo/peliculas/search?modelKey=apple_iphone_7_branco`)
    expect(pelaAntiga.body.results[0].model.modelKey).toBe("apple_iphone_7")

    const r = await setLojaCompatDecisao(prisma, global, A, "u", {
      categoria: "pelicula_tela", modelKey: "apple_iphone_7", otherModelKey: "apple_iphone_8", decisao: "restaurar",
    })
    expect(r.ok).toBe(true)
    expect(await prisma.catalogoAparelhoLojaCompat.count({ where: { storeId: A, categoria: "pelicula_tela" } })).toBe(0)
    const depois = await get(peliculasGET, `/api/catalogo/peliculas/search?modelKey=apple_iphone_7`)
    expect(membros(depois.body)).toContain("apple_iphone_8")
    expect(depois.body.results[0].suprimidosPelaLoja).toEqual([])
  })

  it("localização: chave antiga e canônica são um grupo só (endereço, principal, nova grava no canônico)", async () => {
    // mesmo endereço pela chave canônica = a localização antiga (não duplica)
    const mesma = await addLocalizacao(prisma, global, A, "u", { modelKey: AIR, painelId, fileiraId })
    expect(mesma).toMatchObject({ ok: true, value: { existente: true } })
    // outro endereço: grava no canônico e não nasce principal (o grupo já tem uma)
    const p2 = await createPainel(prisma, A, "u", { nome: "Painel M2" })
    if (!p2.ok) throw new Error("p2")
    const nova = await addLocalizacao(prisma, global, A, "u", { modelKey: AIR_ANTIGO, painelId: p2.value.id })
    if (!nova.ok) throw new Error("nova")
    const linha = await prisma.compatLocalizacao.findUnique({ where: { id: nova.value.id } })
    expect(linha).toMatchObject({ modelKey: AIR, principal: false })
    const principais = () => prisma.compatLocalizacao.count({ where: { storeId: A, modelKey: { in: [AIR, AIR_ANTIGO] }, principal: true } })
    expect(await principais()).toBe(1)
    // tornar principal a nova desmarca a antiga
    expect(await setLocalizacaoPrincipal(prisma, A, nova.value.id, global)).toMatchObject({ ok: true })
    expect(await principais()).toBe(1)
    expect((await prisma.compatLocalizacao.findUnique({ where: { id: nova.value.id } }))?.principal).toBe(true)
  })

  it("editar só o status de um vínculo antigo preserva observação e origem", async () => {
    await prisma.catalogoAparelhoLojaCompat.create({
      data: { storeId: A, categoria: "capinha", modelKeyA: "apple_iphone_7_preto", modelKeyB: "apple_iphone_8", acao: "adicionar", status: "precisa_testar", notes: "legado", origem: "balcão", createdBy: "u", updatedBy: "u" },
    })
    const r = await setLojaCompatDecisao(prisma, global, A, "u", {
      categoria: "capinha", modelKey: "apple_iphone_7", otherModelKey: "apple_iphone_8", decisao: "adicionar", status: "nao_recomendado",
    })
    expect(r.ok).toBe(true)
    const cap = await get(vinculosGET, `/api/catalogo/compat/vinculos?categoria=capinha&modelKey=apple_iphone_7`)
    expect(cap.body.vinculos.map((v: { modelKey: string; status: string; notes: string; origem: string }) => [v.modelKey, v.status, v.notes, v.origem])).toEqual([
      ["apple_iphone_8", "nao_recomendado", "legado", "balcão"],
    ])
  })

  it("nova decisão em chave mesclada é gravada no canônico; a canônica prevalece sobre a antiga", async () => {
    const r = await setLojaCompatDecisao(prisma, global, A, "u", {
      categoria: "capinha", modelKey: AIR_ANTIGO, otherModelKey: P16, decisao: "adicionar", notes: "novo",
    })
    expect(r).toMatchObject({ ok: true, value: { modelKeyA: P16, modelKeyB: AIR } })
    const cap = await get(vinculosGET, `/api/catalogo/compat/vinculos?categoria=capinha&modelKey=${AIR}`)
    expect(cap.body.vinculos.map((v: { modelKey: string; notes: string }) => [v.modelKey, v.notes])).toEqual([[P16, "novo"]])
    // linha antiga preservada (não é apagada por uma nova decisão)
    expect(await prisma.catalogoAparelhoLojaCompat.count({ where: { storeId: A, categoria: "capinha", modelKeyA: P16, modelKeyB: { in: [AIR, AIR_ANTIGO] } } })).toBe(2)
  })
})
