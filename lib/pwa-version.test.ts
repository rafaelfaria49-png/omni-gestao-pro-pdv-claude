import { describe, it, expect } from "vitest"
import { evaluateStaleness, STALE_STRONG_AFTER_MS, type AppVersion } from "./pwa-version"

const at = (iso: string): AppVersion["buildTime"] => iso

describe("evaluateStaleness", () => {
  it("não marca stale quando o deploy é desconhecido ou 'dev'", () => {
    const cur: AppVersion = { buildId: "abc", buildTime: at("2026-06-17T10:00:00Z") }
    expect(evaluateStaleness(cur, null).stale).toBe(false)
    expect(evaluateStaleness(cur, { buildId: "dev", buildTime: null }).severity).toBe("none")
  })

  it("não marca stale em dev (bundle local sem id)", () => {
    const cur: AppVersion = { buildId: "dev", buildTime: null }
    const dep: AppVersion = { buildId: "xyz", buildTime: at("2026-06-17T10:00:00Z") }
    expect(evaluateStaleness(cur, dep).stale).toBe(false)
  })

  it("ids iguais → não stale", () => {
    const v: AppVersion = { buildId: "same", buildTime: at("2026-06-17T10:00:00Z") }
    expect(evaluateStaleness(v, { ...v })).toEqual({ stale: false, severity: "none", ageMs: 0 })
  })

  it("ids diferentes e diferença pequena → warn", () => {
    const cur: AppVersion = { buildId: "old", buildTime: at("2026-06-17T10:00:00Z") }
    const dep: AppVersion = { buildId: "new", buildTime: at("2026-06-17T11:00:00Z") } // +1h
    const r = evaluateStaleness(cur, dep)
    expect(r.stale).toBe(true)
    expect(r.severity).toBe("warn")
    expect(r.ageMs).toBe(60 * 60 * 1000)
  })

  it("ids diferentes e diferença grande → strong", () => {
    const cur: AppVersion = { buildId: "old", buildTime: at("2026-06-15T10:00:00Z") }
    const dep: AppVersion = { buildId: "new", buildTime: at("2026-06-17T10:00:00Z") } // +48h
    const r = evaluateStaleness(cur, dep)
    expect(r.stale).toBe(true)
    expect(r.severity).toBe("strong")
    expect(r.ageMs).toBeGreaterThanOrEqual(STALE_STRONG_AFTER_MS)
  })

  it("exatamente no limite → strong", () => {
    const cur: AppVersion = { buildId: "old", buildTime: at("2026-06-17T00:00:00Z") }
    const dep: AppVersion = {
      buildId: "new",
      buildTime: at(new Date(Date.parse("2026-06-17T00:00:00Z") + STALE_STRONG_AFTER_MS).toISOString()),
    }
    expect(evaluateStaleness(cur, dep).severity).toBe("strong")
  })

  it("ids diferentes sem timestamps confiáveis → warn (degrada para o aviso brando)", () => {
    const cur: AppVersion = { buildId: "old", buildTime: null }
    const dep: AppVersion = { buildId: "new", buildTime: null }
    const r = evaluateStaleness(cur, dep)
    expect(r.stale).toBe(true)
    expect(r.severity).toBe("warn")
    expect(r.ageMs).toBe(0)
  })

  it("nunca devolve ageMs negativo (deploy 'mais antigo' que o bundle)", () => {
    const cur: AppVersion = { buildId: "a", buildTime: at("2026-06-17T10:00:00Z") }
    const dep: AppVersion = { buildId: "b", buildTime: at("2026-06-17T08:00:00Z") }
    const r = evaluateStaleness(cur, dep)
    expect(r.ageMs).toBe(0)
    expect(r.severity).toBe("warn")
  })
})
