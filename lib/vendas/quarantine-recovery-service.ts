import "server-only"

/**
 * Núcleo COMPARTILHADO da recuperação de vendas em quarentena
 * (GOAL PDV-VENDAS-QUARENTENA-RECOVERY-ALL-P0-006A).
 *
 * Usado pela recuperação individual (`/api/ops/vendas/recover-quarantined`), pelo
 * lote (`/api/ops/vendas/quarantine-recovery/{preview,batch}`) e pela reconciliação
 * automática do PDV (`/api/ops/vendas/quarantine-recovery/auto`). Existe UM motor de
 * persistência — `persistSaleV2` — e este módulo apenas o orquestra. Nenhuma rota
 * escreve venda por conta própria.
 *
 * Invariantes:
 *  - a venda OCUPANTE do número antigo nunca é lida para escrita, alterada ou apagada;
 *  - o número antigo entra só em `payload.recovery.recoveredFromPedidoId`;
 *  - `(storeId, clientSaleId)` é a chave de idempotência: replay devolve a venda
 *    existente sem alocar número e sem repetir estoque/caixa/financeiro/CR/vale;
 *  - o gate do writer é verificado aqui também (defesa em profundidade): nenhum
 *    caller consegue recuperar com o writer v1 ativo.
 */

import { prisma } from "@/lib/prisma"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import {
  CaixaOriginalFechadoError,
  CaixaSessaoInvalidaError,
  ClientSaleIdReusedError,
  InsufficientStockError,
  InvalidClientSaleIdError,
  PedidoIdConflitoMesmaLojaError,
  PedidoIdDeOutraLojaError,
  UnresolvedProductError,
  VENDA_REPLAY_SELECT,
  type SalePayload,
  type VendaPersistView,
} from "@/lib/ops-upsert-venda"
import { persistSaleV2 } from "@/lib/vendas/sale-writer-v2"
import { SALE_WRITER_FLOW } from "@/lib/vendas/sale-identity-contracts"
import { resolveSaleNumberingWriter } from "@/lib/vendas/sale-numbering-runtime-gate"
import { isSaleNumberingError } from "@/lib/vendas/server-sale-numbering"
import {
  buildLegacySaleFingerprint,
  isLegacySaleFactsComparable,
} from "@/lib/vendas/legacy-sale-fingerprint"
import {
  HISTORICAL_RECOVERY_STOCK_POLICY,
  QUARANTINE_CLASSIFY_MODE,
  QUARANTINE_RECOVERY_CLASS,
  classifyQuarantineCandidate,
  historicalRecoveryCaixaPolicy,
  historicalRecoveryPersistOptions,
  isExecutableClass,
  type OriginalSessionStatus,
  type QuarantineCandidate,
  type QuarantineRecoveryPlanItem,
  type QuarantineServerFacts,
  type QuarantineStockShortfall,
} from "@/lib/vendas/quarantine-recovery-planner"

export const SALE_WRITER_V1_ACTIVE_CODE = "SALE_WRITER_V1_ACTIVE"

/** `true` quando o writer server-side está ativo. Sem isto, recovery é indisponível. */
export function isRecoveryWriterEnabled(): boolean {
  return resolveSaleNumberingWriter().writer === SALE_WRITER_FLOW.V2
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura de fatos (read-only) — alimenta o planner
// ─────────────────────────────────────────────────────────────────────────────

type ReadClient = Pick<typeof prisma, "venda" | "sessaoCaixa" | "produto">

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function quantityOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(2_000_000_000, Math.round(value)))
}

/**
 * Espelha a resolução de produto de `upsertVendaInTransaction` (OR por id | sku |
 * barcode) e a agregação por produto, para que o preview antecipe exatamente os
 * mesmos bloqueios que o motor aplicaria — sem escrever nada.
 */
async function readProductFacts(
  db: ReadClient,
  storeId: string,
  candidate: QuarantineCandidate,
): Promise<{ unresolvedInventoryIds: string[]; stockShortfalls: QuarantineStockShortfall[] }> {
  const lines = Array.isArray(candidate.lines) ? candidate.lines : []
  const unresolvedInventoryIds: string[] = []
  const qtyByRawId = new Map<string, number>()

  for (const rawLine of lines) {
    const line = rawLine as { inventoryId?: unknown; quantity?: unknown }
    const rawInvId = text(line?.inventoryId)
    if (!rawInvId || isVirtualSaleLine(rawInvId)) continue
    const qty = quantityOf(line?.quantity)
    if (qty === 0) continue
    qtyByRawId.set(rawInvId, (qtyByRawId.get(rawInvId) ?? 0) + qty)
  }

  const qtyByProdutoId = new Map<string, { nome: string; stock: number; necessario: number }>()
  for (const [rawInvId, qty] of qtyByRawId) {
    const produto = await db.produto.findFirst({
      where: {
        storeId,
        OR: [{ id: rawInvId }, { sku: rawInvId }, { barcode: rawInvId }],
      },
      select: { id: true, name: true, stock: true },
    })
    if (!produto) {
      unresolvedInventoryIds.push(rawInvId)
      continue
    }
    // Duas linhas podem resolver para o MESMO produto (id + sku): agrega, como o motor.
    const acc = qtyByProdutoId.get(produto.id)
    if (acc) {
      acc.necessario += qty
    } else {
      qtyByProdutoId.set(produto.id, { nome: produto.name, stock: produto.stock, necessario: qty })
    }
  }

  const stockShortfalls: QuarantineStockShortfall[] = []
  for (const [produtoId, info] of qtyByProdutoId) {
    if (info.stock < info.necessario) {
      stockShortfalls.push({
        produtoId,
        nome: info.nome,
        disponivel: info.stock,
        necessario: info.necessario,
      })
    }
  }

  return { unresolvedInventoryIds, stockShortfalls }
}

async function readOriginalSession(
  db: ReadClient,
  storeId: string,
  candidate: QuarantineCandidate,
): Promise<{ status: OriginalSessionStatus; resolvedSessaoId: string | null }> {
  const sessaoId = text(candidate.sessaoId)
  if (sessaoId) {
    const sessao = await db.sessaoCaixa.findFirst({
      where: { id: sessaoId, storeId },
      select: { id: true, status: true },
    })
    if (!sessao) return { status: "NOT_FOUND", resolvedSessaoId: null }
    return {
      status: sessao.status === "ABERTA" ? "ABERTA" : "FECHADA",
      resolvedSessaoId: sessao.id,
    }
  }

  const atRaw = text(candidate.at)
  const at = atRaw ? new Date(atRaw) : null
  if (!at || Number.isNaN(at.getTime())) {
    return { status: "NO_SESSION_ID", resolvedSessaoId: null }
  }

  const terminalId = text(candidate.terminalId)
  const matches = await db.sessaoCaixa.findMany({
    where: {
      storeId,
      ...(terminalId ? { terminalId } : {}),
      abertaEm: { lte: at },
      OR: [{ fechadaEm: null }, { fechadaEm: { gte: at } }],
    },
    select: { id: true, status: true },
    take: 2,
  })
  if (matches.length !== 1) {
    return { status: "NO_SESSION_ID", resolvedSessaoId: null }
  }
  const sessao = matches[0]
  return {
    status: sessao.status === "ABERTA" ? "ABERTA" : "FECHADA",
    resolvedSessaoId: sessao.id,
  }
}

/** Fingerprint canônico SEM a sessão: a recuperação pode ter resolvido a sessão pela janela. */
function sameSaleFingerprint(facts: Record<string, unknown>): string {
  return buildLegacySaleFingerprint({ ...facts, sessaoId: null })
}

/**
 * Procura, na MESMA loja, venda já gravada no MESMO instante da cópia local.
 *
 * `at` nasce no relógio do PDV com milissegundos e o motor o preserva: duas vendas
 * físicas distintas não compartilham o mesmo instante. Com os mesmos fatos é a própria
 * venda, gravada sob OUTRA identidade técnica — a "ocupante" que na verdade é a mesma
 * venda, ou uma recuperação anterior cujo `clientSaleId` local se perdeu — e o correto é
 * só reconciliar. Com fatos diferentes não há prova de identidade: nem reconciliar nem
 * criar (`conflict`).
 */
async function readSameInstantSale(
  db: ReadClient,
  storeId: string,
  candidate: QuarantineCandidate,
): Promise<{ match: { id: string; pedidoId: string } | null; conflict: boolean }> {
  const atRaw = text(candidate.at)
  const at = atRaw ? new Date(atRaw) : null
  // Fatos inválidos nunca viram "mesma venda": o planner os bloqueia como INVALID_PAYLOAD.
  if (!at || Number.isNaN(at.getTime()) || !isLegacySaleFactsComparable(candidate)) {
    return { match: null, conflict: false }
  }

  const rows = await db.venda.findMany({
    where: { storeId, at },
    select: VENDA_REPLAY_SELECT,
    take: 5,
  })
  if (rows.length === 0) return { match: null, conflict: false }

  const expected = sameSaleFingerprint(candidate as Record<string, unknown>)
  const matches = rows.filter((row) => {
    const facts: Record<string, unknown> = factsFromOccupantPayload(row)
    const comparable = { ...facts, at: facts.at ? facts.at : row.at.toISOString() }
    return isLegacySaleFactsComparable(comparable) && sameSaleFingerprint(comparable) === expected
  })
  if (matches.length === 1) {
    return { match: { id: matches[0].id, pedidoId: matches[0].pedidoId }, conflict: false }
  }
  return { match: null, conflict: true }
}

/**
 * Lê todos os fatos server-side de UMA candidata. Estritamente read-only:
 * `findFirst`/`findUnique`/`findMany` apenas. Chamado tanto pelo preview quanto pelo lote.
 */
export async function readQuarantineServerFacts(input: {
  storeId: string
  candidate: QuarantineCandidate
  db?: ReadClient
}): Promise<QuarantineServerFacts> {
  const { storeId, candidate } = input
  const db = input.db ?? prisma

  const clientSaleId = text(candidate.clientSaleId)
  const conflictingPedidoId = text(candidate.id)

  const already = clientSaleId
    ? await db.venda.findFirst({
        where: { storeId, clientSaleId },
        select: { id: true, pedidoId: true },
      })
    : null

  const occupant = conflictingPedidoId
    ? await db.venda.findUnique({
        where: { pedidoId: conflictingPedidoId },
        select: { id: true, storeId: true },
      })
    : null

  // A mesma venda gravada sob OUTRA identidade técnica também "já existe".
  const sameInstant = already ? null : await readSameInstantSale(db, storeId, candidate)
  const existing = already ?? sameInstant?.match ?? null

  // Produto/estoque e sessão só importam quando ainda há algo a criar.
  if (existing) {
    return {
      alreadyRecoveredPedidoId: existing.pedidoId,
      alreadyRecoveredVendaId: existing.id,
      occupantExists: Boolean(occupant),
      occupantStoreId: occupant?.storeId ?? null,
      originalSessionStatus: "NO_SESSION_ID",
      resolvedSessaoId: null,
      unresolvedInventoryIds: [],
      stockShortfalls: [],
    }
  }

  const [session, productFacts] = await Promise.all([
    readOriginalSession(db, storeId, candidate),
    readProductFacts(db, storeId, candidate),
  ])

  return {
    alreadyRecoveredPedidoId: null,
    alreadyRecoveredVendaId: null,
    occupantExists: Boolean(occupant),
    occupantStoreId: occupant?.storeId ?? null,
    originalSessionStatus: session.status,
    resolvedSessaoId: session.resolvedSessaoId,
    unresolvedInventoryIds: productFacts.unresolvedInventoryIds,
    stockShortfalls: productFacts.stockShortfalls,
    sameInstantConflict: sameInstant?.conflict === true,
  }
}

/** Classifica uma candidata lendo os fatos do banco. Read-only. */
export async function planQuarantineCandidate(input: {
  storeId: string
  candidate: QuarantineCandidate
  db?: ReadClient
}): Promise<QuarantineRecoveryPlanItem> {
  const facts = await readQuarantineServerFacts(input)
  return classifyQuarantineCandidate({
    storeId: input.storeId,
    candidate: input.candidate,
    facts,
    mode: QUARANTINE_CLASSIFY_MODE.HISTORICAL_RECOVERY,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Execução
// ─────────────────────────────────────────────────────────────────────────────

export const QUARANTINE_RECOVERY_STATUS = Object.freeze({
  RECOVERED: "RECOVERED",
  ALREADY_RECOVERED: "ALREADY_RECOVERED",
  REQUIRES_CONFIRMATION: "REQUIRES_CONFIRMATION",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
} as const)

export type QuarantineRecoveryStatus =
  (typeof QUARANTINE_RECOVERY_STATUS)[keyof typeof QUARANTINE_RECOVERY_STATUS]

export type QuarantineRecoveryResult = {
  /** Número antigo — chave de correlação com a cópia local. */
  readonly conflictingPedidoId: string
  readonly clientSaleId: string | null
  readonly status: QuarantineRecoveryStatus
  readonly code: string | null
  readonly reason: string
  /** Presente em `RECOVERED` e `ALREADY_RECOVERED` — evidência server-side. */
  readonly venda: VendaPersistView | null
  /** `true` quando nada foi criado porque a venda já existia. */
  readonly replayed: boolean
}

/** Quem disparou a recuperação — fica na trilha `payload.recovery.trigger`. */
export const QUARANTINE_RECOVERY_TRIGGER = Object.freeze({
  /** Console administrativo (motivo e confirmação informados por uma pessoa). */
  ADMIN: "admin",
  /** Reconciliação automática do PDV, sem operador. */
  AUTO: "auto",
} as const)

export type QuarantineRecoveryTrigger =
  (typeof QUARANTINE_RECOVERY_TRIGGER)[keyof typeof QUARANTINE_RECOVERY_TRIGGER]

export const QUARANTINE_AUTO_RECONCILE_MOTIVO =
  "Reconciliação automática: venda preservada no PDV gravada com data e sessão de caixa originais."

export type ExecuteQuarantineRecoveryInput = {
  storeId: string
  candidate: QuarantineCandidate
  motivo: string
  operadorLabel?: string
  /**
   * `auto`: política da reconciliação automática — lança na sessão original mesmo fechada
   * (o único destino correto; nunca o caixa de hoje) e aceita número antigo livre.
   */
  trigger?: QuarantineRecoveryTrigger
  /** Autorização explícita para lançamento retroativo em sessão original FECHADA. */
  allowClosedOriginalSession?: boolean
  /** Fatos já lidos (o lote reaproveita os do preview); relidos quando ausentes. */
  facts?: QuarantineServerFacts
  db?: ReadClient
}

function resultFrom(
  item: Pick<QuarantineRecoveryPlanItem, "conflictingPedidoId" | "clientSaleId">,
  status: QuarantineRecoveryStatus,
  code: string | null,
  reason: string,
  extra?: { venda?: VendaPersistView | null; replayed?: boolean },
): QuarantineRecoveryResult {
  return {
    conflictingPedidoId: item.conflictingPedidoId,
    clientSaleId: item.clientSaleId,
    status,
    code,
    reason,
    venda: extra?.venda ?? null,
    replayed: extra?.replayed ?? false,
  }
}

function factsFromOccupantPayload(existing: {
  pedidoId: string
  payload: unknown
  total: number
  clienteNome: string | null
  clienteId: string | null
  terminalId: string | null
}) {
  const payload =
    existing.payload !== null && typeof existing.payload === "object" && !Array.isArray(existing.payload)
      ? (existing.payload as Record<string, unknown>)
      : {}
  return {
    ...payload,
    id: existing.pedidoId,
    total: "total" in payload ? payload.total : existing.total,
    customerName: payload.customerName ?? existing.clienteNome,
    clienteId: payload.clienteId ?? existing.clienteId,
    terminalId: payload.terminalId ?? existing.terminalId,
  }
}

/**
 * Confirma que o conflito é REAL comparando a candidata com a ocupante.
 *
 * Preserva o contrato da rota individual: ocupante de outra loja é sempre conflito;
 * na mesma loja, só é conflito quando a identidade técnica difere ou os fatos
 * canônicos não batem. Fatos idênticos + mesma identidade = a própria venda já
 * gravada, e o caminho correto é reconciliar, não renumerar.
 */
async function confirmConflict(
  db: ReadClient,
  storeId: string,
  conflictingPedidoId: string,
  clientSaleId: string,
  candidate: QuarantineCandidate,
): Promise<
  | { ok: true; occupantOtherStore: boolean; occupantStoreId: string }
  | { ok: false; code: string; reason: string }
> {
  const occupant = await db.venda.findUnique({
    where: { pedidoId: conflictingPedidoId },
    select: VENDA_REPLAY_SELECT,
  })
  if (!occupant) {
    return {
      ok: false,
      code: "CONFLICT_NOT_CONFIRMED",
      reason: "Não há conflito confirmado para este número. Use o reenvio normal.",
    }
  }
  if (occupant.clientSaleId === clientSaleId && occupant.storeId === storeId) {
    return {
      ok: false,
      code: "CONFLICT_NOT_CONFIRMED",
      reason: "Esta tentativa já está gravada com o número informado.",
    }
  }

  const occupantOtherStore = occupant.storeId !== storeId
  const occupantFacts = factsFromOccupantPayload(occupant)
  const occupantSameStoreDifferentFacts =
    occupant.storeId === storeId &&
    (occupant.clientSaleId !== clientSaleId ||
      !isLegacySaleFactsComparable(candidate) ||
      !isLegacySaleFactsComparable(occupantFacts) ||
      buildLegacySaleFingerprint(candidate) !== buildLegacySaleFingerprint(occupantFacts))

  if (!occupantOtherStore && !occupantSameStoreDifferentFacts) {
    return {
      ok: false,
      code: "CONFLICT_NOT_CONFIRMED",
      reason: "Não há conflito confirmado para este número. Use o reenvio normal.",
    }
  }
  return { ok: true, occupantOtherStore, occupantStoreId: occupant.storeId }
}

/**
 * Recupera UMA venda em quarentena. Nunca lança: devolve sempre um resultado
 * classificado, para que o lote isole falha por item (um erro não invalida as demais).
 *
 * Sem transação abrangente: cada venda usa a própria transação de `persistSaleV2`.
 */
export async function executeQuarantineRecovery(
  input: ExecuteQuarantineRecoveryInput,
): Promise<QuarantineRecoveryResult> {
  const { storeId, candidate, motivo, operadorLabel } = input
  const db = input.db ?? prisma
  const auto = input.trigger === QUARANTINE_RECOVERY_TRIGGER.AUTO
  // O automático grava na sessão ORIGINAL mesmo fechada: é a sessão em que a venda
  // aconteceu, com a data real e trilha retroativa — nunca o caixa aberto de hoje.
  const allowClosedOriginalSession = auto || input.allowClosedOriginalSession === true
  const mode = auto
    ? QUARANTINE_CLASSIFY_MODE.AUTO_RECONCILE
    : QUARANTINE_CLASSIFY_MODE.HISTORICAL_RECOVERY

  const facts = input.facts ?? (await readQuarantineServerFacts({ storeId, candidate, db }))
  const item = classifyQuarantineCandidate({ storeId, candidate, facts, mode })
  const ref = { conflictingPedidoId: item.conflictingPedidoId, clientSaleId: item.clientSaleId }

  // Gate do writer — defesa em profundidade, sem bypass.
  if (!isRecoveryWriterEnabled()) {
    return resultFrom(
      ref,
      QUARANTINE_RECOVERY_STATUS.BLOCKED,
      SALE_WRITER_V1_ACTIVE_CODE,
      "Writer V1 ativo. Recovery V2 indisponível.",
    )
  }

  if (item.klass === QUARANTINE_RECOVERY_CLASS.ALREADY_RECOVERED) {
    const byClientSaleId = item.clientSaleId
      ? await db.venda.findFirst({
          where: { storeId, clientSaleId: item.clientSaleId },
          select: VENDA_REPLAY_SELECT,
        })
      : null
    // A mesma venda pode estar gravada sob OUTRA identidade técnica (`readSameInstantSale`).
    const existing =
      byClientSaleId ??
      (item.alreadyRecoveredVendaId
        ? await db.venda.findFirst({
            where: { id: item.alreadyRecoveredVendaId, storeId },
            select: VENDA_REPLAY_SELECT,
          })
        : null)
    return resultFrom(
      ref,
      QUARANTINE_RECOVERY_STATUS.ALREADY_RECOVERED,
      null,
      item.reason,
      {
        replayed: true,
        venda: existing
          ? {
              id: existing.id,
              storeId: existing.storeId,
              pedidoId: existing.pedidoId,
              clientSaleId: existing.clientSaleId ?? null,
              total: existing.total,
              at: existing.at.toISOString(),
              clienteNome: existing.clienteNome,
              clienteId: existing.clienteId,
              terminalId: existing.terminalId,
              status: existing.status,
            }
          : null,
      },
    )
  }

  if (!isExecutableClass(item.klass)) {
    return resultFrom(ref, QUARANTINE_RECOVERY_STATUS.BLOCKED, item.klass, item.reason)
  }

  // Sessão original fechada exige autorização EXPLÍCITA por execução.
  if (
    item.klass === QUARANTINE_RECOVERY_CLASS.REQUIRES_CLOSED_SESSION_CONFIRM &&
    !allowClosedOriginalSession
  ) {
    return resultFrom(
      ref,
      QUARANTINE_RECOVERY_STATUS.REQUIRES_CONFIRMATION,
      "CAIXA_ORIGINAL_FECHADO",
      item.reason,
    )
  }

  const clientSaleId = item.clientSaleId
  if (!clientSaleId) {
    return resultFrom(
      ref,
      QUARANTINE_RECOVERY_STATUS.BLOCKED,
      QUARANTINE_RECOVERY_CLASS.MISSING_CLIENT_SALE_ID,
      "Sem identidade técnica utilizável.",
    )
  }

  // Número antigo livre (só no automático): não há ocupante a confirmar. O servidor aloca
  // número novo e a idempotência por `(storeId, clientSaleId)` impede segunda criação.
  const confirmed =
    auto && !facts.occupantExists
      ? { ok: true as const, occupantOtherStore: false, occupantStoreId: null }
      : await confirmConflict(db, storeId, item.conflictingPedidoId, clientSaleId, candidate)
  if (!confirmed.ok) {
    return resultFrom(
      ref,
      QUARANTINE_RECOVERY_STATUS.BLOCKED,
      confirmed.code,
      confirmed.reason,
    )
  }

  const identifiedSessaoId =
    item.originalSessionStatus === "ABERTA" || item.originalSessionStatus === "FECHADA"
      ? (text(candidate.sessaoId) ?? text(facts.resolvedSessaoId))
      : null

  const persistOptions = historicalRecoveryPersistOptions({
    originalSessionStatus: item.originalSessionStatus,
    allowClosedOriginalSession,
  })

  const unresolved = (facts.unresolvedInventoryIds ?? []).filter(
    (id) => typeof id === "string" && id.trim() && !isVirtualSaleLine(id),
  )
  const shortfalls = facts.stockShortfalls ?? []

  const recoverySale = {
    ...(candidate as unknown as SalePayload),
    clientSaleId,
    sessaoId: identifiedSessaoId,
    recovery: {
      recoveredFromPedidoId: item.conflictingPedidoId,
      recoveredAt: new Date().toISOString(),
      motivo,
      trigger: auto ? QUARANTINE_RECOVERY_TRIGGER.AUTO : QUARANTINE_RECOVERY_TRIGGER.ADMIN,
      mode,
      stockPolicy: HISTORICAL_RECOVERY_STOCK_POLICY,
      caixaPolicy: historicalRecoveryCaixaPolicy(item.originalSessionStatus),
      conflictCode:
        item.conflictCode ??
        (confirmed.occupantOtherStore
          ? "PEDIDO_ID_DE_OUTRA_LOJA"
          : "PEDIDO_ID_CONFLITO_MESMA_LOJA"),
      occupantStoreId: confirmed.occupantStoreId,
      ...(unresolved.length > 0 ? { unresolvedInventoryIds: unresolved } : {}),
      ...(shortfalls.length > 0 ? { stockShortfalls: shortfalls } : {}),
    },
  } as SalePayload

  try {
    const result = await persistSaleV2({
      storeId,
      sale: recoverySale,
      clientSaleId,
      operadorLabel,
      options: persistOptions,
    })
    return resultFrom(
      ref,
      result.replayed
        ? QUARANTINE_RECOVERY_STATUS.ALREADY_RECOVERED
        : QUARANTINE_RECOVERY_STATUS.RECOVERED,
      null,
      result.replayed
        ? "Venda já existia no servidor com esta identidade técnica."
        : "Venda recuperada com novo número server-side.",
      { venda: result.venda, replayed: result.replayed },
    )
  } catch (error) {
    return classifyRecoveryFailure(ref, error)
  }
}

/** Mapeia as exceções do motor para status/código estáveis. */
export function classifyRecoveryFailure(
  ref: Pick<QuarantineRecoveryPlanItem, "conflictingPedidoId" | "clientSaleId">,
  error: unknown,
): QuarantineRecoveryResult {
  if (error instanceof CaixaOriginalFechadoError) {
    return resultFrom(
      ref,
      QUARANTINE_RECOVERY_STATUS.REQUIRES_CONFIRMATION,
      error.code,
      error.message,
    )
  }
  if (
    error instanceof InvalidClientSaleIdError ||
    error instanceof ClientSaleIdReusedError ||
    error instanceof PedidoIdDeOutraLojaError ||
    error instanceof PedidoIdConflitoMesmaLojaError ||
    error instanceof CaixaSessaoInvalidaError ||
    error instanceof UnresolvedProductError ||
    error instanceof InsufficientStockError
  ) {
    return resultFrom(ref, QUARANTINE_RECOVERY_STATUS.BLOCKED, error.code, error.message)
  }
  if (isSaleNumberingError(error)) {
    return resultFrom(ref, QUARANTINE_RECOVERY_STATUS.BLOCKED, error.code, error.message)
  }
  const message = error instanceof Error ? error.message : String(error)
  return resultFrom(ref, QUARANTINE_RECOVERY_STATUS.FAILED, null, message)
}

// ─────────────────────────────────────────────────────────────────────────────
// Lote
// ─────────────────────────────────────────────────────────────────────────────

export type BatchQuarantineRecoveryInput = {
  storeId: string
  candidates: readonly QuarantineCandidate[]
  motivo: string
  operadorLabel?: string
  trigger?: QuarantineRecoveryTrigger
  /** Autoriza lançamento retroativo nas sessões ORIGINAIS fechadas do lote. */
  allowClosedOriginalSession?: boolean
  db?: ReadClient
}

export type BatchQuarantineRecoverySummary = {
  readonly total: number
  readonly recovered: number
  readonly alreadyRecovered: number
  readonly requiresConfirmation: number
  readonly blocked: number
  readonly failed: number
}

export function summarizeBatchResults(
  results: readonly QuarantineRecoveryResult[],
): BatchQuarantineRecoverySummary {
  let recovered = 0
  let alreadyRecovered = 0
  let requiresConfirmation = 0
  let blocked = 0
  let failed = 0
  for (const result of results) {
    switch (result.status) {
      case QUARANTINE_RECOVERY_STATUS.RECOVERED:
        recovered += 1
        break
      case QUARANTINE_RECOVERY_STATUS.ALREADY_RECOVERED:
        alreadyRecovered += 1
        break
      case QUARANTINE_RECOVERY_STATUS.REQUIRES_CONFIRMATION:
        requiresConfirmation += 1
        break
      case QUARANTINE_RECOVERY_STATUS.BLOCKED:
        blocked += 1
        break
      default:
        failed += 1
    }
  }
  return {
    total: results.length,
    recovered,
    alreadyRecovered,
    requiresConfirmation,
    blocked,
    failed,
  }
}

/**
 * Executa o lote SEQUENCIALMENTE, uma transação por venda.
 *
 * Isolamento é requisito, não detalhe: uma venda bloqueada ou com falha de
 * infraestrutura não impede as demais, e nenhuma transação abrange dezenas de
 * vendas (um `InsufficientStockError` no item 40 não pode desfazer os 39 anteriores).
 */
export async function executeQuarantineRecoveryBatch(
  input: BatchQuarantineRecoveryInput,
): Promise<{
  results: QuarantineRecoveryResult[]
  summary: BatchQuarantineRecoverySummary
}> {
  const results: QuarantineRecoveryResult[] = []
  for (const candidate of input.candidates) {
    try {
      results.push(
        await executeQuarantineRecovery({
          storeId: input.storeId,
          candidate,
          motivo: input.motivo,
          operadorLabel: input.operadorLabel,
          trigger: input.trigger,
          allowClosedOriginalSession: input.allowClosedOriginalSession,
          db: input.db,
        }),
      )
    } catch (error) {
      // `executeQuarantineRecovery` não deveria lançar; se lançar, o lote continua.
      results.push(
        classifyRecoveryFailure(
          {
            conflictingPedidoId: text(candidate.id) ?? "",
            clientSaleId: text(candidate.clientSaleId),
          },
          error,
        ),
      )
    }
  }
  return { results, summary: summarizeBatchResults(results) }
}

/**
 * Reconciliação AUTOMÁTICA do PDV: o mesmo lote, com a política `auto` e trilha própria.
 * Sem motivo digitado e sem confirmação — é a venda que o operador já concluiu.
 */
export async function executeQuarantineAutoReconcileBatch(input: {
  storeId: string
  candidates: readonly QuarantineCandidate[]
  operadorLabel?: string
  db?: ReadClient
}): Promise<{
  results: QuarantineRecoveryResult[]
  summary: BatchQuarantineRecoverySummary
}> {
  return executeQuarantineRecoveryBatch({
    storeId: input.storeId,
    candidates: input.candidates,
    motivo: QUARANTINE_AUTO_RECONCILE_MOTIVO,
    operadorLabel: input.operadorLabel,
    trigger: QUARANTINE_RECOVERY_TRIGGER.AUTO,
    db: input.db,
  })
}
