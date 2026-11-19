import { describe, expect, it } from "vitest"
// Contrato entre o pipeline (apps/desktop, .mjs) e a página/endpoint web (TS).
import { appendHistory, buildReleaseManifest, objectKeys } from "../../apps/desktop/scripts/lib/release-manifest-builder.mjs"
import { parseReleaseManifest, parseReleasesBaseUrl } from "./release-manifest"

const SHA = "e".repeat(64)
const THUMB = "f".repeat(40)
const artifacts = {
  version: "1.0.4",
  channel: "production",
  buildCommit: "A".repeat(40),
  files: [{ file: "OmniGestaoPro-Setup.exe", bytes: 170 * 1024 * 1024, sha256: SHA }],
  authenticode: { setup: { status: "Valid", signer: "CN=RAFACELL LTDA, O=RAFACELL LTDA, C=BR", thumbprint: THUMB, timestamped: true } },
}
const publicCheck = { sha256: SHA, signature: { status: "Valid", thumbprint: THUMB, timestamped: true } }
const base = "https://downloads.exemplo.com.br"

function build(over: Record<string, unknown> = {}) {
  return buildReleaseManifest({ base, artifacts, publicCheck, installTest: "passed", publishedAt: "2026-11-19T12:00:00.000Z", ...over })
}

describe("contrato pipeline → web", () => {
  it("o manifesto gerado pelo pipeline é aceito pela página", () => {
    const r = parseReleaseManifest(build(), parseReleasesBaseUrl(base)!)
    expect(r.installerUrl).toBe(`${base}/${objectKeys("1.0.4").setup}`)
    expect(r.sha256).toBe(SHA)
  })

  it("pipeline recusa instalador NÃO ASSINADO", () => {
    expect(() => build({ artifacts: { ...artifacts, authenticode: { setup: { status: "NotSigned", signer: "", thumbprint: "", timestamped: false } } } })).toThrow(/assinatura/)
  })
  it("pipeline recusa download público divergente", () => {
    expect(() => build({ publicCheck: { ...publicCheck, sha256: "0".repeat(64) } })).toThrow(/difere/)
    expect(() => build({ publicCheck: { ...publicCheck, signature: { status: "Valid", thumbprint: "1".repeat(40) } } })).toThrow(/assinatura/)
  })
  it("pipeline recusa instalação reprovada, canal QA e base na Vercel", () => {
    expect(() => build({ installTest: "failed" })).toThrow()
    expect(() => build({ artifacts: { ...artifacts, channel: "qa" } })).toThrow()
    expect(() => build({ base: "https://omni-gestao-pro.vercel.app" })).toThrow()
  })

  it("histórico p/ rollback: mais nova primeiro, sem duplicar", () => {
    const r = build()
    const h1 = appendHistory({ versions: [{ version: "1.0.4", sha256: "x" }, { version: "1.0.3", sha256: "y" }] }, r)
    expect(h1.versions.map((v: { version: string }) => v.version)).toEqual(["1.0.4", "1.0.3"])
    expect(h1.versions[0].sha256).toBe(SHA)
  })
})
