/** N5-B2: approved matrix. Runtime effects are proved by the companion component suite. */
import { describe, expect, it } from "vitest"
import { PDV_KEYMAP } from "@/lib/pdv-keymap"
import { OFFICIAL_PDV_SURFACE_IDS } from "./surface-ids"
import {
  A3_COLLISION_MARKS,
  CORE_COHERENT_KEYS,
  GAP_P2_04_CONFLICT_KEYS,
  KEYMAP_DOC_NOTES,
  PDV_PARITY_KEYMAP,
  capabilityKeyOf,
  distinctActionDomains,
  shortcutsForKey,
  shortcutsForSurface,
} from "./parity-keymap"

const row = (surface: string, key: string) => PDV_PARITY_KEYMAP.find((r) => r.surfaceId === surface && r.key === key)

describe("N5-B2 — matriz aprovada e diferenças intencionais", () => {
  for (const surface of OFFICIAL_PDV_SURFACE_IDS) {
    it(surface + ": núcleo F1/F7/Insert/Esc sem teclas duplicadas", () => {
      const rows = shortcutsForSurface(surface)
      for (const key of CORE_COHERENT_KEYS) expect(row(surface, key)).toBeDefined()
      expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
      expect(row(surface, "F1")?.domain).toBe("pagamento")
      expect(row(surface, "F7")?.domain).toBe("espera")
      expect(capabilityKeyOf(row(surface, "F7")!)).toBe("pdv.heldSales")
      expect(row(surface, "Insert")?.domain).toBe("avulso")
    })
  }

  it("Supermercado: F1 é alias seguro de quick[0], F2/F3/F4 preservam formas rápidas", () => {
    expect(row("supermercado", "F1")?.action).toContain("alias seguro do F2")
    expect(row("supermercado", "F1")?.gate).toMatchObject({ key: "sales.paymentMethods" })
    for (const key of ["F2", "F3", "F4"]) expect(row("supermercado", key)?.domain).toBe("pagamento-rapido")
    expect(row("supermercado", "F10")?.domain).toBe("cliente")
  })

  it("F2: cliente no Classic/Assistência/VC, pagamento rápido no Supermercado", () => {
    expect(distinctActionDomains("F2")).toEqual(expect.arrayContaining([
      { domain: "cliente", surfaces: ["classic", "assistencia", "venda-completa"] },
      { domain: "pagamento-rapido", surfaces: ["supermercado"] },
    ]))
  })

  it("F4: quantidade no Classic/Assistência, terceira forma no Supermercado, ausente na VC", () => {
    for (const surface of ["classic", "assistencia"]) expect(row(surface, "F4")?.domain).toBe("quantidade")
    expect(row("venda-completa", "F4")).toBeUndefined()
  })

  it("F5: recebimento no Classic, remoção com confirmação na Assistência", () => {
    expect(row("classic", "F5")?.domain).toBe("recebimento")
    expect(row("assistencia", "F5")?.action).toContain("confirma remoção")
    expect(row("assistencia", "F5")?.gate).toEqual(expect.objectContaining({ condition: expect.stringContaining("confirmação consciente") }))
    expect(row("supermercado", "F5")).toBeUndefined()
    expect(row("venda-completa", "F5")).toBeUndefined()
  })

  it("F10: pagamento com desconto no Classic/Assistência, cliente no Supermercado", () => {
    for (const surface of ["classic", "assistencia"]) expect(row(surface, "F10")?.domain).toBe("pagamento")
    expect(row("venda-completa", "F10")).toBeUndefined()
  })

  it("preserva F3/F8/F9/F12 específicos, sem inventar bindings da Venda Completa", () => {
    expect(shortcutsForKey("F3")).toHaveLength(4)
    for (const key of ["F8", "F9", "F12"]) {
      expect(shortcutsForKey(key)).toHaveLength(3)
      expect(row("venda-completa", key)).toBeUndefined()
    }
    for (const surface of ["classic", "assistencia", "supermercado"]) expect(row(surface, "F9")?.domain).toBe("recebimento")
  })

  it("F7 da VC cobre modal, dropdown, repeat e finalização em voo", () => {
    expect(row("venda-completa", "F7")?.gate).toMatchObject({ condition: "sem modal, dropdown, repeat ou finalização em voo" })
  })

  it("mantém as diferenças aprovadas e sua proveniência", () => {
    expect([...GAP_P2_04_CONFLICT_KEYS]).toEqual(["F2", "F4", "F5", "F10"])
    for (const key of GAP_P2_04_CONFLICT_KEYS) expect(distinctActionDomains(key).length).toBeGreaterThanOrEqual(2)
    for (const [key, surfaces] of Object.entries(A3_COLLISION_MARKS)) {
      for (const surface of surfaces) expect(row(surface, key)).toBeDefined()
    }
    expect(KEYMAP_DOC_NOTES.flatMap((note) => note.auditRefs)).toContain("GAP-P3-06")
  })
})

describe("N5-B2 — ajuda do Clássico sem promessas mortas", () => {
  it("não anuncia Espaço/Ctrl+L; anuncia End, F8 e Escape contextual", () => {
    expect(PDV_KEYMAP.some((r) => r.key === "Espaço" || r.key === "Ctrl+L")).toBe(false)
    expect(PDV_KEYMAP.find((r) => r.key === "End")?.desc).toContain("Ajuda")
    expect(PDV_KEYMAP.find((r) => r.key === "F8")?.desc).toContain("bipe")
    expect(PDV_KEYMAP.find((r) => r.key === "ESC")?.desc).toContain("fora de campos e modais")
  })
})
