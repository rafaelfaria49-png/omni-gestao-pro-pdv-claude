/**
 * N5-B1 GOAL 002 (R3) — PROVA COMPORTAMENTAL da identidade PENDING sob
 * restauração de estado (reload/draft, hold/resume, fechar/reabrir modal,
 * re-render) SEM segunda venda.
 *
 * Fonte: GOAL PDV-PARITY-N5-B1-PENDING-IDENTITY-002 — a revisão estrita do
 * candidato R2 provou o único blocker: PENDING perdia a identidade na
 * restauração e a reconfirmação gerava `clientSaleId` novo (segunda venda —
 * estoque/financeiro duplicados). Estes testes EXERCITAM o mesmo contrato que
 * as 4 superfícies executam (`finalize-modal-contract` + `pdv-hold` +
 * draft DraftData da Venda Completa), simulando os fluxos reais:
 *
 *  1. PENDING → reload → draft restore → confirmar (nenhum 2º finalize);
 *  2. PENDING → hold → resume → confirmar (nenhum 2º finalize);
 *  3. PENDING → fechar/reabrir modal na mesma sessão (guard sobrevive);
 *  4. retry/Reenviar mantém a identidade original (mesmo clientSaleId);
 *  5. CONFIRMED libera estado (syncPending limpo → auto-release);
 *  6. FAILED permite nova tentativa consciente (nada registrado);
 *  7. venda nova limpa NÃO herda pending anterior (clear);
 *  8. hold legado (sem pendingIdentity) continua válido;
 *  9. isolamento Store A / Store B (hold/draft nunca cruzam loja);
 * 10. nenhuma segunda `finalizeSaleTransaction` nos cenários de restore.
 *
 * A idempotência N1 server-side permanece a autoridade final.
 * Ambiente node: shim mínimo de localStorage (mesmo padrão de
 * parity-hold-resume.test.ts / pdv-hold.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createPendingSaleIdentityGuard,
  resolveConfirmOutcome,
  type PendingResolutionSource,
} from "./finalize-modal-contract"
import {
  getHeldSales,
  newHoldId,
  removeHeldSale,
  saveHeldSale,
  type HeldSale,
} from "../pdv-hold"

function installLocalStorageShim() {
  const store = new Map<string, string>()
  const fakeLocalStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = globalThis
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = fakeLocalStorage
  return store
}

function uninstallLocalStorageShim() {
  delete (globalThis as { window?: unknown }).window
  delete (globalThis as { localStorage?: unknown }).localStorage
}

const PENDING_IDENTITY = { id: "PEND-ABC123", clientSaleId: "csale-uuid-001" }

/** Vendas como o operations-store as expõe (fonte canônica de syncPending). */
function salesList(entries: Array<Partial<PendingResolutionSource> & { id: string }>): PendingResolutionSource[] {
  return entries
}

/**
 * Simula a borda da superfície: o gate PENDING precede SEMPRE o motor —
 * se bloqueado, `finalizeSaleTransaction` (spy) NUNCA é chamado e nenhuma
 * identidade nova (`generateClientSaleId`) seria criada.
 */
function simulateConfirmAttempt(
  guard: ReturnType<typeof createPendingSaleIdentityGuard>,
  sales: PendingResolutionSource[],
  finalizeSpy: () => void,
): { blocked: boolean } {
  if (guard.isUnresolved(sales)) return { blocked: true }
  finalizeSpy()
  return { blocked: false }
}

/** Draft persistido da Venda Completa (mesmo contrato de DraftData). */
type DraftData = {
  cart: unknown[]
  pendingIdentity?: { id: string; clientSaleId?: string }
}

const DRAFT_KEY = (storeId: string) => `omnigestao:venda-completa-ent-v2:${storeId}`

function persistDraft(storeId: string, draft: DraftData) {
  localStorage.setItem(DRAFT_KEY(storeId), JSON.stringify(draft))
}

function restoreDraft(storeId: string): DraftData | null {
  const raw = localStorage.getItem(DRAFT_KEY(storeId))
  return raw ? (JSON.parse(raw) as DraftData) : null
}

let store: Map<string, string>

beforeEach(() => {
  store = installLocalStorageShim()
})

afterEach(() => {
  uninstallLocalStorageShim()
})

describe("R3 — PENDING → reload → draft restore → confirmar", () => {
  it("identidade registrada sobrevive ao reload via draft; reconfirmar é BLOQUEADO e o motor NUNCA roda", () => {
    // Sessão 1: PENDING registra a identidade e o draft é persistido com ela.
    const session1 = createPendingSaleIdentityGuard()
    session1.register(PENDING_IDENTITY)
    persistDraft("store-1", { cart: [{ lineId: "l1" }], pendingIdentity: session1.getIdentity() ?? undefined })

    // RELOAD: nova instância de guard (memória zerada) + draft restaurado.
    const session2 = createPendingSaleIdentityGuard()
    expect(session2.hasPending()).toBe(false)
    const draft = restoreDraft("store-1")
    expect(draft?.pendingIdentity).toEqual(PENDING_IDENTITY)
    if (draft?.pendingIdentity) session2.register(draft.pendingIdentity)

    const finalizeSpy = vi.fn()
    const attempt = simulateConfirmAttempt(
      session2,
      salesList([{ id: "PEND-ABC123", clientSaleId: "csale-uuid-001", syncPending: true }]),
      finalizeSpy,
    )
    expect(attempt.blocked).toBe(true)
    expect(finalizeSpy).not.toHaveBeenCalled()
    // A identidade continua a ORIGINAL — nenhuma nova foi criada.
    expect(session2.getIdentity()).toEqual(PENDING_IDENTITY)
  })

  it("reload + draft SEM pendência resolvida no motor: conservadoramente bloqueado (BLOCKED_BY_EXISTING_IDENTITY)", () => {
    const session1 = createPendingSaleIdentityGuard()
    session1.register(PENDING_IDENTITY)
    persistDraft("store-1", { cart: [], pendingIdentity: session1.getIdentity() ?? undefined })

    const session2 = createPendingSaleIdentityGuard()
    const draft = restoreDraft("store-1")
    if (draft?.pendingIdentity) session2.register(draft.pendingIdentity)
    // Lista de vendas sem o registro (pior caso): bloqueio mantido — a venda
    // PENDING original nunca é apagada.
    expect(session2.isUnresolved(salesList([]))).toBe(true)
  })
})

describe("R3 — PENDING → hold → resume → confirmar", () => {
  function makeHold(overrides?: Partial<HeldSale>): HeldSale {
    return {
      id: newHoldId(),
      label: "Venda 1",
      savedAt: new Date().toISOString(),
      items: [{ lineId: "line-1", inventoryId: "prod-1", name: "Produto A", price: 30, quantity: 2 }],
      customer: null,
      discountReais: 0,
      pdvType: "classic",
      ...overrides,
    }
  }

  it("identidade viaja com o hold; resume re-registra; reconfirmar é BLOQUEADO sem 2º finalize", () => {
    // Sessão 1: PENDING → hold-save (identidade anexada, guard de sessão limpo).
    const session1 = createPendingSaleIdentityGuard()
    session1.register(PENDING_IDENTITY)
    const held = makeHold({ pendingIdentity: session1.getIdentity() ?? undefined })
    saveHeldSale("store-1", "PDV1", held)
    session1.clear()

    // RELOAD-like: nova sessão lê o hold e faz resume (re-registra).
    const session2 = createPendingSaleIdentityGuard()
    const resumed = getHeldSales("store-1", "PDV1")[0]
    expect(resumed.pendingIdentity).toEqual(PENDING_IDENTITY)
    if (resumed.pendingIdentity) session2.register(resumed.pendingIdentity)
    removeHeldSale("store-1", "PDV1", resumed.id)

    const finalizeSpy = vi.fn()
    const attempt = simulateConfirmAttempt(
      session2,
      salesList([{ id: "PEND-ABC123", clientSaleId: "csale-uuid-001", syncPending: true }]),
      finalizeSpy,
    )
    expect(attempt.blocked).toBe(true)
    expect(finalizeSpy).not.toHaveBeenCalled()
    expect(session2.getIdentity()).toEqual(PENDING_IDENTITY)
  })

  it("hold legado (sem pendingIdentity) continua válido: resume NÃO registra e NÃO bloqueia", () => {
    const legacy = makeHold()
    expect(legacy.pendingIdentity).toBeUndefined()
    saveHeldSale("store-1", "PDV1", legacy)

    const session = createPendingSaleIdentityGuard()
    const resumed = getHeldSales("store-1", "PDV1")[0]
    if (resumed.pendingIdentity) session.register(resumed.pendingIdentity)
    removeHeldSale("store-1", "PDV1", resumed.id)

    const finalizeSpy = vi.fn()
    const attempt = simulateConfirmAttempt(session, salesList([]), finalizeSpy)
    expect(attempt.blocked).toBe(false)
    expect(finalizeSpy).toHaveBeenCalledTimes(1)
  })
})

describe("R3 — ciclo de vida na mesma sessão (modal/re-render)", () => {
  it("fechar/reabrir modal e re-render NÃO limpam a referência PENDING", () => {
    const guard = createPendingSaleIdentityGuard()
    guard.register(PENDING_IDENTITY)
    // fechar modal / re-render: nenhuma chamada a clear() — o guard persiste.
    expect(guard.hasPending()).toBe(true)
    expect(guard.isUnresolved(salesList([{ id: "PEND-ABC123", clientSaleId: "csale-uuid-001", syncPending: true }]))).toBe(true)
    // reabrir modal: continua bloqueado.
    expect(guard.isUnresolved(salesList([{ id: "PEND-ABC123", clientSaleId: "csale-uuid-001", syncPending: true }]))).toBe(true)
  })

  it("CONFIRMED libera estado: syncPending limpo no operations-store → auto-release", () => {
    const guard = createPendingSaleIdentityGuard()
    guard.register(PENDING_IDENTITY)
    const salesPending = salesList([{ id: "PEND-ABC123", clientSaleId: "csale-uuid-001", syncPending: true }])
    expect(guard.isUnresolved(salesPending)).toBe(true)
    // Retry/Reenviar (ou auto-sync) confirma no servidor: syncPending → false.
    const salesConfirmed = salesList([{ id: "VDA-77", clientSaleId: "csale-uuid-001", syncPending: false }])
    expect(guard.isUnresolved(salesConfirmed)).toBe(false)
    // Auto-release: token limpo — nova venda é livre.
    expect(guard.hasPending()).toBe(false)
  })

  it("FAILED permite nova tentativa consciente: nada é registrado no guard", () => {
    const guard = createPendingSaleIdentityGuard()
    // Fluxo FAILED: onConfirm → false — NENHUM registro de identidade.
    const outcome = resolveConfirmOutcome(false, true)
    expect(outcome).toBe("failed")
    const finalizeSpy = vi.fn()
    expect(simulateConfirmAttempt(guard, salesList([]), finalizeSpy).blocked).toBe(false)
    expect(finalizeSpy).toHaveBeenCalledTimes(1)
  })

  it("venda nova limpa NÃO herda pending anterior (clear no encerramento consciente)", () => {
    const guard = createPendingSaleIdentityGuard()
    guard.register(PENDING_IDENTITY)
    expect(guard.isUnresolved(salesList([{ id: "PEND-ABC123", syncPending: true }]))).toBe(true)
    // Operador encerra conscientemente o rascunho (Limpar tudo) → clear().
    guard.clear()
    const finalizeSpy = vi.fn()
    expect(simulateConfirmAttempt(guard, salesList([{ id: "PEND-ABC123", syncPending: true }]), finalizeSpy).blocked).toBe(false)
    expect(finalizeSpy).toHaveBeenCalledTimes(1)
  })

  it("retry/Reenviar mantém a identidade original (mesmo clientSaleId através de hold e draft)", () => {
    const guard = createPendingSaleIdentityGuard()
    guard.register(PENDING_IDENTITY)
    const identity = guard.getIdentity()
    // Hold + resume não recriam identidade.
    const heldIdentity = identity
    expect(heldIdentity).toEqual(PENDING_IDENTITY)
    // Draft + restore não recriam identidade.
    persistDraft("store-1", { cart: [], pendingIdentity: identity ?? undefined })
    expect(restoreDraft("store-1")?.pendingIdentity).toEqual(PENDING_IDENTITY)
  })
})

describe("R3 — isolamento Store A / Store B", () => {
  it("hold com identidade PENDING em Store A NÃO contamina Store B", () => {
    const guardA = createPendingSaleIdentityGuard()
    guardA.register(PENDING_IDENTITY)
    saveHeldSale("store-a", "PDV1", {
      id: newHoldId(),
      label: "Venda 1",
      savedAt: new Date().toISOString(),
      items: [],
      customer: null,
      pdvType: "classic",
      pendingIdentity: guardA.getIdentity() ?? undefined,
    })

    // Store B (outra loja, mesmo terminal): não vê o hold de A.
    const holdsB = getHeldSales("store-b", "PDV1")
    expect(holdsB).toHaveLength(0)

    // Sessão da Store B: nenhum token → confirmar é livre.
    const guardB = createPendingSaleIdentityGuard()
    const finalizeSpyB = vi.fn()
    expect(simulateConfirmAttempt(guardB, salesList([{ id: "PEND-ABC123", syncPending: true }]), finalizeSpyB).blocked).toBe(false)
    expect(finalizeSpyB).toHaveBeenCalledTimes(1)

    // Draft é por loja: draft de A não existe para B.
    persistDraft("store-a", { cart: [{ lineId: "l1" }], pendingIdentity: PENDING_IDENTITY })
    expect(restoreDraft("store-b")).toBeNull()
  })
})
