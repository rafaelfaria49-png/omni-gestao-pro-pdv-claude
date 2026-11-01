/**
 * Classificação operacional da pendência de venda.
 *
 * PENDING não é CONFIRMED. O auto-retry só cobre falha recuperável.
 * Falha determinística (409 de negócio, drift estrutural, caixa original
 * fechado) é ACTION_REQUIRED — nunca vira retry infinito.
 */

import { STOCK_DRIFT_REASON, type StockDriftDetails } from "@/lib/estoque/stock-drift-reconcile"

export const PENDING_SYNC_CLASS = {
  AUTO_RETRY: "AUTO_RETRY",
  ACTION_REQUIRED: "ACTION_REQUIRED",
  QUARANTINED: "QUARANTINED",
  CONFIRMED: "CONFIRMED",
} as const

export type PendingSyncClass = (typeof PENDING_SYNC_CLASS)[keyof typeof PENDING_SYNC_CLASS]

export const STOCK_INVARIANT_DRIFT = "STOCK_INVARIANT_DRIFT"

/** 409 do writer: linha de produto sem `Produto` na loja — nada foi gravado. */
export const UNRESOLVED_PRODUCT_CODE = "PRODUTO_NAO_RESOLVIDO"

const QUARANTINE_CODES = new Set(["PEDIDO_ID_DE_OUTRA_LOJA", "PEDIDO_ID_CONFLITO_MESMA_LOJA"])

const ACTION_REQUIRED_CODES = new Set([
  STOCK_INVARIANT_DRIFT,
  "ESTOQUE_INSUFICIENTE",
  "CAIXA_FECHADO",
  "SESSAO_INVALIDA",
  "CAIXA_ORIGINAL_FECHADO",
  "PRODUTO_NAO_RESOLVIDO",
  "CREDITO_VALE_INSUFICIENTE",
  "PAGAMENTOS_TOTAL_DIVERGENTE",
  "LINHAS_VENDA_INVALIDAS",
  "FRACTIONAL_QUANTITY_UNSUPPORTED",
  "CLIENT_SALE_ID_REQUIRED",
  "IDEMPOTENCY_KEY_REUSED",
  "SALE_NUMBERING_NOT_CONFIGURED",
  "SALE_SEQUENCE_EXHAUSTED",
  "SALE_NUMBERING_INVARIANT_BROKEN",
  "SALE_WRITER_V1_ACTIVE",
  "UNTRUSTED_CONTEXT",
  "IDEMPOTENCY_CONFLICT",
  "VALIDATION",
  "CROSS_STORE",
])

export type PendingSyncFailureInput = {
  httpStatus?: number
  code?: string | null
  networkError?: boolean
  message?: string | null
  drift?: StockDriftDetails | null
  /** Rótulos das linhas não resolvidas DESTA venda (ver `unresolvedSaleLineLabels`). */
  unresolvedLabels?: readonly string[] | null
  /**
   * A linha não resolvida carrega `produtoId` (identidade estável): o servidor só a casa
   * pelo cuid, então o produto foi EXCLUÍDO — recadastrar o código não recupera a venda.
   */
  unresolvedProductRemoved?: boolean
}

export function extractStockInvariantDriftCode(message: string | null | undefined): string | undefined {
  if (!message) return undefined
  return message.includes(STOCK_INVARIANT_DRIFT) ? STOCK_INVARIANT_DRIFT : undefined
}

export function resolvePendingSyncErrorCode(input: PendingSyncFailureInput): string | undefined {
  if (typeof input.code === "string" && input.code.trim()) return input.code.trim()
  return extractStockInvariantDriftCode(input.message)
}

export function classifyPendingSyncFailure(input: PendingSyncFailureInput): PendingSyncClass {
  const code = resolvePendingSyncErrorCode(input)
  if (code && QUARANTINE_CODES.has(code)) return PENDING_SYNC_CLASS.QUARANTINED
  if (code && ACTION_REQUIRED_CODES.has(code)) return PENDING_SYNC_CLASS.ACTION_REQUIRED
  if (input.networkError === true) return PENDING_SYNC_CLASS.AUTO_RETRY
  if (typeof input.httpStatus === "number" && input.httpStatus >= 500) return PENDING_SYNC_CLASS.AUTO_RETRY
  if (typeof input.httpStatus === "number" && input.httpStatus >= 400) return PENDING_SYNC_CLASS.ACTION_REQUIRED
  return PENDING_SYNC_CLASS.AUTO_RETRY
}

export function shouldAutoRetryPendingSync(input: PendingSyncFailureInput): boolean {
  return classifyPendingSyncFailure(input) === PENDING_SYNC_CLASS.AUTO_RETRY
}

export type PendingReasonView = {
  class: PendingSyncClass
  title: string
  description: string
  recommendedAction: string
}

export function pendingReasonView(input: PendingSyncFailureInput & { pending?: boolean }): PendingReasonView {
  if (input.pending === false) {
    return {
      class: PENDING_SYNC_CLASS.CONFIRMED,
      title: "Venda confirmada",
      description: "O servidor confirmou a venda.",
      recommendedAction: "Nenhuma ação necessária.",
    }
  }
  const code = resolvePendingSyncErrorCode(input)
  const classified = classifyPendingSyncFailure(input)
  if (classified === PENDING_SYNC_CLASS.QUARANTINED) {
    return {
      class: classified,
      title: "Conflito de identidade",
      description: "A tentativa colidiu com outra venda. Nenhuma venda foi sobrescrita.",
      recommendedAction: "Preserve a cópia local e solicite recuperação administrada.",
    }
  }
  switch (code) {
    case STOCK_INVARIANT_DRIFT: {
      const drift = input.drift
      const item = drift?.produtoNome?.trim() || drift?.produtoSku?.trim() || drift?.produtoId || null
      const itemLabel = item ? `Item: ${item}. ` : ""
      const numbers =
        drift != null
          ? `Depósitos somam ${drift.somaDepositos}; estoque operacional ${drift.stock} (diferença ${drift.gap}). `
          : ""
      const recoverable =
        drift?.driftReason === STOCK_DRIFT_REASON.UNMATERIALIZED_ZERO ||
        drift?.driftReason === STOCK_DRIFT_REASON.LEGACY_DEPOSIT_OVERHANG ||
        drift?.driftReason === STOCK_DRIFT_REASON.LEGACY_DEPOSIT_UNDERCOUNT ||
        drift?.driftReason === STOCK_DRIFT_REASON.LEGACY_STOCK_CACHE_STALE
      if (drift?.driftReason === STOCK_DRIFT_REASON.PRINCIPAL_CANNOT_ABSORB) {
        return {
          class: classified,
          title: "Estoque divergente — depósito principal insuficiente",
          description: `${itemLabel}${numbers}A venda não foi gravada. O depósito alvo não absorve a diferença.`,
          recommendedAction:
            "Não reenvie em loop. Redistribua o físico no Estoque entre os depósitos; o ajuste absoluto só fecha se o novo total cobrir os outros depósitos. Depois use Reenviar da mesma venda.",
        }
      }
      if (
        drift?.driftReason === STOCK_DRIFT_REASON.MULTI_DEPOSIT_AMBIGUOUS ||
        drift?.driftReason === STOCK_DRIFT_REASON.LEDGER_CONFLICT ||
        drift?.driftReason === STOCK_DRIFT_REASON.UNPROVEN_WITHOUT_LEDGER
      ) {
        return {
          class: classified,
          title: "Estoque divergente — exige decisão",
          description: `${itemLabel}${numbers}Há desacordo entre depósitos e estoque sem autoridade comprovável. A venda não foi gravada.`,
          recommendedAction:
            "Abra Estoque e faça o ajuste absoluto do item (novo saldo). O depósito principal absorve o restante se couber. A ficha do produto não fecha este desacordo. Depois use Reenviar da mesma venda. Não finalize de novo.",
        }
      }
      return {
        class: classified,
        title: recoverable
          ? "Estoque divergente — reenviar a mesma venda"
          : "Estoque divergente — requer revisão",
        description: `${itemLabel}${numbers}O saldo do produto não fecha com os depósitos. A venda não foi gravada no servidor.`,
        recommendedAction: recoverable
          ? "Use Reenviar desta mesma venda. O servidor reconcilia o espelho legado e baixa o estoque uma vez."
          : "Use Reenviar desta mesma venda após a correção administrativa do item. Não finalize de novo.",
      }
    }
    case "ESTOQUE_INSUFICIENTE":
      return {
        class: classified,
        title: "Estoque insuficiente",
        description: "O servidor recusou a baixa. A venda permanece só no terminal.",
        recommendedAction: "Ajuste o estoque real e use Reenviar da mesma venda.",
      }
    case "CAIXA_ORIGINAL_FECHADO":
      return {
        class: classified,
        title: "Caixa original fechado — ação necessária",
        description: "A sessão em que a venda nasceu já foi fechada.",
        recommendedAction: "Use Sincronizar retroativo na mesma venda, com confirmação.",
      }
    case "CAIXA_FECHADO":
    case "SESSAO_INVALIDA":
      return {
        class: classified,
        title: "Sessão de caixa inválida",
        description: "Não há caixa aberto válido para gravar esta venda.",
        recommendedAction: "Abra o caixa deste terminal e use Reenviar da mesma venda.",
      }
    case UNRESOLVED_PRODUCT_CODE: {
      // A pendência tem payload congelado: "revisar o item" nela é impossível. O que o
      // operador consegue fazer é regularizar o cadastro do código e reenviar.
      const labels = input.unresolvedLabels?.filter((l) => l.trim()) ?? []
      const itemLabel = labels.length > 0 ? `Item: ${labels.join(", ")}. ` : ""
      if (input.unresolvedProductRemoved === true) {
        return {
          class: classified,
          title: "Produto não resolvido",
          description: `${itemLabel}O produto desta venda pendente foi excluído do cadastro da loja. A venda não foi gravada no servidor.`,
          recommendedAction:
            "Recadastrar o código não recupera esta venda. Peça ao administrador para revisá-la em Vendas. Não finalize de novo.",
        }
      }
      return {
        class: classified,
        title: "Produto não resolvido",
        description: `${itemLabel}Um item desta venda pendente não casou com o cadastro da loja. A venda não foi gravada no servidor.`,
        recommendedAction:
          labels.length > 0
            ? "Regularize em Cadastros o produto com esse código e use Reenviar desta mesma venda. Não finalize de novo."
            : "Use Reenviar desta mesma venda para identificar o item; depois regularize o cadastro. Não finalize de novo.",
      }
    }
    case "CREDITO_VALE_INSUFICIENTE":
      return {
        class: classified,
        title: "Crédito/vale insuficiente",
        description: "O saldo de crédito no servidor não cobre esta venda.",
        recommendedAction: "Ajuste o pagamento e reenvie a mesma venda.",
      }
    default:
      break
  }
  if (classified === PENDING_SYNC_CLASS.AUTO_RETRY) {
    return {
      class: classified,
      title: "Falha de rede — tentando novamente",
      description: "O servidor ainda não confirmou. O sistema reenvia a mesma venda automaticamente.",
      recommendedAction: "Aguarde a sincronização ou use Reenviar da mesma venda.",
    }
  }
  if (typeof input.httpStatus === "number" && input.httpStatus >= 500) {
    return {
      class: classified,
      title: "Falha temporária do servidor",
      description: "O servidor não concluiu a gravação. A identidade da venda foi preservada.",
      recommendedAction: "Aguarde o reenvio automático ou use Reenviar da mesma venda.",
    }
  }
  return {
    class: classified,
    title: "Venda aguardando confirmação",
    description: "A venda está registrada neste terminal e ainda não foi confirmada pelo servidor.",
    recommendedAction: "Aguarde a sincronização ou use Reenviar da mesma venda. Não finalize de novo.",
  }
}

/**
 * Rótulos das linhas da PRÓPRIA venda cujo `inventoryId` o servidor não resolveu.
 * Nunca olha o carrinho atual: a referência vem da venda que falhou. Referência
 * devolvida pelo servidor sem linha correspondente aparece só como código.
 */
export function unresolvedSaleLineLabels(
  lines: ReadonlyArray<{ inventoryId?: string | null; name?: string | null }> | null | undefined,
  refs: readonly string[] | null | undefined,
): string[] {
  if (!refs || refs.length === 0) return []
  const wanted = new Set(refs.map((r) => r.trim()).filter(Boolean))
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines ?? []) {
    const ref = typeof line?.inventoryId === "string" ? line.inventoryId.trim() : ""
    if (!ref || !wanted.has(ref) || seen.has(ref)) continue
    seen.add(ref)
    const name = typeof line?.name === "string" ? line.name.trim() : ""
    out.push(name ? `${name} (código ${ref})` : `código ${ref}`)
  }
  for (const ref of wanted) if (!seen.has(ref)) out.push(`código ${ref}`)
  return out
}

/** Alguma linha não resolvida da venda carrega `produtoId` (⇒ produto excluído). */
export function unresolvedLinesCarryStableId(
  lines: ReadonlyArray<{ inventoryId?: string | null; produtoId?: string | null }> | null | undefined,
  refs: readonly string[] | null | undefined,
): boolean {
  if (!refs || refs.length === 0) return false
  const wanted = new Set(refs.map((r) => r.trim()))
  return (lines ?? []).some(
    (line) =>
      typeof line?.produtoId === "string" &&
      line.produtoId.trim() !== "" &&
      typeof line.inventoryId === "string" &&
      wanted.has(line.inventoryId.trim()),
  )
}

/** Desfecho FAILED da finalização: nada gravado, carrinho preservado para correção. */
export function unresolvedProductFinalizeReason(labels: readonly string[]): string {
  const alvo = labels.length > 0 ? labels.join(", ") : "um item do carrinho"
  return `Venda NÃO registrada — nada foi gravado no servidor. Sem cadastro válido nesta loja: ${alvo}. O catálogo foi recarregado: remova o item e adicione-o de novo pela busca (ou cadastre-o) e finalize novamente.`
}
