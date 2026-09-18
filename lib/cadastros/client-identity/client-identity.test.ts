/**
 * CAD-R2-018-A — fundação de identidade/dedupe de Cliente.
 * Sem banco, sem IA, sem merge, sem escrita.
 */
import { describe, expect, it } from "vitest"
import {
  ACTIVE_CLIENT_WRITERS,
  CLIENT_IDENTITY_AI_DECISION,
  CLIENT_IDENTITY_AUTO_MERGE,
  CLIENT_IDENTITY_FIELDS,
  CLIENT_MERGE_IMPLEMENTED,
  CLIENT_WRITE_SERVICE_IMPLEMENTED,
  CLIENT_WRITER_INVENTORY,
  classifyClientIdentity,
  classifyIdentityPair,
  createMemoryClientIdentitySource,
  detectDocumentKind,
  discoverClientIdentityCandidates,
  isValidClientDocument,
  isValidCpf,
  lookupKeysFromSignals,
  normalizeClientEmail,
  normalizeClientName,
  normalizeClientPhoneDigits,
  normalizeDocumentDigits,
  sanitizedClientIdentityTelemetry,
  toClientIdentitySignals,
  toDocumentSignal,
  toEmailSignal,
  toNameSignal,
  toPhoneSignal,
} from "./index"
import type { ClientIdentityRecord } from "./types"

const CPF_VALID = "529.982.247-25"
const CPF_VALID_DIGITS = "52998224725"
const CPF_VALID_B = "390.533.447-05"
const CPF_VALID_B_DIGITS = "39053344705"
const CPF_INVALID = "529.982.247-26"
const CNPJ_VALID = "11.222.333/0001-81"
const CNPJ_VALID_DIGITS = "11222333000181"
const CNPJ_INVALID = "11.222.333/0001-82"

const STORE_A = "loja-a"
const STORE_B = "loja-b"

function rec(partial: Partial<ClientIdentityRecord> & { id: string; storeId: string }): ClientIdentityRecord {
  return {
    document: "",
    phone: null,
    email: null,
    name: "Alguem",
    ...partial,
  }
}

describe("documento CPF/CNPJ", () => {
  it("1. CPF formatado → dígitos esperados", () => {
    expect(normalizeDocumentDigits(CPF_VALID)).toBe(CPF_VALID_DIGITS)
    expect(isValidCpf(CPF_VALID)).toBe(true)
    expect(toDocumentSignal(CPF_VALID)).toEqual({
      present: true,
      digits: CPF_VALID_DIGITS,
      kind: "CPF",
      strong: true,
    })
  })

  it("2. CNPJ formatado → dígitos esperados", () => {
    expect(normalizeDocumentDigits(CNPJ_VALID)).toBe(CNPJ_VALID_DIGITS)
    expect(isValidClientDocument(CNPJ_VALID)).toBe(true)
    expect(toDocumentSignal(CNPJ_VALID)).toEqual({
      present: true,
      digits: CNPJ_VALID_DIGITS,
      kind: "CNPJ",
      strong: true,
    })
  })

  it("3. documento vazio → ausência de identidade", () => {
    expect(toDocumentSignal("")).toEqual({ present: false })
    expect(toDocumentSignal("   ")).toEqual({ present: false })
    expect(toDocumentSignal(null)).toEqual({ present: false })
    expect(toDocumentSignal(undefined)).toEqual({ present: false })
    expect(toDocumentSignal(".—./")).toEqual({ present: false })
  })

  it("4. documento inválido não vira identidade forte", () => {
    expect(isValidCpf(CPF_INVALID)).toBe(false)
    expect(isValidCpf("111.111.111-11")).toBe(false)
    expect(isValidCpf("00000000000")).toBe(false)
    expect(isValidClientDocument(CNPJ_INVALID)).toBe(false)
    const sig = toDocumentSignal(CPF_INVALID)
    expect(sig.present).toBe(true)
    if (sig.present) {
      expect(sig.strong).toBe(false)
      expect(sig.kind).toBe("CPF")
    }
    expect(toDocumentSignal("123")).toEqual({
      present: true,
      digits: "123",
      kind: "UNKNOWN",
      strong: false,
    })
    expect(detectDocumentKind("123")).toBe("UNKNOWN")
    const sameInvalid = classifyIdentityPair(
      toClientIdentitySignals({ document: "12345678901" }),
      toClientIdentitySignals({ document: "123.456.789-01" }),
    )
    expect(sameInvalid.pair).toBe("NO_MATCH")
  })
})

describe("email", () => {
  it("9. email com case/espaço → normalização", () => {
    expect(normalizeClientEmail("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com")
    expect(toEmailSignal("  Foo.Bar@Example.COM ").present).toBe(true)
  })

  it("10. email vazio → sem sinal", () => {
    expect(toEmailSignal("")).toEqual({ present: false })
    expect(toEmailSignal("   ")).toEqual({ present: false })
    expect(toEmailSignal(null)).toEqual({ present: false })
  })

  it("não aplica transformações de provider (Gmail dots / +tag)", () => {
    expect(normalizeClientEmail("a.b+tag@gmail.com")).toBe("a.b+tag@gmail.com")
  })
})

describe("telefone", () => {
  it("11. telefone usa normalização canônica (phone-br + 55 seguro)", () => {
    expect(normalizeClientPhoneDigits("(11) 98888-7777")).toBe("11988887777")
    expect(normalizeClientPhoneDigits("+55 11 98888-7777")).toBe("11988887777")
    expect(normalizeClientPhoneDigits("5511988887777")).toBe("11988887777")
    expect(toPhoneSignal("(11) 98888-7777")).toEqual({ present: true, digits: "11988887777" })
  })

  it("12. telefone vazio → sem sinal", () => {
    expect(toPhoneSignal("")).toEqual({ present: false })
    expect(toPhoneSignal("123")).toEqual({ present: false })
    expect(toPhoneSignal(null)).toEqual({ present: false })
  })

  it("não inventa DDD/país", () => {
    expect(toPhoneSignal("988887777")).toEqual({ present: false })
  })
})

describe("nome como sinal fraco", () => {
  it("15. nome igual sozinho → no exact identity", () => {
    expect(normalizeClientName("  José  Silva ")).toBe("jose silva")
    expect(toNameSignal("José Silva").present).toBe(true)
    const incoming = toClientIdentitySignals({ name: "José Silva" })
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming,
      records: [rec({ id: "c1", storeId: STORE_A, name: "Jose Silva" })],
    })
    expect(v.outcome).toBe("NO_MATCH")
    expect(v.reasons).toContain("name_insufficient")
    expect(v.autoMerge).toBe(false)
    expect(v.candidates).toEqual([])
  })

  it("16. nome semelhante sozinho → no automatic identity", () => {
    const incoming = toClientIdentitySignals({ name: "Maria Santos" })
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming,
      records: [rec({ id: "c1", storeId: STORE_A, name: "Maria Santos Silva" })],
    })
    expect(v.outcome).toBe("NO_MATCH")
    expect(v.autoMerge).toBe(false)
  })
})

describe("política de dedupe", () => {
  it("5. mesmo documento normalizado + mesma store → exact match", () => {
    const incoming = toClientIdentitySignals({ document: CPF_VALID })
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming,
      records: [rec({ id: "c1", storeId: STORE_A, document: CPF_VALID_DIGITS })],
    })
    expect(v.outcome).toBe("EXACT_DOCUMENT_MATCH")
    expect(v.candidates.map((c) => c.id)).toEqual(["c1"])
    expect(v.autoMerge).toBe(false)
    expect(v.humanReviewRequired).toBe(true)
  })

  it("6+7. mesmo documento + outra store → não retorna candidato / sem vazamento", () => {
    const incoming = toClientIdentitySignals({ document: CPF_VALID })
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming,
      records: [
        rec({ id: "secret-b", storeId: STORE_B, document: CPF_VALID, name: "Pessoa B", email: "b@x.com", phone: "11988887777" }),
      ],
    })
    expect(v.outcome).toBe("NO_MATCH")
    expect(v.candidates).toEqual([])
    expect(JSON.stringify(v)).not.toContain("secret-b")
    expect(JSON.stringify(v)).not.toContain("Pessoa B")
    expect(JSON.stringify(v)).not.toContain("b@x.com")
    expect(JSON.stringify(v.telemetry)).not.toMatch(/52998224725/)
  })

  it("8. documentos fortes diferentes → conflict", () => {
    const pair = classifyIdentityPair(
      toClientIdentitySignals({ document: CPF_VALID, phone: "11988887777", name: "Ana" }),
      toClientIdentitySignals({ document: CPF_VALID_B, phone: "11988887777", name: "Ana" }),
    )
    expect(pair.pair).toBe("IDENTITY_CONFLICT")
    expect(pair.reasons).toContain("document_conflict")
  })

  it("13. telefone igual sozinho → possível candidato, não auto-merge", () => {
    const incoming = toClientIdentitySignals({ phone: "(11) 98888-7777" })
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming,
      records: [rec({ id: "c1", storeId: STORE_A, phone: "11988887777" })],
    })
    expect(v.outcome).toBe("POSSIBLE_CONTACT_MATCH")
    expect(v.autoMerge).toBe(false)
    expect(v.humanReviewRequired).toBe(true)
  })

  it("14. email igual sozinho → possível candidato, não auto-merge", () => {
    const incoming = toClientIdentitySignals({ email: "  A@X.COM " })
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming,
      records: [rec({ id: "c1", storeId: STORE_A, email: "a@x.com" })],
    })
    expect(v.outcome).toBe("POSSIBLE_CONTACT_MATCH")
    expect(v.autoMerge).toBe(false)
  })

  it("17. dois campos vazios não geram match", () => {
    const pair = classifyIdentityPair(
      toClientIdentitySignals({ document: "", phone: "", email: "", name: "" }),
      toClientIdentitySignals({ document: "", phone: "", email: "", name: "" }),
    )
    expect(pair.pair).toBe("NO_MATCH")
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming: toClientIdentitySignals({}),
      records: [rec({ id: "c1", storeId: STORE_A, document: "", phone: null, email: null, name: "" })],
    })
    expect(v.outcome).toBe("NO_MATCH")
    expect(v.reasons).toContain("empty_signals")
    expect(v.candidates).toEqual([])
  })

  it("18. mais de um candidato plausível → ambiguous", () => {
    const incoming = toClientIdentitySignals({ phone: "11988887777" })
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming,
      records: [
        rec({ id: "c1", storeId: STORE_A, phone: "11988887777" }),
        rec({ id: "c2", storeId: STORE_A, phone: "(11) 98888-7777" }),
      ],
    })
    expect(v.outcome).toBe("AMBIGUOUS")
    expect(v.autoMerge).toBe(false)
    expect(v.humanReviewRequired).toBe(true)
  })

  it("19. múltiplos candidatos fortes → fail closed", () => {
    const incoming = toClientIdentitySignals({ document: CPF_VALID })
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming,
      records: [
        rec({ id: "c1", storeId: STORE_A, document: CPF_VALID }),
        rec({ id: "c2", storeId: STORE_A, document: CPF_VALID_DIGITS }),
      ],
    })
    expect(v.outcome).toBe("AMBIGUOUS")
    expect(v.reasons).toContain("multiple_strong_candidates")
    expect(v.autoMerge).toBe(false)
  })

  it("20. documento conflitante prevalece sobre nome/contato coincidente", () => {
    const incoming = toClientIdentitySignals({
      document: CPF_VALID,
      phone: "11988887777",
      email: "ana@x.com",
      name: "Ana Souza",
    })
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming,
      records: [
        rec({
          id: "c1",
          storeId: STORE_A,
          document: CPF_VALID_B,
          phone: "11988887777",
          email: "ana@x.com",
          name: "Ana Souza",
        }),
      ],
    })
    expect(v.outcome).toBe("IDENTITY_CONFLICT")
    expect(v.autoMerge).toBe(false)
  })

  it("24. política é determinística", () => {
    const incoming = toClientIdentitySignals({ phone: "11988887777", email: "a@x.com" })
    const records = [
      rec({ id: "c2", storeId: STORE_A, phone: "11988887777" }),
      rec({ id: "c1", storeId: STORE_A, email: "a@x.com" }),
    ]
    const a = classifyClientIdentity({ scope: { storeId: STORE_A }, incoming, records })
    const b = classifyClientIdentity({ scope: { storeId: STORE_A }, incoming, records: [...records].reverse() })
    expect(a.outcome).toBe(b.outcome)
    expect(a.candidates.map((c) => c.id)).toEqual(b.candidates.map((c) => c.id))
    expect(a.autoMerge).toBe(false)
  })

  it("25+26. nenhuma IA e nenhum merge automático", () => {
    expect(CLIENT_IDENTITY_AI_DECISION).toBe(false)
    expect(CLIENT_IDENTITY_AUTO_MERGE).toBe(false)
    expect(CLIENT_WRITE_SERVICE_IMPLEMENTED).toBe(true)
    expect(CLIENT_MERGE_IMPLEMENTED).toBe(true)
  })
})

describe("lookup server-side / IDOR", () => {
  it("21. storeId do caller não amplia scope", async () => {
    const source = createMemoryClientIdentitySource([
      rec({ id: "in-a", storeId: STORE_A, document: CPF_VALID }),
      rec({ id: "in-b", storeId: STORE_B, document: CPF_VALID, name: "Outra Unidade" }),
    ])
    const v = await discoverClientIdentityCandidates({
      scope: { storeId: STORE_A },
      input: { document: CPF_VALID, storeId: STORE_B, actor: "admin", userId: "u-1" },
      source,
    })
    expect(v.storeId).toBe(STORE_A)
    expect(v.outcome).toBe("EXACT_DOCUMENT_MATCH")
    expect(v.candidates.map((c) => c.id)).toEqual(["in-a"])
    expect(JSON.stringify(v)).not.toContain("in-b")
    expect(JSON.stringify(v)).not.toContain("Outra Unidade")
  })

  it("22. lookup server-side usa scope autorizado", async () => {
    const source = createMemoryClientIdentitySource([
      rec({ id: "in-a", storeId: STORE_A, email: "a@x.com" }),
      rec({ id: "in-b", storeId: STORE_B, email: "a@x.com" }),
    ])
    const v = await discoverClientIdentityCandidates({
      scope: { storeId: STORE_A },
      input: { email: "a@x.com", storeId: STORE_B },
      source,
    })
    expect(v.candidates.map((c) => c.id)).toEqual(["in-a"])
    expect(v.storeId).toBe(STORE_A)
  })

  it("23. nenhum resultado cross-store expõe ID/nome/documento", async () => {
    const source = createMemoryClientIdentitySource([
      rec({
        id: "leak-id",
        storeId: STORE_B,
        document: CPF_VALID,
        name: "Cliente Secreto",
        email: "secreto@x.com",
        phone: "11999990000",
      }),
    ])
    const v = await discoverClientIdentityCandidates({
      scope: { storeId: STORE_A },
      input: { document: CPF_VALID },
      source,
    })
    const dumped = JSON.stringify(v)
    expect(v.outcome).toBe("NO_MATCH")
    expect(dumped).not.toContain("leak-id")
    expect(dumped).not.toContain("Cliente Secreto")
    expect(dumped).not.toContain("secreto@x.com")
    expect(dumped).not.toContain(CPF_VALID_DIGITS)
    expect(dumped).not.toContain("11999990000")
  })

  it("scope vazio falha fechado", async () => {
    const source = createMemoryClientIdentitySource([
      rec({ id: "c1", storeId: STORE_A, document: CPF_VALID }),
    ])
    const v = await discoverClientIdentityCandidates({
      scope: { storeId: "  " },
      input: { document: CPF_VALID },
      source,
    })
    expect(v.outcome).toBe("NO_MATCH")
    expect(v.reasons).toContain("untrusted_scope")
    expect(v.candidates).toEqual([])
  })

  it("lookupKeys só usam documento forte / contato — nunca nome", () => {
    const keys = lookupKeysFromSignals(
      toClientIdentitySignals({ document: CPF_INVALID, phone: "11988887777", name: "Ana", email: "a@x.com" }),
    )
    expect(keys.documentDigits).toBeNull()
    expect(keys.phoneDigits).toBe("11988887777")
    expect(keys.email).toBe("a@x.com")
  })
})

describe("telemetria / PII", () => {
  it("29. telemetria não carrega PII bruta", () => {
    const v = classifyClientIdentity({
      scope: { storeId: STORE_A },
      incoming: toClientIdentitySignals({ document: CPF_VALID, email: "ana@x.com", phone: "11988887777" }),
      records: [rec({ id: "c1", storeId: STORE_A, document: CPF_VALID })],
    })
    const t = sanitizedClientIdentityTelemetry(v)
    const dumped = JSON.stringify(t)
    expect(dumped).not.toContain(CPF_VALID_DIGITS)
    expect(dumped).not.toContain("ana@x.com")
    expect(dumped).not.toContain("11988887777")
    expect(t.hasStrongDocument).toBe(true)
    expect(t.autoMerge).toBe(false)
    expect(t.aiDecision).toBe(false)
    expect(t.storeScoped).toBe(true)
  })
})

describe("inventário de writers (entrada do CAD-R2-008)", () => {
  it("classifica writers ativos; ClientWriteService é a boundary de escrita", () => {
    expect(CLIENT_WRITER_INVENTORY.length).toBeGreaterThan(10)
    expect(ACTIVE_CLIENT_WRITERS.every((w) => w.writes)).toBe(true)
    expect(CLIENT_WRITER_INVENTORY.some((w) => w.kind === "INTERACTIVE")).toBe(true)
    expect(CLIENT_WRITER_INVENTORY.some((w) => w.kind === "REST")).toBe(true)
    expect(CLIENT_WRITER_INVENTORY.some((w) => w.kind === "IMPORT")).toBe(true)
    expect(CLIENT_WRITER_INVENTORY.some((w) => w.kind === "QUICK_CREATE")).toBe(true)
    expect(CLIENT_IDENTITY_FIELDS).toEqual(
      expect.arrayContaining(["storeId", "name", "document", "phone", "email"]),
    )
    expect(CLIENT_WRITE_SERVICE_IMPLEMENTED).toBe(true)
    expect(CLIENT_MERGE_IMPLEMENTED).toBe(true)
  })
})
