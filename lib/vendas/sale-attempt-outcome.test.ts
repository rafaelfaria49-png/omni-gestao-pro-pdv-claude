/**
 * PDV-CADASTROS-SYNC-AUTOMATICO-001 — taxonomia do desfecho de uma tentativa de gravar a
 * venda: confirmada, recusada (definitiva), desconhecida, ação necessária e quarentena.
 */
import { describe, expect, it } from "vitest"
import {
  classifySaleAttemptOutcome,
  definitiveRejectionFinalizeReason,
  DEFINITIVE_REJECTION_CODES,
  finalizeFailureDisposition,
  shouldAutoRetryPendingSync,
} from "./pending-sync-classification"

describe("classifySaleAttemptOutcome", () => {
  it("2xx = CONFIRMED", () => {
    expect(classifySaleAttemptOutcome({ ok: true, httpStatus: 200 })).toBe("CONFIRMED")
  })

  it.each([...DEFINITIVE_REJECTION_CODES])("409 %s = REJECTED (nada gravado)", (code) => {
    expect(classifySaleAttemptOutcome({ ok: false, code, httpStatus: 409 })).toBe("REJECTED")
  })

  it("rede, timeout e 5xx = UNKNOWN (pode ter gravado; só a mesma identidade tenta de novo)", () => {
    expect(classifySaleAttemptOutcome({ ok: false, networkError: true })).toBe("UNKNOWN")
    expect(classifySaleAttemptOutcome({ ok: false, httpStatus: 503 })).toBe("UNKNOWN")
    expect(classifySaleAttemptOutcome({ ok: false })).toBe("UNKNOWN")
    // Mesmo com código conhecido, rede/5xx nunca vira recusa definitiva.
    expect(classifySaleAttemptOutcome({ ok: false, code: "ESTOQUE_INSUFICIENTE", networkError: true })).toBe("UNKNOWN")
    expect(classifySaleAttemptOutcome({ ok: false, code: "ESTOQUE_INSUFICIENTE", httpStatus: 500 })).toBe("UNKNOWN")
  })

  it("conflito de identidade = QUARANTINED", () => {
    expect(classifySaleAttemptOutcome({ ok: false, code: "PEDIDO_ID_DE_OUTRA_LOJA", httpStatus: 409 })).toBe("QUARANTINED")
  })

  it("drift de estoque e caixa original fechado ficam como ação necessária (reenvio da mesma venda)", () => {
    expect(classifySaleAttemptOutcome({ ok: false, code: "STOCK_INVARIANT_DRIFT", httpStatus: 409 })).toBe("ACTION_REQUIRED")
    expect(classifySaleAttemptOutcome({ ok: false, code: "CAIXA_ORIGINAL_FECHADO", httpStatus: 409 })).toBe("ACTION_REQUIRED")
    expect(classifySaleAttemptOutcome({ ok: false, code: "QUALQUER_OUTRO", httpStatus: 409 })).toBe("ACTION_REQUIRED")
  })

  it("recusas definitivas nunca entram em auto-retry", () => {
    for (const code of DEFINITIVE_REJECTION_CODES) {
      expect(shouldAutoRetryPendingSync({ code, httpStatus: 409 })).toBe(false)
    }
  })
})

describe("finalizeFailureDisposition (decisão executada pelo operations-store)", () => {
  it("venda nova + recusa definitiva → FAILED (carrinho volta, próxima venda livre)", () => {
    expect(finalizeFailureDisposition({ code: "ESTOQUE_INSUFICIENTE", httpStatus: 409, reusedIdentity: false })).toBe("FAILED")
    expect(finalizeFailureDisposition({ code: "PRODUTO_NAO_RESOLVIDO", httpStatus: 409, reusedIdentity: false })).toBe("FAILED")
  })

  it("identidade reaproveitada (pode estar PENDING em outra aba) nunca é descartada", () => {
    expect(finalizeFailureDisposition({ code: "ESTOQUE_INSUFICIENTE", httpStatus: 409, reusedIdentity: true })).toBe("PENDING")
  })

  it("rede, 5xx e ação necessária seguem PENDING com a mesma identidade", () => {
    expect(finalizeFailureDisposition({ networkError: true, reusedIdentity: false })).toBe("PENDING")
    expect(finalizeFailureDisposition({ code: "ESTOQUE_INSUFICIENTE", httpStatus: 503, reusedIdentity: false })).toBe("PENDING")
    expect(finalizeFailureDisposition({ code: "STOCK_INVARIANT_DRIFT", httpStatus: 409, reusedIdentity: false })).toBe("PENDING")
    expect(finalizeFailureDisposition({ code: "PEDIDO_ID_DE_OUTRA_LOJA", httpStatus: 409, reusedIdentity: false })).toBe("PENDING")
  })
})

describe("definitiveRejectionFinalizeReason", () => {
  it("é honesto: venda não registrada e o próximo passo", () => {
    expect(definitiveRejectionFinalizeReason("ESTOQUE_INSUFICIENTE", [])).toMatch(/^Venda NÃO registrada — nada foi gravado no servidor\. Estoque insuficiente/)
    expect(definitiveRejectionFinalizeReason("CAIXA_FECHADO", [])).toContain("Abra o caixa")
    expect(definitiveRejectionFinalizeReason("PRODUTO_NAO_RESOLVIDO", ["X (código Y)"])).toContain("X (código Y)")
    expect(definitiveRejectionFinalizeReason("LINHAS_VENDA_INVALIDAS", [], "Linha 2 sem produto.")).toContain("Linha 2 sem produto.")
  })
})
