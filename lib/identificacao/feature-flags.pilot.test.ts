import { describe, expect, it } from "vitest"
import { identificationEnabled } from "./feature-flags.server"

const pilot = "loja-2"
const production = {
  VERCEL_ENV: "production",
  VESTUARIO_P03_ENABLED: "1",
  VESTUARIO_P03_PRODUCTION_ENABLED: "1",
  VESTUARIO_P03_STORE_ALLOWLIST: pilot,
  VESTUARIO_CATALOG_ENABLED: "1",
  VESTUARIO_CATALOG_PRODUCTION_ENABLED: "1",
  VESTUARIO_STORE_ALLOWLIST: pilot,
}

describe("P03 Production pilot", () => {
  it("enables only the P02-authorized pilot", () => {
    expect(identificationEnabled(pilot, production)).toBe(true)
    for (const storeId of ["", "loja-1", "loja-20", " loja-2"]) {
      expect(identificationEnabled(storeId, production)).toBe(false)
    }
  })

  it.each([
    ["VESTUARIO_P03_ENABLED", "0"],
    ["VESTUARIO_P03_PRODUCTION_ENABLED", undefined],
    ["VESTUARIO_P03_PRODUCTION_ENABLED", "true"],
    ["VESTUARIO_CATALOG_ENABLED", "0"],
    ["VESTUARIO_CATALOG_PRODUCTION_ENABLED", "0"],
    ["VESTUARIO_STORE_ALLOWLIST", "loja-1"],
    ["VESTUARIO_P03_STORE_ALLOWLIST", ""],
    ["VESTUARIO_P03_STORE_ALLOWLIST", "*"],
    ["VESTUARIO_P03_STORE_ALLOWLIST", "loja-2, loja-1"],
    ["VESTUARIO_P03_STORE_ALLOWLIST", "loja-2, loja-2"],
    ["VERCEL_ENV", "staging"],
  ])("fails closed when %s is %s", (key, value) => {
    expect(identificationEnabled(pilot, { ...production, [key]: value })).toBe(false)
  })

  it.each(["development", "preview"])("preserves the synthetic allowlist in %s", (VERCEL_ENV) => {
    const qa = { VERCEL_ENV, VESTUARIO_P03_ENABLED: "1", VESTUARIO_P03_STORE_ALLOWLIST: "a,b" }
    expect(identificationEnabled("a", qa)).toBe(true)
    expect(identificationEnabled("b", qa)).toBe(true)
    expect(identificationEnabled("c", qa)).toBe(false)
  })
})
