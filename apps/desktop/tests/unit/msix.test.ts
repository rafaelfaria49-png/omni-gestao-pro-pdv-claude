import { describe, expect, it } from "vitest"
import { buildAppxManifest, CI_TEST_IDENTITY, MsixManifestError, msixVersion, validateIdentity } from "../../scripts/lib/msix-manifest.mjs"
import { MSIX_PROFILE_DIR, packageKind } from "../../src/shared/distribution"

const store = { name: "12345RAFACELL.OmniGestaoPro", publisher: "CN=0A1B2C3D-1111-2222-3333-444455556666", publisherDisplayName: "RAFACELL" }
const base = { version: "1.0.4", displayName: "OmniGestão Pro", description: "Vendas & caixa <loja>" }

describe("versão do MSIX", () => {
  it("x.y.z vira x.y.z.0 (a Store exige a 4ª parte = 0)", () => {
    expect(msixVersion("1.0.4")).toBe("1.0.4.0")
    expect(msixVersion("2.10.300")).toBe("2.10.300.0")
  })
  it("recusa formato fora do padrão, 4 partes, versão 0 e acima de 65535", () => {
    for (const v of ["1.0", "1.0.4.1", "v1.0.4", "0.9.0", "1.70000.0", "", null]) expect(() => msixVersion(v)).toThrow(MsixManifestError)
  })
})

describe("identidade", () => {
  it("aceita a identidade do Partner Center", () => {
    expect(validateIdentity(store, { store: true })).toEqual(store)
  })
  it("a identidade de teste do CI nunca vai para a Store", () => {
    expect(validateIdentity(CI_TEST_IDENTITY)).toEqual({ ...CI_TEST_IDENTITY })
    expect(() => validateIdentity(CI_TEST_IDENTITY, { store: true })).toThrow(/teste do CI/)
    expect(() => validateIdentity({ ...store, publisher: CI_TEST_IDENTITY.publisher }, { store: true })).toThrow(/teste do CI/)
  })
  it("recusa identidade vazia ou malformada (sem inventar valores)", () => {
    expect(() => validateIdentity({ name: "", publisher: "", publisherDisplayName: "" }, { store: true })).toThrow(MsixManifestError)
    expect(() => validateIdentity({ ...store, publisher: "RAFACELL" })).toThrow(/Publisher/)
    expect(() => validateIdentity({ ...store, name: "nome com espaço" })).toThrow(/Identity Name/)
    expect(() => validateIdentity({ ...store, publisherDisplayName: "<x>" })).toThrow(/PublisherDisplayName/)
  })
})

describe("AppxManifest", () => {
  const xml = buildAppxManifest({ ...base, identity: store, store: true })
  it("identidade, versão e x64", () => {
    expect(xml).toContain(`<Identity Name="${store.name}" Publisher="${store.publisher}" Version="1.0.4.0" ProcessorArchitecture="x64" />`)
  })
  it("app de confiança total (Electron) com o executável do forge, Windows 10 1809+", () => {
    expect(xml).toContain('Executable="OmniGestaoPro.exe" EntryPoint="Windows.FullTrustApplication"')
    expect(xml).toContain('<rescap:Capability Name="runFullTrust" />')
    expect(xml).toContain('MinVersion="10.0.17763.0"')
    expect(xml).toContain('<Resource Language="pt-BR" />')
  })
  it("escapa texto livre", () => {
    expect(xml).toContain("Vendas &amp; caixa &lt;loja&gt;")
    expect(xml).not.toContain("<loja>")
  })
})

describe("canal do executável", () => {
  it("MSIX só quando o Electron marca windowsStore", () => {
    expect(packageKind({ windowsStore: true })).toBe("msix")
    expect(packageKind({ windowsStore: false })).toBe("squirrel")
    expect(packageKind({})).toBe("squirrel")
  })
  it("perfil do MSIX nunca é o do Setup.exe nem o do QA (pasta nova = privada do pacote)", () => {
    expect(MSIX_PROFILE_DIR).not.toBe("OmniGestão Pro")
    expect(MSIX_PROFILE_DIR.startsWith("OmniGestão Pro QA")).toBe(false)
  })
})
