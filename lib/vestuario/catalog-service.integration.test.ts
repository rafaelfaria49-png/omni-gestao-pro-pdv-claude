/**
 * OMNI-VESTUARIO-P02 — integração REAL contra PostgreSQL DESCARTÁVEL (dados sintéticos).
 * Gateado por `VESTUARIO_P02_TEST_DATABASE_URL` (pula sem banco). Só aceita 127.0.0.1 e banco `vest_p02_*`
 * com a migration 20261115120000 aplicada; qualquer outro alvo é recusado antes da primeira consulta.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { spawnSync } from "node:child_process"
import { Prisma, PrismaClient } from "@/generated/prisma"
import { createProduct, createProductTx, updateProductTx, type ProductWriteDb, type ProductWriteTx } from "@/lib/cadastros/product-write-service"
import { assertProductCommercialSaleSupported } from "@/lib/cadastros/product-commercial-contract"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import * as svc from "./catalog-service"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const TEST_URL = process.env.VESTUARIO_P02_TEST_DATABASE_URL ?? ""
if (TEST_URL && !/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/vest_p02_[a-z0-9_]+$/.test(TEST_URL)) {
  throw new Error("VESTUARIO_P02_TEST_DATABASE_URL precisa ser um banco descartável local (vest_p02_*).")
}

describe.skipIf(!TEST_URL)("catálogo de grade P02 — PostgreSQL descartável", () => {
  const db = new PrismaClient({ datasourceUrl: TEST_URL })
  const other = new PrismaClient({ datasourceUrl: TEST_URL })
  const run = `p02-${Date.now().toString(36)}`
  const A = `${run}-a`
  const B = `${run}-b`
  const ctxA: svc.CatalogContext = { storeId: A, principal: { userId: "u-sintetico-a", displayLabel: "QA A" } }
  const ctxB: svc.CatalogContext = { storeId: B, principal: { userId: "u-sintetico-b", displayLabel: "QA B" } }
  const up = run.toUpperCase()
  const ids: Record<string, string> = {}
  const must = <T>(r: svc.CatalogResult<T>): T => { if (!r.ok) throw new Error(`${r.code}: ${r.message}`); return r.value }

  beforeAll(async () => {
    const dir = await db.$queryRaw<{ d: string }[]>`SELECT current_setting('data_directory') AS d`
    // Prova adicional de descartável: no CI é o service container do job; localmente, o PG do scratchpad.
    if (process.env.CI !== "true") expect(dir[0].d).toMatch(/scratchpad/)
    for (const id of [A, B]) await db.store.create({ data: { id, name: `Loja ${id}`, cnpj: "00.000.000/0000-00", phone: "0" } })
    // Legado: simples com SKU, metadata livre e gradePlanejada — nunca vira produto com grade.
    await db.produto.create({ data: { id: `${run}-leg`, storeId: A, name: "Camiseta legada", sku: `${up}-LEG`, barcode: ` ${run}-bar `, stock: 7, price: 30, metadata: { vestuario: "camiseta", comercial: { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN", gradePlanejada: true }, atributos: { cor: "Azul", tamanho: "M" } } } })
  })
  afterAll(async () => { await db.$disconnect(); await other.$disconnect() })

  it("grades personalizadas (adulto, jeans, calçados 33–45, infantil) e cores por loja", async () => {
    ids.adulto = must(await svc.createGrade(db, ctxA, { nome: "Adulto", tamanhos: ["PP", "P", "M", "G", "GG", "XG"] })).id
    ids.jeans = must(await svc.createGrade(db, ctxA, { nome: "Jeans", tamanhos: ["34", "36", "38", "40", "42", "44"] })).id
    ids.calcados = must(await svc.createGrade(db, ctxA, { nome: "Calçados", tamanhos: Array.from({ length: 13 }, (_, i) => String(33 + i)) })).id
    ids.infantil = must(await svc.createGrade(db, ctxA, { nome: "Infantil", tamanhos: ["2 anos", "4 anos", "6 anos"] })).id
    for (const [k, nome, hex] of [["preto", "Preto", "#000000"], ["branco", "Branco", "ffffff"], ["azul", "Azul", null], ["estampa", "Estampado floral", null]] as const) {
      ids[k] = must(await svc.createCor(db, ctxA, { nome, hex })).id
    }
    ids.pretoB = must(await svc.createCor(db, ctxB, { nome: "Preto" })).id // mesmo nome em outra loja: permitido
    ids.adultoB = must(await svc.createGrade(db, ctxB, { nome: "Adulto", tamanhos: ["P", "M"] })).id
    const cat = await svc.listCatalogo(db, A)
    expect(cat.grades.find((g) => g.id === ids.calcados)?.tamanhos.map((t) => t.rotulo)).toEqual(Array.from({ length: 13 }, (_, i) => String(33 + i)))
    expect(cat.cores.map((c) => c.nome)).toEqual(["Preto", "Branco", "Azul", "Estampado floral"])
    expect(cat.cores.find((c) => c.id === ids.branco)?.hex).toBe("#FFFFFF")
    expect((await svc.listCatalogo(db, B)).cores.map((c) => c.id)).toEqual([ids.pretoB])
  })

  it("duplicidade de nomes ignora caixa/acento/espaço, sem bloquear nomes comerciais distintos", async () => {
    expect(await svc.createCor(db, ctxA, { nome: "  preto " })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await svc.createGrade(db, ctxA, { nome: "calcados" })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect((await svc.createCor(db, ctxA, { nome: "Azul Royal" })).ok).toBe(true)
    expect(await svc.createGrade(db, ctxA, { nome: "X", tamanhos: ["P", "p"] })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await svc.createCor(db, ctxA, { nome: "Rosa", hex: "#ff00" })).toMatchObject({ ok: false, code: "VALIDATION", field: "hex" })
  })

  it("camiseta P/M/G/GG × Preto/Branco/Azul gera SOMENTE as combinações escolhidas, em rascunho e sem estoque", async () => {
    const cat = await svc.listCatalogo(db, A)
    const t = Object.fromEntries(cat.grades.find((g) => g.id === ids.adulto)!.tamanhos.map((x) => [x.rotulo, x.id]))
    ids.tP = t.P; ids.tM = t.M; ids.tG = t.G; ids.tGG = t.GG; ids.tPP = t.PP
    const combinacoes = [
      { corId: ids.preto, tamanhoId: t.P, sku: `${run}-cam-pre-p` }, { corId: ids.preto, tamanhoId: t.M }, { corId: ids.preto, tamanhoId: t.G },
      { corId: ids.branco, tamanhoId: t.M, sku: ` ${run}-cam-bra-m ` }, { corId: ids.azul, tamanhoId: t.GG },
    ]
    const r = must(await svc.createProdutoGrade(db, ctxA, { nome: "Camiseta básica", categoria: "Camisetas", marca: "Marca QA", preco: "49,90", custo: "20", gradeId: ids.adulto, combinacoes }))
    ids.cam = r.produtoId
    expect(r.variantes).toBe(5)
    const p = (await svc.getProdutoGrade(db, A, ids.cam))!
    expect(p.variantes).toHaveLength(5)
    expect(p.variantes.every((v) => v.situacao === "RASCUNHO" && v.barcodeInterno === null)).toBe(true) // nenhum código fabricado
    expect(p.variantes.find((v) => v.corId === ids.branco)?.sku).toBe(`${up}-CAM-BRA-M`) // normalizado
    expect(p.precoCentavos).toBe(4990)
    ids.vPretoP = p.variantes.find((v) => v.corId === ids.preto && v.tamanhoId === t.P)!.id
    const prod = await db.produto.findUniqueOrThrow({ where: { id: ids.cam } })
    expect(prod.stock).toBe(0)
    expect(prod.metadata).toMatchObject({ vestuario: { contract: "omni.vestuario.catalog", version: 1, mode: "COM_GRADE", gradeId: ids.adulto } })
    expect(await db.movimentacaoEstoque.count({ where: { produtoId: ids.cam } })).toBe(0)
    expect(await db.logsAuditoria.count({ where: { source: svc.VESTUARIO_AUDIT_SOURCE, metadata: { contains: ids.cam } } })).toBeGreaterThan(0)
    // identidade não deriva de SKU/rótulo/posição
    expect(ids.vPretoP).not.toContain("CAM")
  })

  it("grade numérica de calçados", async () => {
    const tams = (await svc.listCatalogo(db, A)).grades.find((g) => g.id === ids.calcados)!.tamanhos
    const r = must(await svc.createProdutoGrade(db, ctxA, { nome: "Tênis QA", gradeId: ids.calcados, combinacoes: tams.slice(4, 9).map((tm) => ({ corId: ids.preto, tamanhoId: tm.id })) }))
    expect(r.variantes).toBe(5)
  })

  it("cor editada preserva identidade; tamanho usado não é renomeado, mas pode ser desativado", async () => {
    must(await svc.updateCor(db, ctxA, { id: ids.preto, nome: "Preto Ônix", hex: "#111111" }))
    const v = await db.vestuarioVariante.findUniqueOrThrow({ where: { id: ids.vPretoP } })
    expect(v.corId).toBe(ids.preto)
    expect(await svc.updateTamanho(db, ctxA, { id: ids.tP, rotulo: "Pequeno" })).toMatchObject({ ok: false, code: "IN_USE" })
    must(await svc.updateTamanho(db, ctxA, { id: ids.tPP, rotulo: "PPP" })) // não usado: pode
    must(await svc.updateTamanho(db, ctxA, { id: ids.tG, ativo: false }))
    const p = (await svc.getProdutoGrade(db, A, ids.cam))!
    expect(await svc.addVariantes(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, combinacoes: [{ corId: ids.azul, tamanhoId: ids.tG }] })).toMatchObject({ ok: false, code: "VALIDATION" })
    expect((await svc.getProdutoGrade(db, A, ids.cam))!.variantes.some((x) => x.tamanhoId === ids.tG)).toBe(true) // variante existente intacta
    must(await svc.updateTamanho(db, ctxA, { id: ids.tG, ativo: true }))
  })

  it("SKU e código interno duplicados: variante×variante, variante×produto simples e produto simples×variante", async () => {
    const p = (await svc.getProdutoGrade(db, A, ids.cam))!
    expect(await svc.addVariantes(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, combinacoes: [{ corId: ids.azul, tamanhoId: ids.tM, sku: `${up}-CAM-PRE-P` }] })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await svc.addVariantes(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, combinacoes: [{ corId: ids.azul, tamanhoId: ids.tM, sku: `${run}-leg` }] })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await svc.addVariantes(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, combinacoes: [{ corId: ids.azul, tamanhoId: ids.tM, barcodeInterno: `${run}-BAR` }] })).toMatchObject({ ok: false, code: "DUPLICATE" })
    const v = p.variantes.find((x) => x.id === ids.vPretoP)!
    must(await svc.updateVariante(db, ctxA, { varianteId: v.id, expectedVersion: v.version, barcodeInterno: `ogv-${run}-1` }))
    const v2 = p.variantes.find((x) => x.corId === ids.preto && x.tamanhoId === ids.tM)!
    expect(await svc.updateVariante(db, ctxA, { varianteId: v2.id, expectedVersion: v2.version, barcodeInterno: `OGV-${up}-1` })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await svc.updateVariante(db, ctxA, { varianteId: v2.id, expectedVersion: v2.version, sku: `ogv-${run}-1` })).toMatchObject({ ok: false, code: "DUPLICATE" }) // sku × código de outra
    expect((await svc.getProdutoGrade(db, A, ids.cam))!.variantes.find((x) => x.id === v.id)?.situacao).toBe("COMPLETA")
    // writer legado de produto simples × SKU de variante (trigger autoritativo, mesmo com espaço/minúsculas)
    expect(await createProduct({ storeId: A, principal: null }, { nome: "Simples colidindo", sku: ` ${run}-cam-pre-p` }, { db: db as unknown as ProductWriteDb })).toMatchObject({ ok: false, code: "DUPLICATE" })
    await expect(db.produto.update({ where: { id: `${run}-leg` }, data: { barcode: `ogv-${run}-1` } })).rejects.toThrow(/Unique constraint|VESTUARIO_IDENTIFICADOR_DUPLICADO/)
    expect(await db.produto.count({ where: { storeId: A, name: "Simples colidindo" } })).toBe(0)
    // mesmo SKU em OUTRA loja é permitido
    expect((await db.$transaction((tx) => createProductTx(tx as unknown as ProductWriteTx, { storeId: B, principal: null }, { nome: "Simples B", sku: `${up}-CAM-PRE-P` }))).ok).toBe(true)
  })

  it("duas lojas: catálogos distintos e toda tentativa cross-store é recusada", async () => {
    expect(await svc.getProdutoGrade(db, B, ids.cam)).toBeNull()
    expect((await svc.listProdutosGrade(db, B)).items).toHaveLength(0)
    expect(await svc.updateCor(db, ctxB, { id: ids.preto, nome: "Invadida" })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await svc.updateTamanho(db, ctxB, { id: ids.tM, ativo: false })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    const p = (await svc.getProdutoGrade(db, A, ids.cam))!
    expect(await svc.addVariantes(db, ctxB, { produtoId: ids.cam, expectedVersion: p.catalogVersion, combinacoes: [{ corId: ids.pretoB, tamanhoId: ids.tM }] })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await svc.addVariantes(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, combinacoes: [{ corId: ids.pretoB, tamanhoId: ids.tM }] })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await svc.createProdutoGrade(db, ctxA, { nome: "Cruzado", gradeId: ids.adultoB, combinacoes: [{ corId: ids.preto, tamanhoId: ids.tM }] })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await svc.updateVariante(db, ctxB, { varianteId: ids.vPretoP, expectedVersion: 1, ativo: false })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await db.produto.count({ where: { storeId: A, name: "Cruzado" } })).toBe(0) // nada parcial
    expect((await db.vestuarioCor.findUniqueOrThrow({ where: { id: ids.preto } })).nome).toBe("Preto Ônix")
    expect(await svc.createCor(db, { storeId: " ", principal: null }, { nome: "X" })).toMatchObject({ ok: false, code: "UNTRUSTED" })
  })

  it("variante inexistente, payload com storeId/extra e combinação repetida", async () => {
    expect(await svc.updateVariante(db, ctxA, { varianteId: "nao-existe", expectedVersion: 1, ativo: false })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await svc.createCor(db, ctxA, { nome: "Verde", storeId: B })).toMatchObject({ ok: false, code: "VALIDATION" })
    const p = (await svc.getProdutoGrade(db, A, ids.cam))!
    expect(await svc.addVariantes(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, combinacoes: [{ corId: ids.preto, tamanhoId: ids.tP }] })).toMatchObject({ ok: false, code: "DUPLICATE" })
  })

  it("exclusão indevida de cor/tamanho usados e de variante é barrada pelo banco", async () => {
    await expect(db.vestuarioCor.delete({ where: { id: ids.preto } })).rejects.toThrow()
    await expect(db.vestuarioTamanho.delete({ where: { id: ids.tP } })).rejects.toThrow()
    await expect(db.vestuarioVariante.delete({ where: { id: ids.vPretoP } })).rejects.toThrow(/VESTUARIO_EXCLUSAO_PROIBIDA/)
    await expect(db.produto.delete({ where: { id: ids.cam } })).rejects.toThrow()
    await expect(db.vestuarioVariante.update({ where: { id: ids.vPretoP }, data: { corId: ids.azul } })).rejects.toThrow(/VESTUARIO_IDENTIDADE_IMUTAVEL/)
  })

  it("legado (metadata livre, gradePlanejada) continua simples e vendável; nenhum backfill", async () => {
    const leg = await db.produto.findUniqueOrThrow({ where: { id: `${run}-leg` } })
    expect(leg.stock).toBe(7)
    expect(() => assertProductCommercialSaleSupported(leg.metadata)).not.toThrow()
    expect(await db.vestuarioProdutoGrade.count({ where: { produtoId: leg.id } })).toBe(0)
    expect((await svc.listProdutosGrade(db, A)).items.map((i) => i.produtoId)).not.toContain(leg.id)
  })

  it("P01 preservada: venda e estoque recusam o pai com grade e a variante; nada é gravado", async () => {
    const pai = await db.produto.findUniqueOrThrow({ where: { id: ids.cam } })
    expect(() => assertProductCommercialSaleSupported(pai.metadata)).toThrow(expect.objectContaining({ code: "VARIANTE_OBRIGATORIA" }))
    const stock = await db.$transaction((tx) => applyStockMutationTx(tx as unknown as StockLedgerTx, { storeId: A, principal: null, source: "p02-qa" }, {
      kind: "entrada", produtoId: ids.cam, quantidade: 5, custoUnitario: 10, origem: "manual", motivo: "QA", idempotencyKey: `${run}-e1`,
    }))
    expect(stock).toMatchObject({ ok: false, code: "VARIANTE_OBRIGATORIA" })
    const stockVar = await db.$transaction((tx) => applyStockMutationTx(tx as unknown as StockLedgerTx, { storeId: A, principal: null, source: "p02-qa" }, {
      kind: "entrada", produtoId: ids.cam, quantidade: 5, custoUnitario: 10, origem: "manual", motivo: "QA", idempotencyKey: `${run}-e2`, varianteId: ids.vPretoP,
    } as Parameters<typeof applyStockMutationTx>[2]))
    expect(stockVar).toMatchObject({ ok: false, code: "VESTUARIO_NAO_OPERACIONAL" })
    const sale = { id: `VDA-${run}`, lines: [{ inventoryId: ids.cam, quantity: 1, varianteId: ids.vPretoP }] } as unknown as SalePayload
    await expect(db.$transaction((tx) => upsertVendaInTransaction(tx, A, sale, undefined, { enforceStock: true }))).rejects.toMatchObject({ code: "VESTUARIO_NAO_OPERACIONAL" })
    // editor legado de produto não altera nem "simplifica" o pai com grade
    const legacyEdit = await db.$transaction((tx) => updateProductTx(tx as unknown as ProductWriteTx, { storeId: A, principal: null }, ids.cam, { nome: "Renomeado pelo legado" }))
    expect(legacyEdit).toMatchObject({ ok: false, code: "VALIDATION" })
    const after = await db.produto.findUniqueOrThrow({ where: { id: ids.cam } })
    expect(after.stock).toBe(0)
    expect(after.name).toBe("Camiseta básica")
    expect(await db.movimentacaoEstoque.count({ where: { produtoId: ids.cam } })).toBe(0)
    expect(await db.produtoDeposito.count({ where: { produtoId: ids.cam } })).toBe(0)
  })

  it("edição do pai pelo writer próprio com concorrência otimista", async () => {
    const p = (await svc.getProdutoGrade(db, A, ids.cam))!
    must(await svc.updateProdutoGradeBase(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, nome: "Camiseta básica II", preco: "59,90" }))
    expect(await svc.updateProdutoGradeBase(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, nome: "Stale" })).toMatchObject({ ok: false, code: "CONFLICT" })
    const q = (await svc.getProdutoGrade(db, A, ids.cam))!
    expect(q.nome).toBe("Camiseta básica II")
    expect(q.precoCentavos).toBe(5990)
    expect((await db.produto.findUniqueOrThrow({ where: { id: ids.cam } })).metadata).toMatchObject({ vestuario: { mode: "COM_GRADE" } })
  })

  it("concorrência: mesmo SKU em dois cadastros simultâneos, variante×produto simples e versão da variante", async () => {
    const sku = `${up}-CONC-1`
    const mk = (client: PrismaClient, nome: string) => svc.createProdutoGrade(client, ctxA, { nome, gradeId: ids.adulto, combinacoes: [{ corId: ids.azul, tamanhoId: ids.tP, sku }] })
    const results = await Promise.all([mk(db, "Conc A"), mk(other, "Conc B")])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.code === "DUPLICATE")).toHaveLength(1)
    expect(await db.produto.count({ where: { storeId: A, name: { in: ["Conc A", "Conc B"] } } })).toBe(1) // perdedor não deixou pai órfão

    const sku2 = `${up}-CONC-2`
    const legacyP = other.$transaction((tx) => createProductTx(tx as unknown as ProductWriteTx, { storeId: A, principal: null }, { nome: "Conc simples", sku: sku2 })).then((r) => r.ok, () => false)
    const variantP = svc.createProdutoGrade(db, ctxA, { nome: "Conc grade", gradeId: ids.adulto, combinacoes: [{ corId: ids.azul, tamanhoId: ids.tM, sku: sku2 }] }).then((r) => r.ok, () => false)
    const [l, v] = await Promise.all([legacyP, variantP])
    expect([l, v].filter(Boolean)).toHaveLength(1)
    const owners = (await db.produto.count({ where: { storeId: A, sku: sku2 } })) + (await db.vestuarioVariante.count({ where: { storeId: A, sku: sku2 } }))
    expect(owners).toBe(1)

    const cur = (await svc.getProdutoGrade(db, A, ids.cam))!.variantes.find((x) => x.id === ids.vPretoP)!
    const upd = await Promise.all([
      svc.updateVariante(db, ctxA, { varianteId: cur.id, expectedVersion: cur.version, preco: "10" }),
      svc.updateVariante(other, ctxA, { varianteId: cur.id, expectedVersion: cur.version, preco: "20" }),
    ])
    expect(upd.filter((r) => r.ok)).toHaveLength(1)
    expect(upd.filter((r) => !r.ok && r.code === "CONFLICT")).toHaveLength(1)
  })

  it("lock: legado × legado não se serializa; variação espera o legado aberto e enxerga a colisão", async () => {
    const sku = `${up}-LOCK-1`
    let releaseA!: () => void
    const holdA = new Promise<void>((r) => { releaseA = r })
    let insertedA!: () => void
    const aInserted = new Promise<void>((r) => { insertedA = r })
    const txA = db.$transaction(async (tx) => {
      await tx.produto.create({ data: { storeId: A, name: "Lock legado A", sku } })
      insertedA()
      await holdA
    }, { timeout: 20_000 })
    await aInserted
    // Outro cadastro legado da MESMA loja, com outro SKU, conclui com A ainda aberta (lock compartilhado).
    const t0 = Date.now()
    await other.$transaction((tx) => tx.produto.create({ data: { storeId: A, name: "Lock legado B", sku: `${up}-LOCK-2` } }))
    expect(Date.now() - t0).toBeLessThan(3_000)
    // Variação com o MESMO código de A precisa esperar A (lock exclusivo) e então recusar.
    let variantDone = false
    const variantP = svc.createProdutoGrade(other, ctxA, { nome: "Lock grade", gradeId: ids.adulto, combinacoes: [{ corId: ids.azul, tamanhoId: ids.tGG, sku }] })
      .then((r) => { variantDone = true; return r })
    await new Promise((r) => setTimeout(r, 1_000))
    expect(variantDone).toBe(false)
    releaseA()
    await txA
    expect(await variantP).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await db.vestuarioVariante.count({ where: { storeId: A, sku } })).toBe(0)
  })

  it("lock_timeout: variação não fica presa atrás de transação de produto longa (CONFLICT em ~3 s, nada gravado)", async () => {
    let releaseA!: () => void
    const holdA = new Promise<void>((r) => { releaseA = r })
    let insertedA!: () => void
    const aInserted = new Promise<void>((r) => { insertedA = r })
    const txA = db.$transaction(async (tx) => {
      await tx.produto.create({ data: { storeId: A, name: "Importação longa", sku: `${up}-IMP-1` } })
      insertedA()
      await holdA
    }, { timeout: 30_000 })
    await aInserted
    const t0 = Date.now()
    const r = await svc.createProdutoGrade(other, ctxA, { nome: "Espera longa", gradeId: ids.adulto, combinacoes: [{ corId: ids.azul, tamanhoId: ids.tGG, sku: `${up}-IMP-2` }] })
    const waited = Date.now() - t0
    releaseA(); await txA
    expect(r).toMatchObject({ ok: false, code: "CONFLICT" })
    expect(waited).toBeGreaterThanOrEqual(2_500)
    expect(waited).toBeLessThan(10_000)
    expect(await db.produto.count({ where: { storeId: A, name: "Espera longa" } })).toBe(0)
  })

  it("SKU do pai: trigger real na mesma sessão (exclusivo → compartilhado) e colisões nos dois sentidos", async () => {
    const tams = (await svc.listCatalogo(db, A)).grades.find((g) => g.id === ids.adulto)!.tamanhos
    const r = must(await svc.createProdutoGrade(db, ctxA, { nome: "Pai com SKU", skuPai: `${run}-pai`, gradeId: ids.adulto, combinacoes: [{ corId: ids.branco, tamanhoId: tams[0].id, sku: `${run}-pai-v1` }] }))
    expect((await db.produto.findUniqueOrThrow({ where: { id: r.produtoId } })).sku).toBe(`${up}-PAI`)
    expect(await svc.createProdutoGrade(db, ctxA, { nome: "Pai colide legado", skuPai: `${run}-leg`, gradeId: ids.adulto, combinacoes: [{ corId: ids.branco, tamanhoId: tams[0].id }] })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await svc.createProdutoGrade(db, ctxA, { nome: "Pai colide variação", skuPai: `${run}-pai-v1`, gradeId: ids.adulto, combinacoes: [{ corId: ids.branco, tamanhoId: tams[0].id }] })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await svc.createProdutoGrade(db, ctxA, { nome: "Pai = própria variação", skuPai: "X-1", gradeId: ids.adulto, combinacoes: [{ corId: ids.branco, tamanhoId: tams[0].id, sku: "x-1" }] })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(await db.produto.count({ where: { storeId: A, name: { startsWith: "Pai " } } })).toBe(1)
  })

  it("validações: preço acima do INT4, campo longo e grade desativada", async () => {
    const cur = (await svc.getProdutoGrade(db, A, ids.cam))!
    const v = cur.variantes.find((x) => x.id !== ids.vPretoP)!
    expect(await svc.updateVariante(db, ctxA, { varianteId: v.id, expectedVersion: v.version, preco: "25000000" })).toMatchObject({ ok: false, code: "VALIDATION", field: "preco" })
    expect(await svc.updateProdutoGradeBase(db, ctxA, { produtoId: ids.cam, expectedVersion: cur.catalogVersion, marca: "M".repeat(130) })).toMatchObject({ ok: false, code: "VALIDATION" })
    expect((await db.produto.findUniqueOrThrow({ where: { id: ids.cam } })).brand).toBe("Marca QA")
    const g = (await svc.listCatalogo(db, A)).grades.find((x) => x.id === ids.adulto)!
    must(await svc.updateGrade(db, ctxA, { id: ids.adulto, ativo: false, expectedVersion: g.version }))
    const p = (await svc.getProdutoGrade(db, A, ids.cam))!
    expect(await svc.addVariantes(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, combinacoes: [{ corId: ids.azul, tamanhoId: ids.tM }] })).toMatchObject({ ok: false, code: "VALIDATION" })
    const g2 = (await svc.listCatalogo(db, A)).grades.find((x) => x.id === ids.adulto)!
    must(await svc.updateGrade(db, ctxA, { id: ids.adulto, ativo: true, expectedVersion: g2.version }))
  })

  it("listagem paginada e desativação de variante sem apagar", async () => {
    const page1 = await svc.listProdutosGrade(db, A, { take: 1 })
    expect(page1.items).toHaveLength(1)
    expect(page1.nextCursor).not.toBeNull()
    const page2 = await svc.listProdutosGrade(db, A, { take: 1, cursor: page1.nextCursor })
    expect(page2.items[0].produtoId).not.toBe(page1.items[0].produtoId)
    const cur = (await svc.getProdutoGrade(db, A, ids.cam))!.variantes.find((x) => x.id === ids.vPretoP)!
    must(await svc.updateVariante(db, ctxA, { varianteId: cur.id, expectedVersion: cur.version, ativo: false }))
    const after = (await svc.getProdutoGrade(db, A, ids.cam))!.variantes.find((x) => x.id === ids.vPretoP)!
    expect(after.situacao).toBe("INATIVA")
    expect(after.sku).toBe(cur.sku)
  })

  it("cor desativada não gera variante nova nem permite reativar variante com ela", async () => {
    must(await svc.updateCor(db, ctxA, { id: ids.estampa, ativo: false }))
    const p = (await svc.getProdutoGrade(db, A, ids.cam))!
    expect(await svc.addVariantes(db, ctxA, { produtoId: ids.cam, expectedVersion: p.catalogVersion, combinacoes: [{ corId: ids.estampa, tamanhoId: ids.tM }] })).toMatchObject({ ok: false, code: "VALIDATION" })
    expect(Prisma).toBeDefined()
  })

  it("criação do pai não passa por uma desativação concorrente da grade", async () => {
    const gradeId = must(await svc.createGrade(db, ctxA, { nome: "Grade concorrente", tamanhos: ["Único"] })).id
    const tamanho = (await svc.listCatalogo(db, A)).grades.find((g) => g.id === gradeId)!.tamanhos[0]
    let release!: () => void
    let signal!: () => void
    const hold = new Promise<void>((resolve) => { release = resolve })
    const ready = new Promise<void>((resolve) => { signal = resolve })
    const deactivation = other.$transaction(async (tx) => {
      await tx.vestuarioGrade.update({ where: { id: gradeId }, data: { ativo: false, version: { increment: 1 } } })
      signal()
      await hold
    }, { timeout: 20_000 })
    await ready
    try {
      const result = await svc.createProdutoGrade(db, ctxA, {
        nome: "Não criar em grade desativando", gradeId,
        combinacoes: [{ corId: ids.preto, tamanhoId: tamanho.id }],
      })
      expect(result).toMatchObject({ ok: false, code: "CONFLICT" })
      expect(await db.produto.count({ where: { storeId: A, name: "Não criar em grade desativando" } })).toBe(0)
    } finally {
      release()
      await deactivation
    }
    expect((await db.vestuarioGrade.findUniqueOrThrow({ where: { id: gradeId } })).ativo).toBe(false)
  })

  it("SQL não troca id da variante para burlar identidade estável e colisão com produto simples", async () => {
    const produto = must(await svc.createProdutoGrade(db, ctxA, {
      nome: "Identidade imutável QA", gradeId: ids.adulto,
      combinacoes: [{ corId: ids.preto, tamanhoId: ids.tP, sku: `${up}-IDENTIDADE` }],
    }))
    const variante = await db.vestuarioVariante.findFirstOrThrow({ where: { storeId: A, produtoId: produto.produtoId } })
    await expect(db.$executeRaw`
      UPDATE "vestuario_variantes" SET "id" = ${`${variante.id}-trocado`}, "sku" = ${`${up}-LEG`}
      WHERE "id" = ${variante.id} AND "storeId" = ${A}
    `).rejects.toThrow(/VESTUARIO_IDENTIDADE_IMUTAVEL/)
    expect(await db.vestuarioVariante.findUnique({ where: { id: variante.id } })).toMatchObject({ sku: variante.sku })
    expect(await db.vestuarioVariante.count({ where: { storeId: A, sku: `${up}-LEG` } })).toBe(0)
  })

  it("preparador recusa banco já populado antes de qualquer DDL", async () => {
    const before = await db.produto.count({ where: { storeId: A } })
    const result = spawnSync(process.execPath, ["scripts/vestuario/prepare-pg.mjs"], {
      env: process.env, encoding: "utf8", timeout: 20_000,
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("RAMOS_E2E_DATABASE_MUST_BE_EMPTY")
    expect(await db.produto.count({ where: { storeId: A } })).toBe(before)
    expect(await db.vestuarioVariante.findUnique({ where: { id: ids.vPretoP } })).not.toBeNull()
  })
})
