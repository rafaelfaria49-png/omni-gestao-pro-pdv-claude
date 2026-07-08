import { describe, expect, it } from "vitest"
import {
  DEFAULT_OMNI_AGENT_CONFIG,
  OMNI_AGENT_CONFIRMABLE_READ_INTENTS,
  omniAgentNeedsConfirmation,
  sanitizeAutonomyLevel,
  sanitizeBusinessHoursDays,
  sanitizeExtraConfirmIntents,
  sanitizeTone,
} from "./config"

describe("sanitizeExtraConfirmIntents", () => {
  it("mantém apenas intenções de leitura elegíveis", () => {
    expect(sanitizeExtraConfirmIntents(["CASHBOX_QUERY", "OS_OPEN", "PRODUCT_SEARCH", "BOGUS"])).toEqual([
      "CASHBOX_QUERY",
      "PRODUCT_SEARCH",
    ])
  })

  it("nunca inclui intenções de escrita, mesmo se enviadas", () => {
    const result = sanitizeExtraConfirmIntents(["OS_OPEN", "REMINDER_CREATE", "EXPENSE_CREATE", "RECEIVABLE_CREATE"])
    expect(result).toEqual([])
  })
})

describe("sanitizeBusinessHoursDays", () => {
  it("filtra dias inválidos", () => {
    expect(sanitizeBusinessHoursDays(["seg", "xyz", "dom"])).toEqual(["seg", "dom"])
  })
})

describe("sanitizeTone / sanitizeAutonomyLevel", () => {
  it("usa fallback quando valor é inválido ou ausente", () => {
    expect(sanitizeTone("agressivo", DEFAULT_OMNI_AGENT_CONFIG.tone)).toBe(DEFAULT_OMNI_AGENT_CONFIG.tone)
    expect(sanitizeTone(undefined, DEFAULT_OMNI_AGENT_CONFIG.tone)).toBe(DEFAULT_OMNI_AGENT_CONFIG.tone)
    expect(sanitizeTone("formal", DEFAULT_OMNI_AGENT_CONFIG.tone)).toBe("formal")

    expect(sanitizeAutonomyLevel("extremo", "medio")).toBe("medio")
    expect(sanitizeAutonomyLevel("alto", "medio")).toBe("alto")
  })
})

describe("omniAgentNeedsConfirmation", () => {
  const baseConfig = { autonomyLevel: "medio", extraConfirmIntents: [] as const }

  it("exige confirmação para escritas independentemente da config", () => {
    expect(
      omniAgentNeedsConfirmation({ intent: "OS_OPEN", requiresConfirmation: true }, { ...baseConfig, extraConfirmIntents: [] }),
    ).toBe(true)
    expect(
      omniAgentNeedsConfirmation(
        { intent: "OS_OPEN", requiresConfirmation: true },
        { autonomyLevel: "alto", extraConfirmIntents: [] },
      ),
    ).toBe(true)
  })

  it("não exige confirmação para leituras por padrão (autonomia média, sem extras)", () => {
    expect(
      omniAgentNeedsConfirmation(
        { intent: "CASHBOX_QUERY", requiresConfirmation: false },
        { autonomyLevel: "medio", extraConfirmIntents: [] },
      ),
    ).toBe(false)
  })

  it("exige confirmação para leitura marcada em extraConfirmIntents", () => {
    expect(
      omniAgentNeedsConfirmation(
        { intent: "CASHBOX_QUERY", requiresConfirmation: false },
        { autonomyLevel: "medio", extraConfirmIntents: ["CASHBOX_QUERY"] },
      ),
    ).toBe(true)
  })

  it("autonomia baixo força confirmação em toda leitura confirmável, mesmo sem extras", () => {
    for (const intent of OMNI_AGENT_CONFIRMABLE_READ_INTENTS) {
      expect(
        omniAgentNeedsConfirmation({ intent, requiresConfirmation: false }, { autonomyLevel: "baixo", extraConfirmIntents: [] }),
      ).toBe(true)
    }
  })

  it("autonomia alto nunca reduz a exigência de confirmação de escritas", () => {
    expect(
      omniAgentNeedsConfirmation(
        { intent: "REMINDER_CREATE", requiresConfirmation: true },
        { autonomyLevel: "alto", extraConfirmIntents: [] },
      ),
    ).toBe(true)
  })
})
