import { describe, it, expect, beforeEach } from "vitest"
import {
  __resetContadorRateLimitForTests,
  checkContadorRateLimit,
  registerContadorAuthFailure,
  registerContadorAuthSuccess,
} from "./rate-limit"

const KEY_A = "ip-hash-a"
const KEY_B = "ip-hash-b"

beforeEach(() => {
  __resetContadorRateLimitForTests()
})

describe("checkContadorRateLimit / registerContadorAuthFailure", () => {
  it("permite as primeiras cinco falhas", () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      expect(checkContadorRateLimit(KEY_A, now).limited).toBe(false)
      registerContadorAuthFailure(KEY_A, now)
    }
  })

  it("bloqueia a sexta tentativa dentro da janela de 15 minutos, com Retry-After", () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) registerContadorAuthFailure(KEY_A, now)
    const result = checkContadorRateLimit(KEY_A, now + 1000)
    expect(result.limited).toBe(true)
    if (result.limited) expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("a janela expira após 15 minutos e libera novas tentativas", () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) registerContadorAuthFailure(KEY_A, now)
    const afterWindow = now + 15 * 60 * 1000 + 1
    expect(checkContadorRateLimit(KEY_A, afterWindow).limited).toBe(false)
  })

  it("IPs diferentes não compartilham contador", () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) registerContadorAuthFailure(KEY_A, now)
    expect(checkContadorRateLimit(KEY_A, now + 1000).limited).toBe(true)
    expect(checkContadorRateLimit(KEY_B, now + 1000).limited).toBe(false)
  })

  it("sucesso limpa o bloqueio do IP", () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) registerContadorAuthFailure(KEY_A, now)
    expect(checkContadorRateLimit(KEY_A, now + 1000).limited).toBe(true)
    registerContadorAuthSuccess(KEY_A)
    expect(checkContadorRateLimit(KEY_A, now + 2000).limited).toBe(false)
  })
})
