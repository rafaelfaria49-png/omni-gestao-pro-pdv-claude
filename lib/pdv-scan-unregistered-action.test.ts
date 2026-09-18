import { describe, expect, it } from "vitest"

import {
  DEFAULT_PDV_SCAN_UNREGISTERED_ACTION,
  hasBlockingPdvDialog,
  normalizePdvScanUnregisteredAction,
  PDV_SCAN_UNREGISTERED_ACTIONS,
  resolvePdvScanUnregisteredPolicy,
} from "./pdv-scan-unregistered-action"

describe("normalizePdvScanUnregisteredAction — fail-safe para o default", () => {
  it("aceita exatamente os três valores canônicos", () => {
    expect(normalizePdvScanUnregisteredAction("warn_continue")).toBe("warn_continue")
    expect(normalizePdvScanUnregisteredAction("warn_offer_avulso")).toBe("warn_offer_avulso")
    expect(normalizePdvScanUnregisteredAction("open_avulso")).toBe("open_avulso")
    expect(PDV_SCAN_UNREGISTERED_ACTIONS).toHaveLength(3)
  })

  it.each([
    undefined,
    null,
    "",
    "WARN_CONTINUE",
    "abrir_avulso",
    "auto",
    123,
    true,
    {},
    [],
  ])("valor inválido/legado (%s) cai no default sem quebrar", (v) => {
    expect(normalizePdvScanUnregisteredAction(v)).toBe(DEFAULT_PDV_SCAN_UNREGISTERED_ACTION)
  })

  it("default é 'warn_offer_avulso' e NUNCA é autoabertura (loja existente não muda sozinha)", () => {
    expect(DEFAULT_PDV_SCAN_UNREGISTERED_ACTION).toBe("warn_offer_avulso")
    expect(DEFAULT_PDV_SCAN_UNREGISTERED_ACTION).not.toBe("open_avulso")
    // Configuração ausente (loja existente, blob antigo sem o campo) → default seguro.
    expect(normalizePdvScanUnregisteredAction(undefined)).not.toBe("open_avulso")
  })
})

describe("resolvePdvScanUnregisteredPolicy — decisão única das 4 superfícies", () => {
  it("modo A (warn_continue): só feedback, sem hint nem contexto nem autoabertura", () => {
    const p = resolvePdvScanUnregisteredPolicy("warn_continue")
    expect(p).toEqual({
      action: "warn_continue",
      showInsertHint: false,
      offersAvulsoContext: false,
      autoOpenAvulso: false,
    })
  })

  it("modo B (warn_offer_avulso): hint de Insert + contexto; NÃO autoabre", () => {
    const p = resolvePdvScanUnregisteredPolicy("warn_offer_avulso")
    expect(p.showInsertHint).toBe(true)
    expect(p.offersAvulsoContext).toBe(true)
    expect(p.autoOpenAvulso).toBe(false)
  })

  it("modo C (open_avulso): autoabertura opt-in com contexto; sem hint (modal já abre)", () => {
    const p = resolvePdvScanUnregisteredPolicy("open_avulso")
    expect(p.autoOpenAvulso).toBe(true)
    expect(p.offersAvulsoContext).toBe(true)
    expect(p.showInsertHint).toBe(false)
  })

  it("inválido herda o default (avisar e oferecer), nunca autoabre", () => {
    const p = resolvePdvScanUnregisteredPolicy("lixo")
    expect(p.action).toBe("warn_offer_avulso")
    expect(p.autoOpenAvulso).toBe(false)
  })
})

describe("hasBlockingPdvDialog — modo C nunca abre Item Avulso por cima de outro modal", () => {
  it("sem DOM (SSR/teste) → não bloqueia", () => {
    expect(hasBlockingPdvDialog(null)).toBe(false)
  })

  it("dialog aberto → bloqueia; sem dialog → libera", () => {
    const withDialog: Pick<Document, "querySelector"> = {
      querySelector: (sel: string) => (sel.includes("dialog") ? ({} as Element) : null),
    }
    expect(hasBlockingPdvDialog(withDialog)).toBe(true)

    const clean: Pick<Document, "querySelector"> = { querySelector: () => null }
    expect(hasBlockingPdvDialog(clean)).toBe(false)
  })
})
