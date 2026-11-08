/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — integração REAL contra PostgreSQL descartável.
 *
 * Gateado por `ACC_COMPAT_TEST_DATABASE_URL` (pula sem banco). O alvo precisa ser um banco
 * descartável em 127.0.0.1 com a migration 20261107120000 aplicada; qualquer outro host é
 * recusado antes da primeira consulta. Usa o catálogo global REAL (CSVs versionados).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { loadCatalogoIndex } from "./catalogo-loader"
import { getPeliculasPorModelo } from "./peliculas"
import { applyPeliculaOverrides, buildLojaCatalogoIndex, searchDeviceModelsComLoja } from "./loja-catalogo"
import {
  createLojaModelo,
  getLojaModelosByKeys,
  listLojaCompatOverrides,
  listLojaModelos,
  setLojaCompatDecisao,
  updateLojaModelo,
} from "./loja-catalogo-store"

const TEST_URL = process.env.ACC_COMPAT_TEST_DATABASE_URL ?? ""
if (TEST_URL && !/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/acc_compat_[a-z0-9_]+$/.test(TEST_URL)) {
  throw new Error("ACC_COMPAT_TEST_DATABASE_URL precisa ser um banco descartável local (acc_compat_*).")
}

describe.skipIf(!TEST_URL)("catálogo por loja — PostgreSQL descartável", () => {
  const db = new PrismaClient({ datasourceUrl: TEST_URL })
  const second = new PrismaClient({ datasourceUrl: TEST_URL })
  const run = `acc-${Date.now()}`
  const storeA = `${run}-a`
  const storeB = `${run}-b`
  const global = loadCatalogoIndex()
  const BRAND = "Marca Sintética"

  beforeAll(async () => {
    expect(global.modelByKey.has("samsung_galaxy_a05")).toBe(true)
    expect(global.models.some((m) => /G47/i.test(m.canonicalName))).toBe(false)
    for (const id of [storeA, storeB]) {
      await db.store.create({ data: { id, name: `Loja ${id}`, cnpj: "00.000.000/0000-00", phone: "(00) 0000-0000" } })
    }
    await db.produto.create({
      data: { id: `${run}-pel`, storeId: storeA, name: "Película sintética", sku: `${run}-PEL`, price: 25, precoCusto: 5, stock: 9 },
    })
  })

  afterAll(async () => {
    await db.catalogoAparelhoLojaCompat.deleteMany({ where: { storeId: { in: [storeA, storeB] } } })
    await db.catalogoAparelhoLojaModelo.deleteMany({ where: { storeId: { in: [storeA, storeB] } } })
    await db.produto.deleteMany({ where: { storeId: { in: [storeA, storeB] } } })
    await db.store.deleteMany({ where: { id: { in: [storeA, storeB] } } })
    await db.$disconnect()
    await second.$disconnect()
  })

  let g47Key = ""
  let g47Id = ""

  it("1–3. cadastra G47 inexistente, busca imediatamente e persiste em nova conexão", async () => {
    const r = await createLojaModelo(db, global, storeA, "user-a", { brand: BRAND, name: "G47", aliases: ["XG47"] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    g47Key = r.value.modelKey
    g47Id = r.value.id
    expect(g47Key).toMatch(/^manual_[0-9a-f]{32}$/)
    // "reload": outra conexão (outro processo) lê o mesmo registro
    const fresh = await listLojaModelos(second, storeA)
    const found = searchDeviceModelsComLoja(global, buildLojaCatalogoIndex(fresh), "G47")
    expect(found[0]).toMatchObject({ modelKey: g47Key, brand: BRAND, canonicalName: `${BRAND} G47`, source: "loja" })
    expect(searchDeviceModelsComLoja(global, buildLojaCatalogoIndex(fresh), "xg47")[0]?.modelKey).toBe(g47Key)
  })

  it("4. edita nome e apelido com controle de versão (modelKey estável)", async () => {
    const ok = await updateLojaModelo(db, global, storeA, "user-a", g47Id, { version: 1, name: "G47 5G", aliases: ["XG47", "G47-5G"] })
    expect(ok).toMatchObject({ ok: true, value: { modelKey: g47Key, name: "G47 5G", version: 2, aliases: ["XG47", "G47-5G"] } })
    const stale = await updateLojaModelo(db, global, storeA, "user-b", g47Id, { version: 1, name: "Outro" })
    expect(stale).toMatchObject({ ok: false, code: "CONFLICT" })
    const back = await updateLojaModelo(db, global, storeA, "user-a", g47Id, { version: 2, name: "G47" })
    expect(back).toMatchObject({ ok: true, value: { name: "G47", version: 3 } })
  })

  it("5–6. bloqueia duplicidade na mesma marca; permite mesmo nome em outra marca; bloqueia contra o global", async () => {
    const dup = await createLojaModelo(db, global, storeA, "user-a", { brand: "marca sintetica", name: "g47" })
    expect(dup).toMatchObject({ ok: false, code: "DUPLICATE", existing: { modelKey: g47Key, source: "loja" } })
    const outra = await createLojaModelo(db, global, storeA, "user-a", { brand: "Outra Marca", name: "G47" })
    expect(outra.ok).toBe(true)
    const globalDup = await createLojaModelo(db, global, storeA, "user-a", { brand: "Motorola", name: "Moto G35" })
    expect(globalDup).toMatchObject({ ok: false, code: "DUPLICATE", existing: { modelKey: "motorola_moto_g35", source: "global" } })
    // editar para colidir com outro modelo da loja também é recusado
    if (!outra.ok) return
    const colide = await updateLojaModelo(db, global, storeA, "user-a", outra.value.id, { version: 1, brand: BRAND })
    expect(colide).toMatchObject({ ok: false, code: "DUPLICATE" })
  })

  it("7–8/11–12. adiciona/remove G47 como película equivalente e suprime relação global (só na loja A)", async () => {
    const add = await setLojaCompatDecisao(db, global, storeA, "user-a", {
      modelKey: g47Key, otherModelKey: "samsung_galaxy_a05", decisao: "adicionar", status: "provavel_mercado",
    })
    expect(add.ok).toBe(true)
    // idempotente: repetir não duplica
    await setLojaCompatDecisao(db, global, storeA, "user-a", { modelKey: "samsung_galaxy_a05", otherModelKey: g47Key, decisao: "adicionar" })
    expect(await db.catalogoAparelhoLojaCompat.count({ where: { storeId: storeA } })).toBe(1)

    const groupsA05 = getPeliculasPorModelo(global, "samsung_galaxy_a05")
    const someGlobalMember = groupsA05[0]?.members[0]?.modelKey
    expect(someGlobalMember).toBeTruthy()
    const supr = await setLojaCompatDecisao(db, global, storeA, "user-a", {
      modelKey: "samsung_galaxy_a05", otherModelKey: someGlobalMember, decisao: "suprimir",
    })
    expect(supr.ok).toBe(true)

    // "reabrir": nova conexão lê as decisões salvas
    const overrides = await listLojaCompatOverrides(second, storeA, "pelicula_tela", ["samsung_galaxy_a05"])
    const view = applyPeliculaOverrides("samsung_galaxy_a05", groupsA05, overrides, (k) => ({ modelKey: k, canonicalName: k, brand: "" }))
    const members = view.grupos.flatMap((g) => g.members.map((m) => m.modelKey))
    expect(members).toContain(g47Key)
    expect(members).not.toContain(someGlobalMember)
    expect(view.suprimidos.map((m) => m.modelKey)).toContain(someGlobalMember)
    // a manual nunca sai como confirmada
    expect(view.grupos.find((g) => g.members.some((m) => m.modelKey === g47Key))?.status).toBe("provavel_mercado")

    // loja B continua vendo o catálogo global intacto
    expect(await listLojaCompatOverrides(db, storeB, "pelicula_tela", ["samsung_galaxy_a05"])).toEqual([])

    // remover G47 (restaurar) apaga só a decisão manual
    const rm = await setLojaCompatDecisao(db, global, storeA, "user-a", { modelKey: g47Key, otherModelKey: "samsung_galaxy_a05", decisao: "restaurar" })
    expect(rm.ok).toBe(true)
    const after = await listLojaCompatOverrides(db, storeA, "pelicula_tela", ["samsung_galaxy_a05"])
    expect(after.map((o) => o.acao)).toEqual(["suprimir"])
    // seed global (índice) intocado
    expect(getPeliculasPorModelo(global, "samsung_galaxy_a05")).toEqual(groupsA05)
  })

  it("rejeita categoria capinha, status confirmado e par inválido", async () => {
    expect(await setLojaCompatDecisao(db, global, storeA, "u", { categoria: "capinha", modelKey: g47Key, otherModelKey: "samsung_galaxy_a05", decisao: "adicionar" }))
      .toMatchObject({ ok: false, code: "INVALID" })
    expect(await setLojaCompatDecisao(db, global, storeA, "u", { modelKey: g47Key, otherModelKey: g47Key, decisao: "adicionar" }))
      .toMatchObject({ ok: false, code: "INVALID" })
    const conf = await setLojaCompatDecisao(db, global, storeA, "u", {
      modelKey: g47Key, otherModelKey: "motorola_moto_g35", decisao: "adicionar", status: "confirmado_fornecedor",
    })
    expect(conf.ok).toBe(true)
    const row = await db.catalogoAparelhoLojaCompat.findFirst({ where: { storeId: storeA, OR: [{ modelKeyA: g47Key }, { modelKeyB: g47Key }], acao: "adicionar" } })
    expect(row?.status).toBe("precisa_testar")
  })

  it("18. loja B não lê, não edita e não referencia modelos/decisões da loja A", async () => {
    expect(await listLojaModelos(db, storeB, { includeInactive: true })).toEqual([])
    expect(await getLojaModelosByKeys(db, storeB, [g47Key])).toEqual([])
    expect(await updateLojaModelo(db, global, storeB, "user-b", g47Id, { version: 3, name: "Hack" })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await setLojaCompatDecisao(db, global, storeB, "user-b", { modelKey: g47Key, otherModelKey: "samsung_galaxy_a05", decisao: "adicionar" }))
      .toMatchObject({ ok: false, code: "NOT_FOUND" })
    const a = await db.catalogoAparelhoLojaModelo.findUnique({ where: { id: g47Id } })
    expect(a?.name).toBe("G47")
  })

  it("20. desativar esconde da busca mas preserva o registro para histórico", async () => {
    const off = await updateLojaModelo(db, global, storeA, "user-a", g47Id, { version: 3, active: false })
    expect(off).toMatchObject({ ok: true, value: { active: false, modelKey: g47Key } })
    const active = await listLojaModelos(db, storeA)
    expect(active.some((m) => m.modelKey === g47Key)).toBe(false)
    expect(searchDeviceModelsComLoja(global, buildLojaCatalogoIndex(active), "G47").some((r) => r.modelKey === g47Key)).toBe(false)
    expect((await getLojaModelosByKeys(db, storeA, [g47Key]))[0]).toMatchObject({ active: false, name: "G47" })
    // recadastrar o mesmo nome orienta a reativar
    expect(await createLojaModelo(db, global, storeA, "u", { brand: BRAND, name: "G47" })).toMatchObject({ ok: false, code: "DUPLICATE", existing: { active: false } })
    expect(await updateLojaModelo(db, global, storeA, "user-a", g47Id, { version: 4, active: true })).toMatchObject({ ok: true, value: { active: true } })
  })

  it("21. corrida: dois cadastros simultâneos do mesmo modelo geram UM registro", async () => {
    const input = { brand: BRAND, name: "G99 Corrida" }
    const results = await Promise.all([
      createLojaModelo(db, global, storeA, "u1", input),
      createLojaModelo(second, global, storeA, "u2", input),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && (r.code === "DUPLICATE" || r.code === "CONFLICT"))).toBe(true)
    expect(await db.catalogoAparelhoLojaModelo.count({ where: { storeId: storeA, nameKey: "G99 CORRIDA" } })).toBe(1)
  })

  it("21. corrida: duas edições com a mesma versão — só uma vence", async () => {
    const cur = await db.catalogoAparelhoLojaModelo.findUniqueOrThrow({ where: { id: g47Id } })
    const results = await Promise.all([
      updateLojaModelo(db, global, storeA, "u1", g47Id, { version: cur.version, notes: "edição 1" }),
      updateLojaModelo(second, global, storeA, "u2", g47Id, { version: cur.version, notes: "edição 2" }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.code === "CONFLICT")).toHaveLength(1)
    const final = await db.catalogoAparelhoLojaModelo.findUniqueOrThrow({ where: { id: g47Id } })
    expect(final.version).toBe(cur.version + 1)
  })

  it("22. salvar modelos/compatibilidades não toca produto, estoque ou preço", async () => {
    const p = await db.produto.findUniqueOrThrow({ where: { id: `${run}-pel` } })
    expect(p.stock).toBe(9)
    expect(p.price).toBe(25)
    expect(p.metadata ?? null).toBeNull()
    expect(await db.movimentacaoEstoque.count({ where: { storeId: storeA } })).toBe(0)
  })

  it("CHECKs de domínio do banco recusam ação/categoria/par inválidos", async () => {
    const insert = (acao: string, cat: string, a: string, b: string) =>
      db.$executeRawUnsafe(
        `INSERT INTO "catalogo_aparelhos_loja_compat" ("id","storeId","categoria","modelKeyA","modelKeyB","acao","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())`,
        `${run}-${acao}-${cat}-${a}`, storeA, cat, a, b, acao,
      )
    await expect(insert("apagar", "pelicula_tela", "a", "b")).rejects.toThrow()
    await expect(insert("adicionar", "tela", "a", "b")).rejects.toThrow()
    await expect(insert("adicionar", "pelicula_tela", "b", "a")).rejects.toThrow()
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO "catalogo_aparelhos_loja_modelos" ("id","storeId","modelKey","brand","name","brandKey","nameKey","updatedAt") VALUES ($1,$2,'samsung_x','S','X','S','X',now())`,
        `${run}-bad`, storeA,
      ),
    ).rejects.toThrow()
  })

  it("P2-1: par ordenado usa COLLATE \"C\" (independe da collation do banco)", async () => {
    const def = await db.$queryRawUnsafe<Array<{ d: string }>>(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'catalogo_aparelhos_loja_compat_par_ordenado_check'`,
    )
    expect(def[0]?.d).toMatch(/COLLATE "C"/)
    // Ordem do código: "0" (0x30) < "_" (0x5F). Em ICU/pt_BR (inclusive este PG local) a ordem inverte.
    const [a, b] = ["motorola_moto_g_power", "motorola_moto_g04"].sort()
    expect(a).toBe("motorola_moto_g04")
    const ins = (cmp: string) => db.$executeRawUnsafe(
      `INSERT INTO "catalogo_aparelhos_loja_compat" ("id","storeId","categoria","modelKeyA","modelKeyB","acao","updatedAt") VALUES ($1,$2,'pelicula_tela',$3,$4,'adicionar',now())`,
      `${run}-coll-${cmp}`, storeA, ...(cmp === "ok" ? [a, b] : [b, a]),
    )
    await expect(ins("ok")).resolves.toBe(1)
    await expect(ins("invertido")).rejects.toThrow()
  })
})
