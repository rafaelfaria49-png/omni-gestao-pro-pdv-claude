import { describe, it, expect } from "vitest"
import type { Session } from "next-auth"
import {
  looksLikeOperatorId,
  operatorDisplayName,
  pdvOperatorReceiptLabel,
  sanitizeOperatorLabel,
} from "./pdv-operator-label"

const sessionWith = (user: Partial<NonNullable<Session["user"]>> | null): Session | null =>
  user ? ({ user, expires: "" } as Session) : null

describe("operatorDisplayName — fonte única do operador (apresentação)", () => {
  it("1ª prioridade: nome informado na abertura do caixa", () => {
    expect(
      operatorDisplayName({ aberturaNome: "Rafael", session: sessionWith({ name: "Outro" }) }),
    ).toBe("Rafael")
  })

  it("preserva exatamente o texto informado na abertura (ex.: 'Admin Rafael')", () => {
    expect(operatorDisplayName({ aberturaNome: "Admin Rafael" })).toBe("Admin Rafael")
  })

  it("preserva rótulo de posto (ex.: 'Caixa 1')", () => {
    expect(operatorDisplayName({ aberturaNome: "Caixa 1" })).toBe("Caixa 1")
  })

  it("ignora abertura só com espaços e cai para a sessão", () => {
    expect(
      operatorDisplayName({ aberturaNome: "   ", session: sessionWith({ name: "Rafael" }) }),
    ).toBe("Rafael")
  })

  it("2ª prioridade: nome do usuário autenticado quando não há abertura", () => {
    expect(operatorDisplayName({ session: sessionWith({ name: "Rafael Faria" }) })).toBe(
      "Rafael Faria",
    )
  })

  it("3ª prioridade: prefixo do e-mail autenticado", () => {
    expect(
      operatorDisplayName({ session: sessionWith({ email: "rafael@rafacell.com.br" }) }),
    ).toBe("rafael")
  })

  it("fallback honesto: nunca expõe id quando não há fonte identificável", () => {
    expect(operatorDisplayName({ aberturaNome: null, session: null })).toBe(
      "Operador não identificado",
    )
  })

  it("jamais retorna um UUID de dispositivo (cashierId)", () => {
    const uuid = "aa6402dc-1234-4f00-8a1b-000000000000"
    const out = operatorDisplayName({ aberturaNome: null, session: sessionWith({ name: "Rafael" }) })
    expect(out).not.toContain(uuid)
    expect(out).toBe("Rafael")
  })
})

describe("pdvOperatorReceiptLabel — base de fallback (sessão)", () => {
  it("sem nome e sem e-mail → rótulo honesto, não id", () => {
    expect(pdvOperatorReceiptLabel(null)).toBe("Operador não identificado")
  })
})

describe("looksLikeOperatorId — detector de id técnico (cashierId)", () => {
  it("reconhece UUID do crypto.randomUUID()", () => {
    expect(looksLikeOperatorId("aa6402dc-1234-4f00-8a1b-000000000000")).toBe(true)
  })

  it("reconhece o fallback timestamp-hash (${Date.now()}-${hex})", () => {
    expect(looksLikeOperatorId("1718000000000-1a2b3c4d5e6f")).toBe(true)
  })

  it("NÃO confunde nome humano com id", () => {
    for (const nome of ["Rafael", "Admin Rafael", "Caixa 1", "João", "Operador não identificado"]) {
      expect(looksLikeOperatorId(nome)).toBe(false)
    }
  })

  it("string vazia / nula → não é id", () => {
    expect(looksLikeOperatorId("")).toBe(false)
    expect(looksLikeOperatorId(null)).toBe(false)
    expect(looksLikeOperatorId(undefined)).toBe(false)
  })
})

describe("sanitizeOperatorLabel — filtro puro (nunca inventa nem substitui)", () => {
  it("preserva nomes legíveis exatamente", () => {
    expect(sanitizeOperatorLabel("Rafael")).toBe("Rafael")
    expect(sanitizeOperatorLabel("Admin Rafael")).toBe("Admin Rafael")
    expect(sanitizeOperatorLabel("Caixa 1")).toBe("Caixa 1")
  })

  it("oculta UUID (→ vazio)", () => {
    expect(sanitizeOperatorLabel("aa6402dc-1234-4f00-8a1b-000000000000")).toBe("")
  })

  it("oculta timestamp-hash (→ vazio)", () => {
    expect(sanitizeOperatorLabel("1718000000000-1a2b3c4d5e6f")).toBe("")
  })

  it("trim e vazios → vazio (sem inventar)", () => {
    expect(sanitizeOperatorLabel("  Rafael  ")).toBe("Rafael")
    expect(sanitizeOperatorLabel("   ")).toBe("")
    expect(sanitizeOperatorLabel(null)).toBe("")
  })
})
