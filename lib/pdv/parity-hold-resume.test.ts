/**
 * N5-A F-03 — Contrato de venda em espera (create/resume) por superfície.
 *
 * Fonte: audit A.1 #12/#13, §F-03, D-01, GOAL §6.
 *
 * Tabela sobre fixtures das 4 superfícies oficiais:
 * 1. criação permitida no runtime; leitura persiste mesmo com heldSales off
 *    (hold nunca é apagado por gate);
 * 2. round-trip loja+terminal isolado e filtro pdvType por superfície;
 * 3. snapshot versionado no save (`withHoldCapabilitiesSnapshot`), congelado;
 * 4. resume: runtime atual vence — snapshot false restringe runtime true;
 *    snapshot true NÃO eleva runtime false; hold legado (sem snapshot) válido;
 * 5. cliente histórico preservado; desconto operacional condicionado ao
 *    runtime (`resumeDiscountFields`) e desconto de linha VC
 *    (`operationalLineDiscountPct`).
 *
 * Ambiente node: shim mínimo de localStorage (mesmo padrão de pdv-hold.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  getHeldSales,
  newHoldId,
  nextHoldLabel,
  removeHeldSale,
  saveHeldSale,
  withHoldCapabilitiesSnapshot,
  type HeldSale,
} from "../pdv-hold"
import {
  applySnapshotAgainstRuntime,
  buildCapabilitiesSnapshot,
  combineHoldSnapshotWithRuntime,
  operationalLineDiscountPct,
  resolveCapability,
  resumeDiscountFields,
} from "./resolve-capability"
import { fixtureFor, OFFICIAL_SURFACE_FIXTURES } from "./parity-fixtures"
import { CAPABILITIES_RUNTIME_VERSION } from "./capability-types"

function installLocalStorageShim() {
  const store = new Map<string, string>()
  const fakeLocalStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = globalThis
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = fakeLocalStorage
}

function uninstallLocalStorageShim() {
  delete (globalThis as { window?: unknown }).window
  delete (globalThis as { localStorage?: unknown }).localStorage
}

function makeHold(fixtureSurfaceId: (typeof OFFICIAL_SURFACE_FIXTURES)[number]["surfaceId"], overrides?: Partial<HeldSale>): HeldSale {
  return {
    id: newHoldId(),
    label: "Venda 1",
    savedAt: new Date().toISOString(),
    items: [
      { lineId: "line-1", inventoryId: "prod-1", name: "Produto A", price: 30, quantity: 2 },
      { lineId: "line-2", inventoryId: "prod-2", name: "Produto B", price: 10, quantity: 1 },
    ],
    customer: { id: "cli-1", name: "Cliente Histórico", cpf: "12345678909" },
    discountReais: 5,
    discountPercent: 10,
    pdvType: fixtureFor(fixtureSurfaceId).holdPdvType,
    ...overrides,
  }
}

describe("F-03 — criação, round-trip e isolamento por superfície", () => {
  beforeEach(installLocalStorageShim)
  afterEach(uninstallLocalStorageShim)

  for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
    it(`${fixture.surfaceId}: save/resume com pdvType "${fixture.holdPdvType}" isolado por loja+terminal`, () => {
      const hold = makeHold(fixture.surfaceId)
      saveHeldSale("loja-1", "T1", hold)

      // Round-trip na mesma loja+terminal.
      const same = getHeldSales("loja-1", "T1", fixture.holdPdvType)
      expect(same).toHaveLength(1)
      expect(same[0]!.pdvType).toBe(fixture.holdPdvType)
      expect(same[0]!.items).toHaveLength(2)

      // Isolamento: outra loja e outro terminal não veem o hold.
      expect(getHeldSales("loja-2", "T1")).toHaveLength(0)
      expect(getHeldSales("loja-1", "T2")).toHaveLength(0)

      // Filtro pdvType não deixa hold de outra superfície virar resume incompatível.
      saveHeldSale("loja-1", "T1", { ...makeHold("classic"), id: "hold-classic", pdvType: fixture.holdPdvType === "classic" ? "assistencia" : "classic" })
      const filtered = getHeldSales("loja-1", "T1", fixture.holdPdvType)
      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.id).toBe(hold.id)
    })

    it(`${fixture.surfaceId}: snapshot versionado grava no save e congela entradas`, () => {
      const base = makeHold(fixture.surfaceId)
      const snapshot = buildCapabilitiesSnapshot({ storeId: "loja-1", surfaceId: fixture.surfaceId })
      const held = withHoldCapabilitiesSnapshot(base, snapshot)

      expect(held.capabilitiesVersion).toBe(CAPABILITIES_RUNTIME_VERSION)
      expect(held.capabilitiesSnapshot?.surfaceId).toBe(fixture.surfaceId)
      expect(held.capabilitiesSnapshot?.entries.length).toBeGreaterThan(0)
      expect(Object.isFrozen(held.capabilitiesSnapshot)).toBe(true)
      expect(Object.isFrozen(held.capabilitiesSnapshot?.entries)).toBe(true)

      saveHeldSale("loja-1", "T1", held)
      const [persisted] = getHeldSales("loja-1", "T1", fixture.holdPdvType)
      expect(persisted?.capabilitiesSnapshot?.version).toBe(CAPABILITIES_RUNTIME_VERSION)
    })

    it(`${fixture.surfaceId}: resume usa runtime atual; snapshot não eleva runtime false`, () => {
      // Snapshot do passado com pdv.discounts true; runtime atual com override false.
      const snapshot = buildCapabilitiesSnapshot({ storeId: "loja-1", surfaceId: fixture.surfaceId })
      const base = makeHold(fixture.surfaceId)
      const held = withHoldCapabilitiesSnapshot(base, snapshot)

      const resumeCaps = combineHoldSnapshotWithRuntime({
        surfaceId: fixture.surfaceId,
        overrides: { "pdv.discounts": false },
        snapshot: held.capabilitiesSnapshot,
      })
      expect(resumeCaps.isEnabled("pdv.discounts")).toBe(false)

      // Desconto operacional do hold não reaparece com capability efetivamente off.
      const discountRestore = resumeDiscountFields(held, resumeCaps.isEnabled("pdv.discounts"))
      expect(discountRestore).toEqual({ discountReais: 0, discountPercent: 0 })
    })

    it(`${fixture.surfaceId}: snapshot false restringe runtime true; runtime true + snapshot true mantém`, () => {
      const snapshot = buildCapabilitiesSnapshot({
        storeId: "loja-1",
        surfaceId: fixture.surfaceId,
        overrides: { "pdv.discounts": false },
      })
      const current = resolveCapability({ surfaceId: fixture.surfaceId, capabilityKey: "pdv.discounts" })
      const snapshotEntry = snapshot.entries.find((e) => e.key === "pdv.discounts")

      const restricted = applySnapshotAgainstRuntime(current, snapshotEntry)
      expect(restricted.enabled).toBe(false)
      expect(restricted.elevated).toBe(false)

      const currentOn = resolveCapability({ surfaceId: fixture.surfaceId, capabilityKey: "pdv.discounts" })
      const kept = applySnapshotAgainstRuntime(currentOn, { key: "pdv.discounts", supported: true, enabled: true, source: "default" })
      expect(kept.enabled).toBe(true)
      expect(kept.elevated).toBe(false)
    })

    it(`${fixture.surfaceId}: hold legado (sem snapshot) continua válido no resume`, () => {
      const legacy = makeHold(fixture.surfaceId, { capabilitiesVersion: undefined, capabilitiesSnapshot: undefined })
      expect(legacy.capabilitiesSnapshot).toBeUndefined()

      const resumeCaps = combineHoldSnapshotWithRuntime({
        surfaceId: fixture.surfaceId,
        overrides: null,
        snapshot: legacy.capabilitiesSnapshot ?? null,
      })
      // Runtime puro: defaults canônicos (desconto ligado) mesmo sem snapshot.
      expect(resumeCaps.isEnabled("pdv.discounts")).toBe(true)
      const discountRestore = resumeDiscountFields(legacy, resumeCaps.isEnabled("pdv.discounts"))
      expect(discountRestore.discountReais).toBe(5)
      expect(discountRestore.discountPercent).toBe(10)
    })

    it(`${fixture.surfaceId}: cliente histórico preservado no round-trip`, () => {
      const held = withHoldCapabilitiesSnapshot(
        makeHold(fixture.surfaceId),
        buildCapabilitiesSnapshot({ storeId: "loja-1", surfaceId: fixture.surfaceId }),
      )
      saveHeldSale("loja-1", "T1", held)
      const [persisted] = getHeldSales("loja-1", "T1", fixture.holdPdvType)
      expect(persisted?.customer?.id).toBe("cli-1")
      expect(persisted?.customer?.name).toBe("Cliente Histórico")

      removeHeldSale("loja-1", "T1", held.id)
      expect(getHeldSales("loja-1", "T1")).toHaveLength(0)
    })
  }

  it("labels de hold não colidem entre superfícies no mesmo terminal (nextHoldLabel é local)", () => {
    const existing = getHeldSales("loja-1", "T1")
    expect(nextHoldLabel(existing)).toBe("Venda 1")
    expect(newHoldId()).not.toBe(newHoldId())
  })

  it("runtime heldSales=false não apaga holds persistidos (leitura continua possível)", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const hold = makeHold(fixture.surfaceId)
      saveHeldSale("loja-1", "T1", hold)
      expect(getHeldSales("loja-1", "T1", fixture.holdPdvType)).toHaveLength(1)
      const gate = resolveCapability({
        surfaceId: fixture.surfaceId,
        capabilityKey: "pdv.heldSales",
        overrides: { "pdv.heldSales": false },
      })
      expect(gate.enabled).toBe(false) // F7 fica morto, mas o hold persiste.
      removeHeldSale("loja-1", "T1", hold.id)
    }
  })
})

describe("F-03 — desconto de linha operacional na Venda Completa (B-05)", () => {
  it("operationalLineDiscountPct só entra com pdv.discounts efetivamente on", () => {
    const vc = fixtureFor("venda-completa")
    expect(vc.holdPdvType).toBe("venda-completa")
    expect(operationalLineDiscountPct(15, true)).toBe(15)
    expect(operationalLineDiscountPct(15, false)).toBe(0)
    expect(operationalLineDiscountPct(undefined, true)).toBe(0)
  })

  it("resume VC com runtime on restaura desconto de linha do snapshot do carrinho", () => {
    const snapshot = buildCapabilitiesSnapshot({ storeId: "loja-1", surfaceId: "venda-completa" })
    const resumeCaps = combineHoldSnapshotWithRuntime({
      surfaceId: "venda-completa",
      overrides: null,
      snapshot,
    })
    const storedLineDiscount = 12
    const applied = operationalLineDiscountPct(storedLineDiscount, resumeCaps.isEnabled("pdv.discounts"))
    expect(applied).toBe(12)
  })
})
