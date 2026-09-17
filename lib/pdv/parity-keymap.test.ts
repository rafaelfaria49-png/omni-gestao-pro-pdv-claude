/**
 * N5-A F-02 — Contrato do keymap ATUAL por superfície (extração sem decisão).
 *
 * Fonte: audit §A.3, GAP-P2-04, GAP-P3-01/02/03/06/09/12, D-03.
 *
 * Provas:
 * 1. Tabela canônica (`parity-keymap.ts`) descreve o comportamento existente —
 *    drift guard estático por marcador de handler + contagem de F-keys.
 * 2. Núcleo coerente F1/F7/Insert/Esc congelado (audit: convergente).
 * 3. Colisões GAP-P2-04 (F2/F4/F5/F10) e marcas ≠ da tabela A.3 registradas
 *    objetivamente (tecla × superfície × domínio × gate) — SEM resolver.
 * 4. Divergências doc×código (P3-01/02/03/06, D-03) congeladas como estão.
 *
 * NÃO decide tecla nova, não declara fluxo vencedor e não corrige nada:
 * a decisão de keymap-base (roadmap) deve editar a tabela + handlers juntos.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { fixtureFor, OFFICIAL_SURFACE_FIXTURES } from "./parity-fixtures"
import {
  A3_COLLISION_MARKS,
  CORE_COHERENT_KEYS,
  distinctActionDomains,
  GAP_P2_04_CONFLICT_KEYS,
  KEYMAP_DOC_NOTES,
  PDV_PARITY_KEYMAP,
  shortcutsForKey,
  shortcutsForSurface,
  capabilityKeysInKeymap,
  capabilityKeyOf,
} from "./parity-keymap"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

/** Marcador de código que prova que o handler da tecla existe no fonte. */
const DRIFT_MARKERS: Record<string, string[]> = {
  classic: [
    'case "F1":',
    'case "F2":',
    'case "F3":',
    'case "F4":',
    'case "F5":',
    'case "F6":',
    'case "F7":',
    'case "F8":',
    'case "F9":',
    'case "F10":',
    'case "F12":',
    'case "End":',
    'case "CTRL":',
    'e.key === "Insert"',
    'e.key === "Delete"',
    'e.key === "Escape" && cart.length > 0',
  ],
  assistencia: [
    'case "F1":',
    'case "F2":',
    'case "F3":',
    'case "F4":',
    'case "F5":',
    'case "F6":',
    'case "F7":',
    'case "F8":',
    'case "F9":',
    'case "F10":',
    'case "F11":',
    'case "F12":',
    'e.key === "Insert"',
    'e.key === "Delete"',
    'e.key === "End"',
    'e.ctrlKey && (e.key === "l" || e.key === "L")',
    'if (e.key !== "Escape") return',
  ],
  supermercado: [
    'e.key === "F2"',
    'e.key === "F3"',
    'e.key === "F4"',
    'e.key === "F7"',
    'e.key === "F8"',
    'e.key === "F9"',
    'e.key === "F10"',
    'e.key === "F12"',
    'e.key === "Insert"',
    'if (e.key !== "Escape") return',
  ],
  "venda-completa": [
    'case "F1":',
    'case "F2":',
    'case "F3":',
    'case "Insert":',
    'case "F7":',
    'case "End":',
    'case "Escape":',
  ],
}

/** Contagem exata de bindings de F-key por fonte (guarda bidirecional). */
const FKEY_BIND_COUNTS: Record<string, { pattern: RegExp; count: number }> = {
  classic: { pattern: /case "F\d{1,2}":/g, count: 11 },
  assistencia: { pattern: /case "F\d{1,2}":/g, count: 12 },
  supermercado: { pattern: /e\.key === "F\d{1,2}"/g, count: 8 },
  "venda-completa": { pattern: /case "F\d{1,2}":/g, count: 4 },
}

describe("F-02 — tabela canônica fiel ao código vivo (drift guard)", () => {
  for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
    it(`${fixture.surfaceId}: toda tecla da tabela tem handler no componente`, () => {
      const source = read(fixture.componentPath)
      const rows = shortcutsForSurface(fixture.surfaceId)
      expect(rows.length, "tabela tem linhas para a superfície").toBeGreaterThan(0)
      for (const marker of DRIFT_MARKERS[fixture.surfaceId]) {
        expect(source, `${fixture.surfaceId} marker ${marker}`).toContain(marker)
      }
      // Tabela ⊆ marcadores: cada linha precisa de um marker correspondente.
      for (const row of rows) {
        const keyMarkers = DRIFT_MARKERS[fixture.surfaceId].filter((m) =>
          m.includes(`"${row.key}"`) ||
          (row.key === "Esc" && m.includes("Escape")) ||
          (row.key === "Ctrl (keyup)" && m.includes("CTRL")) ||
          (row.key === "Ctrl+L" && m.includes("e.ctrlKey")),
        )
        expect(
          keyMarkers.length,
          `${fixture.surfaceId}/${row.key}: linha da tabela sem marker de drift`,
        ).toBeGreaterThan(0)
      }
    })

    it(`${fixture.surfaceId}: contagem de F-keys vinculados não muda silenciosamente`, () => {
      const source = read(fixture.componentPath)
      const { pattern, count } = FKEY_BIND_COUNTS[fixture.surfaceId]
      const found = source.match(pattern)?.length ?? 0
      expect(found, `${fixture.surfaceId}: F-keys vinculados (mudou? atualize parity-keymap.ts)`).toBe(count)
    })
  }

  it("nenhuma superfície oficial ficou sem linhas de keymap", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      expect(shortcutsForSurface(fixture.surfaceId).length).toBeGreaterThanOrEqual(7)
    }
  })
})

describe("F-02 — núcleo coerente F1/F7/Insert/Esc (congelado pelo audit)", () => {
  it("F7 = espera com gate pdv.heldSales nas 4 superfícies", () => {
    const rows = shortcutsForKey("F7")
    expect(rows.map((r) => r.surfaceId).sort()).toEqual([
      "assistencia",
      "classic",
      "supermercado",
      "venda-completa",
    ])
    for (const row of rows) {
      expect(row.domain).toBe("espera")
      expect(capabilityKeyOf(row)).toBe("pdv.heldSales")
    }
  })

  it("Insert = item avulso nas 4 superfícies, sem gate de capability", () => {
    const rows = shortcutsForKey("Insert")
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.domain).toBe("avulso")
      expect(row.gate.kind).toBe("none")
    }
  })

  it("F1 é domínio pagamento onde vinculada; Supermercado NÃO prende F1 (nota A.3/D-03)", () => {
    const rows = shortcutsForKey("F1")
    expect(rows.map((r) => r.surfaceId).sort()).toEqual([
      "assistencia",
      "classic",
      "venda-completa",
    ])
    for (const row of rows) expect(row.domain).toBe("pagamento")
    expect(rows.find((r) => r.surfaceId === "supermercado")).toBeUndefined()
  })

  it("Esc existe nas 4; nas 3 do switcher remove último em modo-rápido, na VC fecha ajuda", () => {
    const rows = shortcutsForKey("Esc")
    expect(rows).toHaveLength(4)
    for (const row of rows.filter((r) => r.surfaceId !== "venda-completa")) {
      expect(row.domain).toBe("remover-item")
      expect(row.action).toContain("modo-rápido")
    }
    expect(rows.find((r) => r.surfaceId === "venda-completa")?.domain).toBe("fechar")
  })

  it("conjunto de núcleo do audit é exatamente F1/F7/Insert/Esc", () => {
    expect([...CORE_COHERENT_KEYS].sort()).toEqual(["Esc", "F1", "F7", "Insert"])
  })
})

describe("F-02 — colisões GAP-P2-04 registradas objetivamente (sem resolver)", () => {
  it("F2/F4/F5/F10 têm ≥2 domínios distintos entre superfícies que prendem a tecla", () => {
    for (const key of GAP_P2_04_CONFLICT_KEYS) {
      const domains = distinctActionDomains(key)
      expect(domains.length, `${key}: colisão objetiva registrada`).toBeGreaterThanOrEqual(2)
    }
  })

  it("F2: cliente (Classic/Assist/VC) vs pagamento-rapido (Super)", () => {
    const domains = new Map(distinctActionDomains("F2").map((d) => [d.domain, d.surfaces]))
    expect(domains.get("cliente")!.sort()).toEqual(["assistencia", "classic", "venda-completa"])
    expect(domains.get("pagamento-rapido")).toEqual(["supermercado"])
  })

  it("F4: quantidade (Classic/Assist) vs pagamento-rapido (Super)", () => {
    const domains = new Map(distinctActionDomains("F4").map((d) => [d.domain, d.surfaces]))
    expect(domains.get("quantidade")!.sort()).toEqual(["assistencia", "classic"])
    expect(domains.get("pagamento-rapido")).toEqual(["supermercado"])
  })

  it("F5: recebimento (Classic) vs remover-item (Assist); Super/VC não prendem", () => {
    const domains = new Map(distinctActionDomains("F5").map((d) => [d.domain, d.surfaces]))
    expect(domains.get("recebimento")).toEqual(["classic"])
    expect(domains.get("remover-item")).toEqual(["assistencia"])
    expect(shortcutsForKey("F5").find((r) => r.surfaceId === "supermercado")).toBeUndefined()
    expect(shortcutsForKey("F5").find((r) => r.surfaceId === "venda-completa")).toBeUndefined()
  })

  it("F10: pagamento (Classic/Assist) vs cliente (Super)", () => {
    const domains = new Map(distinctActionDomains("F10").map((d) => [d.domain, d.surfaces]))
    expect(domains.get("pagamento")!.sort()).toEqual(["assistencia", "classic"])
    expect(domains.get("cliente")).toEqual(["supermercado"])
  })

  it("marcas ≠ da tabela A.3 batem com a superfície divergente na tabela canônica", () => {
    for (const [key, markedSurfaces] of Object.entries(A3_COLLISION_MARKS)) {
      for (const surfaceId of markedSurfaces) {
        const row = shortcutsForKey(key).find((r) => r.surfaceId === surfaceId)
        expect(row, `${key} em ${surfaceId} existe na tabela canônica`).toBeDefined()
      }
    }
  })

  it("F12 não existe na Venda Completa (múltiplo só via modal — D-03/P2-04)", () => {
    expect(shortcutsForKey("F12").find((r) => r.surfaceId === "venda-completa")).toBeUndefined()
    expect(shortcutsForKey("F12")).toHaveLength(3)
  })

  it("toda colisão GAP-P2-04 conecta o gate/capability relacionado", () => {
    // F2/F4/F5/F10: nenhuma linha da colisão pode ficar sem gate declarado
    // (capability OU runtime) — evidência da coluna gate do audit §A.3.
    for (const key of GAP_P2_04_CONFLICT_KEYS) {
      for (const row of shortcutsForKey(key)) {
        expect(row.gate.kind, `${key}/${row.surfaceId} declara gate`).not.toBe("none")
      }
    }
  })

  it("gates do keymap batem com capabilities consultadas no fonte da borda", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const source = read(fixture.componentPath)
      for (const capKey of capabilityKeysInKeymap(fixture.surfaceId)) {
        expect(
          source,
          `${fixture.surfaceId} consulta "${capKey}" no código (audit A.3 coluna gate)`,
        ).toContain(`"${capKey}"`)
      }
    }
  })
})

describe("F-02 — divergências doc×código congeladas (P3-01/02/03/06, D-03)", () => {
  it("GAP-P3-02: PDV_KEYMAP do Classic lista Espaço/Ctrl+L que continuam sem handler", () => {
    const keymapDoc = read("lib/pdv-keymap.ts")
    expect(keymapDoc).toContain('desc: "Finalizar venda"') // Espaço
    expect(keymapDoc).toContain('desc: "Limpar carrinho (Assistência)"') // Ctrl+L
    // Handler real não intercepta Espaço nem Ctrl+L (mortos, documentado).
    const classic = read(fixtureFor("classic").componentPath)
    expect(classic).not.toContain('e.key === " "')
    expect(classic).not.toContain('e.key === "l"')
  })

  it("GAP-P3-03: F10 do Classic permanece alias exato do F1 (openPaymentFlow null/false)", () => {
    const classic = read(fixtureFor("classic").componentPath)
    const f1 = classic.indexOf('case "F1":')
    const f10 = classic.indexOf('case "F10":')
    expect(f1).toBeGreaterThan(-1)
    expect(f10).toBeGreaterThan(f1)
    expect(classic.slice(f1, f1 + 60)).toContain("openPaymentFlow(null, false)")
    expect(classic.slice(f10, f10 + 260)).toContain("openPaymentFlow(null, false)")
  })

  it("GAP-P3-01: End abre ajuda no Classic; F1 continua pagamento (help divergente congelado)", () => {
    const classic = read(fixtureFor("classic").componentPath)
    const endCase = classic.slice(classic.indexOf('case "End":'), classic.indexOf('case "F2":'))
    expect(endCase).toContain("setShowKeyboardHelp(true)")
  })

  it("GAP-P3-06: F9 da Assistência continua Recebimento (help diz Limpar — divergência viva)", () => {
    const assist = read(fixtureFor("assistencia").componentPath)
    expect(assist).toContain('{ key: "F9",  label: "Limpar carrinho",             status: "ok" },')
    const f9 = assist.slice(assist.indexOf('case "F9":'), assist.indexOf('case "F10":'))
    expect(f9).toContain("setRecebimentoOpen(true)")
  })

  it("GAP-P3-09: guard parcial do F7 na VC permanece registrado na tabela", () => {
    const vcF7 = shortcutsForKey("F7").find((r) => r.surfaceId === "venda-completa")
    expect(vcF7?.auditRefs).toContain("GAP-P3-09")
    expect(vcF7?.action).toContain("guard parcial")
  })

  it("notas doc×código do audit estão registradas na extração", () => {
    const refs = KEYMAP_DOC_NOTES.flatMap((n) => n.auditRefs)
    for (const ref of ["D-03", "GAP-P3-01", "GAP-P3-02", "GAP-P3-06"]) {
      expect(refs, `nota ${ref} registrada`).toContain(ref)
    }
  })

  it("nenhuma linha do keymap marca um fluxo vencedor (extração não decide)", () => {
    for (const row of PDV_PARITY_KEYMAP) {
      expect(row.action.toLowerCase()).not.toContain("deve vencer")
      expect(row.action.toLowerCase()).not.toContain("correto é")
    }
  })
})
