/**
 * CAD-R2-005 — ProductWriteService: boundary canônico server-side de escrita
 * de Produto (CREATE / UPDATE do cadastro-base).
 *
 * server-only: nunca importado por Client Components.
 *
 * O QUE ESTE SERVIÇO FAZ
 * - Recebe um `ProductWriteContext` JÁ PROVADO pelo servidor (loja autorizada
 *   + principal canônico). `storeId`/autoria vindos do payload são ignorados.
 * - Normaliza deterministicamente (trim; vazio→null nos identificadores;
 *   mesma entrada ⇒ mesmo resultado; sem IA, sem rede, sem browser).
 * - Valida invariantes universais de cadastro (fail-closed, erros estruturados).
 * - Checa duplicidade FORTE de SKU/barcode DENTRO da mesma store, reutilizando
 *   `duplicateProductDetails` + `PRODUTO_DUP_SELECT` e os uniques por loja
 *   (`storeId_sku`, `storeId_barcode`). Mesma SKU/EAN em outra loja NÃO bloqueia.
 * - UPDATE parcial não-destrutivo: campo ausente ≠ campo limpo; metadata faz
 *   merge aditivo de 2 níveis (`mergeProdutoMetadataTwoLevels`); fiscal e
 *   acessórios usam os helpers canônicos existentes.
 * - Persiste via Prisma dentro de UMA transação junto com o audit
 *   (`tx.produto.*` + `tx.logsAuditoria.create` — padrão do bulk-action).
 * - Audita com o principal canônico (`cadastrosAuditLogFields`); caller nunca
 *   escolhe o ator.
 *
 * O QUE ESTE SERVIÇO NÃO FAZ (escopo bloqueado)
 * - NÃO migra callers existentes (Server Actions, REST, bulk, imports, IA, PDV).
 * - NÃO permite PATCH de saldo: `updateProduct` com `estoque`/`stock` explícito
 *   falha (VALIDATION) — saldo só muda pelo boundary de estoque (CAD-R2-009).
 *   `createProduct` aceita `estoque`/`stock` como ESTOQUE INICIAL, aplicado via
 *   Stock/Ledger (`entrada`, origem `cadastro`) na MESMA transação de criação,
 *   gerando `Produto.stock` + `ProdutoDeposito` + `MovimentacaoEstoque` sem
 *   janela inconsistente. `stock: 0`/ausente = sem ledger.
 * - NÃO valida dígito verificador GTIN no write path (nenhum writer atual faz;
 *   `validarGtin` continua disponível para leitura/scanner).
 * - NÃO exige `price` no create: default 0, como o `upsertProduto`; preço zero
 *   bloqueia ATIVAÇÃO na conferência (`avaliarAptidaoAtivacao`), não o cadastro.
 * - Top-level `catalogoAparelhos` passa pelo contrato canônico existente
 *   (`catalogoInputFromBody` + `mergeCatalogoAparelhosIntoMetadata`, paridade
 *   com o PATCH REST): ausente = preserva; `metadata.catalogoAparelhos`
 *   continua preservado pelo merge genérico mesmo sem o sinal top-level.
 * - NÃO inventa `null` como "limpar metadata" no update: `metadata: null` é
 *   omissão (paridade com `upsertProduto`), nunca deleção silenciosa.
 * - NÃO valida `produtoStockPatch` por reuso direto: ele ignora inválidos em
 *   silêncio; aqui explícito-mas-inválido é `VALIDATION` (fail-closed).
 */
import "server-only"

import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { cadastrosAuditLogFields } from "@/lib/cadastros/cadastros-audit-principal"
import {
  mergeProdutoMetadataTwoLevels,
  normalizeProdutoIdentifier,
} from "@/lib/cadastros/produto-upsert-metadata"
import {
  mergeProdutoAcessoriosIntoMetadata,
  produtoAcessoriosInputFromBody,
} from "@/lib/acessorios/metadata"
import {
  catalogoInputFromBody,
  mergeCatalogoAparelhosIntoMetadata,
} from "@/lib/catalogo-aparelhos/produto-metadata"
import { fiscalInputFromBody } from "@/lib/produto-fiscal"
import { canonicalizeProdutoFiscalMetadata } from "@/lib/produtos/produto-fiscal-upsert"
import { StockIdempotency } from "@/lib/estoque/stock-ledger-contract"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import {
  duplicateProductDetails,
  PRODUTO_DUP_SELECT,
} from "@/lib/produtos/duplicate-product"
import {
  productWriteInvalid,
  productWriteUntrusted,
  type ProductWriteContext,
  type ProductWriteField,
  type ProductWriteInput,
  type ProductWriteResult,
} from "@/lib/cadastros/product-write-contract"

/** Fonte de auditoria — coluna livre, identifica o boundary sem redesenhar schema. */
export const PRODUCT_WRITE_AUDIT_SOURCE = "product-write-service"

/** Delegate mínimo usado pelo serviço (falsificável em testes; Prisma real em produção). */
export type ProductWriteTx = Omit<StockLedgerTx, "produto"> & {
  // `update` preciso do cadastro (sem a assinatura genérica `args: unknown` da
  // base, que sombrearia o retorno `{ id }` na interseção).
  produto: Omit<StockLedgerTx["produto"], "update"> & {
    create(args: Prisma.ProdutoCreateArgs): Promise<{ id: string }>
    update(args: Prisma.ProdutoUpdateArgs): Promise<{ id: string }>
  }
  logsAuditoria: {
    create(args: Prisma.LogsAuditoriaCreateArgs): Promise<unknown>
  }
}

/** Linha lida do banco — subconjunto conforme o `select` de cada consulta. */
export type ProductWriteFoundRow = {
  id: string
  name?: string
  storeId?: string
  sku?: string | null
  barcode?: string | null
  stock?: number
  metadata?: Prisma.JsonValue | null
}

export type ProductWriteDb = {
  produto: {
    findFirst(args: Prisma.ProdutoFindFirstArgs): Promise<ProductWriteFoundRow | null>
    findUnique(args: Prisma.ProdutoFindUniqueArgs): Promise<{ id: string; storeId: string } | null>
  }
  $transaction<T>(fn: (tx: ProductWriteTx) => Promise<T>): Promise<T>
}

export type ProductWriteDeps = {
  /** Default: Prisma real. Testes injetam um fake — sem banco, sem mocks de módulo. */
  db?: ProductWriteDb
}

type TrustedContext = { storeId: string; principal: ProductWriteContext["principal"] }

function trustedContext(
  context: ProductWriteContext | null | undefined,
): { error: ProductWriteResult } | { ctx: TrustedContext } {
  if (!context) return { error: productWriteUntrusted() as ProductWriteResult }
  const storeId = (context.storeId ?? "").trim()
  if (!storeId) return { error: productWriteUntrusted() as ProductWriteResult }
  const principal = context.principal ?? null
  if (principal && !(principal.userId ?? "").trim()) {
    return { error: productWriteUntrusted() as ProductWriteResult }
  }
  return { ctx: { storeId, principal } as TrustedContext }
}

function isPrismaKnownError(e: unknown, code: "P2002" | "P2025"): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === code
  const record = e as { code?: unknown; name?: unknown } | null
  return record?.code === code && String(record?.name ?? "").includes("PrismaClientKnown")
}

function firstDefined(input: ProductWriteInput, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = input[key]
    if (value !== undefined) return value
  }
  return undefined
}

function asTrimmedText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") return null
  return value.trim()
}

function normalizeIdentifierField(
  value: unknown,
  field: ProductWriteField,
): { ok: true; value: string | null; touched: boolean } | { ok: false; error: ProductWriteResult } {
  if (value === undefined || value === null) return { ok: true, value: null, touched: false }
  const raw = typeof value === "number" && Number.isFinite(value) ? String(value) : value
  if (typeof raw !== "string") {
    return { ok: false, error: productWriteInvalid(`Campo "${field}" inválido.`, field) }
  }
  return { ok: true, value: normalizeProdutoIdentifier(raw), touched: true }
}

function parseNonNegativeInt(
  value: unknown,
  field: ProductWriteField,
): { ok: true; value: number | undefined } | { ok: false; error: ProductWriteResult } {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  let num: number | null = null
  if (typeof value === "number" && Number.isFinite(value)) num = Math.trunc(value)
  else if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) num = Math.trunc(parsed)
  }
  if (num === null || num < 0) {
    return { ok: false, error: productWriteInvalid(`Campo "${field}" inválido.`, field) }
  }
  return { ok: true, value: num }
}

function parseNonNegativeMoney(
  value: unknown,
  field: ProductWriteField,
):
  | { ok: true; value: number | undefined }
  | { ok: false; error: ProductWriteResult } {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  const num = typeof value === "number" ? value : typeof value === "string" && value.trim() !== ""
    ? Number(value.trim())
    : NaN
  if (!Number.isFinite(num) || num < 0) {
    return { ok: false, error: productWriteInvalid(`Campo "${field}" inválido.`, field) }
  }
  return { ok: true, value: num }
}

type NormalizedPatch = {
  name?: string
  sku: string | null
  skuTouched: boolean
  barcode: string | null
  barcodeTouched: boolean
  category?: string | null
  brand?: string
  supplierName?: string
  stock?: number
  precoCusto?: number
  price?: number
  warrantyDays?: number
  active?: boolean
  status?: string
  changedFields: ProductWriteField[]
}

function normalizePatch(
  input: ProductWriteInput,
  opts: { requireName: boolean },
): { ok: true; patch: NormalizedPatch } | { ok: false; error: ProductWriteResult } {
  const patch: NormalizedPatch = {
    sku: null,
    skuTouched: false,
    barcode: null,
    barcodeTouched: false,
    changedFields: [],
  }

  const rawName = firstDefined(input, "nome", "name")
  const name = asTrimmedText(rawName)
  if (name === null || (rawName !== undefined && name === "")) {
    return { ok: false, error: productWriteInvalid('Campo "nome" é obrigatório.', "nome") }
  }
  if (name) {
    patch.name = name
    patch.changedFields.push("nome")
  } else if (opts.requireName) {
    return { ok: false, error: productWriteInvalid('Campo "nome" é obrigatório.', "nome") }
  }

  const sku = normalizeIdentifierField(firstDefined(input, "sku", "codigo"), "sku")
  if (!sku.ok) return { ok: false, error: sku.error }
  patch.sku = sku.value
  patch.skuTouched = sku.touched
  if (sku.touched) patch.changedFields.push("sku")

  const barcode = normalizeIdentifierField(
    firstDefined(input, "barras", "barcode", "codigoBarras"),
    "barcode",
  )
  if (!barcode.ok) return { ok: false, error: barcode.error }
  patch.barcode = barcode.value
  patch.barcodeTouched = barcode.touched
  if (barcode.touched) patch.changedFields.push("barcode")

  const rawCategory = firstDefined(input, "categoria", "category")
  if (rawCategory !== undefined && rawCategory !== null) {
    const category = asTrimmedText(rawCategory)
    if (category === null) {
      return { ok: false, error: productWriteInvalid('Campo "categoria" inválido.', "categoria") }
    }
    patch.category = category || null
    patch.changedFields.push("categoria")
  }

  const rawBrand = firstDefined(input, "marca", "brand")
  if (rawBrand !== undefined && rawBrand !== null) {
    const brand = asTrimmedText(rawBrand)
    if (brand === null) {
      return { ok: false, error: productWriteInvalid('Campo "marca" inválido.', "marca") }
    }
    patch.brand = brand
    patch.changedFields.push("marca")
  }

  const rawSupplier = firstDefined(input, "fornecedor", "supplierName")
  if (rawSupplier !== undefined && rawSupplier !== null) {
    const supplierName = asTrimmedText(rawSupplier)
    if (supplierName === null) {
      return { ok: false, error: productWriteInvalid('Campo "fornecedor" inválido.', "fornecedor") }
    }
    patch.supplierName = supplierName
    patch.changedFields.push("fornecedor")
  }

  const stock = parseNonNegativeInt(firstDefined(input, "estoque", "stock"), "estoque")
  if (!stock.ok) return { ok: false, error: stock.error }
  if (stock.value !== undefined) {
    patch.stock = stock.value
    patch.changedFields.push("estoque")
  }

  const precoCusto = parseNonNegativeMoney(
    firstDefined(input, "custo", "precoCusto", "cost"),
    "custo",
  )
  if (!precoCusto.ok) return { ok: false, error: precoCusto.error }
  if (precoCusto.value !== undefined) {
    patch.precoCusto = precoCusto.value
    patch.changedFields.push("custo")
  }

  const price = parseNonNegativeMoney(firstDefined(input, "preco", "price"), "preco")
  if (!price.ok) return { ok: false, error: price.error }
  if (price.value !== undefined) {
    patch.price = price.value
    patch.changedFields.push("preco")
  }

  const warranty = parseNonNegativeInt(firstDefined(input, "garantia", "warrantyDays"), "garantia")
  if (!warranty.ok) return { ok: false, error: warranty.error }
  if (warranty.value !== undefined) {
    patch.warrantyDays = warranty.value
    patch.changedFields.push("garantia")
  }

  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") {
      return { ok: false, error: productWriteInvalid('Campo "active" inválido.', "active") }
    }
    patch.active = input.active
    patch.changedFields.push("active")
  }

  if (input.status !== undefined && input.status !== null) {
    const status = asTrimmedText(input.status)
    if (status === null) {
      return { ok: false, error: productWriteInvalid('Campo "status" inválido.', "status") }
    }
    if (status) {
      patch.status = status
      patch.changedFields.push("status")
    }
  }

  return { ok: true, patch }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/**
 * Opções explícitas do write (intenção do adapter, nunca heurística).
 * - `clearMetadata`: REST `metadata: null` continua LIMPANDO (DbNull);
 *   interactive `metadata: null` sem a opção continua PRESERVANDO (omissão,
 *   paridade `upsertProduto`). CAD-R2-007.
 */
export type ProductWriteTxOptions = {
  clearMetadata?: boolean
}

export type ProductWriteOptions = ProductWriteTxOptions

/**
 * Resolve o `metadata` final do write.
 * - create: parte do objeto enviado (ou `{}`); update: merge aditivo de 2 níveis.
 * - `accessoryConfig`/`metadata.acessorios`, sinal fiscal e top-level
 *   `catalogoAparelhos` passam pelos contratos canônicos existentes.
 *   Retorna `undefined` quando nada de metadata foi sinalizado (create omite
 *   a coluna; update preserva).
 * - CAD-R2-007: `clearMetadata: true` + `metadata: null` explícito = CLEAR
 *   (DbNull). Sem a opção, `metadata: null` = omissão/preservação.
 */
function resolveMetadata(
  input: ProductWriteInput,
  existingMetadata: unknown,
  opts: { isCreate: boolean; clearMetadata?: boolean },
):
  | { ok: true; metadata: Record<string, unknown> | undefined; clear: boolean }
  | { ok: false; error: ProductWriteResult } {
  const rawMetadata = input.metadata
  if (rawMetadata !== undefined && rawMetadata !== null && !isRecord(rawMetadata)) {
    return { ok: false, error: productWriteInvalid("metadata deve ser objeto JSON ou null.", "metadata") }
  }
  const incoming = isRecord(rawMetadata) ? rawMetadata : null
  const explicitNull = rawMetadata === null
  const accessoryInput = produtoAcessoriosInputFromBody(input)
  const fiscalInput = fiscalInputFromBody(input)
  const catalogoInput = catalogoInputFromBody(input)
  const signaled =
    incoming !== null || accessoryInput.provided || fiscalInput !== null || catalogoInput !== undefined

  // CLEAR explícito do adapter REST: base zerada; namespaces sinalizados
  // (fiscal/acessórios/catálogo) fazem merge sobre `{}` em vez do existente.
  if (!opts.isCreate && opts.clearMetadata && explicitNull) {
    if (!signaled) return { ok: true, metadata: undefined, clear: true }
    let next: Record<string, unknown> = { ...(incoming ?? {}) }
    if (accessoryInput.provided) {
      next = { ...mergeProdutoAcessoriosIntoMetadata(next, accessoryInput.value) }
    }
    if (fiscalInput) {
      next = { ...canonicalizeProdutoFiscalMetadata(next, fiscalInput) }
    }
    if (catalogoInput !== undefined) {
      next = { ...mergeCatalogoAparelhosIntoMetadata(next, catalogoInput) }
    }
    return { ok: true, metadata: next, clear: false }
  }

  if (!signaled) return { ok: true, metadata: undefined, clear: false }

  let next: Record<string, unknown> = opts.isCreate
    ? { ...(incoming ?? {}) }
    : { ...mergeProdutoMetadataTwoLevels(existingMetadata, incoming) }
  if (accessoryInput.provided) {
    next = { ...mergeProdutoAcessoriosIntoMetadata(next, accessoryInput.value) }
  }
  if (fiscalInput) {
    next = { ...canonicalizeProdutoFiscalMetadata(next, fiscalInput) }
  }
  if (catalogoInput !== undefined) {
    next = { ...mergeCatalogoAparelhosIntoMetadata(next, catalogoInput) }
  }
  return { ok: true, metadata: next, clear: false }
}

type DuplicateReader = {
  produto: {
    findFirst(args: Prisma.ProdutoFindFirstArgs): Promise<unknown>
  }
}

async function findDuplicate(
  db: DuplicateReader,
  storeId: string,
  sku: string | null,
  barcode: string | null,
  excludeId?: string,
) {
  const duplicateFields: Prisma.ProdutoWhereInput[] = []
  if (sku) duplicateFields.push({ sku })
  if (barcode) duplicateFields.push({ barcode })
  if (duplicateFields.length === 0) return null
  return db.produto.findFirst({
    where: {
      storeId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: duplicateFields,
    },
    select: PRODUTO_DUP_SELECT,
  }) as unknown as Promise<DuplicateRow | null>
}

type DuplicateRow = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  stock: number
}

function duplicateFailure(
  existing: DuplicateRow,
  sku: string | null,
  barcode: string | null,
  operacao: "create" | "update",
): ProductWriteResult {
  const details = duplicateProductDetails(existing, sku, barcode, { context: operacao })
  return { ok: false, code: "DUPLICATE", message: details.message, field: details.field, produto: details.produto }
}

function auditFields(ctx: TrustedContext) {
  return cadastrosAuditLogFields(ctx.principal)
}

function auditMetadata(
  ctx: TrustedContext,
  operacao: "create" | "update",
  produtoId: string,
  nome: string,
  sku: string | null,
  barcode: string | null,
  changedFields: ProductWriteField[],
): string {
  const audit = auditFields(ctx)
  return JSON.stringify({
    entidade: "Produto",
    operacao,
    produtoId,
    storeId: ctx.storeId,
    nome,
    sku,
    barcode,
    campos: changedFields,
    ...audit.actorMeta,
  })
}

/**
 * CREATE do cadastro-base DENTRO de uma transação já aberta.
 * Componível: import-catalog (categoria + cadastro + StockLedger) chama esta
 * variante com o MESMO `tx` — commit único, sem nested transaction. Mesmas
 * invariantes do `createProduct` (normalização, duplicidade por loja,
 * metadata/fiscal canônicos, estoque inicial via ledger `cadastro`).
 * CAD-R2-014: extensão mínima para composição; não cria segundo motor.
 * Callers sem transação DEVEM usar `createProduct`.
 */
export async function createProductTx(
  tx: ProductWriteTx,
  context: ProductWriteContext,
  input: ProductWriteInput,
): Promise<ProductWriteResult> {
  const trusted = trustedContext(context)
  if ("error" in trusted) return trusted.error
  const { ctx } = trusted

  const normalized = normalizePatch(input ?? {}, { requireName: true })
  if (!normalized.ok) return normalized.error
  const patch = normalized.patch
  if (!patch.name) return productWriteInvalid('Campo "nome" é obrigatório.', "nome")

  const duplicate = await findDuplicate(tx, ctx.storeId, patch.sku, patch.barcode).catch(() => null)
  if (duplicate) return duplicateFailure(duplicate, patch.sku, patch.barcode, "create")

  const meta = resolveMetadata(input ?? {}, null, { isCreate: true })
  if (!meta.ok) return meta.error

  const active = patch.active ?? true
  const initialStock = patch.stock ?? 0
  const data: Prisma.ProdutoUncheckedCreateInput = {
    name: patch.name as string,
    sku: patch.sku,
    barcode: patch.barcode,
    category: patch.category ?? null,
    brand: patch.brand ?? "",
    supplierName: patch.supplierName ?? "",
    precoCusto: patch.precoCusto ?? 0,
    price: patch.price ?? 0,
    warrantyDays: patch.warrantyDays ?? 0,
    active,
    status: patch.status ?? (active ? "Ativo" : "Inativo"),
    stock: 0,
    storeId: ctx.storeId,
    ...(meta.metadata ? { metadata: meta.metadata as Prisma.InputJsonValue } : {}),
  }
  const changedFields: ProductWriteField[] = [
    "nome",
    ...(patch.changedFields.filter((f) => f !== "nome")),
    ...(meta.metadata ? (["metadata"] as ProductWriteField[]) : []),
  ]

  const audit = auditFields(ctx)
  const row = await tx.produto.create({ data, select: { id: true } })
  await tx.logsAuditoria.create({
    data: {
      action: "produto.create",
      userLabel: audit.userLabel,
      detail: `${audit.userLabel} criou o produto "${patch.name}" na loja ${ctx.storeId}.`,
      metadata: auditMetadata(ctx, "create", row.id, patch.name as string, patch.sku, patch.barcode, changedFields),
      source: PRODUCT_WRITE_AUDIT_SOURCE,
    },
  })
  if (initialStock > 0) {
    const ledger = await applyStockMutationTx(
      tx,
      { storeId: ctx.storeId, principal: ctx.principal, source: PRODUCT_WRITE_AUDIT_SOURCE },
      {
        kind: "entrada",
        produtoId: row.id,
        quantidade: initialStock,
        custoUnitario: patch.precoCusto ?? 0,
        origem: "cadastro",
        motivo: `Estoque inicial — cadastro ${patch.name as string}`,
        idempotencyKey: StockIdempotency.cadastroInicial(row.id),
      },
    )
    if (!ledger.ok) {
      throw new Error(`[product-write-service] estoque inicial falhou: ${ledger.code} ${ledger.message}`)
    }
  }
  return { ok: true, id: row.id, operacao: "create" }
}

/**
 * CREATE do cadastro-base dentro de `context.storeId`.
 * `input.id`/`input.storeId` (e demais chaves de autoridade) são ignorados.
 * CAD-R2-009: o produto nasce com `stock: 0` (neutro estrutural); `estoque`/
 * `stock` explícito > 0 é aplicado como ENTRADA `cadastro` via Stock/Ledger
 * na MESMA transação (stock + depósito + ledger, sem janela inconsistente).
 */
export async function createProduct(
  context: ProductWriteContext,
  input: ProductWriteInput,
  deps?: ProductWriteDeps,
): Promise<ProductWriteResult> {
  const trusted = trustedContext(context)
  if ("error" in trusted) return trusted.error
  const { ctx } = trusted
  const db = deps?.db ?? (prisma as unknown as ProductWriteDb)

  // Pré-validação fora da tx para mapear DUPLICATE sem abrir transação à toa.
  // A checagem autoritativa acontece dentro de `createProductTx` (via tx).
  const pre = normalizePatch(input ?? {}, { requireName: true })
  if (!pre.ok) return pre.error
  const prePatch = pre.patch

  try {
    const created = await db.$transaction((tx) => createProductTx(tx, context, input))
    return created
  } catch (e) {
    if (isPrismaKnownError(e, "P2002")) {
      const conflicted = await findDuplicate(db, ctx.storeId, prePatch.sku, prePatch.barcode).catch(() => null)
      if (conflicted) return duplicateFailure(conflicted, prePatch.sku, prePatch.barcode, "create")
    }
    console.error("[product-write-service] create falhou:", e instanceof Error ? e.message : String(e))
    return { ok: false, code: "PERSISTENCE", message: "Não foi possível salvar o produto. Tente novamente." }
  }
}

/**
 * UPDATE parcial do cadastro-base DENTRO de uma transação já aberta.
 * Componível: REST mixed PATCH (cadastro + StockLedger) e bulk-action chamam
 * esta variante com o MESMO `tx` do ledger/bulk — commit único, sem nested
 * transaction. Callers sem transação DEVEM usar `updateProduct`.
 * CAD-R2-007: `opts.clearMetadata` = intenção explícita REST `metadata: null`
 * → CLEAR (DbNull). Sem a opção, `metadata: null` = preservação.
 */
export async function updateProductTx(
  tx: ProductWriteTx,
  context: ProductWriteContext,
  productId: string,
  input: ProductWriteInput,
  opts?: ProductWriteTxOptions,
): Promise<ProductWriteResult> {
  const trusted = trustedContext(context)
  if ("error" in trusted) return trusted.error
  const { ctx } = trusted

  const pid = (productId ?? "").trim()
  if (!pid) return productWriteInvalid("ID do produto inválido.", "productId")

  if (firstDefined(input ?? {}, "estoque", "stock") !== undefined) {
    return productWriteInvalid(
      'Campo "estoque" não pode ser alterado por PATCH de cadastro. Use a operação de estoque (entrada/ajuste).',
      "estoque",
    )
  }

  const normalized = normalizePatch(input ?? {}, { requireName: false })
  if (!normalized.ok) return normalized.error
  const patch = normalized.patch

  const reader = tx as unknown as {
    produto: {
      findFirst(args: Prisma.ProdutoFindFirstArgs): Promise<ProductWriteFoundRow | null>
      findUnique(args: Prisma.ProdutoFindUniqueArgs): Promise<{ id: string; storeId: string } | null>
    }
  }
  const existing = await reader.produto.findFirst({
    where: { id: pid, storeId: ctx.storeId },
    select: { id: true, name: true, metadata: true },
  })
  if (!existing) {
    const elsewhere = await reader.produto
      .findUnique({ where: { id: pid }, select: { id: true, storeId: true } })
      .catch(() => null)
    if (elsewhere) {
      return { ok: false, code: "CROSS_STORE", message: "Produto pertence a outra loja." }
    }
    return { ok: false, code: "NOT_FOUND", message: "Produto não encontrado." }
  }

  // Só valores NÃO-VAZIOS entram na checagem: manter o próprio código, limpar
  // (null) ou não tocar no campo nunca dispara duplicidade.
  const nextSku = patch.skuTouched ? (patch.sku || null) : null
  const nextBarcode = patch.barcodeTouched ? (patch.barcode || null) : null
  if (nextSku || nextBarcode) {
    const duplicate = await findDuplicate(tx, ctx.storeId, nextSku, nextBarcode, pid).catch(() => null)
    if (duplicate) return duplicateFailure(duplicate, nextSku, nextBarcode, "update")
  }

  const meta = resolveMetadata(input ?? {}, existing.metadata, {
    isCreate: false,
    clearMetadata: opts?.clearMetadata === true,
  })
  if (!meta.ok) return meta.error

  const data: Prisma.ProdutoUpdateInput = {}
  if (patch.name !== undefined) data.name = patch.name
  if (patch.skuTouched) data.sku = patch.sku
  if (patch.barcodeTouched) data.barcode = patch.barcode
  if (patch.category !== undefined) data.category = patch.category
  if (patch.brand !== undefined) data.brand = patch.brand
  if (patch.supplierName !== undefined) data.supplierName = patch.supplierName
  if (patch.precoCusto !== undefined) data.precoCusto = patch.precoCusto
  if (patch.price !== undefined) data.price = patch.price
  if (patch.warrantyDays !== undefined) data.warrantyDays = patch.warrantyDays
  if (patch.active !== undefined) {
    data.active = patch.active
    if (patch.status === undefined) data.status = patch.active ? "Ativo" : "Inativo"
  }
  if (patch.status !== undefined) data.status = patch.status
  if (meta.clear) data.metadata = Prisma.DbNull
  else if (meta.metadata) data.metadata = meta.metadata as Prisma.InputJsonValue

  const changedFields: ProductWriteField[] = [
    ...patch.changedFields,
    ...(meta.metadata || meta.clear ? (["metadata"] as ProductWriteField[]) : []),
  ]
  if (changedFields.length === 0) {
    return productWriteInvalid("Nada para atualizar.", undefined)
  }

  const audit = auditFields(ctx)
  const finalName = patch.name ?? existing.name ?? pid
  try {
    const row = await tx.produto.update({ where: { id: pid }, data, select: { id: true } })
    await tx.logsAuditoria.create({
      data: {
        action: "produto.update",
        userLabel: audit.userLabel,
        detail: `${audit.userLabel} atualizou o produto "${finalName}" na loja ${ctx.storeId} (campos: ${changedFields.join(", ")}).`,
        metadata: auditMetadata(ctx, "update", pid, finalName, nextSku, nextBarcode, changedFields),
        source: PRODUCT_WRITE_AUDIT_SOURCE,
      },
    })
    return { ok: true, id: row.id, operacao: "update" }
  } catch (e) {
    if (isPrismaKnownError(e, "P2002")) {
      const conflicted = await findDuplicate(tx, ctx.storeId, nextSku, nextBarcode, pid).catch(() => null)
      if (conflicted) return duplicateFailure(conflicted, nextSku, nextBarcode, "update")
      return { ok: false, code: "DUPLICATE", message: "Produto já cadastrado nesta loja.", field: nextBarcode ? "barcode" : "sku" }
    }
    if (isPrismaKnownError(e, "P2025")) {
      return { ok: false, code: "NOT_FOUND", message: "Produto não encontrado." }
    }
    console.error("[product-write-service] update falhou:", e instanceof Error ? e.message : String(e))
    return { ok: false, code: "PERSISTENCE", message: "Não foi possível salvar o produto. Tente novamente." }
  }
}

/**
 * UPDATE parcial do cadastro-base. O produto é resolvido pelo par
 * (`productId`, `context.storeId`) — fail-closed contra cross-store.
 * Campos ausentes são preservados; `metadata` ausente/nulo preserva o JSON
 * (salvo `opts.clearMetadata`, intenção REST explícita de CLEAR).
 * CAD-R2-009: `estoque`/`stock` explícito NÃO é PATCH — falha VALIDATION.
 * Saldo só muda pelo Stock/Ledger boundary.
 */
export async function updateProduct(
  context: ProductWriteContext,
  productId: string,
  input: ProductWriteInput,
  optsOrDeps?: ProductWriteOptions & ProductWriteDeps | ProductWriteDeps,
  maybeDeps?: ProductWriteDeps,
): Promise<ProductWriteResult> {
  const { opts, deps } = normalizeUpdateArgs(optsOrDeps, maybeDeps)
  const db = deps?.db ?? (prisma as unknown as ProductWriteDb)
  try {
    return await db.$transaction((tx) => updateProductTx(tx, context, productId, input, opts))
  } catch (e) {
    console.error("[product-write-service] update transacional falhou:", e instanceof Error ? e.message : String(e))
    return { ok: false, code: "PERSISTENCE", message: "Não foi possível salvar o produto. Tente novamente." }
  }
}

function normalizeUpdateArgs(
  optsOrDeps?: (ProductWriteOptions & ProductWriteDeps) | ProductWriteDeps | ProductWriteTxOptions,
  maybeDeps?: ProductWriteDeps,
): { opts: ProductWriteTxOptions; deps: ProductWriteDeps | undefined } {
  if (maybeDeps) {
    const o = (optsOrDeps ?? {}) as ProductWriteTxOptions
    return {
      opts: {
        ...(o.clearMetadata !== undefined ? { clearMetadata: o.clearMetadata } : {}),
      },
      deps: maybeDeps,
    }
  }
  const mixed = (optsOrDeps ?? {}) as ProductWriteOptions & ProductWriteDeps
  const { db, clearMetadata } = mixed
  return {
    opts: clearMetadata !== undefined ? { clearMetadata } : {},
    deps: db !== undefined ? { db } : undefined,
  }
}
