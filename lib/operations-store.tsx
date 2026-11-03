"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { OrdemServico } from "@/components/dashboard/os/ordens-servico"
import type { Orcamento } from "@/lib/orcamento-types"
import { normalizeDocDigits } from "@/lib/cpf"
import { OPS_KEY_LEGACY } from "@/lib/loja-ativa"
import { opsLojaIdFromStorageKey } from "@/lib/ops-loja-id"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import type { APrazoConfig, CaixaOperacaoRecord, DevolucaoRecord, PaymentBreakdownFull, SaleLineRecord, SaleRecord } from "@/lib/operations-sale-types"
import { mergeSalesById } from "@/lib/operations-sales-merge"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import { resolveSaleLineItemType, type SaleLineItemType } from "@/lib/sale-line-classification"
import { saleLineRecordFromFinalizeInput } from "@/lib/operations-sale-line"
import { readSelectedTerminal } from "@/lib/pdv-terminal"
import { emitEvent } from "@/lib/events/event-bus"
import { initAutomationEngineClient } from "@/lib/automation/automation-engine"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import { useSession } from "next-auth/react"
import { isStoreExperienceSession } from "@/lib/auth/store-admin-reauth"
import { registrarOperacaoCaixaServer } from "@/lib/pdv-caixa-operacao"
import {
  applyCaixaSessionDecision,
  createSingleFlight,
  isCaixaSessionRejectionCode,
  reconcileCaixaSession,
  type CaixaRefreshOutcome,
} from "@/lib/pdv-caixa-session"
import { toast } from "@/components/ui/use-toast"
import type { AccessorySelectionV1, ProdutoAcessoriosMetadataV1 } from "@/lib/acessorios/types"
import {
  isSaleIdentityConflictCode,
  preserveSaleIdentityConflictCodes,
  SALE_IDENTITY_CONFLICT_GUIDANCE,
  SALE_IDENTITY_CONFLICT_TITLE,
} from "@/lib/vendas/sale-identity-conflict"
import {
  FRACTIONAL_QUANTITY_MESSAGE,
  isIntegerSaleQuantity,
} from "@/lib/vendas/sale-quantity-contract"
import {
  assertGeneratedClientSaleId,
  buildProvisionalSaleRef,
  deriveLegacySaleClientSaleId,
  generateClientSaleId,
  isProvisionalSaleRef,
  saleLocalKey,
} from "@/lib/vendas/local-sale-identity"
import {
  classifySaleWriterCapability,
  extractConfirmedVenda,
  parseSalePersistError,
  quarantineAutoReconcileUrl,
  recoverQuarantinedSaleUrl,
  quarantineRecoveryPreviewUrl,
  quarantineRecoveryBatchUrl,
  shouldFallbackV2ToV1,
  vendaByClientSaleIdUrl,
  vendaPersistV2Url,
  type ConfirmedVendaView,
  type SaleWriterCapability,
} from "@/lib/vendas/sale-client-sync"
import {
  QUARANTINE_AUTO_RECONCILE_HOLD_MS,
  QUARANTINE_AUTO_RECONCILE_RETRY_MS,
  QUARANTINE_RECOVERY_CHUNK,
  applyRecoveryConfirmations,
  buildIndividualRecoveryConfirmations,
  buildRecoveryConfirmations,
  chunk,
  isQuarantinedLocalSale,
  selectAutoReconcileCandidates,
  summarizePlanItems,
  summarizeRecoveryResults,
  type RecoveryConfirmation,
} from "@/lib/vendas/quarantine-local-reconciliation"
import {
  pendingReasonView,
  PENDING_SYNC_CLASS,
  resolvePendingSyncErrorCode,
  shouldAutoRetryPendingSync,
  definitiveRejectionFinalizeReason,
  finalizeFailureDisposition,
  unresolvedSaleLineLabels,
} from "@/lib/vendas/pending-sync-classification"
import {
  applyConfirmedLocalEffects,
  reverseAppliedLocalEffects,
  shouldReverseFinanceOnPendingDiscard,
  shouldReverseStockOnPendingDiscard,
} from "@/lib/pdv/pending-local-effects"
import {
  clearPersistedSaleAttempt,
  closePersistedSaleAttemptIfIdentity,
  findMatchingPendingSale,
  reconcilePersistedSaleAttempts,
  resolvePersistedAttemptForNewSale,
  saleAttemptFingerprint,
  saleRecordAttemptFingerprint,
  writePersistedSaleAttempt,
} from "@/lib/pdv/pending-sale-attempt"
import { createConfirmedSaleEmitter } from "@/lib/pdv-finalize-integrity"
import {
  AUTH_REQUIRED,
  INCONCLUSIVE_RESPONSE,
  OFFLINE_CODE,
  SALE_ALREADY_CONFIRMED_CODE,
  SALE_PERSIST_TIMEOUT_MS,
  SALE_PROBE_TIMEOUT_MS,
  SALE_LOCK_WAIT_MS,
  SALE_VERIFY_TIMEOUT_MS,
  SaleSyncTimeoutError,
  addSaleTombstone,
  attemptOutcomeFromFailure,
  authFailureCode,
  autoRetryDelayMs,
  autoRetryKind,
  confirmedSaleEvidence,
  deriveConnectivity,
  dropTombstonedPending,
  fetchTextWithTimeout,
  isEffectivelyOffline,
  mergeSalesFromOtherTab,
  nextResultUnknown,
  offlinePaymentBlockReason,
  readSaleTombstones,
  saleTombstonesKey,
  saleSyncLockName,
  withSaleSyncLock,
  type SaleSyncAttemptOutcome,
  type SaleSyncPhase,
  type SyncConnectivity,
  type TimedTextResponse,
} from "@/lib/vendas/sale-sync-engine"
import {
  countNonRecords,
  isRecord,
  keepRecords,
  sanitizeInventoryItems,
  sanitizeSaleRecords,
} from "@/lib/pdv-mount-guards"
import { markPdvMountStep } from "@/lib/pdv-mount-diagnostics"
import {
  CATALOG_SYNC_INTERVAL_MS,
  createCatalogSyncController,
  subscribeCatalogChanged,
  type CatalogCheckStatus,
  type CatalogSyncController,
} from "@/lib/estoque/catalog-sync"

const VENDA_AUTO_RETRY_HOLD_MS = 5 * 60_000
/** Janela em que uma venda idêntica com resultado desconhecido bloqueia o re-registro após F5. */
const UNKNOWN_TWIN_WINDOW_MS = 10 * 60_000
/** Código da recusa: venda idêntica pendente com resultado desconhecido — decisão do operador. */
export const UNKNOWN_TWIN_CODE = "VENDA_IDENTICA_RESULTADO_DESCONHECIDO"

export type { APrazoConfig, CaixaOperacaoRecord, DevolucaoRecord, PaymentBreakdownFull, SaleLineRecord, SaleRecord } from "@/lib/operations-sale-types"

/** Variação de produto (tamanho, cor, sabor, etc.) */
export type ProdutoAtributoDef = {
  id: string
  nome: string
  opcoes: string[]
}

export interface InventoryItem {
  id: string
  name: string
  /** Código de barras (EAN/GTIN) — usado no PDV Alta Performance. */
  barcode?: string
  /** SKU interno (Prisma `sku`) quando diferente do `id` operacional. */
  sku?: string
  /** Id persistido no banco (cuid) — bipe/código pode referenciar o registro. */
  dbId?: string
  /** Código interno de balcão (alias de SKU / id legado). */
  codigo?: string
  /** Alias de `barcode` para buscas e integrações. */
  codigoBarras?: string
  stock: number
  cost: number
  price: number
  category: string
  /** Se true, `price` é preço por kg; venda = preço/kg × peso da balança. */
  vendaPorPeso?: boolean
  /** Quando `vendaPorPeso`, deve refletir o mesmo que `price` (R$/kg). */
  precoPorKg?: number
  atributos?: ProdutoAtributoDef[]
  /** Configuração saneada e opcional projetada por `/api/ops/inventory`. */
  accessoryConfig?: ProdutoAcessoriosMetadataV1
}

export interface CaixaState {
  isOpen: boolean
  saldoInicial: number
  dataAbertura: Date | null
  totalEntradas: number
  totalSaidas: number
}

/** Resumo do dia para fechamento cego (por forma de pagamento). */
export interface DailyLedger {
  date: string
  vendasDinheiro: number
  /** Valor faturado à prazo (Contas a Receber) — excluído do caixa físico. */
  vendasAPrazo: number
  vendasPix: number
  vendasCartaoDebito: number
  vendasCartaoCredito: number
  vendasCarne: number
  /** Valor de compras pagas com crédito/vale de troca (não é dinheiro físico). */
  vendasCreditoVale: number
  totalVendas: number
  osAbertas: number
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0]
}

function emptyLedger(): DailyLedger {
  return {
    date: todayStr(),
    vendasDinheiro: 0,
    vendasPix: 0,
    vendasCartaoDebito: 0,
    vendasCartaoCredito: 0,
    vendasCarne: 0,
    vendasAPrazo: 0,
    vendasCreditoVale: 0,
    totalVendas: 0,
    osAbertas: 0,
  }
}

/** Migra ledger antigo (vendasCartao) e garante campos novos. */
export function ensureLedger(ledger: DailyLedger | undefined): DailyLedger {
  const t = todayStr()
  if (!ledger || ledger.date !== t) return emptyLedger()
  const legacy = ledger as DailyLedger & { vendasCartao?: number }
  const oldC = legacy.vendasCartao ?? 0
  return {
    date: ledger.date,
    vendasDinheiro: ledger.vendasDinheiro ?? 0,
    vendasPix: ledger.vendasPix ?? 0,
    vendasCartaoDebito: (ledger.vendasCartaoDebito ?? 0) + oldC,
    vendasCartaoCredito: ledger.vendasCartaoCredito ?? 0,
    vendasCarne: ledger.vendasCarne ?? 0,
    vendasAPrazo: ledger.vendasAPrazo ?? 0,
    vendasCreditoVale: ledger.vendasCreditoVale ?? 0,
    totalVendas: ledger.totalVendas ?? 0,
    osAbertas: ledger.osAbertas ?? 0,
  }
}

function normalizePaymentBreakdown(pb?: Partial<PaymentBreakdownFull> & { cartao?: number }): PaymentBreakdownFull {
  const legacyCartao = pb?.cartao ?? 0
  return {
    dinheiro: pb?.dinheiro ?? 0,
    pix: pb?.pix ?? 0,
    cartaoDebito: pb?.cartaoDebito ?? legacyCartao,
    cartaoCredito: pb?.cartaoCredito ?? 0,
    carne: pb?.carne ?? 0,
    aPrazo: pb?.aPrazo ?? 0,
    creditoVale: pb?.creditoVale ?? 0,
  }
}

function nextSaleId(sales: SaleRecord[]): string {
  const year = new Date().getFullYear()
  let max = 0
  for (const s of sales) {
    const m = s.id.match(/^VDA-(\d{4})-(\d+)$/)
    if (m && parseInt(m[1], 10) === year) max = Math.max(max, parseInt(m[2], 10))
  }
  return `VDA-${year}-${String(max + 1).padStart(4, "0")}`
}

// `mergeSalesById` (pura) vive em `@/lib/operations-sales-merge` — importada acima e
// reutilizada por `loadDb` e `refreshSalesFromServer`. Mantida fora deste módulo client
// para permitir teste isolado em ambiente node.

function formatVendaPersistErrorBody(body: string, status: number): string {
  try {
    const j = JSON.parse(body) as { error?: string; detail?: string; code?: string }
    const parts = [j.error, j.detail, j.code ? `(${j.code})` : ""].filter(Boolean)
    if (parts.length > 0) return parts.join(" — ")
  } catch {
    /* raw text */
  }
  const trimmed = body.trim()
  return trimmed || `HTTP ${status}`
}

/** Extrai só o `code` do corpo de erro de `/api/ops/venda-persist` (ex.: `CAIXA_ORIGINAL_FECHADO`). */
function extractVendaPersistErrorCode(body: string): string | undefined {
  try {
    const j = JSON.parse(body) as { code?: string; error?: string; detail?: string }
    if (typeof j.code === "string" && j.code.trim()) return j.code.trim()
    return resolvePendingSyncErrorCode({
      code: j.code,
      message: [j.error, j.detail, body].filter(Boolean).join(" "),
    })
  } catch {
    return resolvePendingSyncErrorCode({ message: body })
  }
}

function vendaPersistUrl(lojaId: string): string {
  return `/api/ops/venda-persist?storeId=${encodeURIComponent(lojaId)}`
}

function persistHeaders(lojaId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    [ASSISTEC_LOJA_HEADER]: lojaId,
  }
}

/** `next` com os mesmos elementos (por referência) de `base` → devolve `base`. */
function sameRefs<T>(next: T[], base: T[]): T[] {
  if (next.length !== base.length) return next
  for (let i = 0; i < next.length; i += 1) if (next[i] !== base[i]) return next
  return base
}

function alreadyConfirmedResult(pedidoId: string): ManualSyncResult {
  return {
    ok: false,
    code: SALE_ALREADY_CONFIRMED_CODE,
    outcome: "CONFIRMADA",
    reason: `Esta venda já está confirmada no servidor (${pedidoId}). Nada foi reenviado.`,
  }
}

function saleMatches(s: SaleRecord, token: { id: string; clientSaleId?: string }): boolean {
  if (token.clientSaleId && s.clientSaleId === token.clientSaleId) return true
  return s.id === token.id
}

function clearSaleSyncFailure(sale: SaleRecord): SaleRecord {
  return {
    ...sale,
    syncBlockedCode: undefined,
    syncHttpStatus: undefined,
    syncFailureMessage: undefined,
    syncDrift: undefined,
    syncNetworkError: undefined,
    syncUnresolvedInventoryIds: undefined,
  }
}

function applyConfirmedFlags(
  sale: SaleRecord,
  confirmed?: { pedidoId: string; id: string; clientSaleId?: string | null },
): SaleRecord {
  const cleared = clearSaleSyncFailure(sale)
  if (!confirmed) {
    return { ...cleared, syncPending: false, localEffectsApplied: true }
  }
  return {
    ...cleared,
    id: confirmed.pedidoId,
    serverId: confirmed.id,
    clientSaleId: sale.clientSaleId ?? confirmed.clientSaleId ?? undefined,
    syncPending: false,
    localEffectsApplied: true,
  }
}

function applyLocalConfirmationToState(
  prev: OpsState,
  token: { id: string; clientSaleId?: string },
  confirmed?: { pedidoId: string; id: string; clientSaleId?: string | null },
): OpsState {
  const current = prev.sales.find((s) => saleMatches(s, token))
  if (!current) return prev
  let inventory = prev.inventory
  let caixa = prev.caixa
  let dailyLedger = prev.dailyLedger
  let customerCredits = prev.customerCredits
  let ordens = prev.ordens
  if (current.localEffectsApplied === false) {
    const applied = applyConfirmedLocalEffects(
      { inventory, caixa: { totalEntradas: caixa.totalEntradas }, dailyLedger, customerCredits },
      current,
      { applyStock: true },
    )
    inventory = applied.state.inventory
    caixa = { ...caixa, totalEntradas: applied.state.caixa.totalEntradas }
    dailyLedger = applied.state.dailyLedger
    customerCredits = applied.state.customerCredits
    if (current.linkedOsId) {
      const now = new Date()
      const linkedOsId = current.linkedOsId
      ordens = prev.ordens.map((o) =>
        o.id === linkedOsId
          ? {
              ...o,
              status: "finalizado",
              dataSaida: now.toISOString().split("T")[0],
              horaSaida: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
            }
          : o,
      )
    }
  }
  return {
    ...prev,
    inventory,
    caixa,
    dailyLedger,
    customerCredits,
    ordens,
    sales: prev.sales.map((s) => (saleMatches(s, token) ? applyConfirmedFlags(s, confirmed) : s)),
  }
}

function discardPendingSaleFromState(prev: OpsState, sale: SaleRecord): OpsState {
  const reversed = reverseAppliedLocalEffects(
    {
      inventory: prev.inventory,
      caixa: { totalEntradas: prev.caixa.totalEntradas },
      dailyLedger: prev.dailyLedger,
      customerCredits: prev.customerCredits,
    },
    sale,
    {
      applyStock: shouldReverseStockOnPendingDiscard(sale),
      reverseFinance: shouldReverseFinanceOnPendingDiscard(sale),
    },
  )
  return {
    ...prev,
    inventory: reversed.state.inventory,
    caixa: { ...prev.caixa, totalEntradas: reversed.state.caixa.totalEntradas },
    dailyLedger: reversed.state.dailyLedger,
    customerCredits: reversed.state.customerCredits,
    sales: prev.sales.filter((s) => !saleMatches(s, sale)),
  }
}

function persistedSaleIdentityConflictCode(
  storageKey: string,
  sale: Pick<SaleRecord, "id" | "clientSaleId" | "syncBlockedCode">,
): string | undefined {
  if (isSaleIdentityConflictCode(sale.syncBlockedCode)) return sale.syncBlockedCode
  if (typeof window === "undefined") return undefined
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { sales?: SaleRecord[] }
    const persisted = Array.isArray(parsed.sales)
      ? parsed.sales.find((candidate) => saleMatches(candidate, sale))
      : undefined
    return isSaleIdentityConflictCode(persisted?.syncBlockedCode)
      ? persisted.syncBlockedCode
      : undefined
  } catch {
    return undefined
  }
}

/** `clientSaleId`s já gravados no armazenamento local desta loja. */
function persistedClientSaleIds(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(storageKey)
    const parsed = raw ? (JSON.parse(raw) as { sales?: SaleRecord[] }) : null
    const sales = parsed && Array.isArray(parsed.sales) ? parsed.sales : []
    return new Set(
      sales
        .map((sale) => sale.clientSaleId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    )
  } catch {
    return new Set()
  }
}

function mergeCustomerCredits(
  local: Record<string, { nome: string; saldo: number }>,
  remote: Record<string, { nome: string; saldo: number }>,
  pendingDevs: DevolucaoRecord[],
  pendingSales: SaleRecord[]
): Record<string, { nome: string; saldo: number }> {
  const merged = { ...local, ...remote }
  for (const k of Object.keys(merged)) {
    const remoteClient = remote[k]
    let saldo = remoteClient ? remoteClient.saldo : 0
    const nome = remoteClient ? remoteClient.nome : (local[k]?.nome ?? "Cliente")

    for (const dev of pendingDevs) {
      if (dev.syncPending && dev.customerCpf === k && dev.mode === "vale_credito") {
        saldo += dev.creditIssued
      }
    }

    for (const sale of pendingSales) {
      if (sale.syncPending && sale.customerCpf === k && sale.paymentBreakdown?.creditoVale > 0) {
        saldo -= sale.paymentBreakdown.creditoVale
      }
    }

    merged[k] = {
      nome,
      saldo: Math.max(0, Math.round(saldo * 100) / 100)
    }
  }
  return merged
}

function nextDevolucaoId(list: DevolucaoRecord[]): string {
  const year = new Date().getFullYear()
  let max = 0
  for (const d of list) {
    const m = d.id.match(/^DEV-(\d{4})-(\d+)$/)
    if (m && parseInt(m[1], 10) === year) max = Math.max(max, parseInt(m[2], 10))
  }
  return `DEV-${year}-${String(max + 1).padStart(4, "0")}`
}

type OpsState = {
  inventory: InventoryItem[]
  ordens: OrdemServico[]
  caixa: CaixaState
  /** ID da sessão de caixa persistida no servidor (POST /api/ops/caixa/abrir). */
  caixaSessaoId: string | null
  dailyLedger: DailyLedger
  sales: SaleRecord[]
  devolucoes: DevolucaoRecord[]
  pendingCaixaOperations: CaixaOperacaoRecord[]
  orcamentos: Orcamento[]
  /** chave = CPF/CNPJ só dígitos */
  customerCredits: Record<string, { nome: string; saldo: number }>
}

type SaleLine = {
  inventoryId: string
  quantity: number
  /** `Produto.id` capturado no carrinho (PDV-CADASTROS-SYNC-AUTOMATICO-001). */
  produtoId?: string
}

const defaultState: OpsState = {
  inventory: [],
  ordens: [],
  caixa: {
    isOpen: false,
    saldoInicial: 0,
    dataAbertura: null,
    totalEntradas: 0,
    totalSaidas: 0,
  },
  dailyLedger: emptyLedger(),
  sales: [],
  devolucoes: [],
  pendingCaixaOperations: [],
  orcamentos: [],
  customerCredits: {},
  caixaSessaoId: null,
}

interface OperationsContextType {
  inventory: InventoryItem[]
  ordens: OrdemServico[]
  caixa: CaixaState
  caixaSessaoId: string | null
  dailyLedger: DailyLedger
  sales: SaleRecord[]
  devolucoes: DevolucaoRecord[]
  pendingCaixaOperations: CaixaOperacaoRecord[]
  orcamentos: Orcamento[]
  customerCredits: Record<string, { nome: string; saldo: number }>
  setOrdens: React.Dispatch<React.SetStateAction<OrdemServico[]>>
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>
  setOrcamentos: React.Dispatch<React.SetStateAction<Orcamento[]>>
  abrirCaixa: (saldoInicial: number) => void
  fecharCaixa: () => void
  adicionarEntrada: (valor: number) => void
  adicionarSaida: (valor: number) => void
  getSaldoAtual: () => number
  setCaixaSessaoId: (id: string | null) => void
  /**
   * Reconsulta a sessão de caixa ABERTA da loja atual e re-hidrata o estado local
   * (servidor é a fonte da verdade). Substitui referência local obsoleta/ausente sem
   * exigir fechar e abrir outro caixa. Nunca adota caixa de outra loja, nunca decide
   * antes da hidratação do estado persistido, e não toca no carrinho nem na fila de
   * vendas pendentes. Chamadas concorrentes compartilham a mesma consulta em voo.
   */
  refreshCaixaSession: () => Promise<CaixaRefreshOutcome>
  incrementOsAbertasDia: () => void
  getSaldoCreditoCliente: (cpf: string) => number
  /**
   * Semeia/reforça o saldo local de crédito (CPF/CNPJ) com o valor reportado
   * pelo servidor quando o PaymentModal localiza um vale por doc/código. Só
   * sobe o teto — nunca reduz — porque o DB é a fonte da verdade e a
   * reconciliação do bootstrap volta a sobrescrever. Evita o falso
   * "Saldo de crédito insuficiente" no guard do finalize em navegador frio.
   */
  sincronizarCreditoLocal: (doc: string, nome: string, saldo: number) => void
  /**
   * Contrato tri-estado (PDV-MOTOR-INTEGRITY-N1) — sem segunda máquina:
   * - `{ ok: false }` = FAILED (rejeitada antes de qualquer efeito);
   * - `{ ok: true, pending: true }` = PENDING (identidade estável gravada local,
   *   AGUARDANDO confirmação do servidor; estoque/caixa/ledger NÃO são
   *   mutados até CONFIRMED; nunca limpar o carrinho, nunca nova identidade);
   * - `{ ok: true, pending: false }` = CONFIRMED (servidor confirmou).
   * Somente CONFIRMED dispara efeitos definitivos (`venda_finalizada`, cupom
   * definitivo). Retry/sync confirma com a MESMA identidade (`clientSaleId`).
   */
  finalizeSaleTransaction: (input: {
    lines: Array<
      SaleLine & {
        name?: string
        unitPrice?: number
        itemType?: SaleLineItemType
        /** Marca item avulso (Venda Avulsa via INSERT no PDV) — não toca estoque. */
        isAvulso?: boolean
        /** Custo unitário opcional informado pelo operador no balcão. `null`/ausente = desconhecido. */
        custoUnitario?: number | null
        /** Seleção de modelo/cor do acessório (dado passivo, ver SaleLineRecord). */
        accessorySelection?: AccessorySelectionV1
        serviceId?: string
        serviceCategory?: string
        warrantyDays?: number
        serviceTerms?: string
      }
    >
    total: number
    linkedOsId?: string | null
    paymentBreakdown?: Partial<PaymentBreakdownFull> & { cartao?: number }
    /**
     * Discriminador fiscal observado do PIX. O cliente não envia tPag.
     * Ausente com PIX > 0: a venda comercial fecha; o handoff Fiscal permanece bloqueado.
     */
    pixQrKind?: unknown
    /**
     * Dinheiro fisicamente entregue. Não altera o valor comercial nem o Caixa.
     * Ausente: sem troco fiscal.
     */
    cashTendered?: unknown
    customerCpf?: string
    customerName?: string
    /** FK real para o cliente cadastrado (cuid de Cliente). Nulo em consumidor final. */
    clienteId?: string
    openCaixaIfClosed?: boolean
    saldoInicialAoAbrir?: number
    auditMeta?: {
      cashierId?: string
      discountAuthorizedByAdminId?: string
      discountReais?: number
      discountPercent?: number
    }
    aPrazoConfig?: APrazoConfig
  }) => Promise<
    | { ok: true; saleId: string; pending?: boolean; clientSaleId?: string; serverId?: string }
    /** \`code: UNKNOWN_TWIN_CODE\` = aguardando a decisão explícita do operador (\`resolveUnknownTwin\`). */
    | { ok: false; reason: string; code?: string }
  >
  registrarDevolucao: (input: {
    saleId: string
    lines: { inventoryId: string; quantity: number }[]
    mode: "vale_credito" | "somente_estoque"
    customerCpf: string
    customerName: string
    sessaoId?: string
    tipo?: "vale_credito" | "somente_estoque" | "troca" | "devolucao"
    motivo?: string
    observacao?: string
    payload?: any
  }) => { ok: true; devolucaoId: string; creditIssued: number } | { ok: false; reason: string }
  registrarOperacaoCaixa: (input: {
    sessaoId: string
    tipo: "sangria" | "suprimento"
    valor: number
    motivo: string
    localId: string
    operador?: string
  }) => Promise<{ ok: true; deduped?: boolean } | { ok: false; reason: string }>
  /**
   * Re-busca as vendas do servidor (`/api/ops/vendas-list`) e reconcilia o estado local,
   * propagando o `status` autoritativo (ex.: cancelamento feito na tela Vendas) para o
   * caixa/fechamento. Best-effort: erro de rede não altera o estado.
   */
  refreshSalesFromServer: () => Promise<void>
  /** Versão do catálogo carregado (PDV-CADASTROS-SYNC-AUTOMATICO-001); `null` antes da 1ª carga. */
  catalogVersion: string | null
  /** Pergunta a versão do catálogo da loja e baixa o snapshot se mudou; `force` baixa direto. */
  checkCatalog: (opts?: { force?: boolean }) => Promise<CatalogCheckStatus>
  /** Superfície de venda montada: liga os checks automáticos de versão. Devolve o desligamento. */
  watchCatalogSync: () => () => void
  /**
   * Reenvio MANUAL de uma venda local `syncPending` (PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001):
   * offline → recusa na hora (`SEM_CONEXAO`), sem fingir envio; senão 1) verifica no servidor
   * pela mesma `clientSaleId` (já gravada → reconcilia sem reenviar), 2) envia a MESMA venda.
   * `ok: true` só com prova da venda no servidor. Cada tentativa grava horário e desfecho na
   * própria venda; `saleSyncPhases` expõe "verificando"/"enviando" enquanto acontece.
   */
  retrySyncSale: (saleId: string) => Promise<ManualSyncResult>
  /**
   * Ação manual explícita (nunca automática): reenvia uma venda pendente cuja sessão de
   * caixa original existe e é desta loja, mas já está `FECHADA`
   * (`sale.syncBlockedCode === "CAIXA_ORIGINAL_FECHADO"`), autorizando o servidor a
   * gravá-la retroativamente na PRÓPRIA sessão original (nunca no caixa atual). A UI deve
   * pedir confirmação antes de chamar.
   */
  retrySyncSaleRetroactive: (saleId: string) => Promise<ManualSyncResult>
  recoverQuarantinedSale: (input: {
    saleId: string
    motivo: string
    allowClosedOriginalSession?: boolean
  }) => Promise<{ ok: true; saleId: string; replayed?: boolean } | { ok: false; reason: string; code?: string }>
  /**
   * Capability do writer (GET `/api/ops/venda-persist/v2`). O mesmo gate do
   * preview global: a UI individual só inicia recovery quando o resultado é `v2`.
   */
  probeSaleWriterCapability: () => Promise<SaleWriterCapability>
  /**
   * Verifica no servidor se a venda existe antes de descartar localmente.
   * - Se o servidor tem (HTTP 200): NÃO descarta — reconcilia como CONFIRMED.
   * - Se o servidor NÃO tem (HTTP 404): remove a venda e reverte efeitos locais.
   * - Outros erros: aborta sem alterar estado (fail-closed).
   */
  discardLocalPendingSale: (saleId: string) => Promise<
    | { ok: true; mode: "discarded" }
    | { ok: true; mode: "reconciled"; reason: string }
    | { ok: false; reason: string }
  >
  /**
   * Para CADA venda local com `syncPending=true`, consulta o servidor: reconcilia as
   * presentes (200) e MANTÉM as ausentes (404) — venda real que ainda não chegou ao
   * servidor nunca é descartada; o reenvio automático continua cuidando dela. Conflitos
   * de identificação e erros de consulta entram em `conflicts`.
   * Só estado local — não toca em estoque/financeiro/caixa.
   */
  bulkDiscardLocalPendingSales: () => Promise<{
    ok: true
    total: number
    reconciled: number
    kept: number
    conflicts: number
  }>
  /**
   * DRY-RUN de TODAS as vendas locais em quarentena. Read-only no servidor: apenas
   * classifica. Cunha e persiste localmente a identidade técnica que estiver faltando
   * ANTES de qualquer chamada — assim a execução (e qualquer retry posterior) reusa a
   * MESMA chave de idempotência, sem risco de criar venda duplicada.
   */
  previewQuarantineRecovery: () => Promise<
    | {
        ok: true
        writerEnabled: boolean
        items: QuarantineRecoveryPlanItemView[]
        summary: QuarantineRecoverySummaryView
      }
    | { ok: false; reason: string; code?: string }
  >
  /**
   * Recuperação administrada EM LOTE. Uma transação por venda no servidor; o estado
   * local só é reconciliado para os itens com evidência server-side (`RECOVERED` /
   * `ALREADY_RECOVERED` com venda). Quarentena de item bloqueado permanece intacta.
   */
  recoverQuarantinedSalesBatch: (input: {
    motivo: string
    allowClosedOriginalSession?: boolean
  }) => Promise<
    | {
        ok: true
        results: QuarantineRecoveryResultView[]
        summary: {
          total: number
          recovered: number
          alreadyRecovered: number
          requiresConfirmation: number
          blocked: number
          failed: number
        }
        /** Quantas cópias locais saíram da quarentena (só com evidência server-side). */
        reconciled: number
      }
    | { ok: false; reason: string; code?: string }
  >
  /**
   * Chaves (`quarantineReviewKey`) das vendas preservadas que a reconciliação automática
   * NÃO resolveu com segurança — as únicas que pedem o administrador.
   */
  quarantineReviewKeys: ReadonlySet<string>
  /**
   * Conectividade ÚTIL com o backend (não só `navigator.onLine`): a última resposta real
   * do servidor decide entre `online` e `servidor_inacessivel`.
   */
  syncConnectivity?: SyncConnectivity
  /** Fase da tentativa em curso por venda (`saleLocalKey`): "verificando" | "enviando". */
  saleSyncPhases?: Readonly<Record<string, SaleSyncPhase>>
  /** `false` = a última gravação da fila no navegador falhou (quota/bloqueio). */
  localQueueHealthy?: boolean
  /** Decisão pendente sobre venda idêntica com resultado desconhecido (ver `resolveUnknownTwin`). */
  unknownTwinPrompt?: UnknownTwinPrompt | null
  /**
   * Decisão EXPLÍCITA do operador. `"outra"`: é outro cliente — a anterior segue na fila com a
   * identidade dela e a próxima finalização cria identidade nova. `"verificar"`: consulta/reenvia a
   * anterior (Reenviar manual). `"cancelar"`: fecha sem decidir (nada muda).
   */
  resolveUnknownTwin?: (decision: "outra" | "verificar" | "cancelar") => Promise<ManualSyncResult | null>
  /**
   * O operador encerrou conscientemente o carrinho da venda PENDENTE (Cancelar/limpar):
   * a venda continua na fila, mas um carrinho idêntico depois disto é uma NOVA venda —
   * não é coalescido nela (vendas offline idênticas e seguidas na padaria).
   */
  releaseSaleAttempt?: (identity: { id: string; clientSaleId?: string } | null | undefined) => void
}

export type UnknownTwinPrompt = {
  key: string
  saleId: string
  clientSaleId?: string
  at: string
  total: number
}

export type ManualSyncResult =
  | {
      ok: true
      pedidoId?: string
      /** Já estava gravada no servidor: reconciliada sem novo POST. */
      reconciled?: boolean
    }
  /**
   * `code: "JA_CONFIRMADA"`: a venda não está mais pendente aqui (outra aba ou o automático
   * confirmou antes) — nada foi reenviado. `NAO_ENCONTRADA`: saiu da fila deste terminal.
   */
  | { ok: false; reason: string; code?: string; outcome?: SaleSyncAttemptOutcome }

export { SALE_ALREADY_CONFIRMED_CODE }

type PersistPendingSaleResult =
  | { ok: true; pedidoId?: string; serverId?: string; clientSaleId?: string }
  | {
      ok: false
      reason: string
      code?: string
      networkError?: boolean
      httpStatus?: number
      drift?: import("@/lib/estoque/stock-drift-reconcile").StockDriftDetails
      unresolvedInventoryIds?: string[]
      /** O prazo da requisição estourou (resultado desconhecido). */
      timedOut?: boolean
      /** O navegador já estava offline ANTES do envio (a requisição nem saiu). */
      offlineAtSend?: boolean
    }

type SaleAttemptSource = "manual" | "auto" | "finalize"

type FinalizeSaleTransactionResult = Awaited<ReturnType<OperationsContextType["finalizeSaleTransaction"]>>

type SaleSyncFailurePatch = {
  code?: string
  httpStatus?: number
  message?: string
  networkError?: boolean
  drift?: import("@/lib/estoque/stock-drift-reconcile").StockDriftDetails
  unresolvedInventoryIds?: string[]
  timedOut?: boolean
  /** Navegador offline ANTES do envio — medido antes do fetch, não depois da falha. */
  offlineAtSend?: boolean
  source?: SaleAttemptSource
}

/** Recorte do item do planner consumido pela UI. */
export type QuarantineRecoveryPlanItemView = {
  conflictingPedidoId: string
  clientSaleId: string | null
  klass: string
  bucket: "READY" | "ALREADY_RECOVERED" | "REQUIRES_CONFIRMATION" | "BLOCKED"
  reason: string
  total: number
  valorAVista: number
  at: string | null
  customerName: string | null
  originalSessionStatus: string
  alreadyRecoveredPedidoId: string | null
}

export type QuarantineRecoverySummaryView = {
  total: number
  ready: number
  alreadyRecovered: number
  requiresConfirmation: number
  blocked: number
  valorTotal: number
  valorExecutavel: number
  byClass: Record<string, number>
}

export type QuarantineRecoveryResultView = {
  conflictingPedidoId: string
  clientSaleId: string | null
  status: "RECOVERED" | "ALREADY_RECOVERED" | "REQUIRES_CONFIRMATION" | "BLOCKED" | "FAILED"
  code: string | null
  reason: string
  venda: { id: string; pedidoId: string; clientSaleId: string | null } | null
  replayed: boolean
}

const OperationsContext = createContext<OperationsContextType | null>(null)

/** Restaurado só do localStorage (estoque e OS vêm do servidor). */
function parseLocalRest(raw: string, prev: OpsState): Partial<OpsState> | null {
  try {
    const parsed = JSON.parse(raw) as Partial<OpsState>
    // P0 PDV-RAFACELL-LOAD-CRASH: valida ELEMENTOS (não só `Array.isArray`).
    // Objetos são normalizados e preservados — pending legítima nunca é perdida;
    // só entradas sem dado (`null`/primitivos) são quarentenadas.
    return {
      dailyLedger: parsed.dailyLedger ? ensureLedger(parsed.dailyLedger as DailyLedger) : prev.dailyLedger,
      caixa: {
        ...prev.caixa,
        ...parsed.caixa,
        dataAbertura: parsed.caixa?.dataAbertura ? new Date(parsed.caixa.dataAbertura) : prev.caixa.dataAbertura,
      },
      caixaSessaoId:
        typeof (parsed as { caixaSessaoId?: unknown }).caixaSessaoId === "string"
          ? ((parsed as { caixaSessaoId: string }).caixaSessaoId || null)
          : prev.caixaSessaoId,
      sales: sanitizeSaleRecords<SaleRecord>(parsed.sales),
      devolucoes: sanitizeSaleRecords<DevolucaoRecord>(parsed.devolucoes),
      pendingCaixaOperations: keepRecords<CaixaOperacaoRecord>(parsed.pendingCaixaOperations),
      customerCredits:
        parsed.customerCredits && typeof parsed.customerCredits === "object"
          ? parsed.customerCredits
          : prev.customerCredits,
      orcamentos: keepRecords<Orcamento>(parsed.orcamentos),
    }
  } catch {
    return null
  }
}

/**
 * PENDING não reduz o catálogo do servidor. Opção A: o estoque exibido permanece o saldo
 * autoritativo até CONFIRMED — só a devolução pendente devolve a quantidade ao item.
 */
function withPendingDevolucaoStock(items: InventoryItem[], devolucoes: DevolucaoRecord[]): InventoryItem[] {
  const adjustedItems = items.map((i) => ({ ...i }))
  const pendingDevs = devolucoes.filter((d) => isRecord(d) && d.syncPending === true)
  for (const dev of pendingDevs) {
    const lines = Array.isArray(dev.lines) ? dev.lines : []
    for (const line of lines) {
      if (!isRecord(line)) continue
      const lineId = typeof line.inventoryId === "string" ? line.inventoryId : ""
      const qty = typeof line.quantity === "number" && Number.isFinite(line.quantity) ? line.quantity : 0
      if (!lineId || qty <= 0) continue
      const item = adjustedItems.find((i) => i.id === lineId)
      if (item) {
        item.stock += qty
      }
    }
  }
  return adjustedItems
}

function peekLegacyInventoryOrdens(raw: string | null): { inventory: InventoryItem[]; ordens: OrdemServico[] } {
  if (!raw) return { inventory: [], ordens: [] }
  try {
    const parsed = JSON.parse(raw) as Partial<OpsState>
    return {
      inventory: sanitizeInventoryItems<InventoryItem>(parsed.inventory),
      ordens: keepRecords<OrdemServico>(parsed.ordens),
    }
  } catch {
    return { inventory: [], ordens: [] }
  }
}

type CaixaPersisted = {
  isOpen: boolean
  saldoInicial: number
  dataAbertura: string | null
  totalEntradas: number
  totalSaidas: number
}

function caixaStorageKeyForLoja(storeId: string): string {
  return `omnigestao:caixa:${storeId}`
}

function loadCaixaSnapshot(storeId: string): CaixaState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(caixaStorageKeyForLoja(storeId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CaixaPersisted>
    if (!parsed || typeof parsed !== "object") return null
    const isOpen = parsed.isOpen === true
    const saldoInicial = Number(parsed.saldoInicial) || 0
    const totalEntradas = Number(parsed.totalEntradas) || 0
    const totalSaidas = Number(parsed.totalSaidas) || 0
    const dataAbertura =
      typeof parsed.dataAbertura === "string" && parsed.dataAbertura.trim()
        ? new Date(parsed.dataAbertura)
        : null
    return { isOpen, saldoInicial, dataAbertura, totalEntradas, totalSaidas }
  } catch {
    return null
  }
}

function saveCaixaSnapshot(storeId: string, caixa: CaixaState): void {
  if (typeof window === "undefined") return
  try {
    const payload: CaixaPersisted = {
      isOpen: !!caixa.isOpen,
      saldoInicial: Number(caixa.saldoInicial) || 0,
      dataAbertura: caixa.dataAbertura ? caixa.dataAbertura.toISOString() : null,
      totalEntradas: Number(caixa.totalEntradas) || 0,
      totalSaidas: Number(caixa.totalSaidas) || 0,
    }
    localStorage.setItem(caixaStorageKeyForLoja(storeId), JSON.stringify(payload))
  } catch {
    /* ignore quota */
  }
}

function toPersistedRest(state: OpsState): Omit<OpsState, "inventory" | "ordens"> {
  return {
    caixa: state.caixa,
    caixaSessaoId: state.caixaSessaoId,
    dailyLedger: state.dailyLedger,
    sales: state.sales,
    devolucoes: state.devolucoes,
    pendingCaixaOperations: state.pendingCaixaOperations,
    orcamentos: state.orcamentos,
    customerCredits: state.customerCredits,
  }
}

export function OperationsProvider({
  children,
  storageKey = OPS_KEY_LEGACY,
}: {
  children: ReactNode
  /** Por unidade (multiloja); padrão único = assistec-pro-ops-v1 */
  storageKey?: string
}) {
  const accessPermissions = useEnterprisePermissions()
  const canReadOperations = accessPermissions?.hubs.operacoes === true
  // Caixa Seguro STORE (PADARIA-STORE-ADMIN-CASH-AUTH-001): sangria/suprimento só valem
  // com a aprovação da ADMIN no momento do envio. A fila local é por loja, não por
  // usuário — reenviá-la depois faria uma operação enfileirada (inclusive forjada no
  // localStorage) pegar carona na aprovação seguinte. Na experiência STORE a operação é
  // online-only: falhou, é desfeita no caixa local e nunca é reenviada sozinha.
  // Sessão ainda carregando conta como STORE: nada é reenviado antes de saber quem é.
  const { data: authSession, status: authStatus } = useSession()
  const storeCaixaOnline = authStatus === "loading" || isStoreExperienceSession(authSession)
  const storeCaixaOnlineOnlyRef = useRef(storeCaixaOnline)
  useEffect(() => {
    storeCaixaOnlineOnlyRef.current = storeCaixaOnline
  }, [storeCaixaOnline])
  useEffect(() => {
    // Camada de inteligência (eventos/automações) em modo simulado.
    // Não altera lógica de venda/estoque existente.
    initAutomationEngineClient()
  }, [])
  const [state, setState] = useState<OpsState>({
    ...defaultState,
    dailyLedger: emptyLedger(),
  })
  const [opsDbReady, setOpsDbReady] = useState(false)
  const stateRef = useRef(state)
  const lastSentOpsRef = useRef<string>("")
  const bootstrapDoneRef = useRef(false)
  /**
   * Hidratação do estado persistido, como sinal de COMMIT — não de ref.
   *
   * `bootstrapDoneRef` é marcado dentro do próprio efeito de bootstrap, então
   * ainda vale para o commit em que `state` é o PADRÃO: os `setState` de
   * restauração só aparecem no render seguinte. Quem decidir sobre o caixa
   * apoiado nele enxerga "caixa fechado, sem sessão" e nunca o que estava
   * guardado — a regressão A0. Este `useState` só fica preenchido num commit em
   * que `state` (e, pelo efeito abaixo, `stateRef.current`) já está restaurado.
   *
   * Guarda a CHAVE hidratada, não um booleano: numa troca de loja o `storageKey`
   * muda antes de o estado da nova loja ser restaurado, e um booleano continuaria
   * `true` — reabrindo A0 justamente na troca de loja.
   */
  const [caixaHydratedFor, setCaixaHydratedFor] = useState<string | null>(null)
  const caixaHydratedForRef = useRef<string | null>(null)
  const storageKeyRef = useRef(storageKey)
  const caixaHydrated = caixaHydratedFor === storageKey

  useEffect(() => {
    stateRef.current = state
    // Espelhado no mesmo efeito que publica o estado: qualquer fluxo assíncrono
    // que leia `caixaHydratedForRef` encontra `stateRef` já restaurado.
    caixaHydratedForRef.current = caixaHydratedFor
  }, [state, caixaHydratedFor])

  useEffect(() => {
    storageKeyRef.current = storageKey
  }, [storageKey])

  useEffect(() => {
    try {
      const lojaId = opsLojaIdFromStorageKey(storageKey)
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const partial = parseLocalRest(raw, stateRef.current)
        if (partial && Array.isArray(partial.sales)) {
          // Pendência que outra aba descartou com prova não volta pelo F5.
          partial.sales = dropTombstonedPending(partial.sales, readSaleTombstones(lojaId))
        }
        if (partial) {
          setState((prev) => ({ ...prev, ...partial }))
          if (Array.isArray(partial.sales)) {
            reconcilePersistedSaleAttempts(lojaId, partial.sales)
          }
        } else {
          // P0 PDV-RAFACELL-LOAD-CRASH: blob ilegível — quarentena localizada do
          // bruto (recuperável, com timestamp) em vez de perda silenciosa. A
          // chave segue com o estado padrão e se autocura no próximo persist.
          try {
            localStorage.setItem(`${storageKey}:quarentena:${Date.now()}`, raw)
          } catch {
            /* quota: segue sem quarentena */
          }
        }
        // P0 PDV-RAFACELL-LOAD-CRASH: observabilidade do restore (só contagens).
        try {
          const parsed = JSON.parse(raw) as { sales?: unknown }
          const restored = Array.isArray(partial?.sales) ? partial.sales : []
          markPdvMountStep("pending-restore", lojaId, true, {
            counts: {
              sales: restored.length,
              pending: restored.filter((s) => isRecord(s) && s.syncPending === true).length,
              quarantined: countNonRecords(parsed?.sales),
            },
          })
        } catch {
          /* observabilidade nunca quebra o produto */
        }
        const snap = loadCaixaSnapshot(lojaId)
        if (snap) setState((prev) => ({ ...prev, caixa: snap }))
        bootstrapDoneRef.current = true
        return
      }
      if (storageKey !== OPS_KEY_LEGACY && storageKey.endsWith(`-${LEGACY_PRIMARY_STORE_ID}`)) {
        const legacy = localStorage.getItem(OPS_KEY_LEGACY)
        if (legacy) {
          const partial = parseLocalRest(legacy, stateRef.current)
          if (partial) {
            setState((prev) => ({ ...prev, ...partial }))
            localStorage.setItem(storageKey, legacy)
          }
        }
      }
      const snap = loadCaixaSnapshot(lojaId)
      if (snap) setState((prev) => ({ ...prev, caixa: snap }))
    } catch {
      // ignore
    } finally {
      bootstrapDoneRef.current = true
      // Enfileirado junto com os `setState` de restauração acima: o commit que
      // marca esta chave como hidratada é o mesmo que traz o caixa restaurado.
      setCaixaHydratedFor(storageKey)
    }
  }, [storageKey])

  /**
   * Vendas PENDENTES cujo carrinho ainda está aberto NESTA aba (a tentativa em curso). Só
   * elas podem absorver uma reconfirmação do MESMO carrinho. Depois que o operador encerra
   * o carrinho (`releaseSaleAttempt`), recarrega a página ou usa outra aba, um carrinho
   * idêntico é uma venda NOVA — duas vendas iguais seguidas offline não viram uma só.
   */
  const openSaleAttemptsRef = useRef(new Set<string>())
  /** Carrinhos encerrados conscientemente NESTA aba (Cancelar/Limpar) — ver `releaseSaleAttempt`. */
  const releasedSaleAttemptsRef = useRef(new Set<string>())
  /**
   * Venda idêntica pendente com resultado desconhecido que barrou a finalização: o PDV mostra a
   * decisão explícita ("Verificar a anterior" × "É outra venda"). Nada é liberado sem clique.
   */
  const [unknownTwinPrompt, setUnknownTwinPrompt] = useState<UnknownTwinPrompt | null>(null)
  const unknownTwinPromptRef = useRef<UnknownTwinPrompt | null>(null)
  useEffect(() => {
    unknownTwinPromptRef.current = unknownTwinPrompt
  }, [unknownTwinPrompt])
  /** Lápides valem para pendência adotada de outra aba, nunca para a tentativa aberta aqui. */
  const isOpenHere = useCallback((sale: SaleRecord) => openSaleAttemptsRef.current.has(saleLocalKey(sale)), [])
  /** União entre abas + lápides; devolve `local` (mesma referência) quando nada muda. */
  const reconcileTabSales = useCallback(
    (local: SaleRecord[], incoming: readonly unknown[] | null | undefined): SaleRecord[] => {
      const tombstones = readSaleTombstones(opsLojaIdFromStorageKey(storageKey))
      const merged = mergeSalesFromOtherTab(local, incoming, tombstones)
      return dropTombstonedPending(merged, tombstones, isOpenHere)
    },
    [isOpenHere, storageKey],
  )

  // Saúde da fila no navegador (PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001): gravação que
  // falha (quota, armazenamento bloqueado) deixa a venda só na memória desta aba. Antes era
  // engolida em silêncio; agora o PDV avisa e recusa venda NOVA offline enquanto falhar.
  const localQueueHealthyRef = useRef(true)
  const [localQueueHealthy, setLocalQueueHealthy] = useState(true)
  const noteLocalWrite = useCallback((ok: boolean) => {
    if (localQueueHealthyRef.current === ok) return
    localQueueHealthyRef.current = ok
    setLocalQueueHealthy(ok)
  }, [])

  /**
   * Grava a fila AGORA, unindo com o que outra aba da mesma loja gravou: pendência que só
   * a outra aba conhece nunca some por sobrescrita, confirmação vence pendência e só sai o
   * que tem lápide (descarte com prova). A quarentena segue monotônica. Blob ilegível no
   * meio do caminho é copiado para quarentena antes de ser substituído — antes disso a
   * escrita lançava no `JSON.parse` e a fila NUNCA mais era gravada.
   */
  const writeOpsSnapshot = useCallback(
    (snapshot: OpsState): { ok: boolean; sales: SaleRecord[] } => {
      try {
        const persisted = toPersistedRest(snapshot)
        const currentRaw = localStorage.getItem(storageKey)
        if (currentRaw) {
          let current: { sales?: unknown } | null = null
          try {
            current = JSON.parse(currentRaw) as { sales?: unknown }
          } catch {
            current = null
            try {
              localStorage.setItem(`${storageKey}:quarentena:${Date.now()}`, currentRaw)
            } catch {
              /* quota: a escrita abaixo dirá se o armazenamento está saudável */
            }
          }
          if (current && Array.isArray(current.sales)) {
            const merged = reconcileTabSales(persisted.sales, current.sales)
            persisted.sales = sameRefs(
              preserveSaleIdentityConflictCodes(merged, current.sales as SaleRecord[]),
              merged,
            )
          }
        } else {
          persisted.sales = reconcileTabSales(persisted.sales, [])
        }
        const serialized = JSON.stringify(persisted)
        // Igual ao que já está gravado: não regrava (evita o pingue-pongue de `storage` entre abas).
        if (serialized !== currentRaw) localStorage.setItem(storageKey, serialized)
        noteLocalWrite(true)
        return { ok: true, sales: persisted.sales }
      } catch {
        noteLocalWrite(false)
        return { ok: false, sales: snapshot.sales }
      }
    },
    [noteLocalWrite, reconcileTabSales, storageKey],
  )

  useEffect(() => {
    // P0 PDV-RAFACELL-LOAD-CRASH: só persiste APÓS a restauração ter commitado.
    // `caixaHydratedFor` é sinal de COMMIT; `bootstrapDoneRef` é sinal de efeito
    // e permitiria sobrescrever a fila pending com o estado padrão vazio ainda
    // no mount (a restauração enfileirada seria lida já sem os pendings).
    if (caixaHydratedFor !== storageKey) return
    const written = writeOpsSnapshot(state)
    if (!written.ok || written.sales === state.sales) return
    // A outra aba registrou/confirmou/descartou venda: adota (lápide tira a descartada daqui).
    setState((prev) => {
      const sales = reconcileTabSales(prev.sales, written.sales)
      return sales === prev.sales ? prev : { ...prev, sales }
    })
  }, [state, storageKey, caixaHydratedFor, writeOpsSnapshot, reconcileTabSales])

  // Entre abas: a quarentena é monotônica (o código permanente descoberto por outra aba
  // impede foco/online/intervalo de reativar a tentativa) e a fila é unida — venda
  // registrada ou confirmada na outra aba aparece aqui sem F5.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // Lápide nova em outra aba: a pendência descartada lá sai daqui também.
      if (event.key === saleTombstonesKey(opsLojaIdFromStorageKey(storageKey))) {
        setState((prev) => {
          const sales = reconcileTabSales(prev.sales, [])
          return sales === prev.sales ? prev : { ...prev, sales }
        })
        return
      }
      if (event.key !== storageKey || !event.newValue) return
      try {
        const incoming = JSON.parse(event.newValue) as { sales?: SaleRecord[] }
        if (!Array.isArray(incoming.sales)) return
        setState((prev) => {
          const merged = reconcileTabSales(prev.sales, incoming.sales)
          const sales = sameRefs(preserveSaleIdentityConflictCodes(merged, incoming.sales ?? []), merged)
          // Nada mudou: mesmo estado — sem render nem regravação (as abas convergem).
          return sales === prev.sales ? prev : { ...prev, sales }
        })
      } catch {
        // Snapshot inválido de outra aba não altera o estado atual.
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [reconcileTabSales, storageKey])

  useEffect(() => {
    // `caixaHydrated` (e não `bootstrapDoneRef`): antes da hidratação `state.caixa`
    // ainda é o padrão, e gravar aqui sobrescreveria o snapshot guardado.
    if (!caixaHydrated) return
    const lojaId = opsLojaIdFromStorageKey(storageKey)
    saveCaixaSnapshot(lojaId, state.caixa)
  }, [caixaHydrated, state.caixa, storageKey])

  // ── Catálogo sem F5 (PDV-CADASTROS-SYNC-AUTOMATICO-001) ─────────────────────
  // O provider baixava o catálogo só ao montar (troca de loja / F5). Agora pergunta a
  // versão da loja no foco, na volta da aba/rede e a cada 30 s com a aba visível, e baixa
  // o snapshot quando muda; aviso de cadastro salvo (esta aba ou outra) baixa na hora.
  // Só substitui `inventory`: carrinho, pendências e caixa não são tocados aqui.
  const catalogSyncRef = useRef<CatalogSyncController<InventoryItem> | null>(null)
  const [catalogVersion, setCatalogVersion] = useState<string | null>(null)
  // Checks automáticos (foco/aba/rede/intervalo) só com um PDV montado: o provider envolve o
  // dashboard inteiro e outras telas não devem pagar o polling. Aviso de cadastro vale sempre.
  const catalogWatchersRef = useRef(0)
  const watchCatalogSync = useCallback(() => {
    catalogWatchersRef.current += 1
    return () => {
      catalogWatchersRef.current = Math.max(0, catalogWatchersRef.current - 1)
    }
  }, [])

  const checkCatalog = useCallback(async (opts?: { force?: boolean }): Promise<CatalogCheckStatus> => {
    const controller = catalogSyncRef.current
    if (!controller) return "disabled"
    const status = await controller.check(opts)
    if (catalogSyncRef.current === controller) setCatalogVersion(controller.knownVersion())
    return status
  }, [])

  useEffect(() => {
    const lj = opsLojaIdFromStorageKey(storageKey)
    // `catalogSync=1` é NetworkOnly no service worker (next.config.mjs): o cache NetworkFirst de
    // `/api/*` devolveria um catálogo velho em rede lenta. A carga inicial segue cacheável (offline).
    const inventoryUrl = (versionOnly: boolean) =>
      `/api/ops/inventory?lojaId=${encodeURIComponent(lj)}&catalogSync=1${versionOnly ? "&versionOnly=1" : ""}`
    const controller = createCatalogSyncController<InventoryItem>({
      storeId: lj,
      fetchVersion: async (_storeId, signal) => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return null
        const res = await fetch(inventoryUrl(true), { credentials: "include", cache: "no-store", signal })
        if (!res.ok) return null
        const body = (await res.json()) as { storeId?: unknown; version?: unknown }
        return body.storeId === lj && typeof body.version === "string" ? body.version : null
      },
      fetchSnapshot: async (_storeId, signal) => {
        const res = await fetch(inventoryUrl(false), { credentials: "include", cache: "no-store", signal })
        if (!res.ok) return null
        const body = (await res.json()) as { items?: InventoryItem[]; version?: unknown; _lojaIdRecebido?: unknown }
        // Resposta de outra loja nunca vira catálogo desta.
        if (body._lojaIdRecebido !== lj) return null
        return {
          items: sanitizeInventoryItems<InventoryItem>(body.items),
          version: typeof body.version === "string" ? body.version : null,
        }
      },
      apply: (snapshot) => {
        setState((prev) => ({ ...prev, inventory: withPendingDevolucaoStock(snapshot.items, prev.devolucoes) }))
      },
    })
    catalogSyncRef.current = controller
    setCatalogVersion(null)
    const sync = (force: boolean) => {
      void controller.check({ force }).then(() => {
        if (catalogSyncRef.current === controller) setCatalogVersion(controller.knownVersion())
      })
    }
    const autoSync = () => {
      // Offline não tenta (nem gasta o intervalo mínimo): o `online` dispara o check na volta.
      if (navigator.onLine === false) return
      if (catalogWatchersRef.current > 0) sync(false)
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") autoSync()
    }
    const onFocus = () => autoSync()
    const onOnline = () => autoSync()
    window.addEventListener("focus", onFocus)
    window.addEventListener("online", onOnline)
    document.addEventListener("visibilitychange", onVisibility)
    const unsubscribe = subscribeCatalogChanged(lj, () => sync(true))
    const timer = window.setInterval(onVisibility, CATALOG_SYNC_INTERVAL_MS)
    return () => {
      controller.dispose()
      if (catalogSyncRef.current === controller) catalogSyncRef.current = null
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVisibility)
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [storageKey])

  useEffect(() => {
    setOpsDbReady(false)
    let cancelled = false
    async function loadDb() {
      const lj = opsLojaIdFromStorageKey(storageKey)
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "x-assistec-loja-id": lj,
      }
      try {
        const [rInv, rOs] = await Promise.all([
          fetch(`/api/ops/inventory?lojaId=${encodeURIComponent(lj)}`, { credentials: "include" }),
          canReadOperations ? fetch(`/api/ops/ordens?lojaId=${encodeURIComponent(lj)}`, { credentials: "include" }) : null,
        ])
        if (cancelled) return
        if (!rInv.ok || (rOs && !rOs.ok)) {
          lastSentOpsRef.current = JSON.stringify({ ord: stateRef.current.ordens })
          return
        }
        const jInv = (await rInv.json()) as { items?: InventoryItem[]; version?: unknown }
        const jOs = rOs ? (await rOs.json()) as { ordens?: OrdemServico[] } : { ordens: [] }
        // P0 PDV-RAFACELL-LOAD-CRASH: valida ELEMENTOS das respostas (não só o
        // array). Uma linha inválida da loja nunca derruba o mount.
        let items = sanitizeInventoryItems<InventoryItem>(jInv.items)
        let ordens = keepRecords<OrdemServico>(jOs.ordens)

        // Migração legada localStorage → DB: SOMENTE para a loja primária legada.
        // Lojas novas (multiloja) nunca recebem seed/migração automática — server é a
        // fonte da verdade e uma loja vazia deve permanecer 100% vazia (sem resíduo/mock).
        if (canReadOperations && lj === LEGACY_PRIMARY_STORE_ID && items.length === 0 && ordens.length === 0) {
          const raw = localStorage.getItem(storageKey)
          const peek = peekLegacyInventoryOrdens(raw)
          const legInv = peek.inventory
          const legOrd = peek.ordens
          if (legInv.length > 0 || legOrd.length > 0) {
            // LEGACY_INVENTORY_SYNC_DISABLED: não persistir snapshot inteiro do client.
            // O estoque legado do localStorage NÃO é mais enviado por PUT (servidor é a
            // fonte da verdade; o endpoint PUT está quarentenado). `legInv` segue apenas
            // como cache visual desta sessão na loja primária legada — persistir estoque
            // deve ocorrer por fluxo granular do servidor (OPS-INVENTORY-SYNC-SAFETY-001).
            // O migrate de ORDENS (escopo Operações, fora deste GOAL) permanece.
            await fetch("/api/ops/ordens", {
              method: "PUT",
              credentials: "include",
              headers,
              body: JSON.stringify({ ordens: legOrd }),
            })
            items = legInv
            ordens = legOrd
          }
        }

        const snap = JSON.stringify({ ord: ordens })
        lastSentOpsRef.current = snap

        let remoteSales: SaleRecord[] = []
        try {
          const rV = await fetch(`/api/ops/vendas-list?lojaId=${encodeURIComponent(lj)}`, {
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              [ASSISTEC_LOJA_HEADER]: lj,
            },
          })
          if (rV.ok) {
            const jV = (await rV.json()) as { sales?: SaleRecord[] }
            remoteSales = sanitizeSaleRecords<SaleRecord>(jV.sales)
          }
        } catch {
          /* ignore */
        }

        markPdvMountStep("catalog", lj, true, {
          counts: { inventory: items.length, sales: remoteSales.length },
        })

        if (!cancelled) {
          setState((prev) => {
            const adjustedItems = withPendingDevolucaoStock(items, prev.devolucoes)
            const sales = mergeSalesById(prev.sales, remoteSales)
            reconcilePersistedSaleAttempts(lj, sales)
            return {
              ...prev,
              inventory: adjustedItems,
              ordens,
              sales,
            }
          })
          catalogSyncRef.current?.setKnownVersion(jInv.version)
        }

        // A reconciliação da sessão de caixa NÃO vive mais aqui. Ficava depois de
        // `inventory`/`ordens`, então qualquer 4xx/5xx nessas duas rotas abortava
        // `loadDb` antes de chegar no caixa e o estado local nunca era reconciliado.
        // Agora roda em fluxo próprio — `refreshCaixaSession`, abaixo —, independente
        // de estoque e de OS.

        // Reconcilia créditos do cliente com o servidor (best-effort).
        // DB é fonte de verdade: saldos conhecidos no DB sobrescrevem localStorage.
        // Docs apenas locais são mantidos (fallback offline).
        try {
          const rCred = await fetch(
            `/api/ops/credito-cliente?lojaId=${encodeURIComponent(lj)}`,
            { credentials: "include", headers }
          )
          if (!cancelled && rCred.ok) {
            const jCred = (await rCred.json()) as {
              creditos?: Record<string, { nome: string; saldo: number }>
            }
            const dbCreditos = jCred.creditos ?? {}
            if (Object.keys(dbCreditos).length > 0) {
              setState((prev) => ({
                ...prev,
                customerCredits: mergeCustomerCredits(
                  prev.customerCredits,
                  dbCreditos,
                  prev.devolucoes,
                  prev.sales
                ),
              }))
            }
          }
        } catch {
          /* ignorar — reconciliação é best-effort */
        }
      } catch {
        if (!cancelled) {
          lastSentOpsRef.current = JSON.stringify({ ord: stateRef.current.ordens })
        }
      } finally {
        if (!cancelled) {
          setOpsDbReady(true)
          // Checks automáticos só depois da carga inicial; um primeiro check fecha a
          // janela em que um cadastro salvo durante a carga não seria visto.
          catalogSyncRef.current?.enable()
          void checkCatalog()
        }
      }
    }
    void loadDb()
    return () => {
      cancelled = true
    }
  }, [storageKey, canReadOperations, checkCatalog])

  /**
   * Reconcilia a sessão de caixa com o servidor — fonte da verdade.
   *
   * Independente de estoque/OS de propósito: antes, a reconciliação vivia dentro
   * do `loadDb` e qualquer falha de `/api/ops/inventory` ou `/api/ops/ordens`
   * deixava o caixa local desatualizado para sempre (PDV-CAIXA-SESSION-RECOVERY-001).
   *
   * Serializado por `createSingleFlight`: cliques repetidos em "Atualizar caixa"
   * (ou o refresh automático coincidindo com o clique) compartilham a mesma
   * consulta em voo, em vez de disparar N requisições e N decisões.
   *
   * Nunca toca no carrinho nem na fila de vendas (`sales`/`syncPending`): a
   * recuperação do caixa não pode apagar, renumerar nem reenviar venda alguma.
   */
  const caixaSyncSingleFlightRef = useRef(createSingleFlight<CaixaRefreshOutcome>())

  // Troca de loja invalida o serializador: a consulta em voo pertence à loja
  // anterior e não pode ser reaproveitada como resposta da loja nova.
  useEffect(() => {
    caixaSyncSingleFlightRef.current = createSingleFlight<CaixaRefreshOutcome>()
  }, [storageKey])

  const refreshCaixaSession = useCallback(async (): Promise<CaixaRefreshOutcome> => {
    const lj = opsLojaIdFromStorageKey(storageKey)
    return caixaSyncSingleFlightRef.current(async () => {
      const local = stateRef.current
      const { outcome, decision } = await reconcileCaixaSession({
        storeId: lj,
        // Sessão de caixa é POR TERMINAL: sem este escopo a consulta devolvia a
        // sessão mais recente da loja e o PDV1 passava a operar (e a fechar) a
        // sessão do PDV2 — F-01 da readiness 002A. Lido na hora da consulta
        // porque o operador pode trocar de terminal sem remontar o provider.
        terminalId: readSelectedTerminal(lj)?.id ?? null,
        // A0: antes da hidratação, `stateRef.current` ainda é o estado PADRÃO.
        // Decidir aqui adotaria/sobrescreveria saldo com o caixa "fechado" que
        // ninguém persistiu — e tornaria o fechamento inalcançável.
        hydrated: caixaHydratedForRef.current === storageKey,
        local: { isOpen: local.caixa.isOpen, sessaoId: local.caixaSessaoId },
        fetchImpl: fetch,
      })

      // Consulta falhou (rede, HTTP, resposta inválida ou ainda não hidratado):
      // nada muda no estado local — nunca fechar um caixa que pode estar aberto
      // no servidor só porque a rede caiu.
      if (!decision) return outcome

      // A loja ativa mudou enquanto a consulta estava em voo: a resposta é de
      // outra loja e não pode ser aplicada.
      if (storageKeyRef.current !== storageKey) {
        return { ok: false, status: "falha", reason: "loja-trocada" }
      }

      // Transição feita pelo módulo puro: `sales`, `devolucoes` e demais campos
      // saem por referência — a fila de pendências não é tocada.
      setState((prev) => applyCaixaSessionDecision(prev, decision))

      return outcome
    })
  }, [storageKey])

  // Reconciliação automática: montagem (só DEPOIS da hidratação), troca de loja,
  // volta do foco e retorno da rede. Cobre F5, nova aba, novo login e reinício
  // do computador. Não depende de `opsDbReady` — estoque/OS podem falhar.
  useEffect(() => {
    if (!caixaHydrated) return
    void refreshCaixaSession()
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCaixaSession()
    }
    const onOnline = () => void refreshCaixaSession()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", onOnline)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", onOnline)
    }
  }, [caixaHydrated, refreshCaixaSession])

  useEffect(() => {
    if (!opsDbReady || !canReadOperations) return
    // Só ORDENS dispara o PUT (é só o que ele envia): o catálogo agora é atualizado sem F5 e
    // não pode reenviar ordens a cada versão nova (PDV-CADASTROS-SYNC-AUTOMATICO-001).
    const snap = JSON.stringify({ ord: state.ordens })
    if (snap === lastSentOpsRef.current) return
    const t = setTimeout(() => {
      lastSentOpsRef.current = snap
      const lj = opsLojaIdFromStorageKey(storageKey)
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "x-assistec-loja-id": lj,
      }
      // LEGACY_INVENTORY_SYNC_DISABLED: servidor é fonte da verdade; não enviar
      // snapshot inteiro do client. O `PUT /api/ops/inventory` automático sobrescrevia
      // o estoque REAL da loja com o estado local/desatualizado do navegador a cada
      // mudança (baixa de venda local, cache de outra loja, localStorage antigo).
      // Removido em OPS-INVENTORY-SYNC-SAFETY-001 (auditoria PDV-WHATSAPP-SALE-AUDIT-001).
      // A baixa de estoque é feita no servidor (/api/ops/venda-persist); o catálogo é
      // lido por GET /api/ops/inventory. O endpoint PUT está quarentenado (410).
      // O sync de ORDENS (escopo Operações, fora deste GOAL) permanece inalterado.
      void fetch("/api/ops/ordens", {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({ ordens: state.ordens }),
      }).catch(() => {})
    }, 750)
    return () => clearTimeout(t)
  }, [opsDbReady, state.ordens, storageKey, canReadOperations])

  const ledgerKey = JSON.stringify(state.dailyLedger)
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        try {
          const lj = opsLojaIdFromStorageKey(storageKey)
          const res = await fetch("/api/ops/sync-ledger", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              [ASSISTEC_LOJA_HEADER]: lj,
            },
            body: ledgerKey,
          })
          if (cancelled) return
          if (!res.ok && process.env.NODE_ENV === "development") {
            const txt = await res.text().catch(() => "")
            console.warn("[ops] sync-ledger HTTP", res.status, txt)
          }
        } catch (e) {
          if (!cancelled && process.env.NODE_ENV === "development") {
            console.warn("[ops] sync-ledger", e)
          }
        }
      })()
    }, 1200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [ledgerKey, storageKey])

  // Cooldown do re-sync automático por venda: rejeição de REGRA (HTTP 4xx, ex.:
  // 409 caixa fechado / produto não resolvido) não muda re-POSTando a cada 30s —
  // só quando o operador age. Segura a re-tentativa automática dessa venda pelo
  // período abaixo; erros de rede/5xx (transitórios) seguem o ciclo normal e o
  // reenvio MANUAL (retrySyncSale) ignora o cooldown. NUNCA envia
  // `allowClosedOriginalSession`/`retroactiveClosedSession` — sync retroativo de sessão
  // original fechada é sempre ação manual e explícita (ver `retrySyncSaleRetroactive`).
  const vendaAutoRetryHoldRef = useRef<Map<string, number>>(new Map())
  /** Backoff do reenvio AUTOMÁTICO por venda (`saleLocalKey`); o manual ignora. */
  const autoRetryStateRef = useRef(new Map<string, { failures: number; nextAt: number }>())

  // Conectividade útil com o backend: `navigator.onLine` só prova o "offline".
  const lastServerOkAtRef = useRef<number | null>(null)
  const lastServerFailAtRef = useRef<number | null>(null)
  const [syncConnectivity, setSyncConnectivity] = useState<SyncConnectivity>("desconhecida")
  const recomputeConnectivity = useCallback((): SyncConnectivity => {
    const next = deriveConnectivity({
      navigatorOnline: typeof navigator === "undefined" ? undefined : navigator.onLine,
      lastFailureAt: lastServerFailAtRef.current,
      lastSuccessAt: lastServerOkAtRef.current,
      now: Date.now(),
    })
    setSyncConnectivity((prev) => (prev === next ? prev : next))
    return next
  }, [])
  /** Qualquer resposta HTTP = servidor alcançável; só rede/prazo contam como "inacessível". */
  const noteServerReachability = useCallback(
    (reachable: boolean) => {
      if (reachable) lastServerOkAtRef.current = Date.now()
      else lastServerFailAtRef.current = Date.now()
      recomputeConnectivity()
    },
    [recomputeConnectivity],
  )
  useEffect(() => {
    recomputeConnectivity()
    const onChange = () => recomputeConnectivity()
    window.addEventListener("online", onChange)
    window.addEventListener("offline", onChange)
    const t = window.setInterval(onChange, 30_000)
    return () => {
      window.removeEventListener("online", onChange)
      window.removeEventListener("offline", onChange)
      window.clearInterval(t)
    }
  }, [recomputeConnectivity])

  // Fase da tentativa em curso, por venda — a UI mostra "Verificando…" / "Enviando…".
  const [saleSyncPhases, setSaleSyncPhases] = useState<Readonly<Record<string, SaleSyncPhase>>>({})
  const setSalePhase = useCallback((key: string, phase: SaleSyncPhase | null) => {
    setSaleSyncPhases((prev) => {
      if (phase === null) {
        if (!(key in prev)) return prev
        const rest: Record<string, SaleSyncPhase> = {}
        for (const [k, v] of Object.entries(prev)) if (k !== key) rest[k] = v
        return rest
      }
      return prev[key] === phase ? prev : { ...prev, [key]: phase }
    })
  }, [])

  const releaseSaleAttempt = useCallback<NonNullable<OperationsContextType["releaseSaleAttempt"]>>(
    (identity) => {
      if (!identity || (!identity.id && !identity.clientSaleId)) return
      const key = saleLocalKey({ id: identity.id, clientSaleId: identity.clientSaleId })
      openSaleAttemptsRef.current.delete(key)
      openSaleAttemptsRef.current.delete(identity.id)
      releasedSaleAttemptsRef.current.add(key)
      closePersistedSaleAttemptIfIdentity(opsLojaIdFromStorageKey(storageKey), {
        clientSaleId: identity.clientSaleId,
        saleId: identity.id,
      })
    },
    [storageKey],
  )
  const persistInFlightRef = useRef(new Map<string, Promise<PersistPendingSaleResult>>())
  const finalizeInFlightRef = useRef(new Map<string, Promise<FinalizeSaleTransactionResult>>())
  const writerCapabilityRef = useRef<SaleWriterCapability>("unknown")
  /**
   * NOTIFICAÇÃO LOCAL DE UI do `venda_finalizada` (CORREÇÃO-01): o evento
   * definitivo só sai na CONFIRMAÇÃO server-side (POST de persistência,
   * reconciliação com venda existente ou recovery com evidência) — nunca
   * enquanto PENDING. A chave é a identidade estável (`clientSaleId` ou `id`),
   * então o retry da MESMA pendência notifica a UI sem duplicar refresh.
   *
   * NÃO é autoridade de idempotência da automação: o `Set` em memória não
   * atravessa abas nem sobrevive a reload. A automação definitiva é
   * despachada server-side no ponto create-vs-replay de `venda-persist`
   * (ver `lib/vendas/sale-automation-dispatch.ts`); o browser nunca posta
   * `venda_finalizada` para `/api/automation/handle-event`.
   */
  const confirmedSaleEmitterRef = useRef(createConfirmedSaleEmitter(() => {}))
  const emitVendaFinalizadaOnce = useCallback(
    (
      lojaId: string,
      sale: { id: string; clientSaleId?: string | null },
      data: unknown,
    ) => {
      const shouldEmit = confirmedSaleEmitterRef.current({
        id: sale.id,
        clientSaleId: sale.clientSaleId ?? undefined,
      })
      if (!shouldEmit) return
      emitEvent("venda_finalizada", {
        storeId: lojaId,
        entityId: sale.clientSaleId ?? sale.id,
        data,
      })
    },
    [],
  )

  const probeWriterCapability = useCallback(async (lojaId: string): Promise<SaleWriterCapability> => {
    const cached = writerCapabilityRef.current
    if (cached === "v1" || cached === "v2") return cached
    // Sem rede não há o que perguntar: `unknown` mantém o writer V2 (identidade cliente).
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "unknown"
    try {
      const res = await fetchTextWithTimeout(
        vendaPersistV2Url(lojaId),
        { method: "GET", credentials: "include", cache: "no-store", headers: persistHeaders(lojaId) },
        SALE_PROBE_TIMEOUT_MS,
      )
      noteServerReachability(true)
      if (!res.ok) return "unknown"
      let body: unknown = null
      try {
        body = JSON.parse(res.text) as unknown
      } catch {
        body = null
      }
      const cap = classifySaleWriterCapability(body)
      if (cap === "v1" || cap === "v2") writerCapabilityRef.current = cap
      return cap
    } catch {
      noteServerReachability(false)
      return "unknown"
    }
  }, [noteServerReachability])

  const probeSaleWriterCapability = useCallback<OperationsContextType["probeSaleWriterCapability"]>(
    async () => {
      const lj = opsLojaIdFromStorageKey(storageKey)
      return probeWriterCapability(lj)
    },
    [probeWriterCapability, storageKey],
  )

  const markSaleConfirmed = useCallback(
    (
      token: { id: string; clientSaleId?: string },
      confirmed?: { pedidoId: string; id: string; clientSaleId?: string | null },
      meta?: { source: SaleAttemptSource; outcome?: SaleSyncAttemptOutcome },
    ) => {
      vendaAutoRetryHoldRef.current.delete(token.id)
      if (token.clientSaleId) vendaAutoRetryHoldRef.current.delete(token.clientSaleId)
      autoRetryStateRef.current.delete(saleLocalKey(token))
      openSaleAttemptsRef.current.delete(saleLocalKey(token))
      closePersistedSaleAttemptIfIdentity(opsLojaIdFromStorageKey(storageKey), {
        clientSaleId: confirmed?.clientSaleId ?? token.clientSaleId,
        saleId: token.id,
      })
      const at = new Date().toISOString()
      setState((prev) => {
        const next = applyLocalConfirmationToState(prev, token, confirmed)
        if (!meta || next === prev) return next
        const after = {
          id: confirmed?.pedidoId ?? token.id,
          clientSaleId: token.clientSaleId ?? confirmed?.clientSaleId ?? undefined,
        }
        return {
          ...next,
          sales: next.sales.map((s) =>
            s.syncPending !== true && saleMatches(s, after)
              ? {
                  ...s,
                  syncLastAttemptAt: at,
                  syncLastAttemptSource: meta.source,
                  syncLastAttemptOutcome: meta.outcome ?? "CONFIRMADA",
                  syncConfirmedAt: at,
                }
              : s,
          ),
        }
      })
    },
    [storageKey],
  )

  const markSaleBlocked = useCallback((token: { id: string; clientSaleId?: string }, patch?: string | SaleSyncFailurePatch) => {
    const next: SaleSyncFailurePatch = typeof patch === "string" ? { code: patch } : patch ?? {}
    // Navegador offline ANTES do envio = a requisição nem saiu (não é "resultado desconhecido").
    // Medido antes do fetch: a rede pode cair DEPOIS do commit e antes da resposta.
    const offline = next.offlineAtSend === true
    const failure = {
      code: next.code,
      httpStatus: next.httpStatus,
      networkError: next.networkError,
      timedOut: next.timedOut,
      offline,
    }
    const outcome = attemptOutcomeFromFailure(failure)
    setState((prev) => ({
      ...prev,
      sales: prev.sales.map((s) =>
        saleMatches(s, token)
          ? {
              ...s,
              ...(next.code ? { syncBlockedCode: next.code } : {}),
              syncHttpStatus: next.httpStatus,
              syncFailureMessage: next.message ? next.message.slice(0, 500) : s.syncFailureMessage,
              ...(next.drift ? { syncDrift: next.drift } : {}),
              syncNetworkError: next.networkError,
              ...(next.unresolvedInventoryIds ? { syncUnresolvedInventoryIds: next.unresolvedInventoryIds } : {}),
              syncLastAttemptAt: new Date().toISOString(),
              syncAttemptCount: (s.syncAttemptCount ?? 0) + 1,
              ...(next.source ? { syncLastAttemptSource: next.source } : {}),
              syncLastAttemptOutcome: outcome,
              syncResultUnknown: nextResultUnknown(s.syncResultUnknown, failure),
            }
          : s,
      ),
    }))
  }, [])

  /** Registra horário/desfecho de uma tentativa que não chegou ao servidor (sem tocar no código). */
  const noteSaleAttempt = useCallback(
    (token: { id: string; clientSaleId?: string }, source: SaleAttemptSource, outcome: SaleSyncAttemptOutcome) => {
      const at = new Date().toISOString()
      setState((prev) => ({
        ...prev,
        sales: prev.sales.map((s) =>
          saleMatches(s, token)
            ? { ...s, syncLastAttemptAt: at, syncLastAttemptSource: source, syncLastAttemptOutcome: outcome }
            : s,
        ),
      }))
    },
    [],
  )

  // Toda escrita de venda tem prazo: requisição pendurada (Wi-Fi sem internet, servidor
  // travado) vira "sem resposta" — resultado DESCONHECIDO com a mesma identidade — em vez
  // de prender a finalização e o Reenviar (que se juntava à mesma promessa pendurada).
  const postV1Sale = useCallback(
    async (lojaId: string, sale: SaleRecord, retroactive: boolean): Promise<TimedTextResponse> => {
      return fetchTextWithTimeout(
        vendaPersistUrl(lojaId),
        {
          method: "POST",
          credentials: "include",
          headers: persistHeaders(lojaId),
          body: JSON.stringify(retroactive ? { sale, allowClosedOriginalSession: true } : { sale }),
        },
        SALE_PERSIST_TIMEOUT_MS,
      )
    },
    [],
  )

  const postV2Sale = useCallback(
    async (lojaId: string, sale: SaleRecord, retroactive: boolean): Promise<TimedTextResponse> => {
      return fetchTextWithTimeout(
        vendaPersistV2Url(lojaId),
        {
          method: "POST",
          credentials: "include",
          headers: persistHeaders(lojaId),
          body: JSON.stringify({
            sale,
            clientSaleId: sale.clientSaleId,
            ...(retroactive ? { allowClosedOriginalSession: true } : {}),
          }),
        },
        SALE_PERSIST_TIMEOUT_MS,
      )
    },
    [],
  )

  /** Consulta autoritativa por `(storeId, clientSaleId)` — leitura, nunca grava. */
  const verifySaleOnServer = useCallback(
    async (
      lojaId: string,
      clientSaleId: string,
    ): Promise<
      | { kind: "found"; venda: ConfirmedVendaView }
      | { kind: "absent" }
      | { kind: "auth" }
      | { kind: "unreachable"; message: string; timedOut: boolean }
      | { kind: "unknown"; httpStatus: number }
    > => {
      try {
        const res = await fetchTextWithTimeout(
          vendaByClientSaleIdUrl(lojaId, clientSaleId),
          { method: "GET", credentials: "include", cache: "no-store", headers: persistHeaders(lojaId) },
          SALE_VERIFY_TIMEOUT_MS,
        )
        noteServerReachability(true)
        if (res.ok) {
          const venda = confirmedSaleEvidence(res.text, { lojaId, clientSaleId })
          return venda ? { kind: "found", venda } : { kind: "unknown", httpStatus: res.status }
        }
        if (res.status === 404) return { kind: "absent" }
        if (res.status === 401) return { kind: "auth" }
        return { kind: "unknown", httpStatus: res.status }
      } catch (err) {
        noteServerReachability(false)
        return {
          kind: "unreachable",
          message: err instanceof Error ? err.message : String(err),
          timedOut: err instanceof SaleSyncTimeoutError,
        }
      }
    },
    [noteServerReachability],
  )

  const convertPendingV2ToV1 = useCallback(
    (sale: SaleRecord): SaleRecord => {
      const sales = stateRef.current.sales
      const withoutSelf = sales.filter((s) => !saleMatches(s, sale))
      const vda = nextSaleId(withoutSelf)
      const converted: SaleRecord = { ...sale, id: vda }
      setState((prev) => ({
        ...prev,
        sales: prev.sales.map((s) => (saleMatches(s, sale) ? converted : s)),
      }))
      writerCapabilityRef.current = "v1"
      return converted
    },
    [],
  )

  /**
   * Resposta de escrita → desfecho. "Sincronizada" SÓ com a venda no corpo (mesma loja e,
   * havendo, mesma `clientSaleId`); 2xx sem prova é inconclusivo e a venda é consultada
   * pela `clientSaleId` antes de qualquer conclusão. 401/403 sem código de negócio viram
   * sessão expirada / sem permissão (nada gravado).
   */
  const settlePersistResponse = useCallback(
    async (
      res: TimedTextResponse,
      sale: SaleRecord,
      lojaId: string,
      source: SaleAttemptSource,
    ): Promise<PersistPendingSaleResult> => {
      const token = { id: sale.id, clientSaleId: sale.clientSaleId }
      if (res.ok) {
        let confirmed = confirmedSaleEvidence(res.text, { lojaId, clientSaleId: sale.clientSaleId })
        if (!confirmed && sale.clientSaleId) {
          const verified = await verifySaleOnServer(lojaId, sale.clientSaleId)
          if (verified.kind === "found") confirmed = verified.venda
        }
        if (!confirmed) {
          const message = `HTTP ${res.status} sem a venda no corpo da resposta — não confirmada.`
          markSaleBlocked(token, { code: INCONCLUSIVE_RESPONSE, httpStatus: res.status, message, networkError: false, source })
          return { ok: false, reason: message, code: INCONCLUSIVE_RESPONSE, httpStatus: res.status }
        }
        markSaleConfirmed(token, confirmed, { source })
        emitVendaFinalizadaOnce(
          lojaId,
          { id: confirmed.pedidoId, clientSaleId: sale.clientSaleId ?? confirmed.clientSaleId },
          { ...sale, id: confirmed.pedidoId, serverId: confirmed.id, syncPending: false },
        )
        return {
          ok: true,
          pedidoId: confirmed.pedidoId,
          serverId: confirmed.id,
          clientSaleId: sale.clientSaleId ?? confirmed.clientSaleId ?? undefined,
        }
      }
      const parsed = parseSalePersistError(res.text)
      const code =
        parsed.code ??
        extractVendaPersistErrorCode(res.text) ??
        resolvePendingSyncErrorCode({ httpStatus: res.status, message: parsed.message }) ??
        authFailureCode(res.status)
      markSaleBlocked(token, {
        code,
        httpStatus: res.status,
        message: parsed.message,
        networkError: false,
        drift: parsed.drift,
        unresolvedInventoryIds: parsed.unresolvedInventoryIds,
        source,
      })
      return {
        ok: false,
        reason: `HTTP ${res.status} — ${parsed.message}`,
        ...(code ? { code } : {}),
        httpStatus: res.status,
        ...(parsed.drift ? { drift: parsed.drift } : {}),
        ...(parsed.unresolvedInventoryIds ? { unresolvedInventoryIds: parsed.unresolvedInventoryIds } : {}),
      }
    },
    [emitVendaFinalizadaOnce, markSaleBlocked, markSaleConfirmed, verifySaleOnServer],
  )

  const persistPendingSale = useCallback(
    async (
      sale: SaleRecord,
      lojaId: string,
      retroactive: boolean,
      source: SaleAttemptSource = "auto",
    ): Promise<PersistPendingSaleResult> => {
      const flightKey = `${lojaId}:${saleLocalKey(sale)}:${retroactive ? "r" : "n"}`
      const existing = persistInFlightRef.current.get(flightKey)
      if (existing) return existing
      const phaseKey = saleLocalKey(sale)
      const work = (async (): Promise<PersistPendingSaleResult> => {
      const token = { id: sale.id, clientSaleId: sale.clientSaleId }
      const useV2 = Boolean(sale.clientSaleId) && (isProvisionalSaleRef(sale.id) || writerCapabilityRef.current !== "v1")
      const offlineAtSend = typeof navigator !== "undefined" && navigator.onLine === false
      setSalePhase(phaseKey, "enviando")
      try {
        const res = useV2 ? await postV2Sale(lojaId, sale, retroactive) : await postV1Sale(lojaId, sale, retroactive)
        noteServerReachability(true)
        if (!res.ok && useV2) {
          const parsed = parseSalePersistError(res.text)
          const code =
            parsed.code ??
            extractVendaPersistErrorCode(res.text) ??
            resolvePendingSyncErrorCode({ httpStatus: res.status, message: parsed.message })
          if (shouldFallbackV2ToV1({ httpStatus: res.status, code })) {
            const converted = convertPendingV2ToV1(sale)
            const v1 = await postV1Sale(lojaId, converted, retroactive)
            noteServerReachability(true)
            return await settlePersistResponse(v1, converted, lojaId, source)
          }
        }
        return await settlePersistResponse(res, sale, lojaId, source)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const timedOut = err instanceof SaleSyncTimeoutError
        noteServerReachability(false)
        markSaleBlocked(token, { networkError: true, message: msg, timedOut, offlineAtSend, source })
        return {
          ok: false,
          reason: timedOut ? `Sem resposta do servidor: ${msg}` : `Falha de rede: ${msg}`,
          networkError: true,
          ...(timedOut ? { timedOut: true } : {}),
          ...(offlineAtSend ? { offlineAtSend: true } : {}),
        }
      } finally {
        setSalePhase(phaseKey, null)
      }
      })()
      persistInFlightRef.current.set(flightKey, work)
      try {
        return await work
      } finally {
        persistInFlightRef.current.delete(flightKey)
      }
    },
    [convertPendingV2ToV1, markSaleBlocked, noteServerReachability, postV1Sale, postV2Sale, setSalePhase, settlePersistResponse],
  )

  /** A versão MAIS NOVA da venda ainda pendente (outra aba ou o automático podem ter confirmado). */
  const latestPendingSale = useCallback(
    (token: { id: string; clientSaleId?: string }): SaleRecord | undefined => {
      const sale = stateRef.current.sales.find((s) => s.syncPending === true && saleMatches(s, token))
      if (!sale) return undefined
      // Descartada com prova em outra aba (lápide) e ainda não refletida aqui: não envia.
      const tombstones = readSaleTombstones(opsLojaIdFromStorageKey(storageKey))
      return dropTombstonedPending([sale], tombstones, isOpenHere).length === 0 ? undefined : sale
    },
    [isOpenHere, storageKey],
  )

  /**
   * Reenvio AUTOMÁTICO (montagem, rede de volta, foco, aba visível, intervalo): só falha
   * recuperável, com backoff por venda e single-flight entre abas (Web Locks, modo `try`:
   * se outra aba está enviando, esta não envia). `resetBackoff` = a rede acabou de voltar.
   */
  const flushPendingSales = useCallback((opts?: { resetBackoff?: boolean }) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return
    const pending = stateRef.current.sales.filter((s) => s.syncPending === true)
    if (pending.length === 0) return
    const lj = opsLojaIdFromStorageKey(storageKey)
    const agora = Date.now()
    if (opts?.resetBackoff) autoRetryStateRef.current.clear()
    const sendable = new Set(dropTombstonedPending(pending, readSaleTombstones(lj), isOpenHere))
    for (const sale of pending) {
      if (!sendable.has(sale)) continue
      if (persistedSaleIdentityConflictCode(storageKey, sale)) continue
      if (
        !shouldAutoRetryPendingSync({
          code: sale.syncBlockedCode,
          httpStatus: sale.syncHttpStatus,
          networkError: sale.syncNetworkError,
          message: sale.syncFailureMessage,
        })
      ) {
        continue
      }
      const key = saleLocalKey(sale)
      if ((vendaAutoRetryHoldRef.current.get(key) ?? 0) > agora) continue
      const backoff = autoRetryStateRef.current.get(key)
      if (backoff && backoff.nextAt > agora) continue
      const token = { id: sale.id, clientSaleId: sale.clientSaleId }
      void withSaleSyncLock(saleSyncLockName(lj, sale), "try", async () => {
        const latest = latestPendingSale(token)
        if (!latest) return null
        return persistPendingSale(latest, lj, false, "auto")
      })
        .then((locked) => {
          if (!locked.acquired || !locked.value) return
          const result = locked.value
          if (result.ok) {
            autoRetryStateRef.current.delete(key)
            return
          }
          if (!shouldAutoRetryPendingSync(result)) return
          if (result.code && !result.networkError) {
            vendaAutoRetryHoldRef.current.set(key, Date.now() + VENDA_AUTO_RETRY_HOLD_MS)
          }
          const failures = (autoRetryStateRef.current.get(key)?.failures ?? 0) + 1
          autoRetryStateRef.current.set(key, {
            failures,
            nextAt: Date.now() + autoRetryDelayMs(failures, autoRetryKind(result)),
          })
          console.warn("[venda-persist] re-sync", sale.id, "lojaId:", lj, result.reason)
        })
        .catch((err: unknown) => {
          console.warn("[venda-persist] re-sync lock", sale.id, "lojaId:", lj, err)
        })
    }
  }, [isOpenHere, latestPendingSale, persistPendingSale, storageKey])

  const refreshSalesFromServer = useCallback<OperationsContextType["refreshSalesFromServer"]>(
    async () => {
      const lj = opsLojaIdFromStorageKey(storageKey)
      try {
        const rV = await fetch(`/api/ops/vendas-list?lojaId=${encodeURIComponent(lj)}`, {
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            [ASSISTEC_LOJA_HEADER]: lj,
          },
        })
        if (!rV.ok) return
        const jV = (await rV.json()) as { sales?: SaleRecord[] }
        const remoteSales = jV.sales ?? []
        setState((prev) => {
          const merged = mergeSalesById(prev.sales, remoteSales)
          reconcilePersistedSaleAttempts(lj, merged)
          return merged === prev.sales ? prev : { ...prev, sales: merged }
        })
      } catch {
        /* best-effort — reconciliação não bloqueia o caixa */
      }
    },
    [storageKey],
  )

  /**
   * Reenvio manual de uma venda pendente. `retroactive: true` acrescenta
   * `allowClosedOriginalSession` ao corpo — usado SOMENTE pela ação explícita
   * "Sincronizar retroativo" (nunca pelo retry automático nem pelo reenvio normal).
   */
  const doRetrySyncSale = useCallback(
    async (saleId: string, retroactive: boolean): Promise<ManualSyncResult> => {
      const sale = stateRef.current.sales.find(
        (s) => s.syncPending === true && (s.id === saleId || s.clientSaleId === saleId),
      )
      if (!sale) {
        const done = stateRef.current.sales.find((s) => s.id === saleId || s.clientSaleId === saleId)
        if (done) return alreadyConfirmedResult(done.id)
        void refreshSalesFromServer()
        return {
          ok: false,
          code: "NAO_ENCONTRADA",
          reason: "Esta venda não está mais na fila deste terminal. A lista foi atualizada — confira o Histórico.",
        }
      }
      const permanentCode = persistedSaleIdentityConflictCode(storageKey, sale)
      if (permanentCode) {
        return {
          ok: false,
          reason: `${SALE_IDENTITY_CONFLICT_TITLE}. ${SALE_IDENTITY_CONFLICT_GUIDANCE}`,
          code: permanentCode,
        }
      }
      const lj = opsLojaIdFromStorageKey(storageKey)
      const token = { id: sale.id, clientSaleId: sale.clientSaleId }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        recomputeConnectivity()
        noteSaleAttempt(token, "manual", "SEM_CONEXAO")
        return {
          ok: false,
          code: OFFLINE_CODE,
          outcome: "SEM_CONEXAO",
          reason:
            "Este navegador está sem internet. Nada foi enviado; a venda continua preservada neste terminal e será enviada sozinha quando a conexão voltar.",
        }
      }
      const key = saleLocalKey(sale)
      setSalePhase(key, "verificando")
      try {
        // Espera a outra aba que estiver enviando ESTA venda terminar (prazo limitado).
        // Espera a tentativa em curso (desta ou de outra aba) até verificar + enviar + verificar.
        const locked = await withSaleSyncLock(saleSyncLockName(lj, sale), "wait", async (): Promise<ManualSyncResult> => {
          const latest = latestPendingSale(token)
          if (!latest) {
            const done = stateRef.current.sales.find((s) => s.syncPending !== true && saleMatches(s, token))
            if (done) return alreadyConfirmedResult(done.id)
            return {
              ok: false,
              code: "NAO_ENCONTRADA",
              reason: "Esta venda foi retirada da fila em outra aba (recusa definitiva ou descarte verificado). Nada foi reenviado.",
            }
          }
          // 1) Verificar: a resposta da tentativa anterior pode ter se perdido DEPOIS do commit.
          if (latest.clientSaleId) {
            const verified = await verifySaleOnServer(lj, latest.clientSaleId)
            if (verified.kind === "found") {
              markSaleConfirmed(token, verified.venda, { source: "manual", outcome: "JA_EXISTIA_NO_SERVIDOR" })
              emitVendaFinalizadaOnce(
                lj,
                { id: verified.venda.pedidoId, clientSaleId: latest.clientSaleId },
                { ...latest, id: verified.venda.pedidoId, serverId: verified.venda.id, syncPending: false },
              )
              return { ok: true, reconciled: true, pedidoId: verified.venda.pedidoId }
            }
            if (verified.kind === "unreachable") {
              // Só a CONSULTA falhou (nenhum POST saiu): registra a tentativa sem mudar o que se
              // sabe sobre a venda no servidor.
              noteSaleAttempt(token, "manual", verified.timedOut ? "SEM_RESPOSTA" : "SEM_CONEXAO")
              return {
                ok: false,
                outcome: verified.timedOut ? "SEM_RESPOSTA" : "SEM_CONEXAO",
                reason: `Não foi possível falar com o servidor (${verified.message}). Nada foi enviado; a venda continua preservada e será verificada de novo.`,
              }
            }
            if (verified.kind === "auth") {
              markSaleBlocked(token, { code: AUTH_REQUIRED, httpStatus: 401, message: "Não autenticado", source: "manual" })
              return {
                ok: false,
                code: AUTH_REQUIRED,
                outcome: "SESSAO_EXPIRADA",
                reason: "Sessão expirada. Entre novamente: a venda está preservada e será enviada depois do login.",
              }
            }
          }
          // 2) Enviar a MESMA venda com a MESMA identidade.
          const result = await persistPendingSale(latest, lj, retroactive, "manual")
          if (result.ok) return { ok: true, ...(result.pedidoId ? { pedidoId: result.pedidoId } : {}) }
          console.warn("[venda-persist] retry", saleId, "lojaId:", lj, result.reason)
          return {
            ok: false,
            reason: result.reason,
            ...(result.code ? { code: result.code } : {}),
            outcome: attemptOutcomeFromFailure({ ...result, offline: result.offlineAtSend === true }),
          }
        }, SALE_LOCK_WAIT_MS)
        if (!locked.acquired) {
          return {
            ok: false,
            code: "EM_ANDAMENTO",
            reason: "Outra tentativa de envio desta mesma venda (nesta ou em outra aba) ainda não terminou. Nada foi duplicado; confira o resultado em instantes.",
          }
        }
        if (locked.value.ok) autoRetryStateRef.current.delete(key)
        return locked.value
      } finally {
        setSalePhase(key, null)
      }
    },
    [
      emitVendaFinalizadaOnce,
      latestPendingSale,
      markSaleBlocked,
      markSaleConfirmed,
      noteSaleAttempt,
      persistPendingSale,
      recomputeConnectivity,
      refreshSalesFromServer,
      setSalePhase,
      storageKey,
      verifySaleOnServer,
    ],
  )

  const resolveUnknownTwin = useCallback<NonNullable<OperationsContextType["resolveUnknownTwin"]>>(
    async (decision) => {
      const prompt = unknownTwinPromptRef.current
      setUnknownTwinPrompt(null)
      if (!prompt || decision === "cancelar") return null
      if (decision === "outra") {
        // A anterior continua pendente, com a identidade e a fila dela; só deixa de barrar.
        releasedSaleAttemptsRef.current.add(prompt.key)
        return null
      }
      return doRetrySyncSale(prompt.clientSaleId || prompt.saleId, false)
    },
    [doRetrySyncSale],
  )

  const retrySyncSale = useCallback<OperationsContextType["retrySyncSale"]>(
    (saleId) => doRetrySyncSale(saleId, false),
    [doRetrySyncSale],
  )

  /**
   * Ação manual explícita: sincroniza uma venda pendente cuja sessão de caixa original
   * existe e é desta loja, mas já está `FECHADA` (`syncBlockedCode === "CAIXA_ORIGINAL_FECHADO"`).
   * A venda é gravada na PRÓPRIA sessão original — nunca no caixa atual. Requer confirmação
   * explícita na UI antes de chamar (ver `vendas-arquivo-geral.tsx`).
   */
  const retrySyncSaleRetroactive = useCallback<OperationsContextType["retrySyncSaleRetroactive"]>(
    (saleId) => doRetrySyncSale(saleId, true),
    [doRetrySyncSale],
  )

  const recoverQuarantinedSale = useCallback<OperationsContextType["recoverQuarantinedSale"]>(
    async ({ saleId, motivo, allowClosedOriginalSession }) => {
      const sale = stateRef.current.sales.find(
        (s) => s.syncPending === true && (s.id === saleId || s.clientSaleId === saleId),
      )
      if (!sale) return { ok: false, reason: "Venda local em quarentena não encontrada." }
      if (!isSaleIdentityConflictCode(sale.syncBlockedCode) && !persistedSaleIdentityConflictCode(storageKey, sale)) {
        return { ok: false, reason: "Esta venda não está em conflito de identificação." }
      }
      const clientSaleId =
        sale.clientSaleId ?? deriveLegacySaleClientSaleId(opsLojaIdFromStorageKey(storageKey), sale)
      if (!sale.clientSaleId) {
        setState((prev) => ({
          ...prev,
          sales: prev.sales.map((s) => (saleMatches(s, sale) ? { ...s, clientSaleId } : s)),
        }))
      }
      const lj = opsLojaIdFromStorageKey(storageKey)
      try {
        const res = await fetch(recoverQuarantinedSaleUrl(lj), {
          method: "POST",
          credentials: "include",
          headers: persistHeaders(lj),
          body: JSON.stringify({
            sale: { ...sale, clientSaleId },
            clientSaleId,
            motivo,
            conflictingPedidoId: sale.id,
            conflictCode: sale.syncBlockedCode,
            ...(allowClosedOriginalSession ? { allowClosedOriginalSession: true } : {}),
          }),
        })
        const body = await res.text().catch(() => "")
        if (!res.ok) {
          const parsed = parseSalePersistError(body)
          return { ok: false, reason: parsed.message, code: parsed.code }
        }
        let confirmed: ReturnType<typeof extractConfirmedVenda> = null
        try {
          confirmed = extractConfirmedVenda(JSON.parse(body) as unknown)
        } catch {
          confirmed = null
        }
        const confirmations = buildIndividualRecoveryConfirmations({
          clientSaleId,
          venda: confirmed
            ? {
                id: confirmed.id,
                pedidoId: confirmed.pedidoId,
                clientSaleId: confirmed.clientSaleId,
              }
            : null,
        })
        // Sem evidência server-side a quarentena permanece — inclusive a de
        // outra venda que compartilhe o VDA antigo.
        if (confirmations.length === 0) {
          return {
            ok: false,
            reason: "Servidor não devolveu evidência da venda recuperada. A quarentena foi preservada.",
          }
        }
        for (const confirmation of confirmations) {
          vendaAutoRetryHoldRef.current.delete(confirmation.clientSaleId)
          vendaAutoRetryHoldRef.current.delete(confirmation.pedidoId)
          emitVendaFinalizadaOnce(
            lj,
            { id: confirmation.pedidoId, clientSaleId: confirmation.clientSaleId },
            { ...sale, clientSaleId, syncPending: false },
          )
        }
        setState((prev) => ({
          ...prev,
          sales: applyRecoveryConfirmations(prev.sales, confirmations).sales,
        }))
        return { ok: true, saleId: confirmations[0].pedidoId, replayed: confirmed ? undefined : true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, reason: `Falha de rede: ${msg}` }
      }
    },
    [emitVendaFinalizadaOnce, storageKey],
  )

  /**
   * Coleta TODAS as vendas locais em quarentena e garante que cada uma tenha
   * `clientSaleId`, persistindo o que for cunhado ANTES de qualquer rede.
   *
   * Cunhar antes é requisito de segurança, não conveniência: se a identidade técnica
   * fosse gerada a cada tentativa, um retry após timeout criaria uma SEGUNDA venda
   * para a mesma venda física. A chave é sempre a mesma, então o servidor reconhece
   * replay e devolve a venda já criada.
   */
  const collectQuarantinedCandidates = useCallback((): SaleRecord[] => {
    const current = stateRef.current.sales
    const mintedByIndex = new Map<number, string>()
    const candidates: SaleRecord[] = []

    current.forEach((sale, index) => {
      if (!sale.id || sale.syncPending !== true) return
      const quarantined =
        isQuarantinedLocalSale(sale) || Boolean(persistedSaleIdentityConflictCode(storageKey, sale))
      if (!quarantined) return
      if (sale.clientSaleId) {
        candidates.push(sale)
        return
      }
      // Determinística: qualquer aba chega à MESMA chave para a mesma venda.
      const clientSaleId = deriveLegacySaleClientSaleId(opsLojaIdFromStorageKey(storageKey), sale)
      mintedByIndex.set(index, clientSaleId)
      candidates.push({ ...sale, clientSaleId })
    })

    if (mintedByIndex.size > 0) {
      setState((prev) => ({
        ...prev,
        sales: prev.sales.map((sale, index) => {
          const minted = mintedByIndex.get(index)
          // `!sale.clientSaleId` evita sobrescrever identidade já existente.
          return minted && !sale.clientSaleId ? { ...sale, clientSaleId: minted } : sale
        }),
      }))
    }

    return candidates
  }, [storageKey])

  /**
   * Tira da quarentena SOMENTE as cópias locais com evidência server-side, casando
   * por `clientSaleId` EXATO. O recovery individual usa o mesmo helper
   * (`buildIndividualRecoveryConfirmations` → `applyRecoveryConfirmations`).
   *
   * Não reutiliza `markSaleConfirmed` de propósito: `saleMatches` cai no `id` quando o
   * `clientSaleId` não bate, e duas quarentenas distintas podem compartilhar o MESMO
   * número antigo (é justamente a colisão que gerou o incidente). Casar por id ali
   * confirmaria a venda errada e apagaria o bloqueio de uma venda que nunca foi
   * persistida.
   */
  const reconcileRecoveredSales = useCallback(
    (confirmations: readonly RecoveryConfirmation[]): number => {
      if (confirmations.length === 0) return 0
      const lj = opsLojaIdFromStorageKey(storageKey)
      for (const confirmation of confirmations) {
        vendaAutoRetryHoldRef.current.delete(confirmation.clientSaleId)
        vendaAutoRetryHoldRef.current.delete(confirmation.pedidoId)
        // Recovery com evidência server-side é confirmação definitiva — uma vez só.
        const local = stateRef.current.sales.find((s) => s.clientSaleId === confirmation.clientSaleId)
        emitVendaFinalizadaOnce(
          lj,
          { id: confirmation.pedidoId, clientSaleId: confirmation.clientSaleId },
          local ? { ...local, syncPending: false } : { id: confirmation.pedidoId },
        )
      }
      setState((prev) => ({
        ...prev,
        sales: applyRecoveryConfirmations(prev.sales, confirmations).sales,
      }))
      return applyRecoveryConfirmations(stateRef.current.sales, confirmations).reconciled
    },
    [emitVendaFinalizadaOnce, storageKey],
  )

  const previewQuarantineRecovery = useCallback<
    OperationsContextType["previewQuarantineRecovery"]
  >(async () => {
    const candidates = collectQuarantinedCandidates()
    if (candidates.length === 0) {
      return {
        ok: true,
        writerEnabled: false,
        items: [],
        summary: {
          total: 0,
          ready: 0,
          alreadyRecovered: 0,
          requiresConfirmation: 0,
          blocked: 0,
          valorTotal: 0,
          valorExecutavel: 0,
          byClass: {},
        },
      }
    }
    const lj = opsLojaIdFromStorageKey(storageKey)
    const items: QuarantineRecoveryPlanItemView[] = []
    let writerEnabled = false
    try {
      for (const slice of chunk(candidates, QUARANTINE_RECOVERY_CHUNK)) {
        const res = await fetch(quarantineRecoveryPreviewUrl(lj), {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: persistHeaders(lj),
          body: JSON.stringify({ candidates: slice }),
        })
        const body = await res.text().catch(() => "")
        if (!res.ok) {
          const parsed = parseSalePersistError(body)
          return { ok: false, reason: parsed.message, code: parsed.code }
        }
        const json = JSON.parse(body) as {
          writerEnabled?: boolean
          items?: QuarantineRecoveryPlanItemView[]
        }
        writerEnabled = json.writerEnabled === true
        if (Array.isArray(json.items)) items.push(...json.items)
      }
      return { ok: true, writerEnabled, items, summary: summarizePlanItems(items) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, reason: `Falha de rede: ${msg}` }
    }
  }, [collectQuarantinedCandidates, storageKey])

  const recoverQuarantinedSalesBatch = useCallback<
    OperationsContextType["recoverQuarantinedSalesBatch"]
  >(
    async ({ motivo, allowClosedOriginalSession }) => {
      const candidates = collectQuarantinedCandidates()
      if (candidates.length === 0) {
        return { ok: false, reason: "Nenhuma venda em quarentena para recuperar." }
      }
      const lj = opsLojaIdFromStorageKey(storageKey)
      const results: QuarantineRecoveryResultView[] = []
      try {
        // Fatias sequenciais: mantém cada requisição curta e abaixo do teto da rota.
        // Uma fatia que falhe na rede não desfaz as anteriores — as vendas já
        // recuperadas continuam recuperadas, e o retry as reconhece como replay.
        for (const slice of chunk(candidates, QUARANTINE_RECOVERY_CHUNK)) {
          const res = await fetch(quarantineRecoveryBatchUrl(lj), {
            method: "POST",
            credentials: "include",
            headers: persistHeaders(lj),
            body: JSON.stringify({
              candidates: slice,
              motivo,
              ...(allowClosedOriginalSession ? { allowClosedOriginalSession: true } : {}),
            }),
          })
          const body = await res.text().catch(() => "")
          if (!res.ok) {
            // Reconcilia o que já foi confirmado antes de relatar a falha.
            reconcileRecoveredSales(buildRecoveryConfirmations(results))
            const parsed = parseSalePersistError(body)
            return { ok: false, reason: parsed.message, code: parsed.code }
          }
          const json = JSON.parse(body) as { results?: QuarantineRecoveryResultView[] }
          if (Array.isArray(json.results)) results.push(...json.results)
        }

        // Só sai da quarentena o que tem venda real no servidor. `REQUIRES_CONFIRMATION`,
        // `BLOCKED` e `FAILED` preservam a cópia local intacta.
        const reconciled = reconcileRecoveredSales(buildRecoveryConfirmations(results))
        return { ok: true, results, summary: summarizeRecoveryResults(results), reconciled }
      } catch (err) {
        reconcileRecoveredSales(buildRecoveryConfirmations(results))
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, reason: `Falha de rede: ${msg}` }
      }
    },
    [collectQuarantinedCandidates, reconcileRecoveredSales, storageKey],
  )

  const autoReconcileInFlightRef = useRef(false)
  const quarantineAutoHoldRef = useRef<Map<string, number>>(new Map())
  const [quarantineReviewKeys, setQuarantineReviewKeys] = useState<ReadonlySet<string>>(() => new Set())

  /**
   * Reconciliação AUTOMÁTICA das vendas preservadas por conflito de identificação.
   *
   * O operador não precisa entender nada disto: a venda que ele concluiu entra no
   * histórico assim que o servidor confirma. O servidor só grava quando é seguro — venda
   * já existente é apenas reconciliada; venda ausente é criada UMA vez, com a data e a
   * sessão de caixa originais (mesmo fechada; nunca o caixa de hoje) — e devolve bloqueio
   * para o que for realmente ambíguo, que vai para o administrador (`quarantineReviewKeys`).
   *
   * Nunca passa por `persistPendingSale`: conflito de identificação não vira reenvio comum.
   */
  const autoReconcileQuarantinedSales = useCallback(async () => {
    if (autoReconcileInFlightRef.current) return
    const lj = opsLojaIdFromStorageKey(storageKey)
    const isQuarantined = (sale: SaleRecord) =>
      Boolean(sale.id) &&
      sale.syncPending === true &&
      (isSaleIdentityConflictCode(sale.syncBlockedCode) ||
        Boolean(persistedSaleIdentityConflictCode(storageKey, sale)))
    const quarantined = stateRef.current.sales.filter(isQuarantined)
    if (quarantined.length === 0) return

    // 1. Identidade técnica determinística para quem ainda não tem, gravada ANTES da
    //    rede. O envio dessas fica para a volta seguinte, com a chave já persistida.
    if (quarantined.some((sale) => !sale.clientSaleId)) {
      setState((prev) => ({
        ...prev,
        sales: prev.sales.map((sale) =>
          !sale.clientSaleId && isQuarantined(sale)
            ? { ...sale, clientSaleId: deriveLegacySaleClientSaleId(lj, sale) }
            : sale,
        ),
      }))
    }

    // 2. Só vai à rede venda cuja chave já está no armazenamento local.
    const candidates = selectAutoReconcileCandidates({
      sales: quarantined,
      isQuarantined,
      persistedClientSaleIds: persistedClientSaleIds(storageKey),
      holdUntil: quarantineAutoHoldRef.current,
      now: Date.now(),
    })
    if (candidates.length === 0) return

    autoReconcileInFlightRef.current = true
    const results: QuarantineRecoveryResultView[] = []
    let routeUnavailable: "session" | "transient" | null = null
    try {
      for (const slice of chunk(candidates, QUARANTINE_RECOVERY_CHUNK)) {
        const res = await fetch(quarantineAutoReconcileUrl(lj), {
          method: "POST",
          credentials: "include",
          headers: persistHeaders(lj),
          body: JSON.stringify({ candidates: slice }),
        })
        if (!res.ok) {
          // 4xx: indisponível para esta sessão (permissão, writer V1) — fica para o
          // administrador. 5xx: transitório — tenta de novo em breve.
          routeUnavailable = res.status >= 500 ? "transient" : "session"
          break
        }
        const json = (await res.json().catch(() => null)) as {
          results?: QuarantineRecoveryResultView[]
        } | null
        const sliceResults = json?.results
        if (Array.isArray(sliceResults)) results.push(...sliceResults)
      }
    } catch {
      // Rede: nada muda — a venda segue preservada e a próxima volta do ciclo tenta de novo.
    } finally {
      autoReconcileInFlightRef.current = false
    }

    // 3. Só sai da preservação o que tem venda real no servidor.
    const confirmations = buildRecoveryConfirmations(results)
    reconcileRecoveredSales(confirmations)

    const now = Date.now()
    const confirmed = new Set(confirmations.map((confirmation) => confirmation.clientSaleId))
    const answered = new Set<string>()
    const review = new Set<string>()
    for (const result of results) {
      const key = result.clientSaleId
      if (!key || confirmed.has(key)) continue
      answered.add(key)
      if (result.status === "FAILED") {
        quarantineAutoHoldRef.current.set(key, now + QUARANTINE_AUTO_RECONCILE_RETRY_MS)
      } else {
        // BLOCKED / REQUIRES_CONFIRMATION: o servidor não viu segurança — revisão humana.
        quarantineAutoHoldRef.current.set(key, now + QUARANTINE_AUTO_RECONCILE_HOLD_MS)
        review.add(key)
      }
    }
    if (routeUnavailable) {
      const until =
        now + (routeUnavailable === "transient" ? QUARANTINE_AUTO_RECONCILE_RETRY_MS : QUARANTINE_AUTO_RECONCILE_HOLD_MS)
      for (const candidate of candidates) {
        const key = candidate.clientSaleId
        if (!key || confirmed.has(key) || answered.has(key)) continue
        quarantineAutoHoldRef.current.set(key, until)
        if (routeUnavailable === "session") review.add(key)
      }
    }

    setQuarantineReviewKeys((prev) => {
      const next = new Set(prev)
      for (const key of confirmed) next.delete(key)
      for (const key of review) next.add(key)
      if (next.size === prev.size && [...next].every((key) => prev.has(key))) return prev
      return next
    })
  }, [reconcileRecoveredSales, storageKey])

  /** Baixa o catálogo já (best-effort) pelo controlador: mesma loja, resposta mais nova vence. */
  const refreshInventoryFromServer = useCallback(async () => {
    await checkCatalog({ force: true })
  }, [checkCatalog])

  const discardLocalPendingSale = useCallback<OperationsContextType["discardLocalPendingSale"]>(
    async (saleId) => {
      const sale = stateRef.current.sales.find(
        (s) => s.syncPending === true && (s.id === saleId || s.clientSaleId === saleId),
      )
      if (!sale) {
        return { ok: false, reason: "Venda local pendente não encontrada." }
      }
      if (persistedSaleIdentityConflictCode(storageKey, sale)) {
        return {
          ok: false,
          reason: `${SALE_IDENTITY_CONFLICT_TITLE}. ${SALE_IDENTITY_CONFLICT_GUIDANCE}`,
        }
      }
      const lj = opsLojaIdFromStorageKey(storageKey)
      const dropLocal = () => {
        clearPersistedSaleAttempt(lj, saleRecordAttemptFingerprint(sale), {
          clientSaleId: sale.clientSaleId,
          saleId: sale.id,
        })
        // Lápide ANTES de tirar da fila: a união entre abas não pode ressuscitá-la.
        addSaleTombstone(lj, sale)
        openSaleAttemptsRef.current.delete(saleLocalKey(sale))
        setState((prev) => discardPendingSaleFromState(prev, sale))
        void refreshInventoryFromServer()
      }
      try {
        if (sale.clientSaleId) {
          const res = await fetch(vendaByClientSaleIdUrl(lj, sale.clientSaleId), {
            credentials: "include",
            cache: "no-store",
            headers: persistHeaders(lj),
          })
          if (res.ok) {
            const body: unknown = await res.json().catch(() => null)
            const confirmed = extractConfirmedVenda(body)
            markSaleConfirmed({ id: sale.id, clientSaleId: sale.clientSaleId }, confirmed ?? undefined)
            emitVendaFinalizadaOnce(
              lj,
              { id: confirmed?.pedidoId ?? sale.id, clientSaleId: sale.clientSaleId },
              { ...sale, syncPending: false },
            )
            return {
              ok: true,
              mode: "reconciled",
              reason: "Venda já existe no servidor — marcada como sincronizada (não descartada).",
            }
          }
          if (res.status === 404) {
            dropLocal()
            return { ok: true, mode: "discarded" }
          }
          const body = await res.text().catch(() => "")
          return {
            ok: false,
            reason: `Verificação no servidor falhou (HTTP ${res.status}). Nada foi descartado. ${body.trim().slice(0, 160)}`,
          }
        }
        const res = await fetch(`/api/vendas/${encodeURIComponent(saleId)}`, {
          credentials: "include",
          cache: "no-store",
          headers: { [ASSISTEC_LOJA_HEADER]: lj },
        })
        if (res.ok) {
          markSaleConfirmed({ id: sale.id, clientSaleId: sale.clientSaleId })
          emitVendaFinalizadaOnce(lj, { id: saleId }, { ...sale, syncPending: false })
          return {
            ok: true,
            mode: "reconciled",
            reason: "Venda já existe no servidor — marcada como sincronizada (não descartada).",
          }
        }
        if (res.status === 404) {
          dropLocal()
          return { ok: true, mode: "discarded" }
        }
        const body = await res.text().catch(() => "")
        const snippet = body.trim().slice(0, 160)
        return {
          ok: false,
          reason: `Verificação no servidor falhou (HTTP ${res.status}). Nada foi descartado. ${snippet}`,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, reason: `Falha de rede ao verificar no servidor: ${msg}` }
      }
    },
    [emitVendaFinalizadaOnce, markSaleConfirmed, refreshInventoryFromServer, storageKey],
  )

  const bulkDiscardLocalPendingSales = useCallback<
    OperationsContextType["bulkDiscardLocalPendingSales"]
  >(async () => {
    const pending = stateRef.current.sales.filter((s) => s.syncPending === true)
    const total = pending.length
    if (total === 0) {
      return { ok: true, total: 0, reconciled: 0, kept: 0, conflicts: 0 }
    }
    const lj = opsLojaIdFromStorageKey(storageKey)
    const reconciledIds = new Set<string>()
    let kept = 0
    let conflicts = 0
    for (const sale of pending) {
      if (persistedSaleIdentityConflictCode(storageKey, sale)) {
        conflicts += 1
        continue
      }
      try {
        const res = await fetch(`/api/vendas/${encodeURIComponent(sale.id)}`, {
          credentials: "include",
          cache: "no-store",
          headers: { [ASSISTEC_LOJA_HEADER]: lj },
        })
        if (res.ok) {
          reconciledIds.add(sale.id)
        } else if (res.status === 404) {
          // Ainda não chegou ao servidor: é venda REAL aguardando envio. Nunca descartar —
          // o reenvio automático (`flushPendingSales`) continua cuidando dela.
          kept += 1
        } else {
          conflicts += 1
        }
      } catch {
        conflicts += 1
      }
    }
    if (reconciledIds.size > 0) {
      for (const sale of pending) {
        if (!reconciledIds.has(sale.id)) continue
        closePersistedSaleAttemptIfIdentity(lj, {
          clientSaleId: sale.clientSaleId,
          saleId: sale.id,
        })
      }
      setState((prev) => ({
        ...prev,
        sales: prev.sales.map((s) => (reconciledIds.has(s.id) ? { ...s, syncPending: false } : s)),
      }))
    }
    return {
      ok: true,
      total,
      reconciled: reconciledIds.size,
      kept,
      conflicts,
    }
  }, [storageKey])

  const flushPendingDevolucoes = useCallback(() => {
    const pending = stateRef.current.devolucoes.filter((d) => d.syncPending === true)
    if (pending.length === 0) return
    const lj = opsLojaIdFromStorageKey(storageKey)
    for (const dev of pending) {
      const itensServidor = dev.lines.map((it) => {
        const sale = stateRef.current.sales.find((s) => s.id === dev.saleId)
        const saleLine = sale?.lines.find((l) => l.inventoryId === it.inventoryId)
        const valorUnitario = saleLine ? (saleLine.lineTotal / saleLine.quantity) : 0
        return {
          inventoryId: it.inventoryId,
          nome: it.name,
          quantidade: it.quantity,
          valorUnitario,
          valorTotal: it.valor,
        }
      })

      fetch("/api/ops/devolucao", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-assistec-loja-id": lj,
        },
        body: JSON.stringify({
          localId: dev.id,
          vendaLocalId: dev.saleId,
          sessaoId: dev.sessaoId || undefined,
          tipo: dev.tipo || dev.mode,
          valorTotal: dev.lines.reduce((sum, l) => sum + l.valor, 0),
          creditoEmitido: dev.creditIssued,
          clienteNome: dev.customerName,
          clienteDoc: dev.customerCpf,
          operador: "",
          motivo: dev.motivo || "",
          observacao: dev.observacao || "",
          itens: itensServidor,
          payload: dev.payload || { saleId: dev.saleId, linhas: dev.lines.map(l => ({ inventoryId: l.inventoryId, quantity: l.quantity })), modo: dev.tipo || dev.mode, motivo: dev.motivo || "" },
        }),
      })
        .then(async (res) => {
          if (res.ok) {
            setState((prev) => ({
              ...prev,
              devolucoes: prev.devolucoes.map((d) => (d.id === dev.id ? { ...d, syncPending: false } : d)),
            }))
          } else {
            const body = await res.text().catch(() => "")
            console.warn("[devolucao-persist] re-sync HTTP", res.status, dev.id, "lojaId:", lj, "body:", body)
          }
        })
        .catch((err: unknown) => {
          console.warn("[devolucao-persist] re-sync rede", dev.id, "lojaId:", lj, err)
        })
    }
  }, [storageKey])

  const flushPendingCaixaOperations = useCallback(() => {
    if (storeCaixaOnlineOnlyRef.current) return
    const pending = stateRef.current.pendingCaixaOperations?.filter((op) => op.syncPending === true) ?? []
    if (pending.length === 0) return
    const lj = opsLojaIdFromStorageKey(storageKey)
    for (const op of pending) {
      void registrarOperacaoCaixaServer({
        lojaId: lj,
        sessaoId: op.sessaoId,
        tipo: op.tipo,
        valor: op.valor,
        motivo: op.motivo,
        localId: op.id,
        operador: op.operador,
        maxAttempts: 1,
      })
        .then((res) => {
          if (res.ok) {
            setState((prev) => ({
              ...prev,
              pendingCaixaOperations: prev.pendingCaixaOperations.map((o) =>
                o.id === op.id ? { ...o, syncPending: false } : o
              ),
            }))
          } else {
            console.warn("[caixa-persist] re-sync HTTP", res.reason, op.id)
          }
        })
        .catch((err: unknown) => {
          console.warn("[caixa-persist] re-sync rede", op.id, err)
        })
    }
  }, [storageKey])

  // Sessão STORE confirmada: sangria/suprimento que ficaram na fila (versão anterior,
  // aba fechada no meio do envio ou valor forjado no storage) nunca chegaram ao servidor.
  // Saem da fila e do total local, para não pegarem carona em outra conta depois.
  const storeCaixaConfirmada = authStatus !== "loading" && isStoreExperienceSession(authSession)
  useEffect(() => {
    if (!opsDbReady || !storeCaixaConfirmada) return
    setState((prev) => {
      const presas = (prev.pendingCaixaOperations ?? []).filter((o) => o.syncPending === true)
      if (presas.length === 0) return prev
      const saidas = presas.filter((o) => o.tipo === "sangria").reduce((t, o) => t + o.valor, 0)
      const entradas = presas.filter((o) => o.tipo === "suprimento").reduce((t, o) => t + o.valor, 0)
      return {
        ...prev,
        caixa: { ...prev.caixa, totalSaidas: prev.caixa.totalSaidas - saidas, totalEntradas: prev.caixa.totalEntradas - entradas },
        pendingCaixaOperations: prev.pendingCaixaOperations.filter((o) => o.syncPending !== true),
      }
    })
  }, [opsDbReady, storeCaixaConfirmada])

  // Recupera pendências ao montar/abrir o PDV (bootstrap).
  useEffect(() => {
    if (!opsDbReady) return
    flushPendingSales()
    flushPendingDevolucoes()
    flushPendingCaixaOperations()
    void autoReconcileQuarantinedSales()
  }, [opsDbReady, flushPendingSales, flushPendingDevolucoes, flushPendingCaixaOperations, autoReconcileQuarantinedSales])

  // Rede de segurança em sessão: re-tenta pendências quando a conexão volta,
  // quando a aba reganha foco e periodicamente.
  useEffect(() => {
    if (!opsDbReady) return
    const onWake = (event?: Event) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return
      // Rede de volta: tenta já, sem esperar o backoff das falhas de quando estava fora.
      flushPendingSales({ resetBackoff: event?.type === "online" })
      flushPendingDevolucoes()
      flushPendingCaixaOperations()
      void autoReconcileQuarantinedSales()
      // Reconcilia status autoritativo das vendas (ex.: cancelamento feito na tela
      // Vendas) ao voltar o foco/rede — caixa/fechamento atualizam sem reload manual.
      void refreshSalesFromServer()
    }
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") onWake()
    }
    window.addEventListener("online", onWake)
    document.addEventListener("visibilitychange", onVisible)
    const interval = window.setInterval(() => onWake(), 30_000)
    return () => {
      window.removeEventListener("online", onWake)
      document.removeEventListener("visibilitychange", onVisible)
      window.clearInterval(interval)
    }
  }, [
    opsDbReady,
    flushPendingSales,
    flushPendingDevolucoes,
    flushPendingCaixaOperations,
    refreshSalesFromServer,
    autoReconcileQuarantinedSales,
  ])

  const setOrdens: OperationsContextType["setOrdens"] = useCallback((updater) => {
    setState((prev) => ({
      ...prev,
      ordens: typeof updater === "function" ? (updater as (value: OrdemServico[]) => OrdemServico[])(prev.ordens) : updater,
    }))
  }, [])

  const setInventory: OperationsContextType["setInventory"] = useCallback((updater) => {
    setState((prev) => ({
      ...prev,
      inventory:
        typeof updater === "function"
          ? (updater as (value: InventoryItem[]) => InventoryItem[])(prev.inventory)
          : updater,
    }))
  }, [])

  const setOrcamentos: OperationsContextType["setOrcamentos"] = useCallback((updater) => {
    setState((prev) => ({
      ...prev,
      orcamentos:
        typeof updater === "function"
          ? (updater as (value: Orcamento[]) => Orcamento[])(prev.orcamentos)
          : updater,
    }))
  }, [])

  const abrirCaixa = useCallback((saldoInicial: number) => {
    setState((prev) => ({
      ...prev,
      caixa: {
        isOpen: true,
        saldoInicial,
        dataAbertura: new Date(),
        totalEntradas: 0,
        totalSaidas: 0,
      },
    }))
  }, [])

  const fecharCaixa = useCallback(() => {
    setState((prev) => ({
      ...prev,
      caixaSessaoId: null,
      caixa: {
        isOpen: false,
        saldoInicial: 0,
        dataAbertura: null,
        totalEntradas: 0,
        totalSaidas: 0,
      },
    }))
  }, [])

  const setCaixaSessaoId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, caixaSessaoId: id }))
  }, [])

  const adicionarEntrada = useCallback((valor: number) => {
    setState((prev) => ({
      ...prev,
      caixa: { ...prev.caixa, totalEntradas: prev.caixa.totalEntradas + valor },
    }))
  }, [])

  const adicionarSaida = useCallback((valor: number) => {
    setState((prev) => ({
      ...prev,
      caixa: { ...prev.caixa, totalSaidas: prev.caixa.totalSaidas + valor },
    }))
  }, [])

  const getSaldoAtual = useCallback(() => {
    const c = stateRef.current.caixa
    return c.saldoInicial + c.totalEntradas - c.totalSaidas
  }, [])

  const getSaldoCreditoCliente = useCallback((cpf: string) => {
    const k = normalizeDocDigits(cpf)
    if (!k) return 0
    return stateRef.current.customerCredits[k]?.saldo ?? 0
  }, [])

  const sincronizarCreditoLocal = useCallback((doc: string, nome: string, saldo: number) => {
    const k = normalizeDocDigits(doc)
    const saldoSeguro = Math.max(0, Math.round((Number.isFinite(saldo) ? saldo : 0) * 100) / 100)
    if (!k || saldoSeguro <= 0) return
    setState((prev) => {
      const atual = prev.customerCredits[k]?.saldo ?? 0
      if (atual >= saldoSeguro) return prev
      return {
        ...prev,
        customerCredits: {
          ...prev.customerCredits,
          [k]: {
            nome: nome?.trim() || prev.customerCredits[k]?.nome || "Cliente",
            saldo: saldoSeguro,
          },
        },
      }
    })
  }, [])

  const incrementOsAbertasDia = useCallback(() => {
    setState((prev) => {
      const dailyLedger = ensureLedger(prev.dailyLedger)
      dailyLedger.osAbertas += 1
      return { ...prev, dailyLedger }
    })
  }, [])

  const finalizeSaleTransaction = useCallback<OperationsContextType["finalizeSaleTransaction"]>(
    async ({
      lines,
      total,
      linkedOsId,
      paymentBreakdown,
      customerCpf,
      customerName,
      clienteId,
      openCaixaIfClosed,
      saldoInicialAoAbrir,
      auditMeta,
      aPrazoConfig,
      pixQrKind,
      cashTendered,
    }) => {
      // Preflight fail-closed (FRACTIONAL-SALE-HARD-BLOCK-005): quantidade
      // significativamente fracionária nunca gera mutação local (carrinho,
      // SaleRecord, estoque, caixa, syncPending) nem "Venda finalizada". Roda
      // antes de qualquer leitura/mutação — o guard do servidor continua sendo
      // a autoridade final. Ruído insignificante de floating point passa.
      for (const line of lines) {
        const q = line?.quantity
        if (typeof q !== "number" || !Number.isFinite(q)) {
          return { ok: false, reason: "Quantidade inválida." }
        }
        if (!isIntegerSaleQuantity(q)) {
          return { ok: false, reason: FRACTIONAL_QUANTITY_MESSAGE }
        }
      }
      // Fail-closed (PDV-MOTOR-INTEGRITY-N1): venda sem itens nunca gera
      // mutação local nem pendência — o servidor rejeitaria do mesmo jeito.
      if (lines.length === 0) {
        return { ok: false, reason: "Carrinho vazio." }
      }

      const pb = normalizePaymentBreakdown(paymentBreakdown)
      const cpfNormEarly = customerCpf ? normalizeDocDigits(customerCpf) : ""
      const fingerprint = saleAttemptFingerprint({
        lines: lines.map((line) => ({
          inventoryId: line.inventoryId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
        total,
        paymentBreakdown: pb,
        linkedOsId: linkedOsId?.trim() || undefined,
        customerCpf: cpfNormEarly || undefined,
      })
      const lj = opsLojaIdFromStorageKey(storageKey)
      const reusePending = (sale: SaleRecord): FinalizeSaleTransactionResult => ({
        ok: true,
        saleId: sale.id,
        pending: true,
        clientSaleId: sale.clientSaleId,
        serverId: sale.serverId,
      })
      // Só a tentativa com carrinho ABERTO nesta aba absorve a reconfirmação do mesmo carrinho
      // (PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001). Antes qualquer pendente com a mesma
      // impressão absorvia: a 2ª venda idêntica feita offline virava a 1ª e sumia.
      const openPending = () =>
        stateRef.current.sales.filter((s) => s.syncPending === true && openSaleAttemptsRef.current.has(saleLocalKey(s)))
      // Identidade do mapa persistido que aponta para pendente JÁ ENCERRADA (outra venda) não serve.
      const usableAttempt = <T extends { clientSaleId: string; saleId: string }>(attempt: T | null): T | null => {
        if (!attempt) return null
        const local = stateRef.current.sales.find(
          (s) => s.syncPending === true && (s.clientSaleId === attempt.clientSaleId || s.id === attempt.saleId),
        )
        return local && !openSaleAttemptsRef.current.has(saleLocalKey(local)) ? null : attempt
      }
      const matching = findMatchingPendingSale(openPending(), fingerprint)
      if (matching) return reusePending(matching)
      reconcilePersistedSaleAttempts(lj, stateRef.current.sales)
      const persistedAttempt = usableAttempt(resolvePersistedAttemptForNewSale(lj, fingerprint, stateRef.current.sales))
      if (persistedAttempt) {
        const byIdentity = stateRef.current.sales.find(
          (s) =>
            s.syncPending === true &&
            (s.clientSaleId === persistedAttempt.clientSaleId || s.id === persistedAttempt.saleId),
        )
        if (byIdentity) return reusePending(byIdentity)
      }
      const inFlight = finalizeInFlightRef.current.get(fingerprint)
      if (inFlight) return inFlight

      const run = (async (): Promise<FinalizeSaleTransactionResult> => {
      const current = stateRef.current
      const next: OpsState = {
        inventory: current.inventory.map((i) => ({ ...i })),
        ordens: current.ordens.map((o) => ({ ...o })),
        caixa: { ...current.caixa },
        caixaSessaoId: current.caixaSessaoId,
        dailyLedger: ensureLedger(current.dailyLedger),
        sales: [...current.sales],
        devolucoes: [...current.devolucoes],
        pendingCaixaOperations: [...current.pendingCaixaOperations],
        orcamentos: [...current.orcamentos],
        customerCredits: { ...current.customerCredits },
      }

      if (!next.caixa.isOpen) {
        if (openCaixaIfClosed) {
          next.caixa = {
            isOpen: true,
            saldoInicial: saldoInicialAoAbrir ?? 0,
            dataAbertura: new Date(),
            totalEntradas: 0,
            totalSaidas: 0,
          }
        } else {
          return { ok: false, reason: "Caixa fechado." }
        }
      }

      for (const line of lines) {
        const itemType = resolveSaleLineItemType(line)
        if (itemType !== "produto" || isVirtualSaleLine(line.inventoryId)) {
          if (line.quantity <= 0) return { ok: false, reason: "Quantidade inválida." }
          continue
        }
        const item = next.inventory.find((i) => i.id === line.inventoryId)
        if (!item) return { ok: false, reason: `Item de estoque não encontrado: ${line.inventoryId}` }
        if (line.quantity <= 0) return { ok: false, reason: "Quantidade inválida." }
        if (item.stock < line.quantity) {
          return { ok: false, reason: `Estoque insuficiente para ${item.name}.` }
        }
      }

      if (linkedOsId) {
        const os = next.ordens.find((o) => o.id === linkedOsId)
        if (!os) return { ok: false, reason: "O.S. vinculada não encontrada." }
      }

      const sumPb =
        pb.dinheiro +
        pb.pix +
        pb.cartaoDebito +
        pb.cartaoCredito +
        pb.carne +
        pb.aPrazo +
        pb.creditoVale
      if (Math.abs(sumPb - total) > 0.02) {
        return { ok: false, reason: "Soma das formas de pagamento difere do total." }
      }

      // Offline (navegador sem rede ou backend sem responder há pouco) — PDV-OFFLINE-SYNC-
      // CONFIABILIDADE-E2E-001: só o que pode ser registrado localmente com segurança, antes
      // das checagens de saldo local (que seriam um motivo enganoso). Nada é gravado na recusa.
      const offlineNow = isEffectivelyOffline(recomputeConnectivity())
      if (offlineNow) {
        const blockedPayment = offlinePaymentBlockReason(pb)
        if (blockedPayment) return { ok: false, reason: blockedPayment }
        if (!localQueueHealthyRef.current) {
          return {
            ok: false,
            reason:
              "Sem conexão e o armazenamento deste navegador falhou na última gravação: uma venda offline ficaria só na memória e poderia se perder. Nada foi gravado. Aguarde a conexão ou libere espaço do navegador.",
          }
        }
      }

      const cpfNorm = cpfNormEarly
      if (pb.aPrazo > 0 && !cpfNorm) {
        return { ok: false, reason: "Selecione o cliente (com CPF) para venda à prazo em Contas a Receber." }
      }
      if (pb.creditoVale > 0) {
        if (!cpfNorm) return { ok: false, reason: "Informe o cliente (CPF) para usar crédito/vale." }
        const saldo = next.customerCredits[cpfNorm]?.saldo ?? 0
        if (pb.creditoVale > saldo + 0.01) {
          return { ok: false, reason: "Saldo de crédito insuficiente." }
        }
      }

      const rematch = findMatchingPendingSale(openPending(), fingerprint)
      if (rematch) return reusePending(rematch)

      // Recarregou a página (ou outra aba) com uma venda IDÊNTICA cujo envio ficou sem resposta:
      // ela pode estar gravada. Registrar de novo com identidade nova duplicaria. O operador
      // verifica pelo Reenviar (que consulta o servidor) — carrinho encerrado conscientemente
      // nesta aba (Cancelar/Limpar) não entra aqui: aí é um cliente novo.
      const unknownTwin = stateRef.current.sales.find(
        (s) =>
          s.syncPending === true &&
          s.syncResultUnknown === true &&
          !openSaleAttemptsRef.current.has(saleLocalKey(s)) &&
          !releasedSaleAttemptsRef.current.has(saleLocalKey(s)) &&
          Date.now() - Date.parse(s.at) < UNKNOWN_TWIN_WINDOW_MS &&
          saleRecordAttemptFingerprint(s) === fingerprint,
      )
      if (unknownTwin) {
        // Repetir a finalização NÃO libera (seria confirmação implícita por reflexo): só a escolha
        // explícita "É outra venda" (`resolveUnknownTwin`) marca a anterior como outro cliente.
        const hora = new Date(unknownTwin.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        setUnknownTwinPrompt({
          key: saleLocalKey(unknownTwin),
          saleId: unknownTwin.id,
          clientSaleId: unknownTwin.clientSaleId,
          at: unknownTwin.at,
          total: unknownTwin.total,
        })
        return {
          ok: false,
          code: UNKNOWN_TWIN_CODE,
          reason: `Já existe uma venda idêntica das ${hora} cujo envio ficou sem resposta do servidor — ela pode já estar gravada. Escolha no aviso: verificar a anterior ou "É outra venda". Nada foi gravado.`,
        }
      }

      const capability = await probeWriterCapability(lj)
      const useV2 = capability !== "v1"
      const reusedIdentity = usableAttempt(resolvePersistedAttemptForNewSale(lj, fingerprint, stateRef.current.sales))
      const clientSaleId = useV2
        ? reusedIdentity?.clientSaleId ?? assertGeneratedClientSaleId(generateClientSaleId())
        : undefined
      const saleId =
        useV2 && clientSaleId
          ? reusedIdentity?.saleId ?? buildProvisionalSaleRef(clientSaleId)
          : nextSaleId(next.sales)
      const saleLines: SaleLineRecord[] = lines.map((ln) => {
        const itemType = resolveSaleLineItemType(ln)
        const item = itemType === "produto"
          ? next.inventory.find((inventoryItem) => inventoryItem.id === ln.inventoryId)
          : undefined
        const record = saleLineRecordFromFinalizeInput(
          ln,
          item ? { name: item.name, price: item.price } : undefined,
        )
        // Identidade estável do catálogo: o `inventoryId` é o SKU quando existe e o
        // Cadastro pode alterá-lo antes da sincronização (PDV-SYNC-PRODUTO-NAO-RESOLVIDO).
        // A do carrinho (capturada ao incluir o item) vence a busca pelo id operacional.
        const fromLine = itemType === "produto" && typeof ln.produtoId === "string" ? ln.produtoId.trim() : ""
        const produtoId = fromLine || (typeof item?.dbId === "string" ? item.dbId.trim() : "")
        return produtoId ? { ...record, produtoId } : record
      })
      // Writer V1 não tem `clientSaleId`: comparar `undefined === undefined` casava QUALQUER pendente
      // V1 e a venda nova era absorvida pela anterior (perdida) — PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001.
      const already = next.sales.find(
        (s) =>
          s.syncPending === true &&
          ((Boolean(clientSaleId) && s.clientSaleId === clientSaleId) || s.id === saleId),
      )
      if (already) return reusePending(already)

      const saleRow: SaleRecord = {
        id: saleId,
        ...(clientSaleId ? { clientSaleId } : {}),
        at: new Date().toISOString(),
        lines: saleLines,
        total,
        customerCpf: cpfNorm || undefined,
        customerName: customerName?.trim() || undefined,
        clienteId: clienteId?.trim() || undefined,
        paymentBreakdown: pb,
        ...(pb.pix > 0.02 && typeof pixQrKind === "string" && pixQrKind !== "" ? { pixQrKind } : {}),
        ...(pb.dinheiro > 0.02 &&
        typeof cashTendered === "number" &&
        Number.isFinite(cashTendered) &&
        cashTendered >= 0 &&
        cashTendered + 0.001 >= pb.dinheiro
          ? { cashTendered: Math.round(cashTendered * 100) / 100 }
          : {}),
        cashierId: auditMeta?.cashierId,
        sessaoId: next.caixaSessaoId ?? current.caixaSessaoId ?? undefined,
        terminalId: readSelectedTerminal(lj)?.id || undefined,
        linkedOsId: linkedOsId?.trim() || undefined,
        discountAuthorizedByAdminId: auditMeta?.discountAuthorizedByAdminId,
        discountReais: auditMeta?.discountReais,
        discountPercent: auditMeta?.discountPercent,
        ...(aPrazoConfig ? { aPrazoConfig } : {}),
        ...(offlineNow ? { registeredOffline: true } : {}),
        syncPending: true,
        localEffectsApplied: false,
      }
      next.sales.push(saleRow)
      if (clientSaleId) {
        writePersistedSaleAttempt(lj, {
          fingerprint,
          clientSaleId,
          saleId,
          at: saleRow.at,
        })
      }
      openSaleAttemptsRef.current.add(saleLocalKey(saleRow))
      setState(next)
      stateRef.current = next
      // Durável ANTES do primeiro envio: a venda inteira (não só a identidade) já está no
      // navegador se a aba fechar/travar com a requisição em voo. Antes a escrita só vinha
      // no efeito do próximo render, depois do `fetch` ter saído.
      // Antes da hidratação o efeito de persistência ainda não grava; aqui também não.
      const durable = caixaHydratedForRef.current === storageKey ? writeOpsSnapshot(next) : { ok: true }
      if (!durable.ok) {
        toast({
          variant: "destructive",
          title: "Armazenamento do navegador falhou",
          description:
            "Esta venda não pôde ser salva neste aparelho. Se o servidor não confirmar agora, ela existe só nesta aba — não feche nem recarregue a página.",
        })
      }

      const persistResult = await persistPendingSale(saleRow, lj, false, "finalize")
      if (persistResult.ok) {
        clearPersistedSaleAttempt(lj, fingerprint, {
          clientSaleId: persistResult.clientSaleId ?? saleRow.clientSaleId,
          saleId: saleRow.id,
        })
        const confirmedId = persistResult.pedidoId ?? saleRow.id
        const pending = isProvisionalSaleRef(confirmedId)
        return {
          ok: true,
          saleId: confirmedId,
          pending,
          clientSaleId: persistResult.clientSaleId ?? saleRow.clientSaleId,
          serverId: persistResult.serverId,
        }
      }
      const code = persistResult.code
      // RECUSA DEFINITIVA (PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001 →
      // PDV-CADASTROS-SYNC-AUTOMATICO-001): o writer recusou ANTES de qualquer efeito — o
      // código está em `DEFINITIVE_REJECTION_CODES` (lançado dentro da transação, que reverte
      // inteira, numeração inclusa). Não há venda a confirmar. Manter PENDING congelava um
      // payload que o operador não consegue revisar: o Reenviar repetia o mesmo 409 e a guarda
      // de identidade travava as próximas vendas. FAILED honesto: descarta a tentativa local
      // (nunca confirmada, `localEffectsApplied: false`), recarrega catálogo/caixa e devolve o
      // carrinho intacto. Rede/5xx (resultado DESCONHECIDO) continua PENDING com a mesma
      // identidade. Só para identidade criada NESTA chamada: uma `clientSaleId` reaproveitada
      // do mapa compartilhado pode estar viva como PENDING em outra aba — o 409 só prova que
      // ela não estava gravada AGORA; fechá-la abriria caminho para 2 identidades.
      const disposition = finalizeFailureDisposition({
        code,
        httpStatus: persistResult.httpStatus,
        networkError: persistResult.networkError,
        reusedIdentity: reusedIdentity != null,
      })
      if (disposition === "FAILED" && code) {
        const token = { id: saleRow.id, clientSaleId: saleRow.clientSaleId }
        const isThisAttempt = (s: SaleRecord) => s.syncPending === true && saleMatches(s, token)
        clearPersistedSaleAttempt(lj, fingerprint, { clientSaleId: saleRow.clientSaleId, saleId: saleRow.id })
        // Lápide ANTES de tirar da fila: a cópia gravada (escrita durável acima) não volta pela união entre abas.
        addSaleTombstone(lj, saleRow)
        openSaleAttemptsRef.current.delete(saleLocalKey(saleRow))
        stateRef.current = { ...stateRef.current, sales: stateRef.current.sales.filter((s) => !isThisAttempt(s)) }
        setState((prev) => ({ ...prev, sales: prev.sales.filter((s) => !isThisAttempt(s)) }))
        if (isCaixaSessionRejectionCode(code)) void refreshCaixaSession()
        else void refreshInventoryFromServer()
        console.warn("[venda-persist] recusa definitiva — tentativa descartada", code, saleRow.id, "lojaId:", lj)
        return {
          ok: false,
          reason: definitiveRejectionFinalizeReason(
            code,
            unresolvedSaleLineLabels(saleRow.lines, persistResult.unresolvedInventoryIds),
            persistResult.reason.replace(/^HTTP \d+ — /, ""),
          ),
        }
      }
      const view = pendingReasonView({
        code,
        httpStatus: persistResult.httpStatus,
        networkError: persistResult.networkError,
        message: persistResult.reason,
        drift: persistResult.drift,
      })
      console.error("[venda-persist]", saleRow.id, "lojaId:", lj, persistResult.reason)
      toast({
        variant: view.class === PENDING_SYNC_CLASS.AUTO_RETRY ? "default" : "destructive",
        title: isSaleIdentityConflictCode(code) ? SALE_IDENTITY_CONFLICT_TITLE : view.title,
        description: isSaleIdentityConflictCode(code)
          ? SALE_IDENTITY_CONFLICT_GUIDANCE
          : `${view.description} ${view.recommendedAction}`,
      })
      if (isCaixaSessionRejectionCode(code)) {
        void refreshCaixaSession()
      }
      return {
        ok: true,
        saleId: saleRow.id,
        pending: true,
        clientSaleId: saleRow.clientSaleId,
      }
      })()

      finalizeInFlightRef.current.set(fingerprint, run)
      try {
        return await run
      } finally {
        finalizeInFlightRef.current.delete(fingerprint)
      }
    },
    [
      persistPendingSale,
      probeWriterCapability,
      recomputeConnectivity,
      refreshCaixaSession,
      refreshInventoryFromServer,
      storageKey,
      writeOpsSnapshot,
    ]
  )

  const registrarDevolucao = useCallback<OperationsContextType["registrarDevolucao"]>((input) => {
    const { saleId, lines, mode, customerCpf, customerName, sessaoId, tipo, motivo, observacao, payload } = input
    const k = normalizeDocDigits(customerCpf)
    if (!k) return { ok: false, reason: "CPF/CNPJ do cliente obrigatório." }

    const prev = stateRef.current
    const sale = prev.sales.find((s) => s.id === saleId)
    if (!sale) return { ok: false, reason: "Venda/cupom não encontrado." }

    const next: OpsState = {
      ...prev,
      inventory: prev.inventory.map((i) => ({ ...i })),
      sales: prev.sales.map((s) =>
        s.id === saleId ? { ...s, lines: s.lines.map((l) => ({ ...l })) } : { ...s }
      ),
      devolucoes: [...prev.devolucoes],
      customerCredits: { ...prev.customerCredits },
    }

    const saleCopy = next.sales.find((s) => s.id === saleId)!
    let creditIssued = 0
    const outLines: DevolucaoRecord["lines"] = []

    for (const req of lines) {
      const saleLine = saleCopy.lines.find((l) => l.inventoryId === req.inventoryId)
      if (!saleLine) {
        return { ok: false, reason: `Item não consta na venda: ${req.inventoryId}` }
      }
      const already = saleLine.qtyReturned ?? 0
      const canReturn = saleLine.quantity - already
      if (req.quantity <= 0) {
        return { ok: false, reason: "Quantidade inválida." }
      }
      if (canReturn < req.quantity) {
        return { ok: false, reason: `Devolução maior que o disponível para ${saleLine.name}.` }
      }
      const inv = next.inventory.find((i) => i.id === req.inventoryId)
      if (!inv) return { ok: false, reason: "Produto não está mais no cadastro de estoque." }

      const unit = saleLine.lineTotal / saleLine.quantity
      const valor = Math.round(unit * req.quantity * 100) / 100
      inv.stock += req.quantity
      saleLine.qtyReturned = already + req.quantity
      creditIssued += mode === "vale_credito" ? valor : 0
      outLines.push({
        inventoryId: req.inventoryId,
        name: saleLine.name,
        quantity: req.quantity,
        valor,
      })
    }

    if (outLines.length === 0) {
      return { ok: false, reason: "Nenhuma linha de devolução válida." }
    }

    const devolucaoId = nextDevolucaoId(next.devolucoes)
    if (mode === "vale_credito" && creditIssued > 0) {
      const cur = next.customerCredits[k]?.saldo ?? 0
      const nome = customerName.trim() || next.customerCredits[k]?.nome || "Cliente"
      next.customerCredits[k] = {
        nome,
        saldo: Math.round((cur + creditIssued) * 100) / 100,
      }
    }

    next.devolucoes.push({
      id: devolucaoId,
      at: new Date().toISOString(),
      saleId,
      customerCpf: k,
      customerName: customerName.trim(),
      lines: outLines,
      mode,
      creditIssued: mode === "vale_credito" ? creditIssued : 0,
      syncPending: true,
      sessaoId: sessaoId || undefined,
      tipo: tipo || mode,
      motivo: motivo || "",
      observacao: observacao || "",
      payload,
    })

    setState(next)

    const devRow = next.devolucoes[next.devolucoes.length - 1]
    if (devRow) {
      const lj = opsLojaIdFromStorageKey(storageKey)
      const itensServidor = devRow.lines.map((it) => {
        const sale = next.sales.find((s) => s.id === devRow.saleId)
        const saleLine = sale?.lines.find((l) => l.inventoryId === it.inventoryId)
        const valorUnitario = saleLine ? (saleLine.lineTotal / saleLine.quantity) : 0
        return {
          inventoryId: it.inventoryId,
          nome: it.name,
          quantidade: it.quantity,
          valorUnitario,
          valorTotal: it.valor,
        }
      })

      void fetch("/api/ops/devolucao", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-assistec-loja-id": lj,
        },
        body: JSON.stringify({
          localId: devRow.id,
          vendaLocalId: devRow.saleId,
          sessaoId: devRow.sessaoId || undefined,
          tipo: devRow.tipo || devRow.mode,
          valorTotal: devRow.lines.reduce((sum, l) => sum + l.valor, 0),
          creditoEmitido: devRow.creditIssued,
          clienteNome: devRow.customerName,
          clienteDoc: devRow.customerCpf,
          operador: "",
          motivo: devRow.motivo || "",
          observacao: devRow.observacao || "",
          itens: itensServidor,
          payload: devRow.payload || { saleId: devRow.saleId, linhas: devRow.lines.map(l => ({ inventoryId: l.inventoryId, quantity: l.quantity })), modo: devRow.tipo || devRow.mode, motivo: devRow.motivo || "" },
        }),
      })
        .then(async (res) => {
          if (res.ok) {
            setState((prev) => ({
              ...prev,
              devolucoes: prev.devolucoes.map((d) => (d.id === devolucaoId ? { ...d, syncPending: false } : d)),
            }))
          } else {
            const body = await res.text().catch(() => "")
            console.error("[devolucao-persist] HTTP", res.status, devRow.id, "lojaId:", lj, "body:", body)
          }
        })
        .catch((err: unknown) => {
          console.error("[devolucao-persist] rede", devRow.id, "lojaId:", lj, err)
        })
    }

    return { ok: true, devolucaoId, creditIssued: mode === "vale_credito" ? creditIssued : 0 }
  }, [storageKey])

  const registrarOperacaoCaixa = useCallback<OperationsContextType["registrarOperacaoCaixa"]>(
    async ({ sessaoId, tipo, valor, motivo, localId, operador }) => {
      const prev = stateRef.current
      const next: OpsState = {
        ...prev,
        caixa: { ...prev.caixa },
        pendingCaixaOperations: [...(prev.pendingCaixaOperations ?? [])],
      }

      if (tipo === "sangria") {
        next.caixa.totalSaidas += valor
      } else {
        next.caixa.totalEntradas += valor
      }

      next.pendingCaixaOperations.push({
        id: localId,
        at: new Date().toISOString(),
        sessaoId,
        tipo,
        valor,
        motivo,
        operador,
        syncPending: true,
      })

      setState(next)

      // STORE: desfaz o lançamento local e tira da fila — sem reenvio automático.
      const descartarOperacaoLocal = () =>
        setState((prev) => ({
          ...prev,
          caixa: {
            ...prev.caixa,
            ...(tipo === "sangria"
              ? { totalSaidas: prev.caixa.totalSaidas - valor }
              : { totalEntradas: prev.caixa.totalEntradas - valor }),
          },
          pendingCaixaOperations: prev.pendingCaixaOperations.filter((o) => o.id !== localId),
        }))

      const lj = opsLojaIdFromStorageKey(storageKey)
      try {
        const r = await registrarOperacaoCaixaServer({
          lojaId: lj,
          sessaoId,
          tipo,
          valor,
          motivo,
          localId,
          operador,
          maxAttempts: 4,
        })
        if (r.ok) {
          setState((prev) => ({
            ...prev,
            pendingCaixaOperations: prev.pendingCaixaOperations.map((o) =>
              o.id === localId ? { ...o, syncPending: false } : o
            ),
          }))
          return { ok: true, deduped: r.deduped }
        }
        if (storeCaixaOnlineOnlyRef.current) {
          descartarOperacaoLocal()
          return { ok: false, reason: r.reason === "approval_required" ? r.reason : "not_recorded" }
        }
        return { ok: false, reason: r.reason }
      } catch (err) {
        if (storeCaixaOnlineOnlyRef.current) {
          descartarOperacaoLocal()
          return { ok: false, reason: "not_recorded" }
        }
        return { ok: false, reason: "network" }
      }
    },
    [storageKey]
  )

  const value = useMemo<OperationsContextType>(
    () => ({
      inventory: state.inventory,
      ordens: state.ordens,
      caixa: state.caixa,
      caixaSessaoId: state.caixaSessaoId,
      dailyLedger: state.dailyLedger,
      sales: state.sales,
      devolucoes: state.devolucoes,
      pendingCaixaOperations: state.pendingCaixaOperations,
      orcamentos: state.orcamentos,
      customerCredits: state.customerCredits,
      setOrdens,
      setInventory,
      setOrcamentos,
      abrirCaixa,
      fecharCaixa,
      adicionarEntrada,
      adicionarSaida,
      getSaldoAtual,
      setCaixaSessaoId,
      refreshCaixaSession,
      incrementOsAbertasDia,
      getSaldoCreditoCliente,
      sincronizarCreditoLocal,
      finalizeSaleTransaction,
      registrarDevolucao,
      registrarOperacaoCaixa,
      refreshSalesFromServer,
      retrySyncSale,
      retrySyncSaleRetroactive,
      recoverQuarantinedSale,
      probeSaleWriterCapability,
      previewQuarantineRecovery,
      recoverQuarantinedSalesBatch,
      discardLocalPendingSale,
      bulkDiscardLocalPendingSales,
      quarantineReviewKeys,
      catalogVersion,
      checkCatalog,
      watchCatalogSync,
      syncConnectivity,
      saleSyncPhases,
      localQueueHealthy,
      releaseSaleAttempt,
      unknownTwinPrompt,
      resolveUnknownTwin,
    }),
    [
      state,
      setOrdens,
      setInventory,
      setOrcamentos,
      abrirCaixa,
      fecharCaixa,
      adicionarEntrada,
      adicionarSaida,
      getSaldoAtual,
      setCaixaSessaoId,
      refreshCaixaSession,
      incrementOsAbertasDia,
      getSaldoCreditoCliente,
      sincronizarCreditoLocal,
      finalizeSaleTransaction,
      registrarDevolucao,
      registrarOperacaoCaixa,
      refreshSalesFromServer,
      retrySyncSale,
      retrySyncSaleRetroactive,
      recoverQuarantinedSale,
      probeSaleWriterCapability,
      previewQuarantineRecovery,
      recoverQuarantinedSalesBatch,
      discardLocalPendingSale,
      bulkDiscardLocalPendingSales,
      quarantineReviewKeys,
      catalogVersion,
      checkCatalog,
      watchCatalogSync,
      syncConnectivity,
      saleSyncPhases,
      localQueueHealthy,
      releaseSaleAttempt,
      unknownTwinPrompt,
      resolveUnknownTwin,
    ]
  )

  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>
}

export function useOperationsStore() {
  const ctx = useContext(OperationsContext)
  if (!ctx) {
    throw new Error("useOperationsStore must be used within OperationsProvider")
  }
  return ctx
}
