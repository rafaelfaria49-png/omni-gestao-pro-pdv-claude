import { afterEach, describe, expect, it, vi } from "vitest"
import { evaluateLocalDevAuthBypass } from "./local-dev-auth-guard"

/**
 * Cenários do GOAL LOCALHOST-DEV-AUTH-BYPASS-002 (seção 11).
 * A matriz valida o guard puro — o mesmo usado no authorize (fonte autoritativa),
 * na server action e na página de login.
 */

const LOCAL_DATABASE_URL = "postgresql://omnigestao_dev:dev-visual-only@127.0.0.1:55433/omnigestao_visual_dev"
const NEON_DATABASE_URL =
  "postgresql://user:secret@ep-summer-tooth-acltc6wi-pooler.sa-east-1.aws.neon.tech/omnigestao_prod_candidate?sslmode=require"

function stubEnv(overrides: Record<string, string | undefined>) {
  vi.stubEnv("NODE_ENV", overrides.NODE_ENV ?? "development")
  vi.stubEnv("LOCAL_DEV_AUTH_BYPASS", overrides.LOCAL_DEV_AUTH_BYPASS ?? "true")
  vi.stubEnv("DATABASE_URL", overrides.DATABASE_URL ?? LOCAL_DATABASE_URL)
  vi.stubEnv("DIRECT_URL", overrides.DIRECT_URL ?? LOCAL_DATABASE_URL)
}

function baseContext() {
  return { hostHeader: "localhost:3001" }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("evaluateLocalDevAuthBypass — matriz do GOAL", () => {
  it("CENÁRIO A: dev + flag + localhost + visual_dev → ALLOWED", () => {
    stubEnv({})
    const result = evaluateLocalDevAuthBypass(baseContext())
    expect(result.allowed).toBe(true)
    expect(result.checks).toEqual({
      nodeEnvNotProduction: true,
      flagEnabled: true,
      loopbackRequest: true,
      localDatabase: true,
      noRemoteDatabase: true,
    })
  })

  it("CENÁRIO A (variantes): 127.0.0.1 e [::1] no Host do request → ALLOWED", () => {
    stubEnv({})
    expect(evaluateLocalDevAuthBypass({ hostHeader: "127.0.0.1:3001" }).allowed).toBe(true)
    expect(evaluateLocalDevAuthBypass({ hostHeader: "[::1]:3001" }).allowed).toBe(true)
    expect(evaluateLocalDevAuthBypass({ hostHeader: "localhost" }).allowed).toBe(true)
  })

  it("CENÁRIO B: NODE_ENV=production → DENIED mesmo com todo o resto válido", () => {
    stubEnv({ NODE_ENV: "production" })
    const result = evaluateLocalDevAuthBypass(baseContext())
    expect(result.allowed).toBe(false)
    expect(result.checks.nodeEnvNotProduction).toBe(false)
  })

  it("CENÁRIO C: flag ausente → DENIED", () => {
    // Vitest popula process.env a partir de .env/.env.local; "" equivale a ausente
    // para o guard (apenas "true" exato habilita).
    stubEnv({ LOCAL_DEV_AUTH_BYPASS: "" })
    expect(evaluateLocalDevAuthBypass(baseContext()).allowed).toBe(false)
  })

  it("CENÁRIO D: flag false → DENIED", () => {
    stubEnv({ LOCAL_DEV_AUTH_BYPASS: "false" })
    expect(evaluateLocalDevAuthBypass(baseContext()).allowed).toBe(false)
  })

  it("CENÁRIO E: DATABASE_URL Neon → DENIED", () => {
    stubEnv({ DATABASE_URL: NEON_DATABASE_URL })
    const result = evaluateLocalDevAuthBypass(baseContext())
    expect(result.allowed).toBe(false)
    expect(result.checks.localDatabase).toBe(false)
    expect(result.checks.noRemoteDatabase).toBe(false)
  })

  it("CENÁRIO F: DIRECT_URL Neon (só ele) → DENIED", () => {
    stubEnv({ DIRECT_URL: NEON_DATABASE_URL })
    const result = evaluateLocalDevAuthBypass(baseContext())
    expect(result.allowed).toBe(false)
    expect(result.checks.noRemoteDatabase).toBe(false)
  })

  it("CENÁRIO G: database diferente do visual_dev (mesmo em loopback) → DENIED", () => {
    stubEnv({
      DATABASE_URL: "postgresql://user:pw@127.0.0.1:55433/omnigestao_outro_db",
      DIRECT_URL: "postgresql://user:pw@127.0.0.1:55433/omnigestao_outro_db",
    })
    expect(evaluateLocalDevAuthBypass(baseContext()).allowed).toBe(false)
  })

  it("CENÁRIO G2: banco local com nome de produção → DENIED (padrão prod)", () => {
    stubEnv({
      DATABASE_URL: "postgresql://user:pw@127.0.0.1:5432/omnigestao_prod_candidate",
      DIRECT_URL: "postgresql://user:pw@127.0.0.1:5432/omnigestao_prod_candidate",
    })
    const result = evaluateLocalDevAuthBypass(baseContext())
    expect(result.allowed).toBe(false)
    expect(result.checks.noRemoteDatabase).toBe(false)
  })

  it("CENÁRIO H: host do request externo (ex.: vercel.app) → DENIED", () => {
    stubEnv({})
    expect(evaluateLocalDevAuthBypass({ hostHeader: "omni-gestao.vercel.app" }).allowed).toBe(false)
    expect(evaluateLocalDevAuthBypass({ hostHeader: "192.168.0.10:3001" }).allowed).toBe(false)
  })

  it("CENÁRIO H2: Host vazio/ausente → DENIED (fail-closed)", () => {
    stubEnv({})
    expect(evaluateLocalDevAuthBypass({ hostHeader: null }).allowed).toBe(false)
    expect(evaluateLocalDevAuthBypass({ hostHeader: "" }).allowed).toBe(false)
    expect(evaluateLocalDevAuthBypass({}).allowed).toBe(false)
  })

  it("CENÁRIO extra: DATABASE_URL/DIRECT_URL ausentes → DENIED (fail-closed)", () => {
    stubEnv({ DATABASE_URL: "", DIRECT_URL: "" })
    expect(evaluateLocalDevAuthBypass(baseContext()).allowed).toBe(false)
  })

  it("CENÁRIO extra: DATABASE_URL malformada → DENIED (fail-closed)", () => {
    stubEnv({ DATABASE_URL: "não-é-uma-url", DIRECT_URL: LOCAL_DATABASE_URL })
    expect(evaluateLocalDevAuthBypass(baseContext()).allowed).toBe(false)
  })

  it("CENÁRIO extra: flag true em produção com Neon → DENIED (dupla falha)", () => {
    stubEnv({ NODE_ENV: "production", DATABASE_URL: NEON_DATABASE_URL, DIRECT_URL: NEON_DATABASE_URL })
    expect(evaluateLocalDevAuthBypass(baseContext()).allowed).toBe(false)
  })
})
