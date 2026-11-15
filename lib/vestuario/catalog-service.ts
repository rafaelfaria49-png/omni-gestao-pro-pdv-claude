/**
 * OMNI-VESTUARIO-P02 — writer/reader do catálogo de grade (grades, tamanhos, cores, produto com grade,
 * variantes). server-only. Recebe `storeId` JÁ AUTORIZADO pelo gate do servidor; nunca lê loja do payload.
 *
 * - Toda escrita roda em UMA transação com auditoria (`logs_auditoria`) e, quando mexe em identificador
 *   (SKU/código interno/SKU do pai), o mesmo advisory lock por loja usado pelos triggers do banco.
 * - Integridade autoritativa no banco (FKs compostas com storeId, uniques, CHECKs, triggers); as checagens
 *   aqui só produzem mensagens claras antes do erro do banco.
 * - Concorrência: `catalogVersion` do produto e `version` da variante (expectedVersion → CONFLICT).
 * - NÃO movimenta saldo, NÃO vende, NÃO gera código de barras/GTIN, NÃO converte produto legado.
 *   O produto pai nasce com estoque 0 pelo writer canônico de produto e recebe a declaração P01
 *   (`metadata.vestuario` COM_GRADE) que mantém os writers legados de venda/estoque bloqueados.
 */
import "server-only"

import { z } from "zod"
import { Prisma, type PrismaClient } from "@/generated/prisma"
import { createProductTx, type ProductWriteTx } from "@/lib/cadastros/product-write-service"
import { cadastrosAuditLogFields, type CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"
import { CATALOG_DECLARATION_CONTRACT } from "./guard-contract"
import { COST_SCALE, PRICE_SCALE } from "./money"
import {
  BARCODE_INTERNO_MAX, COR_NOME_MAX, GRADE_NOME_MAX, MAX_TAMANHOS_POR_GRADE, MAX_VARIANTES_POR_OPERACAO,
  ORDEM_MAX, SKU_MAX, TAMANHO_ROTULO_MAX, cleanLabel, comboKey, labelKey, normalizeBarcodeInterno, normalizeHex,
  normalizeVariantSku, parseOptionalMoney, variantSituacao, type VariantSituacao,
} from "./catalog-normalize"

export const VESTUARIO_AUDIT_SOURCE = "vestuario-catalog-service"
/** Coluna `precoCentavos` é INTEGER (INT4): R$ 21.474.836,47. */
const PRECO_CENTAVOS_MAX = 2_147_483_647

export type CatalogContext = { storeId: string; principal: CadastrosAuditPrincipal | null }
export type CatalogFailureCode = "VALIDATION" | "NOT_FOUND" | "DUPLICATE" | "CONFLICT" | "IN_USE" | "UNTRUSTED"
export type CatalogFailure = { ok: false; code: CatalogFailureCode; message: string; field?: string }
export type CatalogResult<T> = { ok: true; value: T } | CatalogFailure

export type TamanhoDTO = { id: string; gradeId: string; rotulo: string; ordem: number; ativo: boolean; emUso: boolean }
export type GradeDTO = { id: string; nome: string; ativo: boolean; version: number; tamanhos: TamanhoDTO[] }
export type CorDTO = { id: string; nome: string; hex: string | null; ordem: number; ativo: boolean; emUso: boolean }
export type VarianteDTO = {
  id: string; corId: string; tamanhoId: string; sku: string | null; barcodeInterno: string | null
  precoCentavos: number | null; custoMicros: number | null; ativo: boolean; version: number; situacao: VariantSituacao
}
export type ProdutoGradeDTO = {
  produtoId: string; nome: string; sku: string | null; categoria: string | null; marca: string; fornecedor: string
  precoCentavos: number; custoCentavos: number; ativo: boolean; catalogVersion: number
  grade: { id: string; nome: string; tamanhos: TamanhoDTO[] }
  variantes: VarianteDTO[]
}
export type ProdutoGradeResumoDTO = {
  produtoId: string; nome: string; gradeNome: string; ativo: boolean; variantes: number; ativas: number; rascunhos: number
}

type Tx = Prisma.TransactionClient
const fail = (code: CatalogFailureCode, message: string, field?: string): CatalogFailure => ({ ok: false, code, message, ...(field ? { field } : {}) })
const ok = <T>(value: T): CatalogResult<T> => ({ ok: true, value })

function trusted(ctx: CatalogContext | null | undefined): CatalogContext | null {
  const storeId = (ctx?.storeId ?? "").trim()
  if (!storeId || storeId !== ctx?.storeId) return null
  if (ctx.principal && !(ctx.principal.userId ?? "").trim()) return null
  return ctx
}
const actor = (ctx: CatalogContext) => (ctx.principal?.userId ?? "").slice(0, 200)

const id = z.string().trim().min(1).max(128)
const version = z.number().int().min(1).max(2_000_000_000)
const optText = (max: number) => z.string().max(max * 4).optional()

function parse<T>(schema: z.ZodType<T>, input: unknown): CatalogResult<T> {
  const r = schema.safeParse(input)
  if (r.success) return ok(r.data)
  const issue = r.error.issues[0]
  return fail("VALIDATION", "Dados inválidos para o cadastro de grade.", issue?.path.join(".") || undefined)
}

async function audit(tx: Tx, ctx: CatalogContext, action: string, detail: string, meta: Record<string, unknown>) {
  const fields = cadastrosAuditLogFields(ctx.principal)
  await tx.logsAuditoria.create({
    data: {
      action: `vestuario.${action}`,
      userLabel: fields.userLabel,
      detail: `${fields.userLabel || "Sistema"} ${detail} (loja ${ctx.storeId}).`.slice(0, 2000),
      metadata: JSON.stringify({ storeId: ctx.storeId, ...meta, ...fields.actorMeta }).slice(0, 20_000),
      source: VESTUARIO_AUDIT_SOURCE,
    },
  })
}

/**
 * Lock EXCLUSIVO de identificadores da loja. Espera no máximo 3 s: enquanto um pedido exclusivo está na fila,
 * o PostgreSQL segura também os pedidos compartilhados novos (cadastros de produto da loja), então a espera
 * é limitada para não represar o legado atrás de uma importação longa. Estourou → CONFLICT ("tente de novo").
 */
async function identLock(tx: Tx, storeId: string) {
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '3s'`)
  await tx.$executeRaw`SELECT "vestuario_ident_lock"(${storeId})`
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout TO DEFAULT`)
}

/** Traduz erros do banco (constraints/triggers) em falhas estáveis; o resto propaga. */
function mapDbError(e: unknown): CatalogFailure | null {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes("VESTUARIO_IDENTIFICADOR_DUPLICADO")) return fail("DUPLICATE", "Código já usado por outro produto ou variação desta loja.", "sku")
  if (msg.includes("VESTUARIO_TAMANHO_EM_USO")) return fail("IN_USE", "Tamanho vinculado a variações não pode ser renomeado. Crie outro e desative este.", "rotulo")
  if (msg.includes("VESTUARIO_IDENTIDADE_IMUTAVEL")) return fail("CONFLICT", "Loja, produto, grade, cor e tamanho de uma variação não mudam.")
  if (msg.includes("VESTUARIO_EXCLUSAO_PROIBIDA")) return fail("IN_USE", "Registros de variação não são excluídos; desative.")
  if (msg.includes("lock timeout") || msg.includes("55P03")) {
    return fail("CONFLICT", "Há cadastro de produtos em andamento nesta loja (ex.: importação). Nada foi alterado; tente de novo em instantes.")
  }
  // Checagem estrutural: no bundle do Next a classe do erro pode não ser a mesma instância (instanceof falha).
  const known = e as { code?: unknown; meta?: { target?: unknown } } | null
  const code = typeof known?.code === "string" ? known.code : ""
  if (/^P\d{4}$/.test(code)) {
    if (code === "P2002") {
      const target = JSON.stringify(known?.meta?.target ?? "") + msg
      if (target.includes("nomeKey")) return fail("DUPLICATE", "Já existe um cadastro com esse nome nesta loja.", "nome")
      if (target.includes("rotuloKey")) return fail("DUPLICATE", "Esse tamanho já existe nesta grade.", "rotulo")
      if (target.includes("corId")) return fail("DUPLICATE", "Essa combinação de cor e tamanho já existe neste produto.", "combinacoes")
      if (target.includes("sku") || target.includes("barcode")) return fail("DUPLICATE", "Código já usado por outro produto ou variação desta loja.", "sku")
      return fail("DUPLICATE", "Registro duplicado.")
    }
    if (code === "P2003") return fail("IN_USE", "Referência inválida ou em uso por outro cadastro.")
    if (code === "P2025") return fail("NOT_FOUND", "Registro não encontrado nesta loja.")
    if (code === "P2034") return fail("CONFLICT", "Outra alteração concorrente foi gravada. Recarregue e tente de novo.")
  }
  return null
}

async function run<T>(db: PrismaClient, ctx: CatalogContext, fn: (tx: Tx) => Promise<CatalogResult<T>>): Promise<CatalogResult<T>> {
  try {
    // Resultados de falha lançam para desfazer a transação inteira (nenhuma escrita parcial).
    return await db.$transaction(async (tx) => {
      const r = await fn(tx)
      if (!r.ok) throw new RollbackSignal(r)
      return r
    }, { timeout: 15_000, maxWait: 10_000 })
  } catch (e) {
    if (e instanceof RollbackSignal) return e.result
    const mapped = mapDbError(e)
    if (mapped) return mapped
    throw e
  }
}
class RollbackSignal extends Error {
  constructor(readonly result: CatalogFailure) { super(result.code) }
}

// ───────────────────────────── leitura ─────────────────────────────

export async function listCatalogo(db: PrismaClient, storeId: string): Promise<{ grades: GradeDTO[]; cores: CorDTO[] }> {
  const [grades, cores, tamanhosUsados, coresUsadas] = await Promise.all([
    db.vestuarioGrade.findMany({
      where: { storeId }, orderBy: [{ ativo: "desc" }, { nome: "asc" }], take: 200,
      select: { id: true, nome: true, ativo: true, version: true, tamanhos: { orderBy: [{ ordem: "asc" }, { rotulo: "asc" }], select: { id: true, gradeId: true, rotulo: true, ordem: true, ativo: true } } },
    }),
    db.vestuarioCor.findMany({ where: { storeId }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], take: 500, select: { id: true, nome: true, hex: true, ordem: true, ativo: true } }),
    db.vestuarioVariante.groupBy({ by: ["tamanhoId"], where: { storeId } }),
    db.vestuarioVariante.groupBy({ by: ["corId"], where: { storeId } }),
  ])
  const tu = new Set(tamanhosUsados.map((t) => t.tamanhoId))
  const cu = new Set(coresUsadas.map((c) => c.corId))
  return {
    grades: grades.map((g) => ({ ...g, tamanhos: g.tamanhos.map((t) => ({ ...t, emUso: tu.has(t.id) })) })),
    cores: cores.map((c) => ({ ...c, emUso: cu.has(c.id) })),
  }
}

export async function listProdutosGrade(
  db: PrismaClient, storeId: string, opts: { cursor?: string | null; take?: number; q?: string } = {},
): Promise<{ items: ProdutoGradeResumoDTO[]; nextCursor: string | null }> {
  const take = Math.min(Math.max(Math.trunc(opts.take ?? 30), 1), 60)
  const q = cleanLabel(opts.q ?? "", 80)
  const rows = await db.vestuarioProdutoGrade.findMany({
    where: { storeId, ...(q ? { produto: { name: { contains: q, mode: "insensitive" } } } : {}) },
    orderBy: { id: "asc" }, take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: { id: true, produtoId: true, produto: { select: { name: true, active: true } }, grade: { select: { nome: true } } },
  })
  const page = rows.slice(0, take)
  const counts = page.length
    ? await db.vestuarioVariante.groupBy({
        by: ["produtoId", "ativo"], where: { storeId, produtoId: { in: page.map((r) => r.produtoId) } }, _count: { _all: true },
      })
    : []
  const drafts = page.length
    ? await db.vestuarioVariante.groupBy({
        by: ["produtoId"], where: { storeId, ativo: true, produtoId: { in: page.map((r) => r.produtoId) }, OR: [{ sku: null }, { barcodeInterno: null }] }, _count: { _all: true },
      })
    : []
  return {
    items: page.map((r) => {
      const mine = counts.filter((c) => c.produtoId === r.produtoId)
      return {
        produtoId: r.produtoId, nome: r.produto.name, gradeNome: r.grade.nome, ativo: r.produto.active,
        variantes: mine.reduce((s, c) => s + c._count._all, 0),
        ativas: mine.filter((c) => c.ativo).reduce((s, c) => s + c._count._all, 0),
        rascunhos: drafts.find((d) => d.produtoId === r.produtoId)?._count._all ?? 0,
      }
    }),
    nextCursor: rows.length > take ? page[page.length - 1].id : null,
  }
}

const varianteSelect = {
  id: true, corId: true, tamanhoId: true, sku: true, barcodeInterno: true, precoCentavos: true, custoMicros: true, ativo: true, version: true,
} satisfies Prisma.VestuarioVarianteSelect

function varianteDTO(v: Prisma.VestuarioVarianteGetPayload<{ select: typeof varianteSelect }>): VarianteDTO {
  return { ...v, custoMicros: v.custoMicros === null ? null : Number(v.custoMicros), situacao: variantSituacao(v) }
}

export async function getProdutoGrade(db: PrismaClient | Tx, storeId: string, produtoId: string): Promise<ProdutoGradeDTO | null> {
  const row = await db.vestuarioProdutoGrade.findFirst({
    where: { storeId, produtoId },
    select: {
      catalogVersion: true,
      produto: { select: { id: true, name: true, sku: true, category: true, brand: true, supplierName: true, price: true, precoCusto: true, active: true } },
      grade: { select: { id: true, nome: true, tamanhos: { orderBy: [{ ordem: "asc" }, { rotulo: "asc" }], select: { id: true, gradeId: true, rotulo: true, ordem: true, ativo: true } } } },
      variantes: { orderBy: { createdAt: "asc" }, select: varianteSelect },
    },
  })
  if (!row) return null
  const used = new Set(row.variantes.map((v) => v.tamanhoId))
  return {
    produtoId: row.produto.id, nome: row.produto.name, sku: row.produto.sku, categoria: row.produto.category,
    marca: row.produto.brand, fornecedor: row.produto.supplierName,
    precoCentavos: Math.round(row.produto.price * 100), custoCentavos: Math.round(row.produto.precoCusto * 100),
    ativo: row.produto.active, catalogVersion: row.catalogVersion,
    grade: { id: row.grade.id, nome: row.grade.nome, tamanhos: row.grade.tamanhos.map((t) => ({ ...t, emUso: used.has(t.id) })) },
    variantes: row.variantes.map(varianteDTO),
  }
}

// ───────────────────────────── grades e tamanhos ─────────────────────────────

const createGradeSchema = z.object({ nome: z.string(), tamanhos: z.array(z.string()).max(MAX_TAMANHOS_POR_GRADE).optional() }).strict()

export async function createGrade(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ id: string }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(createGradeSchema, input); if (!p.ok) return p
  const nome = cleanLabel(p.value.nome, GRADE_NOME_MAX); if (!nome) return fail("VALIDATION", `Nome da grade: 1 a ${GRADE_NOME_MAX} caracteres.`, "nome")
  const rotulos: string[] = []
  const keys = new Set<string>()
  for (const raw of p.value.tamanhos ?? []) {
    const r = cleanLabel(raw, TAMANHO_ROTULO_MAX)
    if (!r) return fail("VALIDATION", `Tamanho: 1 a ${TAMANHO_ROTULO_MAX} caracteres.`, "tamanhos")
    if (keys.has(labelKey(r))) return fail("DUPLICATE", `Tamanho "${r}" repetido na grade.`, "tamanhos")
    keys.add(labelKey(r)); rotulos.push(r)
  }
  return run(db, ctx, async (tx) => {
    const g = await tx.vestuarioGrade.create({ data: { storeId: ctx.storeId, nome, nomeKey: labelKey(nome), createdBy: actor(ctx), updatedBy: actor(ctx) }, select: { id: true } })
    if (rotulos.length) {
      await tx.vestuarioTamanho.createMany({ data: rotulos.map((rotulo, i) => ({ storeId: ctx.storeId, gradeId: g.id, rotulo, rotuloKey: labelKey(rotulo), ordem: i + 1 })) })
    }
    await audit(tx, ctx, "grade.create", `criou a grade "${nome}" com ${rotulos.length} tamanho(s)`, { gradeId: g.id, nome, tamanhos: rotulos })
    return ok(g)
  })
}

const updateGradeSchema = z.object({ id, nome: optText(GRADE_NOME_MAX), ativo: z.boolean().optional(), expectedVersion: version }).strict()

export async function updateGrade(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ id: string; version: number }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(updateGradeSchema, input); if (!p.ok) return p
  const data: Prisma.VestuarioGradeUpdateManyMutationInput = { updatedBy: actor(ctx), version: { increment: 1 } }
  if (p.value.nome !== undefined) {
    const nome = cleanLabel(p.value.nome, GRADE_NOME_MAX); if (!nome) return fail("VALIDATION", `Nome da grade: 1 a ${GRADE_NOME_MAX} caracteres.`, "nome")
    data.nome = nome; data.nomeKey = labelKey(nome)
  }
  if (p.value.ativo !== undefined) data.ativo = p.value.ativo
  return run(db, ctx, async (tx) => {
    const r = await tx.vestuarioGrade.updateMany({ where: { id: p.value.id, storeId: ctx.storeId, version: p.value.expectedVersion }, data })
    if (r.count !== 1) {
      const exists = await tx.vestuarioGrade.count({ where: { id: p.value.id, storeId: ctx.storeId } })
      return exists ? fail("CONFLICT", "A grade foi alterada por outra pessoa. Recarregue.") : fail("NOT_FOUND", "Grade não encontrada nesta loja.")
    }
    await audit(tx, ctx, "grade.update", "alterou uma grade", { gradeId: p.value.id, campos: Object.keys(p.value).filter((k) => k !== "id" && k !== "expectedVersion") })
    return ok({ id: p.value.id, version: p.value.expectedVersion + 1 })
  })
}

async function lockGrade(tx: Tx, ctx: CatalogContext, gradeId: string): Promise<boolean> {
  // Serializa mudanças de tamanhos da MESMA grade (ordem/inclusão) sem travar a loja inteira.
  const r = await tx.vestuarioGrade.updateMany({ where: { id: gradeId, storeId: ctx.storeId }, data: { version: { increment: 1 }, updatedBy: actor(ctx) } })
  return r.count === 1
}

const addTamanhoSchema = z.object({ gradeId: id, rotulo: z.string() }).strict()

export async function addTamanho(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ id: string }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(addTamanhoSchema, input); if (!p.ok) return p
  const rotulo = cleanLabel(p.value.rotulo, TAMANHO_ROTULO_MAX); if (!rotulo) return fail("VALIDATION", `Tamanho: 1 a ${TAMANHO_ROTULO_MAX} caracteres.`, "rotulo")
  return run(db, ctx, async (tx) => {
    if (!(await lockGrade(tx, ctx, p.value.gradeId))) return fail("NOT_FOUND", "Grade não encontrada nesta loja.")
    const agg = await tx.vestuarioTamanho.aggregate({ where: { storeId: ctx.storeId, gradeId: p.value.gradeId }, _max: { ordem: true }, _count: { _all: true } })
    if (agg._count._all >= MAX_TAMANHOS_POR_GRADE) return fail("VALIDATION", `Uma grade aceita até ${MAX_TAMANHOS_POR_GRADE} tamanhos.`, "rotulo")
    const t = await tx.vestuarioTamanho.create({
      data: { storeId: ctx.storeId, gradeId: p.value.gradeId, rotulo, rotuloKey: labelKey(rotulo), ordem: Math.min((agg._max.ordem ?? 0) + 1, ORDEM_MAX) }, select: { id: true },
    })
    await audit(tx, ctx, "tamanho.create", `incluiu o tamanho "${rotulo}"`, { gradeId: p.value.gradeId, tamanhoId: t.id, rotulo })
    return ok(t)
  })
}

const updateTamanhoSchema = z.object({ id, rotulo: optText(TAMANHO_ROTULO_MAX), ativo: z.boolean().optional() }).strict()

export async function updateTamanho(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ id: string }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(updateTamanhoSchema, input); if (!p.ok) return p
  const data: Prisma.VestuarioTamanhoUpdateManyMutationInput = {}
  if (p.value.rotulo !== undefined) {
    const rotulo = cleanLabel(p.value.rotulo, TAMANHO_ROTULO_MAX); if (!rotulo) return fail("VALIDATION", `Tamanho: 1 a ${TAMANHO_ROTULO_MAX} caracteres.`, "rotulo")
    data.rotulo = rotulo; data.rotuloKey = labelKey(rotulo)
  }
  if (p.value.ativo !== undefined) data.ativo = p.value.ativo
  if (!Object.keys(data).length) return fail("VALIDATION", "Nada para alterar.")
  return run(db, ctx, async (tx) => {
    const r = await tx.vestuarioTamanho.updateMany({ where: { id: p.value.id, storeId: ctx.storeId }, data })
    if (r.count !== 1) return fail("NOT_FOUND", "Tamanho não encontrado nesta loja.")
    await audit(tx, ctx, "tamanho.update", "alterou um tamanho", { tamanhoId: p.value.id, ...data })
    return ok({ id: p.value.id })
  })
}

const reorderSchema = z.object({ gradeId: id.optional(), ids: z.array(id).min(1).max(500) }).strict()

export async function reorderTamanhos(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ count: number }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(reorderSchema, input); if (!p.ok) return p
  const gradeId = p.value.gradeId; if (!gradeId) return fail("VALIDATION", "Grade obrigatória.", "gradeId")
  if (new Set(p.value.ids).size !== p.value.ids.length) return fail("VALIDATION", "Ordem com tamanho repetido.", "ids")
  return run(db, ctx, async (tx) => {
    if (!(await lockGrade(tx, ctx, gradeId))) return fail("NOT_FOUND", "Grade não encontrada nesta loja.")
    const atuais = await tx.vestuarioTamanho.findMany({ where: { storeId: ctx.storeId, gradeId }, select: { id: true } })
    const set = new Set(atuais.map((t) => t.id))
    if (atuais.length !== p.value.ids.length || p.value.ids.some((i) => !set.has(i))) return fail("CONFLICT", "A lista de tamanhos mudou. Recarregue antes de reordenar.")
    for (const [i, tid] of p.value.ids.entries()) {
      await tx.vestuarioTamanho.updateMany({ where: { id: tid, storeId: ctx.storeId, gradeId }, data: { ordem: i + 1 } })
    }
    await audit(tx, ctx, "tamanho.reorder", "reordenou os tamanhos de uma grade", { gradeId, ids: p.value.ids })
    return ok({ count: p.value.ids.length })
  })
}

// ───────────────────────────── cores ─────────────────────────────

const createCorSchema = z.object({ nome: z.string(), hex: z.string().max(16).nullable().optional() }).strict()

export async function createCor(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ id: string }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(createCorSchema, input); if (!p.ok) return p
  const nome = cleanLabel(p.value.nome, COR_NOME_MAX); if (!nome) return fail("VALIDATION", `Nome da cor: 1 a ${COR_NOME_MAX} caracteres.`, "nome")
  const hex = normalizeHex(p.value.hex); if (!hex.ok) return fail("VALIDATION", hex.message, "hex")
  return run(db, ctx, async (tx) => {
    const agg = await tx.vestuarioCor.aggregate({ where: { storeId: ctx.storeId }, _max: { ordem: true } })
    const c = await tx.vestuarioCor.create({
      data: { storeId: ctx.storeId, nome, nomeKey: labelKey(nome), hex: hex.value, ordem: Math.min((agg._max.ordem ?? 0) + 1, ORDEM_MAX), createdBy: actor(ctx), updatedBy: actor(ctx) },
      select: { id: true },
    })
    await audit(tx, ctx, "cor.create", `criou a cor "${nome}"`, { corId: c.id, nome, hex: hex.value })
    return ok(c)
  })
}

const updateCorSchema = z.object({ id, nome: optText(COR_NOME_MAX), hex: z.string().max(16).nullable().optional(), ativo: z.boolean().optional() }).strict()

export async function updateCor(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ id: string }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(updateCorSchema, input); if (!p.ok) return p
  const data: Prisma.VestuarioCorUpdateManyMutationInput = { updatedBy: actor(ctx) }
  if (p.value.nome !== undefined) {
    const nome = cleanLabel(p.value.nome, COR_NOME_MAX); if (!nome) return fail("VALIDATION", `Nome da cor: 1 a ${COR_NOME_MAX} caracteres.`, "nome")
    data.nome = nome; data.nomeKey = labelKey(nome)
  }
  if (p.value.hex !== undefined) {
    const hex = normalizeHex(p.value.hex); if (!hex.ok) return fail("VALIDATION", hex.message, "hex")
    data.hex = hex.value
  }
  if (p.value.ativo !== undefined) data.ativo = p.value.ativo
  return run(db, ctx, async (tx) => {
    const r = await tx.vestuarioCor.updateMany({ where: { id: p.value.id, storeId: ctx.storeId }, data })
    if (r.count !== 1) return fail("NOT_FOUND", "Cor não encontrada nesta loja.")
    const { updatedBy: _u, ...campos } = data
    await audit(tx, ctx, "cor.update", "alterou uma cor", { corId: p.value.id, ...campos })
    return ok({ id: p.value.id })
  })
}

export async function reorderCores(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ count: number }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(reorderSchema, input); if (!p.ok) return p
  if (new Set(p.value.ids).size !== p.value.ids.length) return fail("VALIDATION", "Ordem com cor repetida.", "ids")
  return run(db, ctx, async (tx) => {
    const n = await tx.vestuarioCor.count({ where: { storeId: ctx.storeId, id: { in: p.value.ids } } })
    if (n !== p.value.ids.length) return fail("NOT_FOUND", "Alguma cor não pertence a esta loja.")
    for (const [i, cid] of p.value.ids.entries()) {
      await tx.vestuarioCor.updateMany({ where: { id: cid, storeId: ctx.storeId }, data: { ordem: Math.min(i + 1, ORDEM_MAX) } })
    }
    await audit(tx, ctx, "cor.reorder", "reordenou as cores", { ids: p.value.ids })
    return ok({ count: p.value.ids.length })
  })
}

// ───────────────────────────── produto com grade e variantes ─────────────────────────────

const comboSchema = z.object({
  corId: id, tamanhoId: id,
  sku: z.string().max(SKU_MAX * 2).nullable().optional(),
  barcodeInterno: z.string().max(BARCODE_INTERNO_MAX * 2).nullable().optional(),
}).strict()
type ComboIn = z.infer<typeof comboSchema>
type ComboNorm = { corId: string; tamanhoId: string; sku: string | null; barcodeInterno: string | null }

function normalizeCombos(list: ComboIn[]): CatalogResult<ComboNorm[]> {
  if (list.length > MAX_VARIANTES_POR_OPERACAO) return fail("VALIDATION", `Até ${MAX_VARIANTES_POR_OPERACAO} combinações por vez.`, "combinacoes")
  const seen = new Set<string>()
  const codes = new Set<string>()
  const out: ComboNorm[] = []
  for (const c of list) {
    const k = comboKey(c.corId, c.tamanhoId)
    if (seen.has(k)) return fail("DUPLICATE", "Combinação de cor e tamanho repetida.", "combinacoes")
    seen.add(k)
    const sku = normalizeVariantSku(c.sku); if (!sku.ok) return fail("VALIDATION", sku.message, "sku")
    const bc = normalizeBarcodeInterno(c.barcodeInterno); if (!bc.ok) return fail("VALIDATION", bc.message, "barcodeInterno")
    for (const code of [sku.value, bc.value]) {
      if (!code) continue
      if (codes.has(code) && !(code === sku.value && code === bc.value)) return fail("DUPLICATE", `Código "${code}" repetido entre as combinações.`, "sku")
      codes.add(code)
    }
    out.push({ corId: c.corId, tamanhoId: c.tamanhoId, sku: sku.value, barcodeInterno: bc.value })
  }
  return ok(out)
}

/** Pré-checagem amigável de colisão (o trigger do banco é a autoridade). Chamar sob identLock. */
async function findIdentifierConflict(tx: Tx, storeId: string, codes: string[], excludeVarianteId?: string): Promise<string | null> {
  if (!codes.length) return null
  const prod = await tx.$queryRaw<{ code: string }[]>`
    SELECT c AS code FROM unnest(${codes}::text[]) c
    WHERE EXISTS (SELECT 1 FROM "estoque_produtos" p WHERE p."storeId" = ${storeId} AND (upper(btrim(p."sku")) = c OR upper(btrim(p."barcode")) = c))
    LIMIT 1`
  if (prod.length) return `Código "${prod[0].code}" já é usado por um produto desta loja.`
  const vars = await tx.vestuarioVariante.findFirst({
    where: { storeId, ...(excludeVarianteId ? { id: { not: excludeVarianteId } } : {}), OR: [{ sku: { in: codes } }, { barcodeInterno: { in: codes } }] },
    select: { sku: true, barcodeInterno: true },
  })
  if (vars) {
    const code = codes.find((c) => c === vars.sku || c === vars.barcodeInterno) ?? codes[0]
    return `Código "${code}" já é usado por outra variação desta loja.`
  }
  return null
}

async function validateCombosRefs(tx: Tx, storeId: string, gradeId: string, combos: ComboNorm[], allowInactive: boolean): Promise<CatalogFailure | null> {
  if (!combos.length) return null
  const corIds = [...new Set(combos.map((c) => c.corId))]
  const tamIds = [...new Set(combos.map((c) => c.tamanhoId))]
  // FOR SHARE: uma desativação concorrente de cor/tamanho espera esta transação (sem variação nova sobre inativo).
  const cores = await tx.$queryRaw<{ id: string; ativo: boolean }[]>`
    SELECT "id", "ativo" FROM "vestuario_cores" WHERE "storeId" = ${storeId} AND "id" = ANY(${corIds}::text[]) FOR SHARE`
  const tams = await tx.$queryRaw<{ id: string; ativo: boolean }[]>`
    SELECT "id", "ativo" FROM "vestuario_grade_tamanhos" WHERE "storeId" = ${storeId} AND "gradeId" = ${gradeId} AND "id" = ANY(${tamIds}::text[]) FOR SHARE`
  if (cores.length !== corIds.length) return fail("NOT_FOUND", "Cor não encontrada nesta loja.", "combinacoes")
  if (tams.length !== tamIds.length) return fail("NOT_FOUND", "Tamanho não pertence à grade deste produto.", "combinacoes")
  if (!allowInactive && (cores.some((c) => !c.ativo) || tams.some((t) => !t.ativo))) {
    return fail("VALIDATION", "Cores e tamanhos desativados não podem gerar novas variações.", "combinacoes")
  }
  return null
}

async function insertVariantes(tx: Tx, ctx: CatalogContext, produtoId: string, gradeId: string, combos: ComboNorm[]) {
  const codes = combos.flatMap((c) => [c.sku, c.barcodeInterno]).filter((c): c is string => !!c)
  const conflict = await findIdentifierConflict(tx, ctx.storeId, [...new Set(codes)])
  if (conflict) return fail("DUPLICATE", conflict, "sku")
  const existing = await tx.vestuarioVariante.findMany({ where: { storeId: ctx.storeId, produtoId }, select: { corId: true, tamanhoId: true } })
  const have = new Set(existing.map((e) => comboKey(e.corId, e.tamanhoId)))
  if (combos.some((c) => have.has(comboKey(c.corId, c.tamanhoId)))) return fail("DUPLICATE", "Essa combinação de cor e tamanho já existe neste produto.", "combinacoes")
  await tx.vestuarioVariante.createMany({
    data: combos.map((c) => ({ storeId: ctx.storeId, produtoId, gradeId, corId: c.corId, tamanhoId: c.tamanhoId, sku: c.sku, barcodeInterno: c.barcodeInterno, createdBy: actor(ctx), updatedBy: actor(ctx) })),
  })
  return null
}

const baseFields = {
  nome: z.string().max(400).optional(),
  categoria: z.string().max(400).nullable().optional(),
  marca: z.string().max(400).nullable().optional(),
  fornecedor: z.string().max(400).nullable().optional(),
  preco: z.string().max(32).nullable().optional(),
  custo: z.string().max(32).nullable().optional(),
}

const createProdutoGradeSchema = z.object({
  ...baseFields,
  nome: z.string().max(400),
  skuPai: z.string().max(SKU_MAX * 2).nullable().optional(),
  gradeId: id,
  combinacoes: z.array(comboSchema).min(1).max(MAX_VARIANTES_POR_OPERACAO),
}).strict()

function parsePrecoCusto(v: { preco?: string | null; custo?: string | null }): CatalogResult<{ preco?: number; custo?: number }> {
  const preco = parseOptionalMoney(v.preco ?? undefined, PRICE_SCALE, "Preço"); if (!preco.ok) return fail("VALIDATION", preco.message, "preco")
  const custo = parseOptionalMoney(v.custo ?? undefined, PRICE_SCALE, "Custo"); if (!custo.ok) return fail("VALIDATION", custo.message, "custo")
  return ok({ ...(preco.value !== null ? { preco: preco.value / 100 } : {}), ...(custo.value !== null ? { custo: custo.value / 100 } : {}) })
}

/**
 * Cria o produto pai (writer canônico de produto, estoque 0) + vínculo autoritativo com a grade +
 * as combinações ESCOLHIDAS (nunca o produto cartesiano implícito). Tudo ou nada.
 */
export async function createProdutoGrade(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ produtoId: string; variantes: number }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(createProdutoGradeSchema, input); if (!p.ok) return p
  const v = p.value
  const nome = cleanLabel(v.nome, 200); if (!nome) return fail("VALIDATION", "Nome do produto obrigatório.", "nome")
  const skuPai = normalizeVariantSku(v.skuPai); if (!skuPai.ok) return fail("VALIDATION", skuPai.message, "skuPai")
  const money = parsePrecoCusto(v); if (!money.ok) return money
  const combos = normalizeCombos(v.combinacoes); if (!combos.ok) return combos
  if (skuPai.value && combos.value.some((c) => c.sku === skuPai.value || c.barcodeInterno === skuPai.value)) {
    return fail("DUPLICATE", "O SKU do produto pai não pode repetir o código de uma variação.", "skuPai")
  }
  return run(db, ctx, async (tx) => {
    await identLock(tx, ctx.storeId)
    const grade = await tx.vestuarioGrade.findFirst({ where: { id: v.gradeId, storeId: ctx.storeId }, select: { id: true, ativo: true, nome: true } })
    if (!grade) return fail("NOT_FOUND", "Grade não encontrada nesta loja.", "gradeId")
    if (!grade.ativo) return fail("VALIDATION", "Grade desativada não pode ser usada em produto novo.", "gradeId")
    const refs = await validateCombosRefs(tx, ctx.storeId, grade.id, combos.value, false); if (refs) return refs
    if (skuPai.value) {
      const conflict = await findIdentifierConflict(tx, ctx.storeId, [skuPai.value])
      if (conflict) return fail("DUPLICATE", conflict, "skuPai")
    }
    const created = await createProductTx(tx as unknown as ProductWriteTx, { storeId: ctx.storeId, principal: ctx.principal }, {
      nome, sku: skuPai.value ?? undefined, categoria: v.categoria ?? undefined, marca: v.marca ?? undefined,
      fornecedor: v.fornecedor ?? undefined, ...(money.value.preco !== undefined ? { preco: money.value.preco } : {}),
      ...(money.value.custo !== undefined ? { custo: money.value.custo } : {}), estoque: 0,
    })
    if (!created.ok) return fail(created.code === "DUPLICATE" ? "DUPLICATE" : "VALIDATION", created.message, created.field)
    const row = await tx.produto.findFirst({ where: { id: created.id, storeId: ctx.storeId }, select: { metadata: true } })
    const meta = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : {}
    // Marcador P01: mantém os writers legados de venda/estoque recusando o pai sem variante.
    await tx.produto.update({
      where: { id: created.id },
      data: { metadata: { ...meta, vestuario: { contract: CATALOG_DECLARATION_CONTRACT, version: 1, mode: "COM_GRADE", gradeId: grade.id } } as Prisma.InputJsonValue },
    })
    await tx.vestuarioProdutoGrade.create({ data: { storeId: ctx.storeId, produtoId: created.id, gradeId: grade.id, createdBy: actor(ctx) } })
    const err = await insertVariantes(tx, ctx, created.id, grade.id, combos.value); if (err) return err
    await audit(tx, ctx, "produto.create", `criou o produto com grade "${nome}" (${grade.nome}, ${combos.value.length} variação(ões))`, {
      produtoId: created.id, gradeId: grade.id, combinacoes: combos.value,
    })
    return ok({ produtoId: created.id, variantes: combos.value.length })
  })
}

async function bumpProduto(tx: Tx, ctx: CatalogContext, produtoId: string, expected: number): Promise<CatalogFailure | { gradeId: string }> {
  const r = await tx.vestuarioProdutoGrade.updateMany({ where: { storeId: ctx.storeId, produtoId, catalogVersion: expected }, data: { catalogVersion: { increment: 1 } } })
  const row = await tx.vestuarioProdutoGrade.findFirst({ where: { storeId: ctx.storeId, produtoId }, select: { gradeId: true } })
  if (!row) return fail("NOT_FOUND", "Produto com grade não encontrado nesta loja.")
  if (r.count !== 1) return fail("CONFLICT", "O produto foi alterado por outra pessoa. Recarregue antes de salvar.")
  return row
}

const updateBaseSchema = z.object({ produtoId: id, expectedVersion: version, ...baseFields, ativo: z.boolean().optional() }).strict()

/** Edita dados comuns do pai (o writer legado de produto recusa produtos com grade — guard P01). */
export async function updateProdutoGradeBase(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ catalogVersion: number }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(updateBaseSchema, input); if (!p.ok) return p
  const v = p.value
  const data: Prisma.ProdutoUpdateManyMutationInput = {}
  if (v.nome !== undefined) { const n = cleanLabel(v.nome, 200); if (!n) return fail("VALIDATION", "Nome do produto obrigatório.", "nome"); data.name = n }
  // Vazio limpa o campo; texto acima do limite é recusado (nunca truncado/apagado em silêncio).
  const optional = (raw: string | null | undefined, max: number, field: string): CatalogResult<string | null> => {
    const text = (raw ?? "").trim()
    if (!text) return ok(null)
    const c = cleanLabel(text, max)
    return c ? ok(c) : fail("VALIDATION", `${field}: até ${max} caracteres.`, field.toLowerCase())
  }
  if (v.categoria !== undefined) { const c = optional(v.categoria, 120, "Categoria"); if (!c.ok) return c; data.category = c.value }
  if (v.marca !== undefined) { const c = optional(v.marca, 120, "Marca"); if (!c.ok) return c; data.brand = c.value ?? "" }
  if (v.fornecedor !== undefined) { const c = optional(v.fornecedor, 200, "Fornecedor"); if (!c.ok) return c; data.supplierName = c.value ?? "" }
  const money = parsePrecoCusto(v); if (!money.ok) return money
  if (v.preco !== undefined) data.price = money.value.preco ?? 0
  if (v.custo !== undefined) data.precoCusto = money.value.custo ?? 0
  if (v.ativo !== undefined) { data.active = v.ativo; data.status = v.ativo ? "Ativo" : "Inativo" }
  if (!Object.keys(data).length) return fail("VALIDATION", "Nada para alterar.")
  return run(db, ctx, async (tx) => {
    const b = await bumpProduto(tx, ctx, v.produtoId, v.expectedVersion); if ("ok" in b) return b
    await tx.produto.updateMany({ where: { id: v.produtoId, storeId: ctx.storeId }, data })
    await audit(tx, ctx, "produto.update", "alterou dados do produto com grade", { produtoId: v.produtoId, campos: Object.keys(data) })
    return ok({ catalogVersion: v.expectedVersion + 1 })
  })
}

const addVariantesSchema = z.object({ produtoId: id, expectedVersion: version, combinacoes: z.array(comboSchema).min(1).max(MAX_VARIANTES_POR_OPERACAO) }).strict()

export async function addVariantes(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ variantes: number; catalogVersion: number }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(addVariantesSchema, input); if (!p.ok) return p
  const combos = normalizeCombos(p.value.combinacoes); if (!combos.ok) return combos
  return run(db, ctx, async (tx) => {
    await identLock(tx, ctx.storeId)
    const b = await bumpProduto(tx, ctx, p.value.produtoId, p.value.expectedVersion); if ("ok" in b) return b
    const grade = await tx.$queryRaw<{ ativo: boolean }[]>`SELECT "ativo" FROM "vestuario_grades" WHERE "storeId" = ${ctx.storeId} AND "id" = ${b.gradeId} FOR SHARE`
    if (!grade[0]?.ativo) return fail("VALIDATION", "Grade desativada não recebe novas variações.", "combinacoes")
    const refs = await validateCombosRefs(tx, ctx.storeId, b.gradeId, combos.value, false); if (refs) return refs
    const err = await insertVariantes(tx, ctx, p.value.produtoId, b.gradeId, combos.value); if (err) return err
    await audit(tx, ctx, "variante.create", `incluiu ${combos.value.length} variação(ões) no produto`, { produtoId: p.value.produtoId, combinacoes: combos.value })
    return ok({ variantes: combos.value.length, catalogVersion: p.value.expectedVersion + 1 })
  })
}

const updateVarianteSchema = z.object({
  varianteId: id, expectedVersion: version,
  sku: z.string().max(SKU_MAX * 2).nullable().optional(),
  barcodeInterno: z.string().max(BARCODE_INTERNO_MAX * 2).nullable().optional(),
  preco: z.string().max(32).nullable().optional(),
  custo: z.string().max(32).nullable().optional(),
  ativo: z.boolean().optional(),
}).strict()

/** SKU/código/preço/custo/ativo. Cor, tamanho e produto da variação são imutáveis (banco garante). */
export async function updateVariante(db: PrismaClient, ctxIn: CatalogContext, input: unknown): Promise<CatalogResult<{ id: string; version: number }>> {
  const ctx = trusted(ctxIn); if (!ctx) return fail("UNTRUSTED", "Contexto de loja não autorizado.")
  const p = parse(updateVarianteSchema, input); if (!p.ok) return p
  const v = p.value
  const data: Prisma.VestuarioVarianteUpdateManyMutationInput = { updatedBy: actor(ctx), version: { increment: 1 } }
  const codes: string[] = []
  if (v.sku !== undefined) { const s = normalizeVariantSku(v.sku); if (!s.ok) return fail("VALIDATION", s.message, "sku"); data.sku = s.value; if (s.value) codes.push(s.value) }
  if (v.barcodeInterno !== undefined) {
    const b = normalizeBarcodeInterno(v.barcodeInterno); if (!b.ok) return fail("VALIDATION", b.message, "barcodeInterno")
    data.barcodeInterno = b.value; if (b.value) codes.push(b.value)
  }
  if (v.preco !== undefined) {
    const m = parseOptionalMoney(v.preco ?? undefined, PRICE_SCALE, "Preço"); if (!m.ok) return fail("VALIDATION", m.message, "preco")
    if (m.value !== null && m.value > PRECO_CENTAVOS_MAX) return fail("VALIDATION", "Preço acima do limite aceito.", "preco")
    data.precoCentavos = m.value
  }
  if (v.custo !== undefined) {
    const m = parseOptionalMoney(v.custo ?? undefined, COST_SCALE, "Custo"); if (!m.ok) return fail("VALIDATION", m.message, "custo")
    data.custoMicros = m.value === null ? null : BigInt(m.value)
  }
  if (v.ativo !== undefined) data.ativo = v.ativo
  if (Object.keys(data).length === 2) return fail("VALIDATION", "Nada para alterar.")
  return run(db, ctx, async (tx) => {
    if (codes.length) {
      await identLock(tx, ctx.storeId)
      const conflict = await findIdentifierConflict(tx, ctx.storeId, [...new Set(codes)], v.varianteId)
      if (conflict) return fail("DUPLICATE", conflict, "sku")
    }
    const cur = await tx.vestuarioVariante.findFirst({ where: { id: v.varianteId, storeId: ctx.storeId }, select: { produtoId: true, gradeId: true, corId: true, tamanhoId: true } })
    if (!cur) return fail("NOT_FOUND", "Variação não encontrada nesta loja.")
    if (v.ativo === true) {
      const refs = await validateCombosRefs(tx, ctx.storeId, cur.gradeId, [{ corId: cur.corId, tamanhoId: cur.tamanhoId, sku: null, barcodeInterno: null }], false)
      if (refs) return fail("VALIDATION", "Reative a cor e o tamanho antes de reativar esta variação.", "ativo")
    }
    const r = await tx.vestuarioVariante.updateMany({ where: { id: v.varianteId, storeId: ctx.storeId, version: v.expectedVersion }, data })
    if (r.count !== 1) return fail("CONFLICT", "A variação foi alterada por outra pessoa. Recarregue.")
    await tx.vestuarioProdutoGrade.updateMany({ where: { storeId: ctx.storeId, produtoId: cur.produtoId }, data: { catalogVersion: { increment: 1 } } })
    const { updatedBy: _u, version: _v, custoMicros, ...campos } = data
    await audit(tx, ctx, "variante.update", "alterou uma variação", {
      produtoId: cur.produtoId, varianteId: v.varianteId, ...campos, ...(custoMicros !== undefined ? { custoMicros: custoMicros === null ? null : String(custoMicros) } : {}),
    })
    return ok({ id: v.varianteId, version: v.expectedVersion + 1 })
  })
}
