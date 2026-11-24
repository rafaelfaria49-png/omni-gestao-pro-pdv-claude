import { describe, expect, it } from "vitest"
import { classifySaleAttemptOutcome, finalizeFailureDisposition, shouldAutoRetryPendingSync } from "@/lib/vendas/pending-sync-classification"

describe("recusa de variante e preservação de identidade pendente", () => {
  it.each(["VARIANTE_OBRIGATORIA", "VESTUARIO_NAO_OPERACIONAL", "CONTRATO_VARIACAO_INVALIDO"])("%s antes do commit deixa carrinho novo corrigível", (code) => {
    expect(classifySaleAttemptOutcome({ ok: false, httpStatus: 409, code })).toBe("REJECTED")
    expect(finalizeFailureDisposition({ httpStatus: 409, code, reusedIdentity: false })).toBe("FAILED")
    expect(shouldAutoRetryPendingSync({ httpStatus: 409, code })).toBe(false)
  })
  it.each(["VARIANTE_OBRIGATORIA", "VESTUARIO_NAO_OPERACIONAL", "CONTRATO_VARIACAO_INVALIDO"])("%s não apaga tentativa reaproveitada cujo resultado anterior pode ser desconhecido", (code) => {
    expect(finalizeFailureDisposition({ httpStatus: 409, code, reusedIdentity: true })).toBe("PENDING")
    expect(classifySaleAttemptOutcome({ ok: false, httpStatus: 500, code })).toBe("UNKNOWN")
    expect(classifySaleAttemptOutcome({ ok: false, networkError: true, code })).toBe("UNKNOWN")
  })
})
