import { describe, expect, it } from "vitest"
import { resolvePdvScaleVisorVisible } from "./pdv-scale-visor-settings"
import { mergePrinterConfigServerSide } from "./pdv-settings-server-first"
import { validateCapabilitiesPayload } from "./capabilities-persistence-v1"

describe("Preferência exclusivamente visual por unidade", () => {
  it.each([
    [undefined, "padaria", true], [false, "padaria", false], [true, "padaria", true],
    [undefined, "assistencia", false], [true, "assistencia", true], [false, "assistencia", false],
    [undefined, undefined, false], ["true", "comercio", false], ["false", "padaria", true],
  ])("explícito %s, ramo %s → %s", (explicit, branch, expected) => {
    expect(resolvePdvScaleVisorVisible(explicit, branch, true)).toBe(expected)
  })
  it("não aplica configuração/padrão antes de confirmar a loja", () => {
    expect(resolvePdvScaleVisorVisible(true, "padaria", false)).toBe(false)
  })
  it("patch mínimo preserva todos os irmãos e false sobrevive a mudança de ramo e serialização", () => {
    const existing = { impressao: { viasCupom: 2 }, appearance: { studioTheme: "black" },
      pdvParams: { atalhosRapidos: [] }, capabilities: { version: 1, overrides: {}, business: { primaryBranch: "padaria" } },
      unknown: { preserved: true } }
    const saved = mergePrinterConfigServerSide(existing, { pdvScaleVisorVisible: false }, false)
    expect(saved).toEqual({ ...existing, pdvScaleVisorVisible: false })
    const reloaded = JSON.parse(JSON.stringify(saved))
    reloaded.capabilities.business.primaryBranch = "comercio"
    expect(resolvePdvScaleVisorVisible(reloaded.pdvScaleVisorVisible, "padaria", true)).toBe(false)
    expect(resolvePdvScaleVisorVisible(reloaded.pdvScaleVisorVisible, reloaded.capabilities.business.primaryBranch, true)).toBe(false)
    expect(mergePrinterConfigServerSide(saved, { impressao: { viasCupom: 3 } }, false).pdvScaleVisorVisible).toBe(false)
  })
  it.each(["pdv.scale", "pdv.scale.weight", "pdv.scale.visor", "sale.fractionalQty"])("%s continua bloqueada", (key) => {
    expect(validateCapabilitiesPayload({ version: 1, overrides: { [key]: true } }).ok).toBe(false)
  })
})
