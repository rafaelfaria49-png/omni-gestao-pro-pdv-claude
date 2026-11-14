/**
 * COMPAT-PROFISSIONAL-001 — integração REAL contra PostgreSQL descartável.
 *
 * Gateado por `COMPAT_TEST_DATABASE_URL` (pula sem banco). O alvo precisa ser um banco descartável
 * em 127.0.0.1 com o schema da main + a migration 20261113120000 aplicada; qualquer outro host é
 * recusado antes da primeira consulta. Usa o catálogo global REAL (CSVs versionados).
 * Nada aqui cria venda, movimenta estoque ou toca fiscal: produtos são sintéticos e só lidos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { buildCapinhaGrupos } from "@/lib/catalogo-aparelhos/loja-catalogo"
import {
  createLojaModelo,
  listLojaCompatOverrides,
  setLojaCompatDecisao,
  updateLojaModelo,
} from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import {
  addLocalizacao,
  createCorLoja,
  createFileira,
  createPainel,
  deleteLocal,
  getPreferencias,
  listCoresLoja,
  listLocalizacoes,
  listOrganizacao,
  listDevolucoesPorVenda,
  listProdutosCapinha,
  moverLocal,
  removeLocalizacao,
  setCorPadraoAtiva,
  setLocalizacaoPrincipal,
  setPreferencias,
  updateCorLoja,
  updateLocal,
} from "./compat-store"
import { coresEfetivas } from "./cores-loja"
import { montarRelatorioCapinhas } from "./capinhas"
import { corPadraoDesativadaNaVenda } from "./venda-cores-guard"

const TEST_URL = process.env.COMPAT_TEST_DATABASE_URL ?? ""
if (TEST_URL && !/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/compat_[a-z0-9_]+$/.test(TEST_URL)) {
  throw new Error("COMPAT_TEST_DATABASE_URL precisa ser um banco descartável local (compat_*).")
}

describe.skipIf(!TEST_URL)("Compat profissional — PostgreSQL descartável", () => {
  const db = new PrismaClient({ datasourceUrl: TEST_URL })
  const run = `cp-${Date.now()}`
  const A = `${run}-a`
  const B = `${run}-b`
  const global = loadCatalogoIndex()
  const A05 = "samsung_galaxy_a05"
  const A06 = "samsung_galaxy_a06"
  const A05S = "samsung_galaxy_a05s"

  beforeAll(async () => {
    for (const id of [A, B]) {
      await db.store.create({ data: { id, name: `Loja ${id}`, cnpj: "00.000.000/0000-00", phone: "(00) 0000-0000" } })
    }
    await db.produto.createMany({
      data: [
        {
          id: `${run}-gen`, storeId: A, name: "Capinha transparente", sku: `${run}-T`, price: 30, stock: 40,
          metadata: { acessorios: { version: 1, tipo: "capinha", exigeModelo: false, exigeCor: false, usaCoresPadrao: true, modoModelo: "opcional", modoCor: "opcional" } },
        },
        {
          id: `${run}-det`, storeId: A, name: "Capinha A06 preta", sku: `${run}-D`, price: 35, stock: 3,
          metadata: { catalogoAparelhos: { version: 1, deviceModelKeys: [A06], deviceAliases: [], compatibilityStatus: "precisa_testar", compatibilityTypes: ["capinha"], reviewRequired: true, source: "manual", notes: "" } },
        },
        {
          id: `${run}-pel`, storeId: A, name: "Película A06", sku: `${run}-P`, price: 20, stock: 9,
          metadata: { catalogoAparelhos: { version: 1, deviceModelKeys: [A06], deviceAliases: [], compatibilityStatus: "precisa_testar", compatibilityTypes: ["pelicula_tela"], reviewRequired: true, source: "manual", notes: "" } },
        },
        {
          id: `${run}-genB`, storeId: B, name: "Capinha loja B", sku: `${run}-B`, price: 30, stock: 7,
          metadata: { acessorios: { version: 1, tipo: "capinha", exigeModelo: false, exigeCor: false, usaCoresPadrao: true } },
        },
      ],
    })
  })

  afterAll(async () => {
    const lojas = { storeId: { in: [A, B] } }
    await db.compatLocalizacao.deleteMany({ where: lojas })
    await db.compatFileira.deleteMany({ where: lojas })
    await db.compatPainel.deleteMany({ where: lojas })
    await db.compatCorLoja.deleteMany({ where: lojas })
    await db.compatPreferenciasLoja.deleteMany({ where: lojas })
    await db.catalogoAparelhoLojaCompat.deleteMany({ where: lojas })
    await db.catalogoAparelhoLojaModelo.deleteMany({ where: lojas })
    await db.devolucaoVenda.deleteMany({ where: lojas })
    await db.venda.deleteMany({ where: lojas })
    await db.produto.deleteMany({ where: lojas })
    await db.store.deleteMany({ where: { id: { in: [A, B] } } })
    await db.$disconnect()
  })

  // ── Modelos ────────────────────────────────────────────────────────────────

  let manualKey = ""
  let manualId = ""
  it("cadastra modelo com fabricante/linha; nome padronizado; duplicidade marca×fabricante recusada", async () => {
    const r = await createLojaModelo(db, global, A, "u-a", { manufacturer: "Xiaomi", brand: "POCO", line: "C", name: "C81 Pro Sintético" })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    manualKey = r.value.modelKey
    manualId = r.value.id
    expect(r.value).toMatchObject({ manufacturer: "Xiaomi", brand: "POCO", line: "C", name: "C81 Pro Sintético" })
    // "Galaxy" + "A05" = Samsung Galaxy A05 do catálogo global
    expect(await createLojaModelo(db, global, A, "u-a", { brand: "Galaxy", name: "A05" })).toMatchObject({
      ok: false, code: "DUPLICATE", existing: { modelKey: A05, source: "global" },
    })
    // grafia diferente do mesmo modelo manual
    expect(await createLojaModelo(db, global, A, "u-a", { brand: "poco", name: "c81 pro sintetico" })).toMatchObject({ ok: false, code: "DUPLICATE" })
    // nome parecido NÃO é duplicata
    expect((await createLojaModelo(db, global, A, "u-a", { brand: "POCO", name: "C81 Sintético" })).ok).toBe(true)
  })

  it("edita linha, desativa e reativa preservando a identidade", async () => {
    const e = await updateLojaModelo(db, global, A, "u-a", manualId, { version: 1, line: "C Pro" })
    expect(e).toMatchObject({ ok: true, value: { line: "C Pro", modelKey: manualKey, version: 2 } })
    expect(await updateLojaModelo(db, global, A, "u-a", manualId, { version: 2, active: false })).toMatchObject({ ok: true, value: { active: false } })
    expect(await updateLojaModelo(db, global, A, "u-a", manualId, { version: 3, active: true })).toMatchObject({ ok: true, value: { active: true, modelKey: manualKey } })
    // loja B não edita
    expect(await updateLojaModelo(db, global, B, "u-b", manualId, { version: 4, line: "X" })).toMatchObject({ ok: false, code: "NOT_FOUND" })
  })

  // ── Vínculos ───────────────────────────────────────────────────────────────

  it("capinha: vincula, confirma só com teste físico registrado e não vaza para película", async () => {
    expect((await setLojaCompatDecisao(db, global, A, "u-a", { categoria: "capinha", modelKey: A05, otherModelKey: A06, decisao: "adicionar", origem: "teste balcão" })).ok).toBe(true)
    // sem confirmação física: recusa
    expect(await setLojaCompatDecisao(db, global, A, "u-a", { categoria: "capinha", modelKey: A05, otherModelKey: A06, decisao: "adicionar", status: "confirmado_loja" }))
      .toMatchObject({ ok: false, code: "INVALID" })
    const ok = await setLojaCompatDecisao(db, global, A, "u-conf", {
      categoria: "capinha", modelKey: A05, otherModelKey: A06, decisao: "adicionar", status: "confirmado_loja", confirmacaoFisica: true,
    })
    expect(ok.ok).toBe(true)
    const [cap] = await listLojaCompatOverrides(db, A, "capinha", [A06])
    expect(cap).toMatchObject({ status: "confirmado_loja", confirmedBy: "u-conf", origem: "teste balcão" })
    expect(cap.confirmedAt).toBeTruthy()
    // película do mesmo par: nada
    expect(await listLojaCompatOverrides(db, A, "pelicula_tela", [A05, A06])).toEqual([])
    // grupos a partir de qualquer lado
    const resolve = (k: string) => ({ modelKey: k, canonicalName: global.modelByKey.get(k)?.canonicalName ?? k, brand: "Samsung" })
    expect(buildCapinhaGrupos(A06, [cap], resolve)[0].members[0].modelKey).toBe(A05)
    // rebaixar o status limpa a confirmação
    await setLojaCompatDecisao(db, global, A, "u-a", { categoria: "capinha", modelKey: A05, otherModelKey: A06, decisao: "adicionar", status: "provavel_mercado" })
    const [rebaixado] = await listLojaCompatOverrides(db, A, "capinha", [A05])
    expect(rebaixado).toMatchObject({ status: "provavel_mercado", confirmedBy: "", confirmedAt: null })
    // loja B não enxerga
    expect(await listLojaCompatOverrides(db, B, "capinha", [A05, A06])).toEqual([])
  })

  it("capinha com modelo manual da loja; modelo de outra loja recusado", async () => {
    expect((await setLojaCompatDecisao(db, global, A, "u-a", { categoria: "capinha", modelKey: manualKey, otherModelKey: A05S, decisao: "adicionar" })).ok).toBe(true)
    expect(await setLojaCompatDecisao(db, global, B, "u-b", { categoria: "capinha", modelKey: manualKey, otherModelKey: A05S, decisao: "adicionar" }))
      .toMatchObject({ ok: false, code: "NOT_FOUND" })
    // remover
    expect((await setLojaCompatDecisao(db, global, A, "u-a", { categoria: "capinha", modelKey: manualKey, otherModelKey: A05S, decisao: "restaurar" })).ok).toBe(true)
    expect(await listLojaCompatOverrides(db, A, "capinha", [manualKey])).toEqual([])
  })

  // ── Painéis e fileiras ─────────────────────────────────────────────────────

  let p1 = ""
  let p2 = ""
  let f1 = ""
  it("cria, impede nome duplicado por grafia, renomeia, reordena e isola por loja", async () => {
    const a = await createPainel(db, A, "u-a", { nome: "Painel 1", descricao: "balcão" })
    const b = await createPainel(db, A, "u-a", { nome: "Painel A" })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    p1 = a.value.id
    p2 = b.value.id
    expect(await createPainel(db, A, "u-a", { nome: "  painel   1 " })).toMatchObject({ ok: false, code: "DUPLICATE" })
    // mesmo nome em outra loja é permitido
    expect((await createPainel(db, B, "u-b", { nome: "Painel 1" })).ok).toBe(true)
    const f = await createFileira(db, A, "u-a", { painelId: p1, nome: "Fileira 1", descricao: "iPhone / Samsung" })
    expect(f.ok).toBe(true)
    if (f.ok) f1 = f.value.id
    // fileira em painel de outra loja
    expect(await createFileira(db, B, "u-b", { painelId: p1, nome: "X" })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    // renomear (concorrência otimista)
    expect((await updateLocal(db, "painel", A, "u-a", p1, { version: 1, nome: "Painel Principal" })).ok).toBe(true)
    expect(await updateLocal(db, "painel", A, "u-a", p1, { version: 1, nome: "Velho" })).toMatchObject({ ok: false, code: "CONFLICT" })
    expect((await moverLocal(db, "painel", A, p2, "cima")).ok).toBe(true)
    const org = await listOrganizacao(db, A)
    expect(org.map((p) => p.nome)).toEqual(["Painel A", "Painel Principal"])
    expect(org[1].fileiras[0]).toMatchObject({ nome: "Fileira 1", descricao: "iPhone / Samsung" })
    expect((await listOrganizacao(db, B)).map((p) => p.nome)).toEqual(["Painel 1"])
  })

  // ── Localizações ───────────────────────────────────────────────────────────

  let locModelo = ""
  it("localiza modelo e produto específico; 1ª é principal; idempotente; posição só se habilitada", async () => {
    const l1 = await addLocalizacao(db, global, A, "u-a", { modelKey: A06, painelId: p1, fileiraId: f1, posicao: "3" })
    expect(l1).toMatchObject({ ok: true, value: { existente: false } })
    if (!l1.ok) return
    locModelo = l1.value.id
    // repetir o mesmo endereço não duplica
    expect(await addLocalizacao(db, global, A, "u-a", { modelKey: A06, painelId: p1, fileiraId: f1 })).toMatchObject({ ok: true, value: { id: locModelo, existente: true } })
    // localização específica (modelo + produto) em outro painel
    const l2 = await addLocalizacao(db, global, A, "u-a", { modelKey: A06, produtoId: `${run}-gen`, painelId: p2 })
    expect(l2.ok).toBe(true)
    const locs = await listLocalizacoes(db, A, { modelKeys: [A06] })
    expect(locs).toHaveLength(2)
    const doModelo = locs.find((l) => !l.produtoId)!
    expect(doModelo).toMatchObject({ principal: true, posicao: "", fileiraNome: "Fileira 1", painelNome: "Painel Principal" })
    // posições habilitadas → gravadas
    const prefs = await getPreferencias(db, A)
    expect(prefs.posicoesHabilitadas).toBe(false)
    expect((await setPreferencias(db, A, "u-a", { version: prefs.version, posicoesHabilitadas: true })).ok).toBe(true)
    const l3 = await addLocalizacao(db, global, A, "u-a", { modelKey: A06, painelId: p2, posicao: "7", principal: true })
    expect(l3.ok).toBe(true)
    const depois = await listLocalizacoes(db, A, { modelKeys: [A06] })
    expect(depois.filter((l) => !l.produtoId && l.principal).map((l) => l.posicao)).toEqual(["7"])
    expect((await setLocalizacaoPrincipal(db, A, locModelo)).ok).toBe(true)
    expect((await listLocalizacoes(db, A, { modelKeys: [A06] })).filter((l) => !l.produtoId && l.principal).map((l) => l.id)).toEqual([locModelo])
  })

  it("recusa modelo inexistente, painel desativado e painel/produto de outra loja", async () => {
    expect(await addLocalizacao(db, global, A, "u-a", { modelKey: "nao_existe_xyz", painelId: p1 })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await addLocalizacao(db, global, B, "u-b", { modelKey: A06, painelId: p1 })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await addLocalizacao(db, global, A, "u-a", { modelKey: A06, produtoId: `${run}-genB`, painelId: p1 })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    const tmp = await createPainel(db, A, "u-a", { nome: "Painel Temporário" })
    if (!tmp.ok) throw new Error("painel")
    await updateLocal(db, "painel", A, "u-a", tmp.value.id, { version: 1, ativo: false })
    expect(await addLocalizacao(db, global, A, "u-a", { modelKey: A06, painelId: tmp.value.id })).toMatchObject({ ok: false, code: "INVALID" })
    // painel vazio pode ser excluído
    expect((await deleteLocal(db, "painel", A, tmp.value.id)).ok).toBe(true)
    expect(await listLocalizacoes(db, B, { modelKeys: [A06] })).toEqual([])
  })

  it("exclusão insegura bloqueada; renomear preserva vínculos; remover vínculo não toca produto", async () => {
    expect(await deleteLocal(db, "painel", A, p1)).toMatchObject({ ok: false, code: "IN_USE" })
    expect(await deleteLocal(db, "fileira", A, f1)).toMatchObject({ ok: false, code: "IN_USE" })
    const v = (await listOrganizacao(db, A)).find((p) => p.id === p1)!
    await updateLocal(db, "painel", A, "u-a", p1, { version: v.version, nome: "Painel Renomeado" })
    expect((await listLocalizacoes(db, A, { modelKeys: [A06] })).find((l) => l.id === locModelo)?.painelNome).toBe("Painel Renomeado")
    const antes = await db.produto.findUniqueOrThrow({ where: { id: `${run}-gen` } })
    const especifica = (await listLocalizacoes(db, A, { produtoIds: [`${run}-gen`] }))[0]
    expect((await removeLocalizacao(db, A, especifica.id)).ok).toBe(true)
    expect(await removeLocalizacao(db, B, locModelo)).toMatchObject({ ok: false, code: "NOT_FOUND" })
    const depois = await db.produto.findUniqueOrThrow({ where: { id: `${run}-gen` } })
    expect(depois.stock).toBe(antes.stock)
  })

  it("concorrência: mesmo endereço em paralelo grava 1 linha; primeiras em paralelo deixam 1 principal", async () => {
    const iguais = await Promise.all(
      Array.from({ length: 6 }, () => addLocalizacao(db, global, A, "u-a", { modelKey: A05, painelId: p2, posicao: "9" })),
    )
    expect(iguais.every((r) => r.ok)).toBe(true)
    expect(new Set(iguais.map((r) => (r.ok ? r.value.id : ""))).size).toBe(1)
    expect(await db.compatLocalizacao.count({ where: { storeId: A, modelKey: A05, posicao: "9" } })).toBe(1)

    const distintas = await Promise.all(
      ["1", "2", "3", "4", "5"].map((posicao) => addLocalizacao(db, global, A, "u-a", { modelKey: A05S, painelId: p2, posicao })),
    )
    expect(distintas.every((r) => r.ok)).toBe(true)
    expect(await db.compatLocalizacao.count({ where: { storeId: A, modelKey: A05S, produtoId: null, principal: true } })).toBe(1)
    // pedidos explícitos simultâneos de principal: continua 1
    const ids = (await db.compatLocalizacao.findMany({ where: { storeId: A, modelKey: A05S }, select: { id: true } })).map((r) => r.id)
    await Promise.all(ids.map((id) => setLocalizacaoPrincipal(db, A, id)))
    expect(await db.compatLocalizacao.count({ where: { storeId: A, modelKey: A05S, produtoId: null, principal: true } })).toBe(1)
  })

  // ── Cores ──────────────────────────────────────────────────────────────────

  it("cores: cadastra, impede duplicata por grafia e nome da paleta, renomeia, desativa e isola", async () => {
    const c = await createCorLoja(db, A, "u-a", { label: "Azul Bebê" })
    expect(c.ok).toBe(true)
    if (!c.ok) return
    expect(await createCorLoja(db, A, "u-a", { label: "azul  bebe" })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await createCorLoja(db, A, "u-a", { label: "Preto" })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect((await updateCorLoja(db, A, "u-a", c.value.id, { version: 1, label: "Azul bebê claro" })).ok).toBe(true)
    expect((await updateCorLoja(db, A, "u-a", c.value.id, { version: 2, ativo: false })).ok).toBe(true)
    expect((await setCorPadraoAtiva(db, A, "u-a", "fume", false)).ok).toBe(true)
    expect(await setCorPadraoAtiva(db, A, "u-a", "outra", false)).toMatchObject({ ok: false, code: "INVALID" })
    const efetivas = coresEfetivas(await listCoresLoja(db, A))
    expect(efetivas.find((x) => x.id === "fume")?.ativo).toBe(false)
    expect(efetivas.find((x) => x.id === c.value.id)).toMatchObject({ label: "Azul bebê claro", ativo: false })
    expect(await listCoresLoja(db, B)).toEqual([])
    expect(await updateCorLoja(db, B, "u-b", c.value.id, { version: 3, ativo: true })).toMatchObject({ ok: false, code: "NOT_FOUND" })
  })

  it("venda nova com cor padrão desativada na loja é recusada; antes da desativação e outra loja, não", async () => {
    const linha = (colorKey: string) => ({ lines: [{ accessorySelection: { version: 1, colorKey } }] })
    const row = await db.compatCorLoja.findFirstOrThrow({ where: { storeId: A, baseKey: "fume" } })
    expect(row.ativo).toBe(false)
    const depois = new Date(row.updatedAt.getTime() + 60_000)
    const antes = new Date(row.updatedAt.getTime() - 60_000)
    expect(await corPadraoDesativadaNaVenda(db, A, linha("fume"), depois)).toBe("Fumê")
    expect(await corPadraoDesativadaNaVenda(db, A, linha("fume"), antes)).toBeNull()
    expect(await corPadraoDesativadaNaVenda(db, B, linha("fume"), depois)).toBeNull()
    expect(await corPadraoDesativadaNaVenda(db, A, linha("preto"), depois)).toBeNull()
    // reativar libera de novo
    expect((await setCorPadraoAtiva(db, A, "u-a", "fume", true)).ok).toBe(true)
    expect(await corPadraoDesativadaNaVenda(db, A, linha("fume"), new Date(Date.now() + 60_000))).toBeNull()
  })

  it("preferências: conflito de versão não sobrescreve", async () => {
    const atual = await getPreferencias(db, A)
    expect(await setPreferencias(db, A, "u-a", { version: atual.version + 5, modoCorPadrao: "desativado" })).toMatchObject({ ok: false, code: "CONFLICT" })
    expect((await setPreferencias(db, A, "u-a", { version: atual.version, modoModeloPadrao: "obrigatorio" })).ok).toBe(true)
    expect((await getPreferencias(db, A)).modoModeloPadrao).toBe("obrigatorio")
    expect((await getPreferencias(db, B)).modoModeloPadrao).toBe("opcional")
  })

  // ── Produtos de capinha (filtro JSON real) + relatório ─────────────────────

  it("lista capinhas gerais e detalhadas da loja pelo metadata (película fica de fora)", async () => {
    const lista = await listProdutosCapinha(db, A)
    expect(lista.map((p) => [p.name, p.controle]).sort()).toEqual([
      ["Capinha A06 preta", "detalhado"],
      ["Capinha transparente", "geral"],
    ])
    expect((await listProdutosCapinha(db, B)).map((p) => p.name)).toEqual(["Capinha loja B"])
    const r = montarRelatorioCapinhas(
      [{ status: "concluida", payload: { lines: [{ produtoId: `${run}-gen`, quantity: 2 }, { produtoId: `${run}-pel`, quantity: 1 }] } }],
      lista,
    )
    expect(r).toMatchObject({ totalVendido: 2, semModelo: 2, porModelo: [] })
  })

  it("relatório: devoluções canônicas lidas por loja; produto desativado segue no histórico", async () => {
    const pedido = `${run}-VDA-1`
    await db.venda.create({
      data: { storeId: A, pedidoId: pedido, total: 90, status: "parcialmente_devolvida",
        payload: { lines: [{ inventoryId: `${run}-T`, produtoId: `${run}-gen`, quantity: 3 }] } },
    })
    await db.devolucaoVenda.create({
      data: { storeId: A, localId: `${run}-DEV-1`, vendaLocalId: pedido, tipo: "somente_estoque",
        itens: { create: [{ inventoryId: `${run}-T`, quantidade: 2 }] } },
    })
    const dev = await listDevolucoesPorVenda(db, A, [pedido])
    expect(dev.get(pedido)?.get(`${run}-T`)).toBe(2)
    expect((await listDevolucoesPorVenda(db, B, [pedido])).size).toBe(0)
    await db.produto.update({ where: { id: `${run}-gen` }, data: { active: false } })
    expect((await listProdutosCapinha(db, A)).some((p) => p.id === `${run}-gen`)).toBe(false)
    const historico = await listProdutosCapinha(db, A, { incluirInativos: true })
    const vendas = await db.venda.findMany({ where: { storeId: A, pedidoId: pedido }, select: { pedidoId: true, status: true, payload: true } })
    expect(montarRelatorioCapinhas(vendas, historico, dev).totalVendido).toBe(1)
    await db.produto.update({ where: { id: `${run}-gen` }, data: { active: true } })
  })

  it("CHECK do banco: localização sem modelo e sem produto é recusada", async () => {
    await expect(
      db.compatLocalizacao.create({ data: { storeId: A, painelId: p1, modelKey: "" } }),
    ).rejects.toThrow()
  })
})
