/**
 * PDV-ACESSORIOS-SELECAO-PERSISTENCIA-SERVER-004B — `SaleLineRecord` ganha
 * `accessorySelection?: AccessorySelectionV1` (opcional/aditivo, mesmo padrão de
 * `isAvulso`/`custoUnitario`). Este teste é o guard de contrato: se o campo for
 * removido ou o tipo divergir de `AccessorySelectionV1`, a compilação já falha
 * (`npx tsc --noEmit`) antes mesmo da asserção em runtime rodar.
 */
import { describe, expect, it } from "vitest"
import type { SaleLineRecord } from "./operations-sale-types"

describe("SaleLineRecord.accessorySelection", () => {
  it("aceita accessorySelection opcional sem quebrar o contrato existente", () => {
    const comSelecao: SaleLineRecord = {
      inventoryId: "prod-1",
      name: "Capinha — Samsung Galaxy A06 — Preto",
      quantity: 1,
      unitPrice: 25,
      lineTotal: 25,
      accessorySelection: { version: 1, colorKey: "preto", colorLabel: "Preto" },
    }
    const semSelecao: SaleLineRecord = {
      inventoryId: "prod-2",
      name: "Produto comum",
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
    }

    expect(comSelecao.accessorySelection?.colorKey).toBe("preto")
    expect(semSelecao.accessorySelection).toBeUndefined()
  })
})
