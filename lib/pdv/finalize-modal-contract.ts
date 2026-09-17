/**
 * Contrato compartilhado da máquina de estados de finalização (N5-B1 R2).
 *
 * Fonte: GOAL PDV-PARITY-N5-B1-CORE-GAPS-001 (P2-06) — a revisão estrita da
 * tentativa a1 provou GAP real: o PaymentModal fechava durante a finalização
 * (Cancel/Esc/fora-click/onOpenChange), resetava o busy e permitia
 * close → reabrir → reconfirmar com o request anterior ainda em voo; após
 * PENDING, uma reconfirmação gerava NOVA identidade (`clientSaleId` novo no
 * motor N1) = segunda venda (estoque/financeiro/automação duplicados).
 *
 * Este módulo é o CONTRATO que o PaymentModal e as 4 superfícies oficiais
 * executam — os testes comportamentais (`parity-finalize-behavior.test.ts`)
 * exercitam ESTE código, não uma cópia. A idempotência N1 server-side
 * permanece a autoridade final; aqui não existe idempotência de negócio nova.
 */

/** Disposição da confirmação interpretada pelo modal. */
export type ConfirmOutcome = "confirmed" | "failed" | "indeterminate"

/**
 * Interpreta o retorno do `onConfirm` da superfície.
 *
 * - `true`  → CONFIRMED (ou PENDING já resolvido pela superfície): modal fecha.
 * - `false` → FAILED explícito: modal permanece aberto, busy liberado para
 *   nova tentativa consciente.
 * - `undefined`/`void` → indeterminado. Com `requireExplicitResult` (as 4
 *   superfícies oficiais passam `true`), indeterminado NUNCA é sucesso —
 *   tratado como FAILED com feedback próprio. Callers legados (Black) que
 *   ainda retornam `void` mantêm o comportamento pré-R2 (`requireExplicitResult`
 *   ausente = false) e migram depois, fora deste GOAL.
 */
export function resolveConfirmOutcome(
  success: boolean | void | undefined,
  requireExplicitResult: boolean,
): ConfirmOutcome {
  if (success === true) return "confirmed"
  if (success === false) return "failed"
  return requireExplicitResult ? "failed" : "confirmed"
}

/**
 * Fechamento do modal durante finalização em voo é recusado.
 * Enquanto `isConfirming`, Cancelar/X/Esc/clique-fora/onOpenChange NÃO fecham
 * o modal e NÃO resetam o busy — a única saída é o desfecho do request
 * (CONFIRMED fecha; FAILED libera). Único ponto de decisão usado pelo modal.
 */
export function refuseModalCloseWhileConfirming(isConfirming: boolean): boolean {
  return isConfirming
}

/** Copy do feedback de tentativa de fechar durante o voo (com cooldown no modal). */
export const FINALIZE_IN_FLIGHT_FEEDBACK = {
  title: "Finalização em andamento",
  description: "Aguarde a confirmação da venda — o fechamento fica bloqueado até o resultado.",
} as const

/**
 * Copy da orientação de retry quando há venda PENDENTE com identidade própria.
 * O mecanismo de retry é o existente (Vendas → Reenviar sync + auto-sync);
 * reconfirmar pelo PaymentModal criaria uma segunda identidade.
 */
export const PENDING_RETRY_GUIDANCE = {
  title: "Venda pendente de sincronização",
  description:
    "Esta venda já tem identidade registrada e está na fila de reenvio (Vendas → Reenviar sync). Confirme pelo modal só depois de resolver a pendência ou iniciar um carrinho novo.",
} as const

/** Identidade já criada pelo motor N1 para uma venda PENDING. */
export type PendingSaleIdentity = {
  /** `result.saleId` (ref provisória `PEND-…` ou id local). */
  id: string
  /** `clientSaleId` estável — a identidade que o retry/reenvio deve preservar. */
  clientSaleId?: string
}

/**
 * Registro de venda consultável para resolução canônica de pendência.
 * Fonte única: as vendas do operations-store (`syncPending` é o estado
 * canônico — CONFIRMED limpa `syncPending`; enquanto `true`, a identidade
 * original continua pendente). Nenhuma fila ou idempotência nova é criada.
 */
export type PendingResolutionSource = {
  id: string
  clientSaleId?: string
  syncPending?: boolean
}

/**
 * Guarda de identidade PENDING por superfície (sessão, em memória).
 *
 * Após um resultado PENDING a superfície registra o token; enquanto registrado
 * e ainda NÃO resolvido, abrir o modal de pagamento ou confirmar de novo é
 * BLOQUEADO (nova confirmação geraria `clientSaleId` novo no motor).
 *
 * N5-B1 GOAL 002 (R3): a identidade também VIAJA COM O ESTADO RESTAURÁVEL —
 * hold (`HeldSale.pendingIdentity`) e draft da Venda Completa
 * (`DraftData.pendingIdentity`) carregam o mesmo token; o resume/restore
 * re-registra no guard. Assim reload, hold/resume, fechar/reabrir modal e
 * re-render não perdem a proteção, e um hold legado (sem metadata) segue
 * válido. A referência só deixa de bloquear por resolução terminal canônica
 * (`syncPending` limpo no operations-store, avaliado por `isUnresolved`) ou
 * encerramento consciente do rascunho (limpar venda — `clear`). A venda
 * PENDING original nunca é apagada.
 */
export function createPendingSaleIdentityGuard() {
  let token: PendingSaleIdentity | null = null
  return {
    register(identity: PendingSaleIdentity): void {
      token = { id: identity.id, ...(identity.clientSaleId ? { clientSaleId: identity.clientSaleId } : {}) }
    },
    hasPending(): boolean {
      return token !== null
    },
    /** Identidade registrada — o retry/reenvio deve usar ESTA, sem recriar. */
    getIdentity(): PendingSaleIdentity | null {
      return token ? { ...token } : null
    },
    clear(): void {
      token = null
    },
    /**
     * Bloqueio EFETIVO contra a fonte canônica (`sales` do operations-store).
     * - sem token → liberado;
     * - registro não encontrado nas vendas da loja → conservadoramente
     *   bloqueado (BLOCKED_BY_EXISTING_IDENTITY — a venda PENDING original
     *   nunca é apagada);
     * - `syncPending === true` → bloqueado (identidade original ainda pendente);
     * - registro com `syncPending` limpo → resolução terminal canônica: libera
     *   e limpa o token (CONFIRMED libera estado).
     * O casamento espelha o operations-store (`s.id === saleId ||
     * s.clientSaleId === saleId`) — nunca cria segunda identidade.
     */
    isUnresolved(sales: PendingResolutionSource[]): boolean {
      if (!token) return false
      const registered = token
      const match = sales.find(
        (s) =>
          (registered.clientSaleId ? s.clientSaleId === registered.clientSaleId : false) ||
          s.id === registered.id,
      )
      if (!match) return true
      if (match.syncPending === true) return true
      token = null
      return false
    },
  }
}

export type FinalizeIntentGate = {
  /** Reivindica a única intenção de finalização em voo (clique/Enter/F-key). */
  begin(): boolean
  /** Libera após o desfecho (CONFIRMED/FAILED/PENDING). */
  end(): void
  isBusy(): boolean
}

/**
 * Gate síncrono de intenção de finalização: duplo clique / Enter duplo /
 * F-key repetida coalescem em UMA intenção em voo. Semântica do mutex
 * `claimSaleFinalizeLock` (Venda Completa), instancável para prova
 * comportamental e reuso no modal.
 */
export function createFinalizeIntentGate(): FinalizeIntentGate {
  let busy = false
  return {
    begin(): boolean {
      if (busy) return false
      busy = true
      return true
    },
    end(): void {
      busy = false
    },
    isBusy(): boolean {
      return busy
    },
  }
}
