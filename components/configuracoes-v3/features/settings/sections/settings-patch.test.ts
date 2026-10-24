import { describe, expect, it } from "vitest"
import { mergePrinterConfigServerSide } from "@/lib/pdv-settings-server-first"
import { changedFields, mergeImpressaoPatch } from "./settings-patch"

describe("patches de Configurações", () => {
  it("envia somente campos alterados, preservando false e zero legítimos", () => {
    const initial = { garantia: 90, imposto: true, aliquota: 5, mesas: false }
    expect(changedFields(initial, { ...initial })).toBeNull()
    expect(changedFields(initial, { ...initial, imposto: false, aliquota: 0 })).toEqual({ imposto: false, aliquota: 0 })
  })

  it("usa a igualdade de domínio quando informada", () => {
    const initial = { formas: [{ id: "pix", ordem: 1 }] }
    const sameByDomain = { formas: [{ id: "pix", ordem: 9 }] }
    expect(changedFields(initial, sameByDomain, { formas: (a, b) => a[0].id === b[0].id })).toBeNull()
  })

  it("seção Vendas não desfaz o que outra seção gravou depois (merge canônico do servidor)", () => {
    const loadedAtMount = { pdvParams: { garantiaPadraoDias: 90, atalhosRapidos: ["a"] }, untouched: "preservado" }
    // Outra aba grava impressão e um atalho depois da montagem.
    const current = { ...loadedAtMount, impressao: { impressoraHost: "10.0.0.5" }, pdvParams: { garantiaPadraoDias: 90, atalhosRapidos: ["b"] } }
    const patch = { pdvParams: changedFields({ formas: 1 }, { formas: 2 })! }
    const merged = mergePrinterConfigServerSide(current, patch, false)
    expect(merged).toEqual({ ...current, pdvParams: { garantiaPadraoDias: 90, atalhosRapidos: ["b"], formas: 2 } })
  })

  it("impressão parte da releitura atual e conserva chaves ocultas/desconhecidas", () => {
    const fresh = {
      appearance: { studioTheme: "midnight" },
      impressao: { impressoraHost: "10.0.0.5", impressoraPorta: 9100, viasCupom: 3, abrirGaveta: true, imprimirOs: false, chaveFutura: "x" },
    }
    const body = mergeImpressaoPatch(fresh, { rodapeCupom: "Obrigado", logoNoCupom: false })
    expect(body).toEqual({ impressao: { ...fresh.impressao, rodapeCupom: "Obrigado", logoNoCupom: false } })
    expect(mergePrinterConfigServerSide(fresh, body, false)).toEqual({ ...fresh, impressao: body.impressao })
    expect(mergeImpressaoPatch(null, { bobinaTamanho: "58mm" })).toEqual({ impressao: { bobinaTamanho: "58mm" } })
  })
})
