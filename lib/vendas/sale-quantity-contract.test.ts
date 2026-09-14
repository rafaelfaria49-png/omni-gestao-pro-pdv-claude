/**
 * FRACTIONAL-SALE-HARD-BLOCK-005 — contrato fail-closed de quantidade inteira.
 *
 * Cobre os exemplos obrigatórios do GOAL (aceita inteiros, tolera apenas ruído
 * mínimo, rejeita 0.350/0.5/1.5/2.25), o plano de correção de itens (draft
 * fracionário vira `quantidade_fracionada`, nunca arredonda) e o preflight
 * client (`finalizeSaleTransaction` bloqueia antes de qualquer mutação local —
 * verificado por inspeção estática porque o harness do Vitest é `node` e não
 * compila `.tsx`).
 */
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  FRACTIONAL_QUANTITY_CODE,
  FRACTIONAL_QUANTITY_MESSAGE,
  FractionalQuantityError,
  isIntegerSaleQuantity,
  normalizeSaleQuantity,
} from "./sale-quantity-contract"
import { computeCorrecaoItensPlan } from "./correcao-itens-plan"

const REPO_ROOT = resolve(__dirname, "../..")

describe("sale-quantity-contract — inteiros permitidos", () => {
  it.each([1, 2, 3])("aceita %i sem alteração", (q) => {
    expect(normalizeSaleQuantity(q)).toBe(q)
    expect(isIntegerSaleQuantity(q)).toBe(true)
  })
})

describe("sale-quantity-contract — ruído mínimo de floating point", () => {
  it("1.0000000001 normaliza para 1", () => {
    expect(normalizeSaleQuantity(1.0000000001)).toBe(1)
    expect(isIntegerSaleQuantity(1.0000000001)).toBe(true)
  })

  it("0.9999999999 normaliza para 1", () => {
    expect(normalizeSaleQuantity(0.9999999999)).toBe(1)
    expect(isIntegerSaleQuantity(0.9999999999)).toBe(true)
  })
})

describe("sale-quantity-contract — fração comercial bloqueada", () => {
  it.each([0.35, 0.5, 1.5, 2.25])("rejeita %s sem arredondar", (q) => {
    let caught: unknown
    try {
      normalizeSaleQuantity(q)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(FractionalQuantityError)
    const err = caught as FractionalQuantityError
    expect(err.code).toBe("FRACTIONAL_QUANTITY_UNSUPPORTED")
    expect(err.code).toBe(FRACTIONAL_QUANTITY_CODE)
    expect(err.message).toBe(FRACTIONAL_QUANTITY_MESSAGE)
    // Mensagem operacional: sem detalhes internos de banco/Prisma.
    expect(err.message).not.toMatch(/prisma|banco|migration|stock/i)
    expect(isIntegerSaleQuantity(q)).toBe(false)
  })

  it("0.350 (caso do P0) é bloqueado e nunca vira 0", () => {
    expect(() => normalizeSaleQuantity(0.35)).toThrowError(FractionalQuantityError)
  })

  it("1.5 é bloqueado e nunca vira 2", () => {
    expect(() => normalizeSaleQuantity(1.5)).toThrowError(FractionalQuantityError)
  })
})

describe("correcao-itens-plan — draft fracionário fail-closed", () => {
  const old = [{ inventoryId: "p1", nome: "Caneta", quantidade: 2, precoUnitario: 10 }]

  it.each([0.35, 0.5, 1.5, 2.25])("draft com %s falha com quantidade_fracionada", (q) => {
    const plan = computeCorrecaoItensPlan({
      oldLines: old,
      newLines: [{ inventoryId: "p1", nome: "Caneta", quantidade: q, precoUnitario: 10 }],
      oldTotal: 20,
      oldBreakdown: { dinheiro: 20 },
    })
    expect(plan.ok).toBe(false)
    expect(plan.errorCode).toBe("quantidade_fracionada")
    expect(plan.error).toBe(FRACTIONAL_QUANTITY_MESSAGE)
    expect(plan.stockDeltas).toHaveLength(0)
    expect(plan.newLines).toHaveLength(0)
  })

  it("draft inteiro continua funcionando", () => {
    const plan = computeCorrecaoItensPlan({
      oldLines: old,
      newLines: [{ inventoryId: "p1", nome: "Caneta", quantidade: 3, precoUnitario: 10 }],
      oldTotal: 20,
      oldBreakdown: { dinheiro: 20 },
    })
    expect(plan.ok).toBe(true)
    expect(plan.newTotal).toBe(30)
    expect(plan.stockDeltas).toContainEqual({ inventoryId: "p1", nome: "Caneta", deltaQty: 1 })
  })

  it("draft com ruído mínimo normaliza sem falhar", () => {
    const plan = computeCorrecaoItensPlan({
      oldLines: old,
      newLines: [{ inventoryId: "p1", nome: "Caneta", quantidade: 2.0000000001, precoUnitario: 10 }],
      oldTotal: 20,
      oldBreakdown: { dinheiro: 20 },
    })
    // 2.0000000001 ≈ 2: nada mudou (idempotência), mas NÃO é fração bloqueada.
    expect(plan.errorCode).not.toBe("quantidade_fracionada")
  })
})

describe("finalizeSaleTransaction — preflight client fail-closed (estático)", () => {
  const source = readFileSync(join(REPO_ROOT, "lib/operations-store.tsx"), "utf8")
  const finalizeStart = source.indexOf("const finalizeSaleTransaction = useCallback")

  it("importa o contrato puro de quantidade", () => {
    expect(source).toContain("lib/vendas/sale-quantity-contract")
    expect(source).toContain("isIntegerSaleQuantity")
    expect(source).toContain("FRACTIONAL_QUANTITY_MESSAGE")
  })

  it("bloqueia quantidade fracionada antes de qualquer mutação local", () => {
    expect(finalizeStart).toBeGreaterThanOrEqual(0)
    const body = source.slice(finalizeStart)
    const guardAt = body.indexOf("isIntegerSaleQuantity")
    const setStateAt = body.indexOf("setState(next)")
    const pushSaleAt = body.indexOf("next.sales.push(")
    const persistAt = body.indexOf("persistPendingSale(saleRow")
    expect(guardAt).toBeGreaterThanOrEqual(0)
    // O preflight retorna `{ ok: false }` antes de montar/mutar o estado local,
    // criar SaleRecord, alterar estoque/caixa ou enfileirar syncPending.
    expect(guardAt).toBeLessThan(setStateAt)
    expect(guardAt).toBeLessThan(pushSaleAt)
    expect(guardAt).toBeLessThan(persistAt)
    expect(body.slice(guardAt, guardAt + 600)).toContain("FRACTIONAL_QUANTITY_MESSAGE")
  })
})
