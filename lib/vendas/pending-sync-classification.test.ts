import { describe, expect, it } from "vitest"
import {
  classifyPendingSyncFailure,
  pendingReasonView,
  PENDING_SYNC_CLASS,
  shouldAutoRetryPendingSync,
  STOCK_INVARIANT_DRIFT,
} from "./pending-sync-classification"

describe("classifyPendingSyncFailure", () => {
  it("STOCK_INVARIANT_DRIFT é ACTION_REQUIRED mesmo quando veio como 500 sem code", () => {
    expect(
      classifyPendingSyncFailure({
        httpStatus: 500,
        message: "[ops/venda-persist/v2] loja-1 [upsert-venda] baixa de estoque falhou: STOCK_INVARIANT_DRIFT Divergência estrutural: SUM(depósitos)=5 != Produto.stock=4.",
      }),
    ).toBe(PENDING_SYNC_CLASS.ACTION_REQUIRED)
    expect(
      shouldAutoRetryPendingSync({
        httpStatus: 500,
        message: "STOCK_INVARIANT_DRIFT Divergência estrutural",
      }),
    ).toBe(false)
  })

  it("409 determinístico não entra em retry infinito", () => {
    expect(shouldAutoRetryPendingSync({ httpStatus: 409, code: "ESTOQUE_INSUFICIENTE" })).toBe(false)
    expect(shouldAutoRetryPendingSync({ httpStatus: 409, code: "CAIXA_ORIGINAL_FECHADO" })).toBe(false)
    expect(shouldAutoRetryPendingSync({ httpStatus: 409, code: "CAIXA_FECHADO" })).toBe(false)
  })

  it("rede e 503 sem código de negócio continuam AUTO_RETRY", () => {
    expect(shouldAutoRetryPendingSync({ networkError: true })).toBe(true)
    expect(shouldAutoRetryPendingSync({ httpStatus: 503 })).toBe(true)
    expect(shouldAutoRetryPendingSync({ httpStatus: 500, message: "P2028 transaction timeout" })).toBe(true)
  })

  it("conflito de identidade é QUARANTINED", () => {
    expect(classifyPendingSyncFailure({ httpStatus: 409, code: "PEDIDO_ID_CONFLITO_MESMA_LOJA" })).toBe(
      PENDING_SYNC_CLASS.QUARANTINED,
    )
  })
})

describe("pendingReasonView", () => {
  it("mostra causa amigável de drift sem stack", () => {
    const view = pendingReasonView({
      httpStatus: 409,
      code: STOCK_INVARIANT_DRIFT,
    })
    expect(view.class).toBe(PENDING_SYNC_CLASS.ACTION_REQUIRED)
    expect(view.title).toMatch(/Estoque divergente/i)
    expect(view.description.toLowerCase()).not.toContain("stack")
    expect(view.recommendedAction).toMatch(/Reenviar/)
  })

  it("rede usa copy de auto-retry", () => {
    const view = pendingReasonView({ networkError: true })
    expect(view.class).toBe(PENDING_SYNC_CLASS.AUTO_RETRY)
    expect(view.title).toMatch(/rede/i)
  })
})
