import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  BLOCKED_CAPABILITY_KEYS_V1,
  KNOWN_CAPABILITY_KEYS_V1,
} from "@/lib/capabilities-persistence-v1"
import {
  CAPABILITIES_RUNTIME_VERSION,
} from "@/lib/pdv/capability-types"
import {
  PDV_CAPABILITY_SUPPORT_MATRIX,
  assertMatrixCoversV1Allowlist,
  canonicalDefaultEnabled,
  isCapabilitySupportedOnSurface,
} from "@/lib/pdv/capability-support-matrix"
import {
  applySnapshotAgainstRuntime,
  buildCapabilitiesSnapshot,
  combineHoldSnapshotWithRuntime,
  isBlockedCapabilityKey,
  resolveAllKnownCapabilities,
  resolveCapability,
  resumeDiscountFields,
} from "@/lib/pdv/resolve-capability"
import {
  PDV_BLACK_REGISTRY_NOTE,
  PDV_REGISTRY,
  assertRegistryTaxonomy,
  officialSurfaceIdsFromRegistry,
  resolveSwitcherSurface,
} from "@/lib/pdv/pdv-registry"
import {
  EXPERIMENTAL_PDV_SURFACE_IDS,
  OFFICIAL_PDV_SURFACE_IDS,
  PDV_BLACK_CLASSIFICATION,
  isOfficialPdvSurfaceId,
  surfaceIdFromHeldPdvType,
  surfaceIdFromSwitcherLayouts,
} from "@/lib/pdv/surface-ids"
import {
  getHeldSales,
  saveHeldSale,
  withHoldCapabilitiesSnapshot,
  type HeldSale,
} from "@/lib/pdv-hold"

const ROOT = resolve(process.cwd())

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
}

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

const emptyHold = (over: Partial<HeldSale> = {}): HeldSale => ({
  id: "hold-1",
  label: "Venda 1",
  savedAt: "2026-01-01T00:00:00.000Z",
  items: [{ lineId: "l1", inventoryId: "p1", name: "Item", price: 10, quantity: 1 }],
  pdvType: "classic",
  ...over,
})

describe("N4 — surface IDs", () => {
  it("1. expõe as 4 superfícies oficiais", () => {
    expect([...OFFICIAL_PDV_SURFACE_IDS]).toEqual([
      "classic",
      "assistencia",
      "supermercado",
      "venda-completa",
    ])
    expect(OFFICIAL_PDV_SURFACE_IDS.every(isOfficialPdvSurfaceId)).toBe(true)
  })

  it("2. Next é experimental/gated", () => {
    expect([...EXPERIMENTAL_PDV_SURFACE_IDS]).toEqual(["next"])
    const next = PDV_REGISTRY.find((e) => e.surfaceId === "next")
    expect(next?.status).toBe("experimental")
    expect(next?.gated).toBe(true)
    expect(readSrc("lib/feature-flags.ts")).toContain("experimentalPdvEnabled")
    expect(readSrc("app/dashboard/pdv-next/page.tsx")).toContain("experimentalPdvEnabled")
  })

  it("3. Black não é superfície oficial", () => {
    expect(PDV_BLACK_CLASSIFICATION).toBe("next-shell")
    expect(PDV_BLACK_REGISTRY_NOTE.officialSurface).toBe(false)
    expect(PDV_REGISTRY.some((e) => (e.surfaceId as string) === "black")).toBe(false)
    expect(isOfficialPdvSurfaceId("black")).toBe(false)
    expect(surfaceIdFromHeldPdvType("black")).toBe("next")
  })
})

describe("N4 — resolver", () => {
  it("4. default canônico reproduz comportamento atual nas suportadas", () => {
    for (const surface of OFFICIAL_PDV_SURFACE_IDS) {
      for (const key of KNOWN_CAPABILITY_KEYS_V1) {
        const resolved = resolveCapability({ surfaceId: surface, capabilityKey: key })
        if (isCapabilitySupportedOnSurface(key, surface)) {
          expect(resolved.source).toBe("default")
          expect(resolved.supported).toBe(true)
          expect(resolved.enabled).toBe(canonicalDefaultEnabled(key, surface))
          expect(resolved.enabled).toBe(true)
        } else {
          expect(resolved.enabled).toBe(false)
          expect(resolved.source).toBe("unsupported")
        }
      }
    }
  })

  it("5. override false desliga capability suportada", () => {
    const r = resolveCapability({
      surfaceId: "classic",
      capabilityKey: "pdv.tables",
      overrides: { "pdv.tables": false },
    })
    expect(r.enabled).toBe(false)
    expect(r.supported).toBe(true)
    expect(r.source).toBe("override")
  })

  it("6. override true em suportada habilita", () => {
    const r = resolveCapability({
      surfaceId: "classic",
      capabilityKey: "sales.paymentMethods",
      overrides: { "sales.paymentMethods": { enabled: true } },
    })
    expect(r.enabled).toBe(true)
    expect(r.source).toBe("override")
  })

  it("7. override true em unsupported não habilita", () => {
    const r = resolveCapability({
      surfaceId: "classic",
      capabilityKey: "pdv.filmLookup",
      overrides: { "pdv.filmLookup": true },
    })
    expect(r.supported).toBe(false)
    expect(r.enabled).toBe(false)
    expect(r.source).toBe("unsupported")
  })

  it("8. scale/fracionado nunca habilitam", () => {
    for (const key of BLOCKED_CAPABILITY_KEYS_V1) {
      expect(isBlockedCapabilityKey(key)).toBe(true)
      const r = resolveCapability({
        surfaceId: "classic",
        capabilityKey: key,
        overrides: { [key]: true } as never,
      })
      expect(r.enabled).toBe(false)
      expect(r.source).toBe("blocked")
    }
    expect(
      resolveCapability({ surfaceId: "supermercado", capabilityKey: "pdv.scale.weight" }).enabled,
    ).toBe(false)
  })
})

describe("N4 — registry e paridade de bordas", () => {
  it("9. registry seleciona a mesma superfície atual do switcher", () => {
    expect(resolveSwitcherSurface("classic", "lovable").renderKey).toBe("classic")
    expect(resolveSwitcherSurface("classic", "services").renderKey).toBe("assistencia")
    expect(resolveSwitcherSurface("supermercado", "lovable").renderKey).toBe("supermercado")
    expect(resolveSwitcherSurface("next", "lovable").renderKey).toBe("next-redirect")
    expect(surfaceIdFromSwitcherLayouts("classic", "lovable")).toBe("classic")
    const src = readSrc("components/dashboard/vendas/vendas-pdv.tsx")
    expect(src).toContain("resolveSwitcherSurface")
    expect(src).toContain('entry.renderKey === "supermercado"')
    expect(src).toContain('entry.renderKey === "assistencia"')
    expect(src).toContain('entry.renderKey === "next-redirect"')
  })

  it("10–13. defaults oficiais preservam comportamento (piloto + rollout)", () => {
    const classicTables = resolveCapability({ surfaceId: "classic", capabilityKey: "pdv.tables" })
    const classicPay = resolveCapability({
      surfaceId: "classic",
      capabilityKey: "sales.paymentMethods",
    })
    expect(classicTables.enabled).toBe(true)
    expect(classicPay.enabled).toBe(true)

    expect(resolveCapability({ surfaceId: "assistencia", capabilityKey: "pdv.quickServices" }).enabled).toBe(true)
    expect(resolveCapability({ surfaceId: "assistencia", capabilityKey: "sales.paymentMethods" }).enabled).toBe(true)
    expect(resolveCapability({ surfaceId: "classic", capabilityKey: "pdv.quickServices" }).enabled).toBe(false)

    expect(resolveCapability({ surfaceId: "supermercado", capabilityKey: "sales.paymentMethods" }).enabled).toBe(true)
    expect(resolveCapability({ surfaceId: "supermercado", capabilityKey: "pdv.tables" }).enabled).toBe(true)

    expect(resolveCapability({ surfaceId: "venda-completa", capabilityKey: "sales.paymentMethods" }).enabled).toBe(true)
    expect(resolveCapability({ surfaceId: "venda-completa", capabilityKey: "pdv.tables" }).enabled).toBe(false)

    assertMatrixCoversV1Allowlist()
    assertRegistryTaxonomy()
    expect(officialSurfaceIdsFromRegistry()).toEqual([...OFFICIAL_PDV_SURFACE_IDS])
  })
})

describe("N4 — multi-loja", () => {
  it("14. Loja A/B isoladas (overrides não cruzam)", () => {
    const snapA = buildCapabilitiesSnapshot({
      storeId: "loja-a",
      surfaceId: "classic",
      overrides: { "pdv.tables": false },
    })
    const snapB = buildCapabilitiesSnapshot({
      storeId: "loja-b",
      surfaceId: "classic",
      overrides: {},
    })
    expect(snapA.entries.find((e) => e.key === "pdv.tables")?.enabled).toBe(false)
    expect(snapB.entries.find((e) => e.key === "pdv.tables")?.enabled).toBe(true)
    expect(snapA.storeId).toBe("loja-a")
    expect(snapB.storeId).toBe("loja-b")
  })

  it("15. troca de loja recalcula capabilities", () => {
    const before = resolveAllKnownCapabilities("classic", { "sales.paymentMethods": false })
    const after = resolveAllKnownCapabilities("classic", {})
    expect(before.find((c) => c.capabilityKey === "sales.paymentMethods")?.enabled).toBe(false)
    expect(after.find((c) => c.capabilityKey === "sales.paymentMethods")?.enabled).toBe(true)
    const hookSrc = readSrc("lib/pdv/use-pdv-capabilities.ts")
    expect(hookSrc).toContain("[surfaceId, overrides, storeId]")
    expect(hookSrc).toContain("useStoreSettings")
  })
})

describe("N4 — holds / snapshot", () => {
  beforeEach(installLocalStorageShim)
  afterEach(uninstallLocalStorageShim)

  it("16. hold novo salva version + snapshot", () => {
    const snapshot = buildCapabilitiesSnapshot({ storeId: "loja-1", surfaceId: "classic" })
    const sale = withHoldCapabilitiesSnapshot(emptyHold(), snapshot)
    saveHeldSale("loja-1", "T1", sale)
    const [got] = getHeldSales("loja-1", "T1")
    expect(got?.capabilitiesVersion).toBe(CAPABILITIES_RUNTIME_VERSION)
    expect(got?.capabilitiesSnapshot?.version).toBe(1)
    expect(got?.capabilitiesSnapshot?.entries.length).toBe(KNOWN_CAPABILITY_KEYS_V1.length)
  })

  it("17. hold legado sem snapshot continua válido", () => {
    saveHeldSale("loja-1", "T1", emptyHold())
    const [got] = getHeldSales("loja-1", "T1")
    expect(got?.id).toBe("hold-1")
    expect(got?.capabilitiesSnapshot).toBeUndefined()
    expect(got?.items).toHaveLength(1)
  })

  it("18. snapshot permanece congelado", () => {
    const snapshot = buildCapabilitiesSnapshot({ storeId: "loja-1", surfaceId: "classic" })
    const sale = withHoldCapabilitiesSnapshot(emptyHold(), snapshot)
    expect(Object.isFrozen(sale.capabilitiesSnapshot)).toBe(true)
    try {
      ;(sale.capabilitiesSnapshot as { storeId: string }).storeId = "loja-hack"
    } catch {
      /* strict mode */
    }
    expect(sale.capabilitiesSnapshot?.storeId).toBe("loja-1")
    const originalEntries = JSON.stringify(sale.capabilitiesSnapshot?.entries)
    saveHeldSale("loja-1", "T1", sale)
    const [got] = getHeldSales("loja-1", "T1")
    expect(JSON.stringify(got?.capabilitiesSnapshot?.entries)).toBe(originalEntries)
    expect(got?.capabilitiesSnapshot?.storeId).toBe("loja-1")
  })

  it("19. snapshot não eleva capability atual", () => {
    const currentOff = resolveCapability({
      surfaceId: "classic",
      capabilityKey: "pdv.tables",
      overrides: { "pdv.tables": false },
    })
    const applied = applySnapshotAgainstRuntime(currentOff, {
      key: "pdv.tables",
      supported: true,
      enabled: true,
      source: "override",
    })
    expect(applied.enabled).toBe(false)
    expect(applied.elevated).toBe(true)

    const unsupported = resolveCapability({
      surfaceId: "classic",
      capabilityKey: "pdv.filmLookup",
    })
    const film = applySnapshotAgainstRuntime(unsupported, {
      key: "pdv.filmLookup",
      supported: true,
      enabled: true,
      source: "override",
    })
    expect(film.enabled).toBe(false)
  })

  it("snapshot true não eleva runtime false", () => {
    const combined = combineHoldSnapshotWithRuntime({
      surfaceId: "classic",
      overrides: { "pdv.heldSales": false },
      snapshot: buildCapabilitiesSnapshot({ storeId: "loja-1", surfaceId: "classic" }),
    })
    expect(combined.isEnabled("pdv.heldSales")).toBe(false)
  })

  it("snapshot false restringe runtime true", () => {
    const snap = buildCapabilitiesSnapshot({
      storeId: "loja-1",
      surfaceId: "classic",
      overrides: { "pdv.discounts": false },
    })
    const combined = combineHoldSnapshotWithRuntime({
      surfaceId: "classic",
      overrides: {},
      snapshot: snap,
    })
    expect(combined.isEnabled("pdv.discounts")).toBe(false)
    expect(resolveCapability({ surfaceId: "classic", capabilityKey: "pdv.discounts" }).enabled).toBe(true)
  })

  it("hold legado sem snapshot usa runtime atual", () => {
    const off = combineHoldSnapshotWithRuntime({
      surfaceId: "classic",
      overrides: { "pdv.discounts": false },
      snapshot: undefined,
    })
    expect(off.isEnabled("pdv.discounts")).toBe(false)
    const on = combineHoldSnapshotWithRuntime({
      surfaceId: "classic",
      overrides: {},
      snapshot: null,
    })
    expect(on.isEnabled("pdv.discounts")).toBe(true)
  })

  it("retomada não reaplica desconto se capability estiver efetivamente off", () => {
    expect(resumeDiscountFields({ discountReais: 10, discountPercent: 5 }, false)).toEqual({
      discountReais: 0,
      discountPercent: 0,
    })
    expect(resumeDiscountFields({ discountReais: 10, discountPercent: 5 }, true)).toEqual({
      discountReais: 10,
      discountPercent: 5,
    })
  })
})

describe("N4 — wiring das superfícies e contrato N3", () => {
  it("20. N1/N2/N3 sem regressão estrutural de contratos", () => {
    expect(KNOWN_CAPABILITY_KEYS_V1).toContain("pdv.tables")
    expect(readSrc("lib/capabilities-persistence-v1.ts")).toContain("KNOWN_CAPABILITY_KEYS_V1")
    expect(readSrc("lib/pdv/resolve-capability.ts")).toContain("KNOWN_CAPABILITY_KEYS_V1")
    const sample = resolveCapability({ surfaceId: "classic", capabilityKey: "pdv.tables" })
    expect(sample).toEqual({
      surfaceId: "classic",
      capabilityKey: "pdv.tables",
      supported: true,
      enabled: true,
      source: "default",
      version: 1,
    })
    expect("entitled" in sample).toBe(false)
    expect("plan" in sample).toBe(false)
    expect("license" in sample).toBe(false)
    expect(readSrc("lib/feature-flags.ts")).toContain("NEXT_PUBLIC_OG_EXPERIMENTAL")
  })

  it("piloto Classic e rollout usam o mesmo hook", () => {
    expect(readSrc("components/dashboard/vendas/pdv-classic.tsx")).toContain('usePdvCapabilities("classic")')
    expect(readSrc("components/dashboard/vendas/pdv-assistencia-enterprise.tsx")).toContain(
      'usePdvCapabilities("assistencia")',
    )
    expect(readSrc("components/dashboard/vendas/pdv-supermercado.tsx")).toContain(
      'usePdvCapabilities("supermercado")',
    )
    expect(readSrc("components/dashboard/vendas/venda-completa-enterprise.tsx")).toContain(
      'usePdvCapabilities("venda-completa")',
    )
    expect(readSrc("app/dashboard/vendas/vendas-page-client.tsx")).toContain("pdv.tables")
    expect(readSrc("lib/pdv-formas-pagamento.ts")).toContain("FormaPagamentoConfig")
  })

  it("matriz não inventa filmLookup/osLookup/quickServices fora do código vivo", () => {
    const film = PDV_CAPABILITY_SUPPORT_MATRIX.find((r) => r.key === "pdv.filmLookup")
    const os = PDV_CAPABILITY_SUPPORT_MATRIX.find((r) => r.key === "pdv.osLookup")
    const qs = PDV_CAPABILITY_SUPPORT_MATRIX.find((r) => r.key === "pdv.quickServices")
    expect(film?.supportedBy).toEqual([])
    expect(os?.supportedBy).toEqual([])
    expect([...qs!.supportedBy]).toEqual(["assistencia"])
  })

  it("Next não herda pdv.tables do Classic", () => {
    const next = resolveCapability({ surfaceId: "next", capabilityKey: "pdv.tables" })
    expect(next.supported).toBe(false)
    expect(next.enabled).toBe(false)
    expect(next.source).toBe("unsupported")
    const vendas = readSrc("app/dashboard/vendas/vendas-page-client.tsx")
    const mesas = readSrc("app/dashboard/vendas/mesas/mesas-page-client.tsx")
    expect(vendas).not.toContain('switcherSurfaceId === "next" ? "classic"')
    expect(mesas).not.toContain('switcherSurfaceId === "next" ? "classic"')
    expect(vendas).toContain("usePdvCapabilities(switcherSurfaceId)")
    expect(mesas).toContain("usePdvCapabilities(switcherSurfaceId)")
    expect(vendas).toContain('pdvCapabilities.isEnabled("pdv.tables")')
    expect(mesas).toContain('pdvCapabilities.isEnabled("pdv.tables")')
  })

  it("gates operacionais nas quatro superfícies oficiais", () => {
    const classic = readSrc("components/dashboard/vendas/pdv-classic.tsx")
    const assist = readSrc("components/dashboard/vendas/pdv-assistencia-enterprise.tsx")
    const superM = readSrc("components/dashboard/vendas/pdv-supermercado.tsx")
    const venda = readSrc("components/dashboard/vendas/venda-completa-enterprise.tsx")
    const modal = readSrc("components/dashboard/vendas/payment-modal.tsx")
    for (const src of [classic, assist, superM, venda]) {
      expect(src).toContain('isEnabled("pdv.heldSales")')
      expect(src).toContain("combineHoldSnapshotWithRuntime")
      expect(src).toContain("resumeDiscountFields")
      expect(src).toContain("discountsEnabled")
      expect(src).toContain("storeCreditEnabled")
      expect(src).toContain("customerSearchEnabled")
      expect(src).toContain("accessoryModelColorEnabled")
    }
    expect(assist).toContain('isEnabled("pdv.quickServices")')
    expect(venda).toContain("allowMultiplePayments={multiplePaymentsEnabled}")
    expect(modal).toContain("allowMultiplePayments")
    expect(modal).toContain("discountsEnabled")
    expect(modal).toContain("storeCreditEnabled")
  })
})

describe("N4 — hold persistido não é apagado quando heldSales=false", () => {
  beforeEach(installLocalStorageShim)
  afterEach(uninstallLocalStorageShim)

  it("getHeldSales continua lendo holds mesmo com runtime off", () => {
    saveHeldSale("loja-1", "T1", emptyHold({ id: "keep-me" }))
    const off = resolveCapability({
      surfaceId: "classic",
      capabilityKey: "pdv.heldSales",
      overrides: { "pdv.heldSales": false },
    })
    expect(off.enabled).toBe(false)
    expect(getHeldSales("loja-1", "T1").map((s) => s.id)).toEqual(["keep-me"])
  })
})
