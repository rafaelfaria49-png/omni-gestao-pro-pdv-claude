import { describe, expect, it } from "vitest"
import { agregarVariantes } from "./produtos-vendidos-variantes"

const sel = (deviceModelName: string, colorLabel: string) => ({ version: 1, deviceModelName, colorKey: "preto", colorLabel })

describe("agregarVariantes", () => {
  it("agrupa por modelo/cor quando o payload bate com ItemVenda", () => {
    const r = agregarVariantes(
      [
        {
          payload: {
            lines: [
              { inventoryId: "p1", quantity: 2, accessorySelection: sel("iPhone 13", "Preto") },
              { inventoryId: "p1", quantity: 1, accessorySelection: sel("iPhone 14", "Preto") },
              { inventoryId: "outro", quantity: 5 },
            ],
          },
          itens: [{ quantidade: 3, lineTotal: 90 }],
        },
        {
          payload: { lines: [{ inventoryId: "p1", quantity: 1, accessorySelection: sel("iPhone 13", "Preto") }] },
          itens: [{ quantidade: 1, lineTotal: 30 }],
        },
      ],
      ["p1"],
    )
    expect(r.quantidadeTotal).toBe(4)
    expect(r.variantes.map((v) => [v.rotulo, v.quantidade, v.receita])).toEqual([
      ["iPhone 13 · Preto", 3, 90],
      ["iPhone 14 · Preto", 1, 30],
    ])
  })

  it("sem seleção registrada vai para 'Sem modelo/cor'; payload divergente vira 'Sem detalhe confiável'", () => {
    const r = agregarVariantes(
      [
        { payload: { lines: [{ inventoryId: "p1", quantity: 2 }] }, itens: [{ quantidade: 2, lineTotal: 40 }] },
        // Payload diz 1, ItemVenda diz 3 (ex.: correção posterior) → não inventa variante.
        {
          payload: { lines: [{ inventoryId: "p1", quantity: 1, accessorySelection: sel("iPhone 13", "Preto") }] },
          itens: [{ quantidade: 3, lineTotal: 60 }],
        },
        { payload: null, itens: [{ quantidade: 1, lineTotal: 20 }] },
      ],
      ["p1"],
    )
    expect(r.variantes.map((v) => [v.origem, v.quantidade])).toEqual([
      ["sem_variante", 2],
      ["nao_confiavel", 4],
    ])
    expect(r.variantes.reduce((s, v) => s + v.quantidade, 0)).toBe(r.quantidadeTotal)
  })

  it("aceita linhas legadas gravadas com SKU (refs múltiplas)", () => {
    const r = agregarVariantes(
      [{ payload: { lines: [{ inventoryId: "SKU1", quantity: 1, accessorySelection: sel("Moto G", "Azul") }] }, itens: [{ quantidade: 1, lineTotal: 10 }] }],
      ["p1", "SKU1"],
    )
    expect(r.variantes[0]).toMatchObject({ origem: "variante", quantidade: 1 })
  })
})
