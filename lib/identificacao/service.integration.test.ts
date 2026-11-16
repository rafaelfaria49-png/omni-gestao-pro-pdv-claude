/** PostgreSQL REAL, somente massa sintética. Sem URL loopback explícita o conjunto é pulado. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { Prisma, PrismaClient } from "@/generated/prisma"
import { mkdir, writeFile } from "node:fs/promises"
import { performance } from "node:perf_hooks"
import * as catalog from "@/lib/vestuario/catalog-service"
import * as svc from "./service"
import { DEFAULT_MEDIA, codeKey, type Result, type Target } from "./contracts"
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
const URL_QA = process.env.VESTUARIO_P03_TEST_DATABASE_URL || ""
if (URL_QA && !/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/vest_p02_[a-z0-9_]+$/.test(URL_QA)) throw new Error("P03 exige PostgreSQL QA loopback vest_p02_* explícito.")
const must = <T>(r: Result<T>): T => { if (!r.ok) throw new Error(`${r.code}: ${r.message}`); return r.value }
describe.skipIf(!URL_QA)("P03 — constraints, emissão, lookup e etiquetas em PG17 descartável", () => {
  // Options explícitas evitam replicar todo TypeMap para cada literal de log; QueryEvent segue tipado.
  const db = new PrismaClient<Prisma.PrismaClientOptions, "query">({ datasourceUrl: URL_QA, log: [{ emit: "event", level: "query" }] })
  const other = new PrismaClient<Prisma.PrismaClientOptions>({ datasourceUrl: URL_QA })
  let queries = 0
  let observedQueries: string[] | null = null
  db.$on("query", e => { queries++; observedQueries?.push(e.query.trim()) })
  const run = `p03-${Date.now().toString(36)}`, A = `${run}-a`, B = `${run}-b`
  const ctx = { storeId: A, principal: { userId: "qa-a", displayLabel: "QA A" } }
  const ctxB = { storeId: B, principal: { userId: "qa-b", displayLabel: "QA B" } }
  let seq = 0, parent = "", v1 = "", v2 = "", vOld = "", oldVersion = 0, oldParentVersion = 0, jobId = ""
  const key = () => `${run}-${++seq}`
  const simple: Target = { produtoId: `${run}-simple`, varianteId: null }
  const simpleB: Target = { produtoId: `${run}-simple-b`, varianteId: null }
  let internalId = "", internalCode = ""
  beforeAll(async () => {
    const [identity] = await db.$queryRaw<{ name: string; role: string; dir: string; p03: string | null }[]>`SELECT current_database() AS name,current_user AS role,current_setting('data_directory') AS dir,to_regclass('public.identificador_chaves')::text AS p03`
    expect(identity.name).toBe(new URL(URL_QA).pathname.slice(1)); expect(identity.role).toBe(decodeURIComponent(new URL(URL_QA).username))
    if (process.env.CI !== "true") expect(identity.dir).toMatch(/scratchpad/)
    expect(identity.p03).toBe("identificador_chaves")
    for (const id of [A, B]) await db.store.create({ data: { id, name: id, cnpj: "00.000.000/0000-00", phone: "0" } })
    await db.produto.create({ data: { id: simple.produtoId, storeId: A, name: "Camiseta simples", sku: "SIM-QA", barcode: "LEGACY-001", price: 1.005, stock: 7,
      metadata: { codigosAlias: ["Alias-Legado"], atributos: { tamanho: "M", cor: "Azul" } } } })
    await db.produto.create({ data: { id: simpleB.produtoId, storeId: B, name: "Camiseta B", sku: "SIM-QA", price: 20, stock: 3 } })
    const grade = must(await catalog.createGrade(other, ctx, { nome: "Adulto", tamanhos: ["P", "M", "G", "GG"] }))
    const preto = must(await catalog.createCor(other, ctx, { nome: "Preto" })), azul = must(await catalog.createCor(other, ctx, { nome: "Azul" }))
    const sizes = (await catalog.listCatalogo(other, A)).grades.find(g => g.id === grade.id)!.tamanhos
    const p = must(await catalog.createProdutoGrade(other, ctx, { nome: "Camiseta Algodão São João", preco: "49,90", gradeId: grade.id,
      combinacoes: sizes.flatMap(t => [preto, azul].map(c => ({ corId: c.id, tamanhoId: t.id, sku: `CAM-${c.id}-${t.rotulo}`, ...(c.id === azul.id && t.rotulo === "GG" ? { barcodeInterno: "OLD-VARIANT" } : {}) }))) }))
    parent = p.produtoId
    const dto = (await catalog.getProdutoGrade(other, A, parent))!
    vOld = dto.variantes.find(v => v.barcodeInterno === "OLD-VARIANT")!.id
    v1 = dto.variantes.find(v => v.id !== vOld)!.id; v2 = dto.variantes.find(v => v.id !== vOld && v.id !== v1)!.id
    oldVersion = dto.variantes.find(v => v.id === vOld)!.version; oldParentVersion = dto.catalogVersion
  }, 60_000)
  afterAll(async () => { await db.$disconnect(); await other.$disconnect() })

  it("migration não adota nem corrige silenciosamente ambiguidades históricas", async () => {
    expect(await db.produto.count({ where: { storeId: "p03-history" } })).toBe(2)
    expect(await db.identificadorChave.count({ where: { storeId: "p03-history" } })).toBe(0)
    const history = { ...ctx, storeId: "p03-history" }
    expect(await svc.lookup(db, history, "hist-collision")).toMatchObject({ ok: false, code: "AMBIGUOUS" })
    expect(await svc.lookup(db, history, "\u00a0HIST-ALIAS\t")).toMatchObject({ code: "AMBIGUOUS" })
    expect(must(await svc.lookup(db, history, "\vALIAS-V\u00a0")).produtoId).toBe("p03-hist-a")
    await expect(db.produto.update({ where: { id: "p03-hist-a" }, data: { storeId: B } })).rejects.toThrow(/P03_IDENTIDADE_LOJA_IMUTAVEL/)
    expect((await db.produto.findUniqueOrThrow({ where: { id: "p03-hist-a" } })).stock).toBe(7)
  })
  it("produto com grade exige variante, variante alheia/inexistente é recusada", async () => {
    expect(await svc.issueInternal(db, ctx, { target: { produtoId: parent }, requestKey: key() })).toMatchObject({ code: "VARIANTE_OBRIGATORIA" })
    expect(await svc.issueInternal(db, ctxB, { target: { produtoId: parent, varianteId: v1 }, requestKey: key() })).toMatchObject({ code: "NOT_FOUND" })
    expect(await svc.issueInternal(db, ctx, { target: { ...simple, varianteId: v1 }, requestKey: key() })).toMatchObject({ code: "NOT_FOUND" })
    expect(await svc.issueInternal(db, { ...ctx, principal: null }, { target: simple, requestKey: key() })).toMatchObject({ code: "UNTRUSTED" })
    expect(await svc.issueInternal(db, ctx, { target: { produtoId: "x'OR('1'='1')--" }, requestKey: key() })).toMatchObject({ code: "NOT_FOUND" })
  })
  it("normalizador SQL coincide com o contrato JS para whitespace e caixa ASCII", async () => {
    const whites = [9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279]
    const samples = whites.map(c => String.fromCodePoint(c) + "Abc-v áßａｂｃ" + String.fromCodePoint(c))
    const rows = await db.$queryRaw<{ value: string; key: string }[]>`SELECT value,public.p03_key(value) AS key FROM unnest(${samples}::text[]) t(value)`
    expect(rows.map(r => r.key)).toEqual(rows.map(r => codeKey(r.value)))
  })
  it("geração concorrente mesma solicitação e chaves diferentes devolvem uma identidade permanente", async () => {
    const requestKey = key(), payload = { target: simple, requestKey }
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => svc.issueInternal(i % 2 ? other : db, ctx, payload)))
    const ids = results.map(r => must(r).id)
    expect(new Set(ids).size).toBe(1); internalId = ids[0]
    const replay = must(await svc.issueInternal(db, ctx, { ...payload, requestKey: key() }))
    expect(replay.id).toBe(internalId)
    internalCode = (await db.identificadorProduto.findUniqueOrThrow({ where: { id: internalId } })).valor
    expect(internalCode).toMatch(/^OGV-[0-9]{12}$/)
    expect(await db.identificadorProduto.count({ where: { storeId: A, ...simple, tipo: "INTERNO" } })).toBe(1)
    expect(await svc.issueInternal(db, ctx, { ...payload, preservarCodigoExistente: true })).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" })
    expect(must(await svc.recoverRequest(db, ctx, "INTERNO", requestKey))?.id).toBe(internalId)
    expect(must(await svc.recoverRequest(db, ctxB, "INTERNO", requestKey))).toBeNull()
  }, 60_000)
  it("simples mantém barcode, SKU, metadata e saldo integralmente; preço da etiqueta usa HALF_UP P01", async () => {
    const row = await db.produto.findUniqueOrThrow({ where: { id: simple.produtoId } })
    expect(row).toMatchObject({ sku: "SIM-QA", barcode: "LEGACY-001", stock: 7, price: 1.005, metadata: { codigosAlias: ["Alias-Legado"], atributos: { tamanho: "M", cor: "Azul" } } })
    expect(must(await svc.lookup(db, ctx, internalCode.toLowerCase())).precoCentavos).toBe(101)
    expect(must(await svc.lookup(db, ctx, "Alias-Legado")).produtoId).toBe(simple.produtoId)
    expect(await svc.lookup(db, ctxB, internalCode)).toMatchObject({ code: "NOT_FOUND" })
  })
  it("código antigo de variante exige consentimento e projeção incrementa as versões P02", async () => {
    const t = { produtoId: parent, varianteId: vOld }
    expect(await svc.issueInternal(db, ctx, { target: t, requestKey: key() })).toMatchObject({ code: "CONSENT_REQUIRED" })
    expect(await db.identificadorProduto.count({ where: { storeId: A, varianteId: vOld } })).toBe(0)
    must(await svc.issueInternal(db, ctx, { target: t, preservarCodigoExistente: true, requestKey: key() }))
    const v = await db.vestuarioVariante.findUniqueOrThrow({ where: { id: vOld } })
    expect(v.barcodeInterno).toMatch(/^OGV-/); expect(v.version).toBe(oldVersion + 1)
    expect((await catalog.getProdutoGrade(other, A, parent))!.catalogVersion).toBe(oldParentVersion + 1)
    expect(must(await svc.lookup(db, ctx, "old-variant")).varianteId).toBe(vOld)
    expect(await catalog.addVariantes(other, ctx, { produtoId: parent, expectedVersion: oldParentVersion, combinacoes: [] })).toMatchObject({ ok: false })
    await expect(db.vestuarioVariante.update({ where: { id: vOld }, data: { barcodeInterno: "OVERRIDE" } })).rejects.toThrow(/VESTUARIO_IDENTIDADE_IMUTAVEL/)
  })
  it("colisão aleatória global aborta a tentativa e repete só após rollback conhecido", async () => {
    const collision = internalCode
    let n = 0
    const ref = must(await svc.issueInternal(db, ctxB, { target: simpleB, requestKey: key() }, () => ++n === 1 ? collision : svc.generateInternalCode()))
    expect(n).toBe(2)
    expect((await db.identificadorProduto.findUniqueOrThrow({ where: { id: ref.id } })).valor).not.toBe(collision)
  })
  it("códigos P03 permanentes bloqueiam SKU/barcode/alias legado, inclusive SQL direto", async () => {
    await expect(db.produto.create({ data: { storeId: A, name: "Colisão", barcode: internalCode } })).rejects.toThrow()
    await expect(db.produto.update({ where: { id: simple.produtoId }, data: { sku: "OLD-VARIANT" } })).rejects.toThrow()
    await expect(db.produto.create({ data: { storeId: A, name: "Alias em colisão", metadata: { codigosAlias: [internalCode.toLowerCase()] } } })).rejects.toThrow()
    await expect(db.identificadorChave.delete({ where: { storeId_chave: { storeId: A, chave: internalCode } } })).rejects.toThrow(/P03_RESERVA_PERMANENTE/)
    await expect(db.identificadorProduto.delete({ where: { id: internalId } })).rejects.toThrow(/P03_IDENTIDADE_PERMANENTE/)
  })
  it("refs correntes só liberam chave após remoção da última fonte; delete simples continua possível", async () => {
    const p = await db.produto.create({ data: { storeId: A, name: "Reuso legado", sku: "REUSO-QA", barcode: "REUSO-QA" } })
    await db.produto.update({ where: { id: p.id }, data: { sku: null } })
    expect(await db.identificadorChave.count({ where: { storeId: A, chave: "REUSO-QA" } })).toBe(1)
    await expect(db.produto.create({ data: { storeId: A, name: "Não pode reutilizar", sku: "REUSO-QA" } })).rejects.toThrow()
    await db.produto.update({ where: { id: p.id }, data: { barcode: null } })
    expect(await db.identificadorChave.count({ where: { storeId: A, chave: "REUSO-QA" } })).toBe(0)
    await db.produto.delete({ where: { id: p.id } })
    expect(await db.identificadorChave.count({ where: { storeId: A, produtoId: p.id } })).toBe(0)
  })
  it("corrida simples×simples SKU×barcode e alias×alias tem exatamente um vencedor", async () => {
    const collision = `${run}-concurrent`
    const results = await Promise.allSettled([
      db.produto.create({ data: { storeId: A, name: "Corrida SKU", sku: collision } }),
      other.produto.create({ data: { storeId: A, name: "Corrida barcode", barcode: collision } }),
    ])
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1)
    const p1 = await db.produto.create({ data: { storeId: A, name: "Alias 1" } }), p2 = await db.produto.create({ data: { storeId: A, name: "Alias 2" } })
    const aliases = await Promise.allSettled([
      db.produto.update({ where: { id: p1.id }, data: { metadata: { codigosAlias: [`${collision}-alias`] } } }),
      other.produto.update({ where: { id: p2.id }, data: { metadata: { codigosAlias: [`${collision}-alias`] } } }),
    ])
    expect(aliases.filter(r => r.status === "fulfilled")).toHaveLength(1)
  })
  it("alias→GTIN explícito conserva id/valor e reserva equivalências UPC/EAN/GTIN14", async () => {
    const data = { target: simple, tipo: "ALIAS", valor: "036000291452", origem: "MANUAL", evidencia: "Etiqueta sintética" }
    const alias = must(await svc.registerIdentifier(db, ctx, { ...data, requestKey: key() }))
    const gtin = must(await svc.registerIdentifier(db, ctx, { ...data, tipo: "GTIN", origem: "FABRICANTE", evidencia: "Ficha sintética do fabricante", requestKey: key() }))
    expect(gtin.id).toBe(alias.id)
    for (const value of ["036000291452", "0036000291452", "00036000291452"]) expect(must(await svc.lookup(db, ctx, value)).produtoId).toBe(simple.produtoId)
    expect(await svc.registerIdentifier(db, ctx, { ...data, target: { produtoId: parent, varianteId: v1 }, tipo: "GTIN", origem: "MARCA", valor: "00036000291452", requestKey: key() })).toMatchObject({ code: "DUPLICATE" })
    const t = { produtoId: parent, varianteId: v2 }
    must(await svc.registerIdentifier(db, ctx, { target: t, tipo: "GTIN", valor: "10012345000017", origem: "FORNECEDOR", evidencia: "Caixa sintética GTIN14", requestKey: key() }))
    expect(must(await svc.lookup(db, ctx, "10012345000017")).varianteId).toBe(v2)
    expect(await svc.lookup(db, ctx, "0012345000017")).toMatchObject({ code: "NOT_FOUND" })
    expect(await svc.registerIdentifier(db, ctx, { ...data, tipo: "GTIN", valor: "00000000000000", origem: "MARCA", requestKey: key() })).toMatchObject({ code: "VALIDATION" })
  })
  it("identificador desativado continua reservado; reativação exige versão e não cria código novo", async () => {
    const i = await db.identificadorProduto.findUniqueOrThrow({ where: { id: internalId } })
    must(await svc.setIdentifierActive(db, ctx, { id: i.id, ativo: false, expectedVersion: i.version, requestKey: key() }))
    expect(await svc.lookup(db, ctx, internalCode)).toMatchObject({ code: "INACTIVE" })
    expect(await svc.issueInternal(db, ctx, { target: simple, requestKey: key() })).toMatchObject({ code: "INACTIVE" })
    await expect(db.produto.create({ data: { storeId: A, name: "Reutilização indevida", sku: internalCode } })).rejects.toThrow()
    expect(await svc.setIdentifierActive(db, ctxB, { id: i.id, ativo: true, expectedVersion: i.version + 1, requestKey: key() })).toMatchObject({ code: "NOT_FOUND" })
    must(await svc.setIdentifierActive(db, ctx, { id: i.id, ativo: true, expectedVersion: i.version + 1, requestKey: key() }))
    expect(must(await svc.lookup(db, ctx, internalCode)).codigoInterno).toBe(internalCode)
  })
  it("lote é snapshot autoritativo, idempotente, sem preço quando configurado e com versões", async () => {
    must(await svc.issueInternal(db, ctx, { target: { produtoId: parent, varianteId: v1 }, requestKey: key() }))
    const t = must(await svc.lookup(db, ctx, internalCode))
    const v = (must(await svc.listTargets(db, ctx, "Camiseta"))).items.find(x => x.varianteId === v1)!
    const payload = { requestKey: key(), media: { ...DEFAULT_MEDIA, showPrice: true }, items: [t, v].map(x => ({ target: x, quantidade: 2, expectedUpdatedAt: x.updatedAt, expectedVariantVersion: x.variantVersion })) }
    const valid = { ...payload, items: payload.items.map(x => ({ ...x, target: { produtoId: x.target.produtoId, varianteId: x.target.varianteId } })) }
    expect(await svc.createJob(db, ctx, payload)).toMatchObject({ code: "VALIDATION" }) // snapshots do cliente não são aceitos
    const ref = must(await svc.createJob(db, ctx, valid)); jobId = ref.id
    expect(must(await svc.createJob(db, ctx, valid)).id).toBe(jobId)
    const j = must(await svc.getJob(db, ctx, jobId))
    expect(j.snapshot.items.map(x => x.precoCentavos)).toEqual([101, 4990]); expect(j.total).toBe(4)
    await db.produto.update({ where: { id: simple.produtoId }, data: { name: "Nome posterior", price: 99 } })
    expect(must(await svc.getJob(db, ctx, jobId)).snapshot).toEqual(j.snapshot)
    expect(await svc.createJob(db, ctx, { ...valid, requestKey: key() })).toMatchObject({ code: "CONFLICT" })
    expect(await svc.getJob(db, ctxB, jobId)).toMatchObject({ code: "NOT_FOUND" })
    await expect(db.etiquetaLote.update({ where: { id: jobId }, data: { total: 5 } })).rejects.toThrow(/P03_REGISTRO_IMUTAVEL/)
  })
  it("reimprimir preserva snapshot/código; motivo obrigatório e isolamento garantido no banco", async () => {
    const original = must(await svc.getJob(db, ctx, jobId))
    expect(await svc.reprintJob(db, ctx, { loteId: jobId, motivo: "", requestKey: key() })).toMatchObject({ code: "VALIDATION" })
    const reprint = must(await svc.reprintJob(db, ctx, { loteId: jobId, motivo: "Papel sintético amassado", requestKey: key() }))
    expect(must(await svc.getJob(db, ctx, reprint.id)).snapshot).toEqual(original.snapshot)
    await expect(db.etiquetaLote.create({ data: { storeId: B, originalId: jobId, snapshot: original.snapshot as unknown as Prisma.InputJsonValue, total: 4, motivo: "Tentativa cross-store", createdBy: "qa" } })).rejects.toThrow()
    await expect(db.identificadorProduto.create({ data: { storeId: B, produtoId: simple.produtoId, tipo: "ALIAS", valor: "OTHER-STORE", origem: "MANUAL", evidencia: "Não autorizado", createdBy: "qa" } })).rejects.toThrow()
    await expect(db.identificadorChave.create({ data: { storeId: B, chave: "CROSS", produtoId: simpleB.produtoId, identificadorId: internalId } })).rejects.toThrow()
  })
  it("tentativa e eventos são idempotentes; diálogo não significa sucesso físico; ack atrasado é monotônico", async () => {
    const payload = { loteId: jobId, requestKey: key() }
    const attempt = must(await svc.startAttempt(db, ctx, payload))
    expect(must(await svc.startAttempt(db, ctx, payload)).id).toBe(attempt.id)
    must(await svc.recordAttemptEvent(db, ctx, { tentativaId: attempt.id, evento: "DIALOGO_SOLICITADO", requestKey: key() }))
    expect((await db.etiquetaTentativa.findUniqueOrThrow({ where: { id: attempt.id } })).estado).toBe("RESULTADO_DESCONHECIDO")
    must(await svc.recordAttemptEvent(db, ctx, { tentativaId: attempt.id, evento: "CONFIRMAR_MANUAL", requestKey: key() }))
    must(await svc.recordAttemptEvent(db, ctx, { tentativaId: attempt.id, evento: "DIALOGO_SOLICITADO", requestKey: key() }))
    expect(await db.etiquetaTentativa.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({ estado: "CONFIRMADO_MANUAL", confirmedBy: "qa-a" })
    await expect(db.etiquetaTentativa.update({ where: { id: attempt.id }, data: { estado: "RESULTADO_DESCONHECIDO", confirmedBy: null } })).rejects.toThrow(/P03_TRANSICAO_INVALIDA/)
    expect(await svc.recordAttemptEvent(db, ctxB, { tentativaId: attempt.id, evento: "CONFIRMAR_MANUAL", requestKey: key() })).toMatchObject({ code: "NOT_FOUND" })
    expect(await svc.startAttempt(db, ctx, { loteId: jobId, requestKey: key() })).toMatchObject({ code: "REPRINT_REQUIRED" })
    expect(must(await svc.startAttempt(db, ctx, payload)).id).toBe(attempt.id)
    await expect(db.etiquetaTentativa.create({ data: { storeId: A, loteId: jobId, createdBy: "qa-a" } })).rejects.toThrow(/P03_REIMPRESSAO_OBRIGATORIA/)
  })
  it("espera advisory limitada retorna conflito e não grava solicitação parcial", async () => {
    let release!: () => void, ready!: () => void
    const held = new Promise<void>(resolve => { ready = resolve }), finish = new Promise<void>(resolve => { release = resolve })
    const blocker = other.$transaction(async tx => { await tx.$executeRaw`SELECT vestuario_ident_lock(${A})`; ready(); await finish }, { timeout: 10_000 })
    await held
    const requestKey = key(), start = Date.now()
    try {
      expect(await svc.issueInternal(db, ctx, { target: simple, requestKey })).toMatchObject({ code: "CONFLICT" })
      expect(Date.now() - start).toBeLessThan(7000)
    } finally { release(); await blocker }
    expect(await db.identificacaoSolicitacao.count({ where: { storeId: A, chave: requestKey } })).toBe(0)
  }, 15_000)
  it("nenhuma operação P03 criou estoque/reserva/venda; auditoria preserva o ator", async () => {
    expect(await db.movimentacaoEstoque.count({ where: { produtoId: { in: [simple.produtoId, parent] } } })).toBe(0)
    expect((await db.produto.findUniqueOrThrow({ where: { id: simple.produtoId } })).stock).toBe(7)
    expect((await db.produto.findUniqueOrThrow({ where: { id: parent } })).stock).toBe(0)
    const audit = await db.logsAuditoria.findFirstOrThrow({ where: { source: "identificacao-p03", metadata: { contains: internalId } } })
    expect(JSON.parse(audit.metadata || "{}")).toMatchObject({ storeId: A, actor: { userId: "qa-a" } })
  })
  it("leitores não fazem N+1 e medem footprint/tempo em catálogo sintético", async () => {
    const perfStore = `${run}-perf`, perfCtx = { ...ctx, storeId: perfStore }
    await db.store.create({ data: { id: perfStore, name: "Performance QA", cnpj: "00.000.000/0000-00", phone: "0" } })
    const start = performance.now()
    await db.produto.createMany({ data: Array.from({ length: 100 }, (_, n) => ({ storeId: perfStore, name: `Produto sintético ${n}`, sku: `PERF-${n}`, barcode: `PERFBAR-${n}`, metadata: { codigosAlias: [`PERFALIAS-${n}`] } })) })
    const write100Ms = performance.now() - start
    queries = 0
    observedQueries = []
    const listStart = performance.now(), list = must(await svc.listTargets(db, perfCtx))
    const listMs = performance.now() - listStart, listQueries = queries, listStatements = [...observedQueries]
    expect(list.items).toHaveLength(40); expect(list.limited).toBe(true)
    // O pool pode enviar SELECT 1 de saúde antes de entregar a conexão. A leitura de dados é única.
    expect(listStatements.filter(sql => sql.startsWith("WITH choices AS"))).toHaveLength(1)
    expect(listStatements.filter(sql => sql !== "SELECT 1")).toHaveLength(1)
    expect(listQueries).toBeLessThanOrEqual(2)
    queries = 0
    observedQueries = []
    const jobStart = performance.now(); must(await svc.getJob(db, ctx, jobId))
    const jobMs = performance.now() - jobStart, jobQueries = queries
    observedQueries = null
    expect(jobQueries).toBeLessThanOrEqual(4)
    const size = await db.$queryRaw<{ tableName: string; bytes: bigint }[]>`SELECT c.relname AS "tableName",pg_total_relation_size(c.oid) AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('identificadores_produto','identificador_chaves','etiqueta_lotes','etiqueta_tentativas','identificacao_solicitacoes','p03_produto_chaves_gin','p03_variante_chaves_gin') ORDER BY c.relname`
    await mkdir("test-results/vestuario-p03", { recursive: true })
    await writeFile("test-results/vestuario-p03/postgres-metrics.json", JSON.stringify({ catalogSize: 100, write100Ms: Math.round(write100Ms),
      list: { queries: listQueries, ms: Math.round(listMs), statementKinds: listStatements.map(sql => sql === "SELECT 1" ? "pool-health" : "bounded-batch-read") }, job: { targets: 2, queries: jobQueries, ms: Math.round(jobMs) }, relations: size.map(r => ({ ...r, bytes: Number(r.bytes) })),
      note: "Medição QA local com outros testes no mesmo PG; não é benchmark de capacidade Production." }, null, 2))
  })
})
