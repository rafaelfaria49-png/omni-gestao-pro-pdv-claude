/**
 * Teste-baseline: garantir nome canônico do cookie de loja ativa.
 *
 * Cobertura: F-03 da AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
 * - proxy.ts:132 lê "assistec_active_store" (com underscores)
 * - Cookie real é "assistec-active-store" (com hífens, definido aqui)
 * - Divergência faz o gate de ACL no proxy nunca disparar
 *
 * Este teste fixa o nome canônico — proxy.ts (área protegida) precisa importar a constante,
 * não usar string literal. Quando o fix for aplicado, este teste permanece como contrato.
 */
import { describe, expect, it } from "vitest"
import { ASSISTEC_ACTIVE_STORE_COOKIE, LEGACY_PRIMARY_STORE_ID } from "./store-defaults"

describe("ASSISTEC_ACTIVE_STORE_COOKIE — contrato de nome", () => {
  it("usa hífens (kebab-case), não underscores", () => {
    expect(ASSISTEC_ACTIVE_STORE_COOKIE).toBe("assistec-active-store")
    expect(ASSISTEC_ACTIVE_STORE_COOKIE).not.toContain("_")
  })

  it("começa com prefixo 'assistec-'", () => {
    expect(ASSISTEC_ACTIVE_STORE_COOKIE.startsWith("assistec-")).toBe(true)
  })

  it("é minúsculo (cookies são case-insensitive mas convenção do projeto é lowercase)", () => {
    expect(ASSISTEC_ACTIVE_STORE_COOKIE).toBe(ASSISTEC_ACTIVE_STORE_COOKIE.toLowerCase())
  })
})

describe("LEGACY_PRIMARY_STORE_ID — contrato", () => {
  it("é exatamente 'loja-1' (não pode mudar sem ADR — afeta importadores e seeds)", () => {
    expect(LEGACY_PRIMARY_STORE_ID).toBe("loja-1")
  })
})
