import { describe, expect, it } from "vitest"
import { mergePrinterConfigServerSide } from "@/lib/pdv-settings-server-first"
import { changedFields } from "./settings-patch"

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

  it("impressão é fundida por chave no servidor: patch do cliente não apaga ajuste concorrente da plataforma", () => {
    const stored = {
      appearance: { studioTheme: "midnight" },
      impressao: { impressoraHost: "10.0.0.5", impressoraPorta: 9100, viasCupom: 3, abrirGaveta: true, imprimirOs: false, chaveFutura: "x" },
    }
    // A plataforma troca host/vias depois que o cliente abriu a tela; o cliente envia só o rodapé.
    const afterPlatform = mergePrinterConfigServerSide(stored, { impressao: { impressoraHost: "10.0.0.9", viasCupom: 2 } }, false)
    const afterClient = mergePrinterConfigServerSide(afterPlatform, { impressao: { rodapeCupom: "Obrigado", logoNoCupom: false } }, false)
    expect(afterClient).toEqual({
      appearance: stored.appearance,
      impressao: { ...stored.impressao, impressoraHost: "10.0.0.9", viasCupom: 2, rodapeCupom: "Obrigado", logoNoCupom: false },
    })
    expect(mergePrinterConfigServerSide({}, { impressao: { bobinaTamanho: "58mm" } }, false)).toEqual({ impressao: { bobinaTamanho: "58mm" } })
    // Backfill continua "só se ausente" no topo.
    expect(mergePrinterConfigServerSide(stored, { impressao: { rodapeCupom: "x" } }, true)).toEqual(stored)
  })
})
