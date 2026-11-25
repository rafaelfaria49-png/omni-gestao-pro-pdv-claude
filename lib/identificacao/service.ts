/** P03: identificação local e snapshots de etiquetas. Nunca vende, reserva ou movimenta estoque. */
import "server-only"
import { createHash, randomInt } from "node:crypto"
import { z } from "zod"
import { Prisma, type PrismaClient } from "@/generated/prisma"
import { cadastrosAuditLogFields } from "@/lib/cadastros/cadastros-audit-principal"
import { validarGtin, validarGtin14 } from "@/lib/cadastros/gtin"
import { chaveNomeCadastro } from "@/lib/cadastros/nome-cadastro"
import { productVariantIssue } from "@/lib/vestuario/guard-contract"
import { decimalToUnits, PRICE_SCALE } from "@/lib/vestuario/money"
import type { CatalogContext } from "@/lib/vestuario/catalog-service"
import {
  activeSchema, attemptEventSchema, attemptSchema, codeKey, id, identifierSchema, internalSchema, jobSchema,
  nextPrintState, operationSchema, reprintSchema, requestKey, snapshotSchema, targetSchema,
  type IdentifierDTO, type JobDTO, type LabelSnapshot, type MutationRef, type Operation, type PrintState, type Result, type Target, type TargetDTO,
} from "./contracts"

type Tx = Prisma.TransactionClient
/** Fronteira mínima: não compara eventos/extensões e delegates alheios ao serviço. */
export type IdentificationDb = Pick<PrismaClient, "$transaction" | "$queryRaw" | "$queryRawUnsafe" | "identificadorProduto" | "etiquetaLote" | "identificacaoSolicitacao">
type Reader = Pick<Tx, "$queryRaw" | "$queryRawUnsafe" | "identificadorProduto" | "etiquetaLote">
class Refusal extends Error { constructor(readonly code: string, message: string) { super(message) } }
const refuse = (code: string, message: string): never => { throw new Refusal(code, message) }
const success = <T>(value: T): Result<T> => ({ ok: true, value })

function context(ctx: CatalogContext): void {
  if (!id.safeParse(ctx?.storeId).success || !id.safeParse(ctx?.principal?.userId).success) refuse("UNTRUSTED", "Sessão e loja autorizadas são obrigatórias.")
}
function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const v = schema.safeParse(input)
  if (!v.success) refuse("VALIDATION", v.error.issues[0]?.message || "Dados inválidos.")
  return v.data
}
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`
  const obj = v as Record<string, unknown>
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`
}
export function requestHash(v: unknown): string { return createHash("sha256").update(canonical(v)).digest("hex") }
export function generateInternalCode(): string {
  // 1 trilhão de sufixos uniformes, sem significado comercial. Code128-C compacta os pares.
  // Identificador público, não segredo de acesso; índice GLOBAL e retry arbitram colisões.
  return `OGV-${String(randomInt(0, 1_000_000_000_000)).padStart(12, "0")}`
}

/** Desconexão/resultado de commit desconhecido nunca é apresentado como rollback confirmado. */
export function failure(e: unknown): Result<never> {
  if (e instanceof Refusal) return { ok: false, code: e.code, message: e.message }
  const s = e instanceof Error ? e.message : String(e)
  const code = (e as { code?: string } | null)?.code
  if (code === "P2002" || /23505|VESTUARIO_IDENTIFICADOR_DUPLICADO/.test(s)) return { ok: false, code: "DUPLICATE", message: "Código já reservado ou conflitante nesta loja." }
  if (/55P03|40P01|lock timeout|deadlock|P2034/.test(s) || code === "P2034") return { ok: false, code: "CONFLICT", message: "Alteração concorrente. Recarregue e repita com a mesma chave de solicitação." }
  if (/23514|P03_|VARIANTE_OBRIGATORIA|VESTUARIO_IDENTIDADE_IMUTAVEL/.test(s) || code === "P2003") return { ok: false, code: "CONFLICT", message: "A operação conflita com a identidade, o estado ou a versão do cadastro. Recarregue os dados." }
  return { ok: false, code: "UNKNOWN_RESULT", message: "Não foi possível confirmar o resultado. Consulte a solicitação ou repita com a mesma chave; não gere outra." }
}

async function audit(tx: Tx, ctx: CatalogContext, operation: string, meta: Record<string, unknown>) {
  const fields = cadastrosAuditLogFields(ctx.principal)
  await tx.logsAuditoria.create({ data: {
    action: `identificacao.${operation}`, source: "identificacao-p03", userLabel: fields.userLabel,
    detail: `${fields.userLabel} registrou ${operation} (loja ${ctx.storeId}).`.slice(0, 2000),
    metadata: JSON.stringify({ storeId: ctx.storeId, ...meta, ...fields.actorMeta }),
  } })
}
function reference(row: { identificadorId: string | null; loteId: string | null; tentativaId: string | null }): MutationRef {
  if (row.identificadorId) return { id: row.identificadorId, kind: "identifier" }
  if (row.loteId) return { id: row.loteId, kind: "job" }
  if (row.tentativaId) return { id: row.tentativaId, kind: "attempt" }
  return refuse("CONFLICT", "Solicitação sem resultado persistido.")
}
async function mutation<S extends z.ZodTypeAny>(
  db: IdentificationDb, ctx: CatalogContext, op: Operation, schema: S, input: unknown,
  fn: (tx: Tx, value: z.output<S>) => Promise<MutationRef>,
): Promise<Result<MutationRef>> {
  try {
    context(ctx)
    const value = parse(schema, input)
    const hash = requestHash(value)
    const result = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'")
      await tx.$executeRaw`SELECT vestuario_ident_lock(${ctx.storeId})`
      const previous = await tx.identificacaoSolicitacao.findUnique({ where: { storeId_operacao_chave: { storeId: ctx.storeId, operacao: op, chave: value.requestKey } } })
      if (previous) {
        if (previous.hash !== hash) refuse("IDEMPOTENCY_CONFLICT", "Esta chave já foi usada com outro conteúdo.")
        return reference(previous)
      }
      const ref = await fn(tx, value)
      await tx.identificacaoSolicitacao.create({ data: {
        storeId: ctx.storeId, operacao: op, chave: value.requestKey, hash, createdBy: ctx.principal!.userId,
        ...(ref.kind === "identifier" ? { identificadorId: ref.id } : ref.kind === "job" ? { loteId: ref.id } : { tentativaId: ref.id }),
      } })
      await audit(tx, ctx, op, { ...ref, requestKey: value.requestKey, requestHash: hash })
      return ref
    }, { timeout: 15_000, maxWait: 10_000 })
    return success(result)
  } catch (e) { return failure(e) }
}

/** Lê só campos necessários: sem custo, saldo, mídia remota nem metadata inteira. */
async function target(db: Reader, storeId: string, t: Target, lock = false): Promise<TargetDTO> {
  // SQL é constante; somente o sufixo booleano interno escolhe o lock. Valores SEMPRE por bind.
  // Evita fragmentos Prisma.sql de identidades diferentes após bundling do Next no E2E real.
  const [p] = await db.$queryRawUnsafe<{ id: string; name: string; sku: string | null; price: number; active: boolean; updatedAt: Date; declaration: Prisma.JsonValue; grade: boolean }[]>(`
    SELECT p."id",p."name",p."sku",p."price",p."active",p."updatedAt",p."metadata"->'vestuario' AS declaration,
      EXISTS(SELECT 1 FROM vestuario_produtos_grade g WHERE g."storeId"=p."storeId" AND g."produtoId"=p."id") AS grade
    FROM estoque_produtos p WHERE p."id"=$1 AND p."storeId"=$2 ${lock ? "FOR SHARE OF p" : ""}`, t.produtoId, storeId)
  if (!p || !p.active) return refuse("NOT_FOUND", "Alvo ativo não encontrado nesta loja.")
  const issue = productVariantIssue({ vestuario: p.declaration })
  if (!t.varianteId && (p.grade || issue)) return refuse(issue?.code || "VARIANTE_OBRIGATORIA", "Produto com grade exige uma variante válida.")
  let sku = p.sku, cor: string | null = null, tamanho: string | null = null, variantVersion: number | null = null, codigoExistente: string | null = null
  let precoCentavos: number | null = null
  try { precoCentavos = decimalToUnits(String(p.price), PRICE_SCALE) } catch { /* Preço legado inválido não é reinterpretado. */ }
  if (t.varianteId) {
    const [v] = await db.$queryRawUnsafe<{ sku: string | null; cor: string; tamanho: string; ativo: boolean; version: number; barcodeInterno: string | null; precoCentavos: number | null }[]>(`
      SELECT v."sku",v."ativo",v."version",v."barcodeInterno",v."precoCentavos",c."nome" AS cor,t."rotulo" AS tamanho
      FROM vestuario_variantes v JOIN vestuario_cores c ON c."id"=v."corId" AND c."storeId"=v."storeId"
      JOIN vestuario_grade_tamanhos t ON t."id"=v."tamanhoId" AND t."storeId"=v."storeId"
      WHERE v."id"=$1 AND v."produtoId"=$2 AND v."storeId"=$3 ${lock ? "FOR SHARE OF v,c,t" : ""}`, t.varianteId, p.id, storeId)
    if (!v || !v.ativo || !p.grade) return refuse("NOT_FOUND", "Variação ativa não encontrada nesta loja/produto.")
    sku = v.sku; cor = v.cor; tamanho = v.tamanho; variantVersion = v.version; codigoExistente = v.barcodeInterno
    precoCentavos = v.precoCentavos ?? precoCentavos
  }
  const internal = await db.identificadorProduto.findFirst({ where: { storeId, produtoId: p.id, varianteId: t.varianteId, tipo: "INTERNO" }, select: { valor: true, ativo: true } })
  return { ...t, nome: p.name, sku, cor, tamanho, variantVersion, updatedAt: p.updatedAt.toISOString(), precoCentavos,
    codigoInterno: internal?.valor ?? null, codigoInternoAtivo: internal?.ativo ?? false, codigoExistente }
}
const identSelect = { id: true, produtoId: true, varianteId: true, tipo: true, valor: true, ativo: true, version: true, formato: true, origem: true, evidencia: true } as const

export async function issueInternal(db: IdentificationDb, ctx: CatalogContext, input: unknown, randomCode: () => string = generateInternalCode): Promise<Result<MutationRef>> {
  // Retry só após unicidade comprovadamente abortada; nunca após erro de rede/commit incerto.
  for (let retry = 0; retry < 3; retry++) {
    let generatedCollision = false
    const result = await mutation(db, ctx, "INTERNO", internalSchema, input, async (tx, value) => {
      const t = await target(tx, ctx.storeId, value.target, true)
      const previous = await tx.identificadorProduto.findFirst({ where: { storeId: ctx.storeId, ...value.target, tipo: "INTERNO" } })
      if (previous) {
        if (!previous.ativo) refuse("INACTIVE", "Código permanente desativado. Reative-o explicitamente; não emita outro.")
        return { id: previous.id, kind: "identifier" }
      }
      if (t.varianteId && t.codigoExistente) {
        if (!value.preservarCodigoExistente) refuse("CONSENT_REQUIRED", "Confirme a preservação do código existente como alias antes de emitir o código interno.")
        const [existing] = await tx.$queryRaw<{ identificadorId: string | null }[]>`SELECT "identificadorId" FROM identificador_chaves WHERE "storeId"=${ctx.storeId} AND "chave"=${codeKey(t.codigoExistente)}`
        if (!existing?.identificadorId) {
          await tx.identificadorProduto.create({ data: { storeId: ctx.storeId, ...value.target, tipo: "ALIAS", valor: t.codigoExistente,
            origem: "MANUAL", evidencia: "Preservação explícita do código da variante P02", createdBy: ctx.principal!.userId } })
        }
        await audit(tx, ctx, "PRESERVAR_CODIGO", { ...value.target, codigo: t.codigoExistente })
      }
      const code = randomCode()
      // Colisão entre lojas também é protegida pelo índice global; usada para classificar retry.
      try {
        const row = await tx.identificadorProduto.create({ data: { storeId: ctx.storeId, ...value.target, tipo: "INTERNO", valor: code,
          formato: "CODE128", origem: "SISTEMA", evidencia: "Emissão explícita P03", createdBy: ctx.principal!.userId } })
        return { id: row.id, kind: "identifier" }
      } catch (e) {
        generatedCollision = (e as { code?: string })?.code === "P2002" || /23505|VESTUARIO_IDENTIFICADOR_DUPLICADO/.test(String(e))
        throw e
      }
    })
    if (result.ok || !generatedCollision || retry === 2) return result
  }
  return { ok: false, code: "CONFLICT", message: "Não foi possível reservar um código. Repita a mesma solicitação." }
}

export async function registerIdentifier(db: IdentificationDb, ctx: CatalogContext, input: unknown) {
  return mutation(db, ctx, "CADASTRAR", identifierSchema, input, async (tx, value) => {
    await target(tx, ctx.storeId, value.target, true)
    const valor = value.valor.trim()
    if (!/^[\x20-\x7e]{1,100}$/.test(valor)) refuse("VALIDATION", "O código novo deve conter de 1 a 100 caracteres ASCII imprimíveis.")
    if (value.tipo === "ALIAS" && /^OGV-[0-9]{12}$/i.test(valor)) refuse("VALIDATION", "O prefixo OGV- com 12 dígitos é reservado para emissão interna do sistema.")
    let formato: string | null = null
    if (value.tipo === "GTIN") {
      const valid = valor.length === 14 ? validarGtin14(valor) : (() => { const v = validarGtin(valor); return v.valid && !v.interno && !/^0+$/.test(valor) })()
      if (!valid || value.origem === "MANUAL") refuse("VALIDATION", "GTIN exige formato/checksum válido e proveniência de fabricante, fornecedor ou marca.")
      formato = ({ 8: "EAN-8", 12: "UPC-A", 13: "EAN-13", 14: "GTIN-14" } as Record<number, string>)[valor.length]
    }
    const existing = await tx.identificadorProduto.findFirst({ where: { storeId: ctx.storeId, ...value.target, valor } })
    if (existing) {
      if (existing.tipo === "ALIAS" && value.tipo === "GTIN" && existing.ativo) {
        await tx.identificadorProduto.update({ where: { id: existing.id }, data: { tipo: "GTIN", formato, origem: value.origem, evidencia: value.evidencia, version: { increment: 1 } } })
        await audit(tx, ctx, "PROMOVER_GTIN", { id: existing.id, valor, origem: value.origem, evidencia: value.evidencia })
        return { id: existing.id, kind: "identifier" }
      }
      return refuse("DUPLICATE", "Identificador já registrado; use a reativação explícita se necessário.")
    }
    const row = await tx.identificadorProduto.create({ data: { storeId: ctx.storeId, ...value.target, tipo: value.tipo, valor, formato,
      origem: value.origem, evidencia: value.evidencia, createdBy: ctx.principal!.userId } })
    await audit(tx, ctx, "PROVENIENCIA", { id: row.id, tipo: row.tipo, valor, origem: value.origem, evidencia: value.evidencia })
    return { id: row.id, kind: "identifier" }
  })
}
export async function setIdentifierActive(db: IdentificationDb, ctx: CatalogContext, input: unknown) {
  return mutation(db, ctx, "ATIVO", activeSchema, input, async (tx, value) => {
    const r = await tx.identificadorProduto.findFirst({ where: { storeId: ctx.storeId, id: value.id } })
    if (!r) return refuse("NOT_FOUND", "Identificador não encontrado nesta loja.")
    if (r.version !== value.expectedVersion) refuse("CONFLICT", "Identificador alterado. Recarregue.")
    if (value.ativo) await target(tx, ctx.storeId, r, true)
    await tx.identificadorProduto.update({ where: { id: r.id }, data: { ativo: value.ativo, version: { increment: 1 } } })
    await audit(tx, ctx, "ESTADO", { id: r.id, ativo: value.ativo })
    return { id: r.id, kind: "identifier" }
  })
}

async function read<T>(ctx: CatalogContext, fn: () => Promise<T>): Promise<Result<T>> {
  try { context(ctx); return success(await fn()) } catch (e) { return failure(e) }
}
export async function listTargets(db: IdentificationDb, ctx: CatalogContext, query: unknown = "") {
  return read(ctx, async () => {
    const q = parse(z.string().trim().max(100), query)
    const tokens = chaveNomeCadastro(q).split(" ").filter(Boolean).slice(0, 10)
    type Row = TargetDTO & { price: number; declaration: Prisma.JsonValue; updatedAt: Date; override: number | null; nomeKey: string; corOrdem: number; tamOrdem: number }
    const rows = await db.$queryRaw<Row[]>`WITH choices AS (
      SELECT p."id" AS "produtoId",NULL::text AS "varianteId",p."name" AS nome,p."sku",NULL::text AS cor,NULL::text AS tamanho,
        p."updatedAt",NULL::int AS "variantVersion",p."price",NULL::int AS override,NULL::text AS "codigoExistente",p."metadata"->'vestuario' AS declaration,
        translate(lower(p."name"),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn') AS "nomeKey",
        0 AS "corOrdem",0 AS "tamOrdem"
      FROM estoque_produtos p
      WHERE p."storeId"=${ctx.storeId} AND p."active" AND NOT EXISTS(SELECT 1 FROM vestuario_produtos_grade g WHERE g."produtoId"=p."id" AND g."storeId"=p."storeId")
      AND (cardinality(${tokens}::text[])=0 OR NOT EXISTS (
        SELECT 1 FROM unnest(${tokens}::text[]) tok
        WHERE strpos(translate(lower(p."name" || ' ' || coalesce(p."sku",'')),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'),tok)=0
      ))
      UNION ALL
      SELECT p."id",v."id",p."name",v."sku",c."nome",t."rotulo",p."updatedAt",v."version",p."price",v."precoCentavos",v."barcodeInterno",p."metadata"->'vestuario',
        translate(lower(p."name"),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'),
        c."ordem",t."ordem"
      FROM vestuario_variantes v JOIN estoque_produtos p ON p."id"=v."produtoId" AND p."storeId"=v."storeId"
      JOIN vestuario_cores c ON c."id"=v."corId" AND c."storeId"=v."storeId"
      JOIN vestuario_grade_tamanhos t ON t."id"=v."tamanhoId" AND t."storeId"=v."storeId"
      WHERE v."storeId"=${ctx.storeId} AND p."active" AND v."ativo"
      AND (cardinality(${tokens}::text[])=0 OR NOT EXISTS (
        SELECT 1 FROM unnest(${tokens}::text[]) tok
        WHERE strpos(translate(lower(p."name" || ' ' || coalesce(v."sku",'') || ' ' || c."nome" || ' ' || t."rotulo"),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'),tok)=0
      ))
      ORDER BY "nomeKey","produtoId","corOrdem",cor NULLS FIRST,"tamOrdem",tamanho NULLS FIRST,"varianteId" NULLS FIRST LIMIT 41)
      SELECT ch.*,i."valor" AS "codigoInterno",coalesce(i."ativo",false) AS "codigoInternoAtivo" FROM choices ch
      LEFT JOIN identificadores_produto i ON i."storeId"=${ctx.storeId} AND i."produtoId"=ch."produtoId" AND i."varianteId" IS NOT DISTINCT FROM ch."varianteId" AND i."tipo"='INTERNO'
      ORDER BY ch."nomeKey",ch."produtoId",ch."corOrdem",ch.cor NULLS FIRST,ch."tamOrdem",ch.tamanho NULLS FIRST,ch."varianteId" NULLS FIRST`
    const items: TargetDTO[] = rows.slice(0, 40).filter(r => r.varianteId || !productVariantIssue({ vestuario: r.declaration })).map(r => {
      let price: number | null = r.override
      if (price === null) try { price = decimalToUnits(String(r.price), PRICE_SCALE) } catch { /* legado preservado */ }
      return { produtoId: r.produtoId, varianteId: r.varianteId, nome: r.nome, sku: r.sku, cor: r.cor, tamanho: r.tamanho,
        updatedAt: r.updatedAt.toISOString(), variantVersion: r.variantVersion, precoCentavos: price, codigoInterno: r.codigoInterno,
        codigoInternoAtivo: r.codigoInternoAtivo, codigoExistente: r.codigoExistente }
    })
    return { items, limited: rows.length > 40 }
  })
}
export async function lookup(db: IdentificationDb, ctx: CatalogContext, input: unknown) {
  return read(ctx, async () => {
    const key = codeKey(parse(z.string().max(160).refine(v => !!v.trim()), input))
    const rows = await db.$queryRaw<(Target & { identificadorId: string | null; ativo: boolean | null })[]>`
      SELECT c."produtoId",c."varianteId",c."identificadorId",i."ativo" FROM identificador_chaves c
      LEFT JOIN identificadores_produto i ON i."id"=c."identificadorId" AND i."storeId"=c."storeId" WHERE c."storeId"=${ctx.storeId} AND c."chave"=${key}
      UNION ALL SELECT pid,vid,NULL::text,NULL::boolean FROM p03_owners(${ctx.storeId},${key})`
    const owners = new Map(rows.map(r => [JSON.stringify([r.produtoId, r.varianteId]), r]))
    if (owners.size > 1) return refuse("AMBIGUOUS", "Código ambíguo: mais de um alvo nesta loja. Revise o cadastro.")
    if (!owners.size) return refuse("NOT_FOUND", "Código não encontrado nesta loja.")
    if (rows.some(r => r.ativo === false)) return refuse("INACTIVE", "Identificador desativado; a reserva permanece e não pode ser reutilizada.")
    return target(db, ctx.storeId, owners.values().next().value!)
  })
}
export async function listIdentifiers(db: IdentificationDb, ctx: CatalogContext, input: unknown): Promise<Result<IdentifierDTO[]>> {
  return read(ctx, async () => {
    const t = parse(targetSchema, input)
    await target(db, ctx.storeId, t)
    return db.identificadorProduto.findMany({ where: { storeId: ctx.storeId, ...t }, select: identSelect, orderBy: { createdAt: "asc" }, take: 100 })
  })
}

export async function createJob(db: IdentificationDb, ctx: CatalogContext, input: unknown) {
  return mutation(db, ctx, "LOTE", jobSchema, input, async (tx, value) => {
    const items: LabelSnapshot["items"] = []
    for (const v of value.items) {
      const t = await target(tx, ctx.storeId, v.target, true)
      if (t.updatedAt !== v.expectedUpdatedAt || t.variantVersion !== v.expectedVariantVersion) refuse("CONFLICT", "Cadastro alterado. Recarregue a seleção antes de gerar etiquetas.")
      const i = await tx.identificadorProduto.findFirst({ where: { storeId: ctx.storeId, ...v.target, tipo: "INTERNO", ativo: true } })
      if (!i) return refuse("INTERNAL_REQUIRED", "Emita ou reative o código interno de cada alvo antes de criar o lote.")
      if (value.media.showPrice && t.precoCentavos === null) refuse("VALIDATION", "Preço legado inválido; revise o cadastro ou gere a etiqueta sem preço.")
      items.push({ ...t, identificadorId: i.id, codigo: i.valor, quantidade: v.quantidade })
    }
    const snapshot = parse(snapshotSchema, { version: 1, createdAt: new Date().toISOString(), media: value.media, items, total: items.reduce((n, x) => n + x.quantidade, 0) })
    const row = await tx.etiquetaLote.create({ data: { storeId: ctx.storeId, snapshot: snapshot as Prisma.InputJsonValue, total: snapshot.total, createdBy: ctx.principal!.userId } })
    return { id: row.id, kind: "job" }
  })
}
async function job(db: Reader, storeId: string, jobId: string): Promise<JobDTO> {
  const row = await db.etiquetaLote.findFirst({ where: { storeId, id: jobId }, include: { tentativas: { orderBy: { createdAt: "desc" }, take: 20 } } })
  if (!row) return refuse("NOT_FOUND", "Lote não encontrado nesta loja.")
  const snapshot = parse(snapshotSchema, row.snapshot)
  // Uma consulta de validação para o lote inteiro (até 50 alvos), sem N+1 nem leitura de preço/custo/saldo.
  const current = await db.$queryRaw<{ varianteId: string | null; productActive: boolean; variantActive: boolean | null; codeValid: boolean; grade: boolean; declaration: Prisma.JsonValue }[]>`
    SELECT r."varianteId",p."active" AS "productActive",v."ativo" AS "variantActive",i."id" IS NOT NULL AS "codeValid",
      EXISTS(SELECT 1 FROM vestuario_produtos_grade g WHERE g."storeId"=${storeId} AND g."produtoId"=p."id") AS grade,p."metadata"->'vestuario' AS declaration
    FROM jsonb_to_recordset(${JSON.stringify(snapshot.items)}::jsonb) AS r("produtoId" text,"varianteId" text,"identificadorId" text,codigo text)
    JOIN estoque_produtos p ON p."id"=r."produtoId" AND p."storeId"=${storeId}
    LEFT JOIN vestuario_variantes v ON v."id"=r."varianteId" AND v."produtoId"=p."id" AND v."storeId"=${storeId}
    LEFT JOIN identificadores_produto i ON i."id"=r."identificadorId" AND i."storeId"=${storeId} AND i."produtoId"=p."id"
      AND i."varianteId" IS NOT DISTINCT FROM r."varianteId" AND i."tipo"='INTERNO' AND i."ativo" AND i."valor"=r.codigo`
  if (current.length !== snapshot.items.length || current.some(r => !r.productActive || !r.codeValid ||
    (r.varianteId ? !r.grade || !r.variantActive : r.grade || !!productVariantIssue({ vestuario: r.declaration })))) {
    refuse("INACTIVE", "Um alvo ou código do lote foi desativado ou alterado. Reimpressão e PDF estão bloqueados.")
  }
  return { id: row.id, total: row.total, originalId: row.originalId, motivo: row.motivo, createdAt: row.createdAt.toISOString(), snapshot,
    tentativas: row.tentativas.map(t => ({ id: t.id, estado: t.estado as PrintState, confirmedBy: t.confirmedBy })) }
}
export async function getJob(db: IdentificationDb, ctx: CatalogContext, jobId: unknown): Promise<Result<JobDTO>> {
  return read(ctx, () => job(db, ctx.storeId, parse(id, jobId)))
}
export async function listJobs(db: IdentificationDb, ctx: CatalogContext) {
  return read(ctx, async () => (await db.etiquetaLote.findMany({ where: { storeId: ctx.storeId },
    select: { id: true, total: true, originalId: true, motivo: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20,
  })).map(r => ({ ...r, createdAt: r.createdAt.toISOString() })))
}
export async function reprintJob(db: IdentificationDb, ctx: CatalogContext, input: unknown) {
  return mutation(db, ctx, "REIMPRIMIR", reprintSchema, input, async (tx, value) => {
    const original = await job(tx, ctx.storeId, value.loteId)
    const row = await tx.etiquetaLote.create({ data: { storeId: ctx.storeId, originalId: original.id, motivo: value.motivo,
      snapshot: original.snapshot as unknown as Prisma.InputJsonValue, total: original.total, createdBy: ctx.principal!.userId } })
    await audit(tx, ctx, "MOTIVO_REIMPRESSAO", { id: row.id, originalId: original.id, motivo: value.motivo })
    return { id: row.id, kind: "job" }
  })
}
export async function startAttempt(db: IdentificationDb, ctx: CatalogContext, input: unknown) {
  return mutation(db, ctx, "TENTATIVA", attemptSchema, input, async (tx, value) => {
    const current = await job(tx, ctx.storeId, value.loteId)
    if (current.tentativas.some(t => t.estado !== "FALHA_ANTES_ENVIO")) {
      refuse("REPRINT_REQUIRED", "Este lote já tem uma solicitação de impressão. Confira o resultado e crie reimpressão explícita com motivo para novo envio.")
    }
    const row = await tx.etiquetaTentativa.create({ data: { storeId: ctx.storeId, loteId: value.loteId, createdBy: ctx.principal!.userId } })
    return { id: row.id, kind: "attempt" }
  })
}
export async function recordAttemptEvent(db: IdentificationDb, ctx: CatalogContext, input: unknown) {
  return mutation(db, ctx, "EVENTO", attemptEventSchema, input, async (tx, value) => {
    const row = await tx.etiquetaTentativa.findFirst({ where: { storeId: ctx.storeId, id: value.tentativaId } })
    if (!row) return refuse("NOT_FOUND", "Tentativa não encontrada nesta loja.")
    const state = nextPrintState(row.estado as PrintState, value.evento)
    await tx.etiquetaTentativa.update({ where: { id: row.id }, data: { estado: state,
      confirmedBy: state === "CONFIRMADO_MANUAL" ? row.confirmedBy ?? ctx.principal!.userId : null } })
    await audit(tx, ctx, "IMPRESSAO_EVENTO", { id: row.id, evento: value.evento, antes: row.estado, depois: state })
    return { id: row.id, kind: "attempt" }
  })
}
export async function recoverRequest(db: IdentificationDb, ctx: CatalogContext, op: unknown, key: unknown) {
  return read(ctx, async () => {
    const row = await db.identificacaoSolicitacao.findUnique({ where: { storeId_operacao_chave: { storeId: ctx.storeId, operacao: parse(operationSchema, op), chave: parse(requestKey, key) } } })
    // Ausente ainda pode estar em execução: não autoriza trocar a chave.
    return row ? reference(row) : null
  })
}
