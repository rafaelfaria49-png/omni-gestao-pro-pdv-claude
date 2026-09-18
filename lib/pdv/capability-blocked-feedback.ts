/**
 * Feedback fail-closed audível para capability desligada — N5-B1 R2 (P2-03).
 *
 * Fonte: audit GAP-P2-03 — `sales.paymentMethods` e `pdv.multiplePayments`
 * off retornavam `false`/`return` SEM toast e SEM `disabled` nas 4 bordas
 * (F12 morto, botão aparente). Contrato R2: nenhuma tentativa bloqueada que
 * alcance o handler cai em retorno silencioso — há feedback operacional claro,
 * com COOLDOWN por chave para não gerar toast loop/spam (F-key repetida,
 * clique insistente, race de teclado).
 */

export type BlockedAttemptNotifier = (feedback: { title: string; description?: string }) => void

export type CapabilityBlockedFeedback = {
  /** Emite o aviso da capability bloqueada (respeitando o cooldown da chave). */
  notifyBlocked(capabilityKey: string, feedback?: { title: string; description?: string }): void
  /** true se o aviso está dentro da janela de cooldown (prova de anti-spam). */
  isInCooldown(capabilityKey: string): boolean
  /** Avança o relógio em testes (injeção; produção usa Date.now). */
  readonly now: () => number
}

/** Janela anti-spam por chave — cobre repeat de teclado e cliques em rajada. */
export const BLOCKED_FEEDBACK_COOLDOWN_MS = 1500

/** Copy canônica por capability (as duas chaves do GAP-P2-03). */
export const CAPABILITY_BLOCKED_COPY: Record<string, { title: string; description: string }> = {
  "sales.paymentMethods": {
    title: "Pagamentos desabilitados",
    description: "A finalização de vendas está desabilitada para esta operação (capability sales.paymentMethods).",
  },
  "pdv.multiplePayments": {
    title: "Pagamento múltiplo indisponível",
    description: "A composição de várias formas está desabilitada para esta operação (capability pdv.multiplePayments).",
  },
}

export function createCapabilityBlockedFeedback(
  notify: BlockedAttemptNotifier,
  options?: { cooldownMs?: number; now?: () => number },
): CapabilityBlockedFeedback {
  const cooldownMs = options?.cooldownMs ?? BLOCKED_FEEDBACK_COOLDOWN_MS
  const now = options?.now ?? (() => Date.now())
  const lastEmittedAt = new Map<string, number>()
  return {
    notifyBlocked(capabilityKey, feedback) {
      const t = now()
      const last = lastEmittedAt.get(capabilityKey)
      if (last !== undefined && t - last < cooldownMs) return
      lastEmittedAt.set(capabilityKey, t)
      notify(feedback ?? CAPABILITY_BLOCKED_COPY[capabilityKey] ?? {
        title: "Ação indisponível",
        description: `Recurso desabilitado nesta operação (${capabilityKey}).`,
      })
    },
    isInCooldown(capabilityKey) {
      const last = lastEmittedAt.get(capabilityKey)
      if (last === undefined) return false
      return now() - last < cooldownMs
    },
    now,
  }
}
