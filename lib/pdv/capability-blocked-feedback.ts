/**
 * N5-B1 (GAP-P2-03) — Fail-closed audível para capabilities de pagamento.
 *
 * `sales.paymentMethods` e `pdv.multiplePayments` desabilitadas continuam
 * fail-closed (nenhum fluxo abre, nenhum efeito acontece), mas o operador
 * recebe feedback operacional quando a ação bloqueada ainda é disparada
 * por teclado/race — em vez de um botão aparentemente quebrado.
 *
 * Regras:
 * - copy única compartilhada (feedback coerente nas 4 superfícies);
 * - cooldown por superfície: repetição de tecla/race não empilha toasts;
 * - nada em render — chamar SOMENTE dentro de handlers de evento;
 * - não altera defaults nem cria entitlement (só UX do bloqueio existente).
 */

export type BlockedPaymentCapability = "sales.paymentMethods" | "pdv.multiplePayments"

export const BLOCKED_PAYMENT_CAPABILITY_COPY: Record<
  BlockedPaymentCapability,
  { title: string; description: string }
> = {
  "sales.paymentMethods": {
    title: "Pagamento indisponível",
    description: "A finalização por pagamento está desabilitada neste PDV. Fale com o responsável pela loja.",
  },
  "pdv.multiplePayments": {
    title: "Pagamento múltiplo indisponível",
    description: "O pagamento em várias formas está desabilitado neste PDV. Finalize em uma única forma.",
  },
}

/** Cooldown padrão anti-spam de toast bloqueado (tecla repetida/race). */
export const BLOCKED_CAPABILITY_TOAST_COOLDOWN_MS = 2500

/**
 * Decide se o feedback do bloqueio deve ser emitido agora. Puro e
 * testável: o caller guarda `lastNotifiedAt` num ref e só chama `toast`
 * quando retornar true.
 */
export function shouldNotifyBlockedCapability(
  lastNotifiedAtMs: number,
  nowMs: number,
  cooldownMs: number = BLOCKED_CAPABILITY_TOAST_COOLDOWN_MS,
): boolean {
  if (!Number.isFinite(lastNotifiedAtMs) || !Number.isFinite(nowMs)) return true
  return nowMs - lastNotifiedAtMs >= cooldownMs
}
