/**
 * Classificação operacional da pendência de venda.
 *
 * PENDING não é CONFIRMED. O auto-retry só cobre falha recuperável.
 * Falha determinística (409 de negócio, drift estrutural, caixa original
 * fechado) é ACTION_REQUIRED — nunca vira retry infinito.
 */

export const PENDING_SYNC_CLASS = {
  AUTO_RETRY: "AUTO_RETRY",
  ACTION_REQUIRED: "ACTION_REQUIRED",
  QUARANTINED: "QUARANTINED",
  CONFIRMED: "CONFIRMED",
} as const

export type PendingSyncClass = (typeof PENDING_SYNC_CLASS)[keyof typeof PENDING_SYNC_CLASS]

export const STOCK_INVARIANT_DRIFT = "STOCK_INVARIANT_DRIFT"

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
    case STOCK_INVARIANT_DRIFT:
      return {
        class: classified,
        title: "Estoque divergente — requer revisão",
        description: "O saldo do produto não fecha com os depósitos. A venda não foi gravada no servidor.",
        recommendedAction: "Não reenviar em loop. Revise o estoque deste item e use Reenviar da mesma venda.",
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
    case "PRODUTO_NAO_RESOLVIDO":
      return {
        class: classified,
        title: "Produto não resolvido",
        description: "Um item do carrinho não casou com o cadastro da loja.",
        recommendedAction: "Revise o item e reenvie a mesma venda.",
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
