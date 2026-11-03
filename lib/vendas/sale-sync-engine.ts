/**
 * Motor de sincronização de vendas do PDV — PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001.
 *
 * Peças sem React que o `operations-store` compõe. Regras que valem para TODA tentativa
 * (finalização, reenvio automático e Reenviar manual):
 *
 * - toda chamada à rede tem prazo (`fetchTextWithTimeout`): requisição pendurada vira
 *   "sem resposta" (resultado DESCONHECIDO, mesma identidade), nunca botão inerte;
 * - "sincronizada" só com PROVA do servidor (`confirmedSaleEvidence`): 2xx sem a venda
 *   no corpo — portal cativo, proxy, resposta truncada — é inconclusivo, não sucesso;
 * - 401/403 sem código de negócio viram `AUTH_REQUIRED` / `PERMISSION_DENIED`: a venda
 *   fica preservada e o operador sabe que precisa entrar de novo;
 * - backoff para falha transitória; o manual nunca espera o backoff;
 * - coordenação entre abas por Web Locks (o banco continua sendo a garantia: a mesma
 *   `(storeId, clientSaleId)` nunca vira duas vendas);
 * - fila entre abas por união monotônica: pendência nunca some por sobrescrita de outra aba,
 *   confirmação vence pendência, e só sai da fila o que esta ou outra aba descartou com prova
 *   (lápide).
 */

import type { PaymentBreakdownFull, SaleRecord } from "@/lib/operations-sale-types"
import { extractConfirmedVenda, type ConfirmedVendaView } from "@/lib/vendas/sale-client-sync"
import { saleLocalKey } from "@/lib/vendas/local-sale-identity"
import { isSaleIdentityConflictCode } from "@/lib/vendas/sale-identity-conflict"
import {
  AUTH_REQUIRED,
  DEFINITIVE_REJECTION_CODES,
  INCONCLUSIVE_RESPONSE,
  OFFLINE_CODE,
  PENDING_SYNC_CLASS,
  PERMISSION_DENIED,
  classifyPendingSyncFailure,
  resolvePendingSyncErrorCode,
} from "@/lib/vendas/pending-sync-classification"

export { AUTH_REQUIRED, INCONCLUSIVE_RESPONSE, OFFLINE_CODE, PERMISSION_DENIED }

/** Reenviar de venda que já não está pendente aqui: nada é reenviado. */
export const SALE_ALREADY_CONFIRMED_CODE = "JA_CONFIRMADA"

/** POST da venda: o writer é uma transação; acima disso o resultado é desconhecido. */
export const SALE_PERSIST_TIMEOUT_MS = 25_000
/** Consulta da venda por `clientSaleId` antes do reenvio manual. */
export const SALE_VERIFY_TIMEOUT_MS = 10_000
/**
 * Espera do Reenviar manual por outra tentativa da MESMA venda (Web Locks): pior caso de uma
 * tentativa = verificar + enviar + verificar (2xx sem prova) + fallback V1 + verificar.
 */
export const SALE_LOCK_WAIT_MS = 2 * 25_000 + 3 * 10_000 + 5_000
/** Capability do writer. */
export const SALE_PROBE_TIMEOUT_MS = 8_000

export class SaleSyncTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`O servidor não respondeu em ${Math.round(timeoutMs / 1000)} s`)
    this.name = "SaleSyncTimeoutError"
  }
}

export type TimedTextResponse = { ok: boolean; status: number; text: string }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * `fetch` + leitura do corpo sob o MESMO prazo: um corpo que nunca termina também é
 * "sem resposta". Abort pelo prazo vira `SaleSyncTimeoutError`; demais falhas sobem como
 * vieram (erro de rede).
 */
export async function fetchTextWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike = (i, r) => fetch(i, r),
): Promise<TimedTextResponse> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    const res = await fetchImpl(input, { ...init, signal: controller.signal })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  } catch (err) {
    if (timedOut) throw new SaleSyncTimeoutError(timeoutMs)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Prova server-side da venda: o corpo traz `venda` com `id` + `pedidoId`, da MESMA loja e,
 * quando as duas pontas têm, do MESMO `clientSaleId`. Qualquer outra coisa não confirma.
 */
export function confirmedSaleEvidence(
  bodyText: string,
  expected: { lojaId: string; clientSaleId?: string | null },
): ConfirmedVendaView | null {
  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    return null
  }
  const venda = extractConfirmedVenda(body)
  if (!venda) return null
  if (venda.storeId && venda.storeId !== expected.lojaId) return null
  if (expected.clientSaleId && venda.clientSaleId && venda.clientSaleId !== expected.clientSaleId) return null
  return venda
}

/** 401/403 sem código de negócio: sessão expirada ou sem permissão — nada foi gravado. */
export function authFailureCode(httpStatus: number): string | undefined {
  if (httpStatus === 401) return AUTH_REQUIRED
  if (httpStatus === 403) return PERMISSION_DENIED
  return undefined
}

/** Desfecho legível da última tentativa, persistido na própria venda. */
export type SaleSyncAttemptOutcome =
  | "CONFIRMADA"
  | "JA_EXISTIA_NO_SERVIDOR"
  | "SEM_CONEXAO"
  | "SEM_RESPOSTA"
  | "SERVIDOR_INDISPONIVEL"
  | "RESPOSTA_INCONCLUSIVA"
  | "SESSAO_EXPIRADA"
  | "SEM_PERMISSAO"
  | "EXIGE_CORRECAO"
  | "REJEITADA"
  | "QUARENTENA"

export function attemptOutcomeFromFailure(input: {
  code?: string | null
  httpStatus?: number
  networkError?: boolean
  timedOut?: boolean
  /** O navegador estava offline na tentativa: a requisição nem saiu. */
  offline?: boolean
}): SaleSyncAttemptOutcome {
  const code = typeof input.code === "string" ? input.code.trim() : ""
  if (isSaleIdentityConflictCode(code)) return "QUARENTENA"
  if (code === OFFLINE_CODE) return "SEM_CONEXAO"
  if (code === AUTH_REQUIRED) return "SESSAO_EXPIRADA"
  if (code === PERMISSION_DENIED) return "SEM_PERMISSAO"
  if (code === INCONCLUSIVE_RESPONSE) return "RESPOSTA_INCONCLUSIVA"
  if (input.timedOut) return "SEM_RESPOSTA"
  // Só o navegador offline prova que nada saiu; erro de rede com o navegador "online" pode
  // ter acontecido depois do commit — resultado desconhecido.
  if (input.networkError) return input.offline ? "SEM_CONEXAO" : "SEM_RESPOSTA"
  if (typeof input.httpStatus === "number" && input.httpStatus >= 500) return "SERVIDOR_INDISPONIVEL"
  if (code && DEFINITIVE_REJECTION_CODES.has(code)) return "REJEITADA"
  return "EXIGE_CORRECAO"
}

export const ATTEMPT_OUTCOME_LABEL: Record<SaleSyncAttemptOutcome, string> = {
  CONFIRMADA: "Confirmada pelo servidor",
  JA_EXISTIA_NO_SERVIDOR: "Já estava gravada no servidor — reconciliada sem reenviar",
  SEM_CONEXAO: "Sem conexão com o servidor — nada foi enviado",
  SEM_RESPOSTA: "Sem resposta do servidor — resultado desconhecido; a mesma venda será verificada antes de qualquer reenvio",
  SERVIDOR_INDISPONIVEL: "Servidor indisponível (erro temporário)",
  RESPOSTA_INCONCLUSIVA: "Resposta sem prova da venda — não marcada como sincronizada",
  SESSAO_EXPIRADA: "Sessão expirada — entre novamente; a venda está preservada",
  SEM_PERMISSAO: "Usuário sem permissão para registrar vendas nesta loja",
  EXIGE_CORRECAO: "Servidor recusou — exige correção",
  REJEITADA: "Servidor recusou a venda — nada foi gravado",
  QUARENTENA: "Conflito de identidade — preservada para recuperação",
}

/**
 * A tentativa pode ter gravado no servidor sem que a resposta chegasse (rede com o navegador
 * online, prazo, 5xx, 2xx sem prova). Uma recusa de NEGÓCIO do writer V2 prova o contrário
 * (identidade gravada seria replay 200) e zera a dúvida; 401/403 não provam nada.
 */
export function nextResultUnknown(
  previous: boolean | undefined,
  input: { code?: string | null; httpStatus?: number; networkError?: boolean; timedOut?: boolean; offline?: boolean },
): boolean {
  const code = typeof input.code === "string" ? input.code.trim() : ""
  if (input.timedOut) return true
  if (input.networkError) return input.offline ? previous === true : true
  if (typeof input.httpStatus === "number" && input.httpStatus >= 500) return true
  if (code === INCONCLUSIVE_RESPONSE) return true
  if (code === AUTH_REQUIRED || code === PERMISSION_DENIED) return previous === true
  if (typeof input.httpStatus === "number" && input.httpStatus >= 400) return false
  return previous === true
}

/**
 * Atraso do reenvio AUTOMÁTICO depois de `failures` falhas transitórias seguidas
 * (o manual ignora). Rede volta pelo evento `online`, que zera o contador.
 */
export function autoRetryDelayMs(failures: number, kind: "network" | "server" | "auth"): number {
  const base = kind === "network" ? 15_000 : kind === "server" ? 30_000 : 60_000
  const exp = Math.min(Math.max(0, failures - 1), 5)
  return Math.min(base * 2 ** exp, 5 * 60_000)
}

export function autoRetryKind(input: {
  code?: string | null
  httpStatus?: number
  networkError?: boolean
}): "network" | "server" | "auth" {
  if (input.code === AUTH_REQUIRED) return "auth"
  if (input.networkError) return "network"
  return "server"
}

// ── Conectividade ────────────────────────────────────────────────────────────

export type SyncConnectivity = "online" | "offline" | "servidor_inacessivel" | "desconhecida"

/** Janela em que uma falha de rede recente ainda vale como "servidor inacessível". */
export const CONNECTIVITY_FAILURE_WINDOW_MS = 2 * 60_000

/**
 * `navigator.onLine === false` é prova de offline; `true` não prova nada (Wi-Fi sem
 * internet, portal cativo, servidor fora). A última resposta real do backend decide.
 */
export function deriveConnectivity(input: {
  navigatorOnline: boolean | undefined
  lastFailureAt: number | null
  lastSuccessAt: number | null
  now: number
}): SyncConnectivity {
  if (input.navigatorOnline === false) return "offline"
  const { lastFailureAt, lastSuccessAt, now } = input
  if (
    lastFailureAt != null &&
    (lastSuccessAt == null || lastFailureAt > lastSuccessAt) &&
    now - lastFailureAt < CONNECTIVITY_FAILURE_WINDOW_MS
  ) {
    return "servidor_inacessivel"
  }
  return lastSuccessAt != null ? "online" : "desconhecida"
}

export function isEffectivelyOffline(connectivity: SyncConnectivity): boolean {
  return connectivity === "offline" || connectivity === "servidor_inacessivel"
}

/**
 * Meios que dependem de saldo/consulta no servidor não podem ser concedidos offline:
 * crédito/vale (saldo do cliente), a prazo e carnê (título em Contas a Receber).
 * Dinheiro, Pix e cartão são registrados como DECLARADOS pelo operador — a venda segue
 * não confirmada até o servidor gravar; o PDV não tem TEF nem Pix com confirmação.
 */
export function offlinePaymentBlockReason(pb: Pick<PaymentBreakdownFull, "creditoVale" | "aPrazo" | "carne">): string | null {
  const blocked: string[] = []
  if (pb.creditoVale > 0.009) blocked.push("crédito/vale")
  if (pb.aPrazo > 0.009) blocked.push("a prazo")
  if (pb.carne > 0.009) blocked.push("carnê")
  if (blocked.length === 0) return null
  return `Sem conexão com o servidor: ${blocked.join(", ")} exige consulta de saldo/título online e não pode ser registrado offline. Use dinheiro, Pix ou cartão (declarados) ou aguarde a conexão. Nada foi gravado.`
}

export function declaredPaymentLabels(pb: Pick<PaymentBreakdownFull, "dinheiro" | "pix" | "cartaoDebito" | "cartaoCredito">): string[] {
  const out: string[] = []
  if (pb.dinheiro > 0.009) out.push("dinheiro")
  if (pb.pix > 0.009) out.push("Pix")
  if (pb.cartaoDebito > 0.009) out.push("cartão de débito")
  if (pb.cartaoCredito > 0.009) out.push("cartão de crédito")
  return out
}

// ── Estado operacional da pendência ──────────────────────────────────────────

export type SaleSyncPhase = "verificando" | "enviando"

export type OperatorSaleSyncStatus =
  | "REGISTRADA_LOCALMENTE"
  | "AGUARDANDO_CONEXAO"
  | "VERIFICANDO_SERVIDOR"
  | "ENVIANDO"
  | "CONFIRMADA"
  | "REJEITADA"
  | "EXIGE_CORRECAO"
  | "QUARENTENA"

export const OPERATOR_STATUS_LABEL: Record<OperatorSaleSyncStatus, string> = {
  REGISTRADA_LOCALMENTE: "Registrada só neste terminal",
  AGUARDANDO_CONEXAO: "Aguardando conexão com o servidor",
  VERIFICANDO_SERVIDOR: "Verificando venda no servidor…",
  ENVIANDO: "Enviando…",
  CONFIRMADA: "Confirmada pelo servidor",
  REJEITADA: "Recusada pelo servidor",
  EXIGE_CORRECAO: "Exige correção",
  // O operador não precisa do jargão: a venda está preservada e a reconciliação é automática.
  QUARENTENA: "Preservada — conferência automática no servidor",
}

export type OperatorSaleSyncView = {
  status: OperatorSaleSyncStatus
  label: string
  /** O servidor tem a venda? `"desconhecido"` quando a última resposta não chegou. */
  serverHasSale: "sim" | "nao" | "desconhecido"
  /** Reenviar é permitido (mesma identidade). */
  canResend: boolean
  /** Precisa de administrador (conflito de identidade). */
  needsAdmin: boolean
}

export function operatorSaleSyncView(
  sale: Pick<
    SaleRecord,
    | "syncPending"
    | "syncBlockedCode"
    | "syncHttpStatus"
    | "syncNetworkError"
    | "syncFailureMessage"
    | "syncLastAttemptAt"
    | "syncAttemptCount"
    | "syncLastAttemptOutcome"
    | "syncResultUnknown"
  >,
  ctx: { phase?: SaleSyncPhase | null; offline?: boolean },
): OperatorSaleSyncView {
  if (sale.syncPending !== true) {
    return { status: "CONFIRMADA", label: OPERATOR_STATUS_LABEL.CONFIRMADA, serverHasSale: "sim", canResend: false, needsAdmin: false }
  }
  const quarantined = isSaleIdentityConflictCode(sale.syncBlockedCode)
  if (ctx.phase === "verificando" || ctx.phase === "enviando") {
    const status: OperatorSaleSyncStatus = ctx.phase === "verificando" ? "VERIFICANDO_SERVIDOR" : "ENVIANDO"
    return { status, label: OPERATOR_STATUS_LABEL[status], serverHasSale: "desconhecido", canResend: false, needsAdmin: false }
  }
  if (quarantined) {
    return { status: "QUARENTENA", label: OPERATOR_STATUS_LABEL.QUARENTENA, serverHasSale: "desconhecido", canResend: false, needsAdmin: true }
  }
  const failure = {
    code: sale.syncBlockedCode,
    httpStatus: sale.syncHttpStatus,
    networkError: sale.syncNetworkError,
    message: sale.syncFailureMessage,
  }
  const klass = classifyPendingSyncFailure(failure)
  const code = resolvePendingSyncErrorCode(failure)
  if (klass === PENDING_SYNC_CLASS.ACTION_REQUIRED) {
    // 4xx de negócio: o writer recusou dentro da transação — nada gravado.
    const status: OperatorSaleSyncStatus = code && DEFINITIVE_REJECTION_CODES.has(code) ? "REJEITADA" : "EXIGE_CORRECAO"
    return {
      status,
      label: OPERATOR_STATUS_LABEL[status],
      serverHasSale: sale.syncResultUnknown === true ? "desconhecido" : "nao",
      canResend: true,
      needsAdmin: false,
    }
  }
  const neverTried = !sale.syncLastAttemptAt && !sale.syncAttemptCount
  if (neverTried && !ctx.offline) {
    return { status: "REGISTRADA_LOCALMENTE", label: OPERATOR_STATUS_LABEL.REGISTRADA_LOCALMENTE, serverHasSale: "desconhecido", canResend: true, needsAdmin: false }
  }
  // Rede/5xx/prazo/inconclusivo: pode ter gravado — só a mesma identidade tenta de novo.
  // Registro anterior a esta entrega (sem `syncResultUnknown`): heurística conservadora.
  const unknownResult =
    sale.syncResultUnknown ??
    (sale.syncNetworkError === true ||
      (typeof sale.syncHttpStatus === "number" && sale.syncHttpStatus >= 500) ||
      code === INCONCLUSIVE_RESPONSE)
  const authExpired = code === AUTH_REQUIRED
  return {
    status: "AGUARDANDO_CONEXAO",
    label: authExpired ? "Aguardando novo login" : OPERATOR_STATUS_LABEL.AGUARDANDO_CONEXAO,
    serverHasSale: unknownResult ? "desconhecido" : "nao",
    canResend: true,
    needsAdmin: false,
  }
}

// ── Fila entre abas ──────────────────────────────────────────────────────────

type MergeableSale = Pick<SaleRecord, "id" | "clientSaleId" | "syncPending" | "at">

function isSaleLike(value: unknown): value is SaleRecord {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string" &&
    (value as { id: string }).id.trim() !== ""
  )
}

/**
 * Chave entre abas: a `clientSaleId` (única por venda); sem ela (writer V1 legado), id +
 * instante — o número `VDA-…` sozinho é reaproveitado por `nextSaleId` depois de um descarte
 * e casaria uma venda NOVA com a antiga (lápide apagando venda real).
 */
export function crossTabSaleKey(sale: Pick<SaleRecord, "id" | "clientSaleId" | "at">): string {
  const key = saleLocalKey(sale)
  return key === sale.id ? legacySaleKey(sale) : key
}

/**
 * Chave secundária `id@at`: a MESMA venda legada antes e depois de ganhar a `clientSaleId`
 * derivada (reconciliação da quarentena). Sem ela a cópia sem identidade voltava do storage
 * como "outra" venda a cada ciclo e a fila crescia até esgotar a quota.
 */
function legacySaleKey(sale: Pick<SaleRecord, "id" | "at">): string {
  return `${sale.id}@${sale.at ?? ""}`
}

function saleKeys(sale: Pick<SaleRecord, "id" | "clientSaleId" | "at">): string[] {
  const primary = crossTabSaleKey(sale)
  const legacy = legacySaleKey(sale)
  return primary === legacy ? [primary] : [primary, legacy]
}

/**
 * União monotônica da fila desta aba com a gravada por outra aba (mesma loja):
 * - venda pendente que só a outra aba conhece entra (salvo lápide: descartada com prova);
 * - a mesma venda confirmada lá e pendente aqui vira confirmada (confirmação vence);
 * - nada daqui é removido (para isso, `dropTombstonedPending`). Devolve a MESMA referência
 *   quando não há mudança.
 */
export function mergeSalesFromOtherTab<T extends SaleRecord>(
  local: readonly T[],
  incoming: readonly unknown[] | null | undefined,
  tombstones: ReadonlySet<string>,
): T[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return local as T[]
  const index = new Map<string, number>()
  local.forEach((s, i) => {
    if (s && typeof s === "object") for (const k of saleKeys(s as MergeableSale)) if (!index.has(k)) index.set(k, i)
  })
  let out: T[] | null = null
  for (const raw of incoming) {
    if (!isSaleLike(raw)) continue
    const other = raw as T
    const keys = saleKeys(other)
    const idx = keys.map((k) => index.get(k)).find((i) => i !== undefined)
    if (idx !== undefined) {
      const mine = (out ?? local)[idx]
      if (mine.syncPending === true && other.syncPending === false) {
        out = out ?? [...local]
        out[idx] = other
      }
      continue
    }
    if (other.syncPending !== true || keys.some((k) => tombstones.has(k))) continue
    out = out ?? [...local]
    for (const k of keys) index.set(k, out.length)
    out.push(other)
  }
  return out ?? (local as T[])
}

/**
 * Tira desta aba as pendentes que OUTRA aba descartou com prova (lápide): recusa definitiva
 * na finalização ou descarte verificado no servidor. Sem isto a aba que adotou a pendência a
 * regravava e reenviava — venda fantasma depois de o operador corrigir e vender de novo.
 * `keep`: tentativas com carrinho aberto NESTA aba nunca saem por lápide alheia.
 */
export function dropTombstonedPending<T extends SaleRecord>(
  sales: readonly T[],
  tombstones: ReadonlySet<string>,
  keep?: (sale: T) => boolean,
): T[] {
  if (tombstones.size === 0) return sales as T[]
  let changed = false
  const out = sales.filter((s) => {
    const drop = s?.syncPending === true && saleKeys(s).some((k) => tombstones.has(k)) && !(keep?.(s) ?? false)
    if (drop) changed = true
    return !drop
  })
  return changed ? out : (sales as T[])
}

const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60_000
const TOMBSTONE_MAX = 300

export function saleTombstonesKey(storeId: string): string {
  return `omnigestao:pdv-sale-tombstones:${storeId}`
}

function readTombstoneMap(storeId: string, now: number): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(saleTombstonesKey(storeId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [key, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at !== "string") continue
      const t = Date.parse(at)
      if (Number.isFinite(t) && now - t < TOMBSTONE_TTL_MS) out[key] = at
    }
    return out
  } catch {
    return {}
  }
}

export function readSaleTombstones(storeId: string, now = Date.now()): Set<string> {
  return new Set(Object.keys(readTombstoneMap(storeId, now)))
}

/** Lápide da venda removida da fila com prova (descarte verificado / recusa definitiva). */
export function addSaleTombstone(storeId: string, sale: Pick<SaleRecord, "id" | "clientSaleId" | "at">, now = Date.now()): void {
  if (typeof window === "undefined") return
  try {
    const map = readTombstoneMap(storeId, now)
    const at = new Date(now).toISOString()
    for (const k of saleKeys(sale)) map[k] = at
    const entries = Object.entries(map).sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, TOMBSTONE_MAX)
    window.localStorage.setItem(saleTombstonesKey(storeId), JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* quota: sem lápide, a outra aba no máximo re-adiciona e o servidor decide */
  }
}

// ── Coordenação entre abas ───────────────────────────────────────────────────

type LockManagerLike = {
  request: (
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<unknown>,
  ) => Promise<unknown>
}

function lockManager(): LockManagerLike | null {
  if (typeof navigator === "undefined") return null
  const locks = (navigator as { locks?: LockManagerLike }).locks
  return locks && typeof locks.request === "function" ? locks : null
}

export function saleSyncLockName(storeId: string, sale: { id: string; clientSaleId?: string }): string {
  return `omnigestao:sale-sync:${storeId}:${saleLocalKey(sale)}`
}

/**
 * Single-flight ENTRE ABAS por venda. `try`: se outra aba está enviando, não envia
 * (reenvio automático). `wait`: espera a outra aba terminar, até `waitMs` (Reenviar manual).
 * Sem Web Locks (navegador antigo) executa direto — o banco segue idempotente.
 */
export async function withSaleSyncLock<T>(
  name: string,
  mode: "try" | "wait",
  fn: () => Promise<T>,
  waitMs = SALE_PERSIST_TIMEOUT_MS + 5_000,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const locks = lockManager()
  if (!locks) return { acquired: true, value: await fn() }
  let result: { acquired: true; value: T } | { acquired: false } = { acquired: false }
  if (mode === "try") {
    await locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return
      result = { acquired: true, value: await fn() }
    })
    return result
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), waitMs)
  try {
    await locks.request(name, { signal: controller.signal }, async () => {
      clearTimeout(timer)
      result = { acquired: true, value: await fn() }
    })
  } catch (err) {
    if (!controller.signal.aborted) throw err
  } finally {
    clearTimeout(timer)
  }
  return result
}
