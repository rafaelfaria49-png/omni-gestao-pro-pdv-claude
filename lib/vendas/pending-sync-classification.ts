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

/**
 * Códigos do CLIENTE (PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001) — o servidor não os emite:
 * - `AUTH_REQUIRED`: 401 sem código (sessão expirada). Nada gravado; volta a tentar
 *   sozinho, com backoff, quando houver sessão válida.
 * - `PERMISSION_DENIED`: 403 sem código. Nada gravado; exige usuário com permissão.
 * - `RESPOSTA_INCONCLUSIVA`: 2xx sem prova da venda no corpo. NÃO é sucesso.
 * - `SEM_CONEXAO`: tentativa recusada localmente porque o navegador está offline.
 */
export const AUTH_REQUIRED = "AUTH_REQUIRED"
export const PERMISSION_DENIED = "PERMISSION_DENIED"
export const INCONCLUSIVE_RESPONSE = "RESPOSTA_INCONCLUSIVA"
export const OFFLINE_CODE = "SEM_CONEXAO"

/** Transitórios por natureza: mesma identidade, reenvio automático com backoff. */
const AUTO_RETRY_CODES = new Set([AUTH_REQUIRED, INCONCLUSIVE_RESPONSE, OFFLINE_CODE])

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
  PERMISSION_DENIED,
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
  if (code && AUTO_RETRY_CODES.has(code)) return PENDING_SYNC_CLASS.AUTO_RETRY
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
        description: "O saldo de crédito no servidor não cobre esta venda. Nada foi gravado.",
        recommendedAction:
          "O pagamento não é alterado automaticamente. Regularize o saldo do cliente com o administrador e use Reenviar da mesma venda.",
      }
    case "PAGAMENTOS_TOTAL_DIVERGENTE":
      return {
        class: classified,
        title: "Pagamento divergente do total",
        description: "A soma das formas de pagamento desta venda não fecha com o total. Nada foi gravado.",
        recommendedAction:
          "Valor e pagamento não são alterados sem o operador. Peça ao administrador para revisar esta venda em Vendas. Não finalize de novo.",
      }
    case AUTH_REQUIRED:
      return {
        class: classified,
        title: "Sessão expirada",
        description: "O servidor não aceitou a sessão deste navegador. Nada foi gravado; a venda continua preservada neste terminal.",
        recommendedAction: "Entre novamente no sistema. O envio da MESMA venda recomeça sozinho depois do login.",
      }
    case PERMISSION_DENIED:
      return {
        class: classified,
        title: "Sem permissão para registrar a venda",
        description: "O usuário atual não pode registrar vendas nesta loja. Nada foi gravado.",
        recommendedAction: "Entre com um usuário com acesso a Vendas desta loja e use Reenviar da mesma venda.",
      }
    case INCONCLUSIVE_RESPONSE:
      return {
        class: classified,
        title: "Resposta sem confirmação",
        description: "A conexão respondeu, mas sem a prova da venda no servidor (rede instável ou portal de Wi-Fi). A venda NÃO foi marcada como sincronizada.",
        recommendedAction: "Aguarde: o sistema verifica a mesma venda sozinho. Ou use Reenviar da mesma venda.",
      }
    case OFFLINE_CODE:
      return {
        class: classified,
        title: "Sem conexão",
        description: "Este navegador está sem internet. A venda está registrada só neste terminal e ainda não foi confirmada.",
        recommendedAction: "Quando a conexão voltar o envio é automático. Não limpe os dados do navegador.",
      }
    case "CLIENT_SALE_ID_REQUIRED":
    case "IDEMPOTENCY_KEY_REUSED":
    case "IDEMPOTENCY_CONFLICT":
      return {
        class: classified,
        title: "Identificação da venda recusada",
        description:
          "O servidor recusou a chave técnica desta venda (ausente ou já usada por outro conteúdo). Nenhuma venda foi sobrescrita e nenhuma identidade nova é criada.",
        recommendedAction: "Não finalize de novo. Peça ao administrador para revisar esta venda em Vendas.",
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

/**
 * Rejeições DEFINITIVAS do writer (PDV-CADASTROS-SYNC-AUTOMATICO-001): todas lançadas dentro
 * da transação da venda, antes do commit — nada é gravado (número, venda, estoque, caixa,
 * financeiro). Para uma identidade criada na própria finalização isso prova que a venda não
 * existe: o desfecho é RECUSADA (FAILED, carrinho volta para correção), não PENDING — que
 * congelava o payload e travava as próximas vendas com a guarda de identidade.
 * Fora daqui, de propósito: rede/5xx (resultado DESCONHECIDO — mesma identidade é reenviada),
 * drift de estoque (o reenvio da mesma venda reconcilia) e conflito de identidade (quarentena).
 */
export const DEFINITIVE_REJECTION_CODES: ReadonlySet<string> = new Set([
  UNRESOLVED_PRODUCT_CODE,
  "ESTOQUE_INSUFICIENTE",
  "PAGAMENTOS_TOTAL_DIVERGENTE",
  "LINHAS_VENDA_INVALIDAS",
  "FRACTIONAL_QUANTITY_UNSUPPORTED",
  "PRODUTO_POR_PESO_NAO_OPERACIONAL",
  "PRODUTO_COMERCIAL_INVALIDO",
  "CREDITO_VALE_INSUFICIENTE",
  "CAIXA_FECHADO",
  "SESSAO_INVALIDA",
])

export type SaleAttemptOutcome = "CONFIRMED" | "REJECTED" | "UNKNOWN" | "ACTION_REQUIRED" | "QUARANTINED"

/**
 * Desfecho de UMA tentativa de gravar a venda:
 * - CONFIRMED: servidor confirmou (2xx);
 * - REJECTED: recusa definitiva antes do commit (4xx com código de `DEFINITIVE_REJECTION_CODES`);
 * - UNKNOWN: rede/timeout/5xx — pode ter gravado; só a mesma identidade pode tentar de novo;
 * - QUARANTINED: conflito de identidade;
 * - ACTION_REQUIRED: demais 4xx de negócio (ex.: caixa original fechado, drift).
 */
export function classifySaleAttemptOutcome(input: {
  ok: boolean
  code?: string | null
  httpStatus?: number
  networkError?: boolean
}): SaleAttemptOutcome {
  if (input.ok) return "CONFIRMED"
  const code = typeof input.code === "string" ? input.code.trim() : ""
  if (code && QUARANTINE_CODES.has(code)) return "QUARANTINED"
  if (input.networkError === true) return "UNKNOWN"
  const status = input.httpStatus
  if (typeof status !== "number" || status >= 500) return "UNKNOWN"
  if (status >= 400 && code && DEFINITIVE_REJECTION_CODES.has(code)) return "REJECTED"
  return "ACTION_REQUIRED"
}

/**
 * Desfecho da finalização quando o servidor NÃO confirmou. FAILED só para recusa definitiva de
 * identidade criada nesta chamada; identidade reaproveitada (pode estar PENDING em outra aba),
 * rede/5xx e demais 4xx seguem PENDING com a mesma identidade.
 */
export function finalizeFailureDisposition(input: {
  code?: string | null
  httpStatus?: number
  networkError?: boolean
  reusedIdentity: boolean
}): "FAILED" | "PENDING" {
  const outcome = classifySaleAttemptOutcome({
    ok: false,
    code: input.code,
    httpStatus: input.httpStatus,
    networkError: input.networkError,
  })
  return outcome === "REJECTED" && !input.reusedIdentity ? "FAILED" : "PENDING"
}

const REJECTION_GUIDANCE: Record<string, string> = {
  ESTOQUE_INSUFICIENTE: "Estoque insuficiente no servidor para um item. Ajuste a quantidade e finalize novamente.",
  PAGAMENTOS_TOTAL_DIVERGENTE: "A soma das formas de pagamento difere do total. Revise os valores e finalize novamente.",
  CREDITO_VALE_INSUFICIENTE: "O saldo de crédito/vale no servidor não cobre a venda. Reaplique o pagamento e finalize novamente.",
  CAIXA_FECHADO: "Não há caixa aberto válido neste terminal. Abra o caixa e finalize novamente.",
  SESSAO_INVALIDA: "Não há caixa aberto válido neste terminal. Abra o caixa e finalize novamente.",
}

/** Mensagem do desfecho RECUSADA (nada gravado; carrinho preservado). */
export function definitiveRejectionFinalizeReason(code: string, labels: readonly string[], serverMessage?: string): string {
  if (code === UNRESOLVED_PRODUCT_CODE) return unresolvedProductFinalizeReason(labels)
  const guidance = REJECTION_GUIDANCE[code] ?? `${(serverMessage ?? "").trim() || "O servidor recusou a venda."} Corrija e finalize novamente.`
  return `Venda NÃO registrada — nada foi gravado no servidor. ${guidance}`
}
