/**
 * Teste-baseline — Fase 1: Proteção de Lojas.
 *
 * Garante que a decisão pura de proteção (evaluateStoreProtection) bloqueia:
 * - lojas reais protegidas (loja-1, loja-2);
 * - a loja principal da conta;
 * - a unidade ativa atual.
 *
 * É a rede de segurança contra exclusão acidental ANTES de qualquer fluxo de limpeza/exclusão.
 * Ver docs/modules/reports/INVENTARIO_LOJAS_2026-05-30.md.
 */
import { describe, expect, it } from "vitest"
import {
  PROTECTED_STORE_IDS,
  evaluateStoreProtection,
  isWhitelistedProtectedStore,
} from "./store-defaults"

describe("PROTECTED_STORE_IDS — whitelist", () => {
  it("contém loja-1 e loja-2", () => {
    expect(PROTECTED_STORE_IDS).toContain("loja-1")
    expect(PROTECTED_STORE_IDS).toContain("loja-2")
  })

  it("isWhitelistedProtectedStore reconhece protegidas e ignora não-protegidas", () => {
    expect(isWhitelistedProtectedStore("loja-1")).toBe(true)
    expect(isWhitelistedProtectedStore(" loja-2 ")).toBe(true)
    expect(isWhitelistedProtectedStore("loja-7")).toBe(false)
    expect(isWhitelistedProtectedStore("")).toBe(false)
    expect(isWhitelistedProtectedStore(null)).toBe(false)
  })
})

describe("evaluateStoreProtection — decisão pura", () => {
  it("bloqueia loja real protegida (loja-1) mesmo se não for principal/ativa", () => {
    const r = evaluateStoreProtection({ storeId: "loja-1", primaryStoreId: "loja-99", activeStoreId: "loja-99" })
    expect(r.blocked).toBe(true)
    if (r.blocked) expect(r.status).toBe(403)
  })

  it("bloqueia loja-2 (real protegida) — antes da Fase 1 estava desprotegida", () => {
    const r = evaluateStoreProtection({ storeId: "loja-2", primaryStoreId: "loja-1", activeStoreId: null })
    expect(r.blocked).toBe(true)
    if (r.blocked) expect(r.status).toBe(403)
  })

  it("bloqueia a loja principal", () => {
    const r = evaluateStoreProtection({ storeId: "loja-7", primaryStoreId: "loja-7", activeStoreId: null })
    expect(r.blocked).toBe(true)
    if (r.blocked) expect(r.status).toBe(403)
  })

  it("bloqueia a unidade ativa atual (409)", () => {
    const r = evaluateStoreProtection({ storeId: "loja-7", primaryStoreId: "loja-1", activeStoreId: "loja-7" })
    expect(r.blocked).toBe(true)
    if (r.blocked) expect(r.status).toBe(409)
  })

  it("bloqueia storeId vazio (400)", () => {
    const r = evaluateStoreProtection({ storeId: "  ", primaryStoreId: "loja-1", activeStoreId: null })
    expect(r.blocked).toBe(true)
    if (r.blocked) expect(r.status).toBe(400)
  })

  it("permite excluir loja de teste comum (não protegida, não principal, não ativa)", () => {
    const r = evaluateStoreProtection({ storeId: "loja-7", primaryStoreId: "loja-1", activeStoreId: "loja-1" })
    expect(r.blocked).toBe(false)
  })
})
