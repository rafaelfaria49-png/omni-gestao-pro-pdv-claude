import { describe, expect, it } from "vitest"
// Contrato entre o pipeline (apps/desktop, .mjs) e a página/endpoint web (TS).
import {
  appendHistory,
  buildReleaseManifest,
  checkReleaseManifest,
  objectKeys,
  parseTrustedThumbprints as parseTrustedMjs,
} from "../../apps/desktop/scripts/lib/release-manifest-builder.mjs"
import { parseReleaseManifest, parseReleasesBaseUrl, parseTrustedThumbprints } from "./release-manifest"

const SHA = "e".repeat(64)
const THUMB = "f".repeat(40)
const TRUSTED = [THUMB]
const artifacts = {
  version: "1.0.4",
  channel: "production",
  buildCommit: "A".repeat(40),
  files: [{ file: "OmniGestaoPro-Setup.exe", bytes: 150 * 1024 * 1024, sha256: SHA }],
  authenticode: { setup: { status: "Valid", signer: "CN=RAFACELL LTDA, O=RAFACELL LTDA, C=BR", thumbprint: THUMB, timestamped: true } },
}
const publicCheck = { sha256: SHA, signature: { status: "Valid", thumbprint: THUMB, timestamped: true } }
const base = "https://downloads.exemplo.com.br"
const baseUrl = parseReleasesBaseUrl(base)!

function build(over: Record<string, unknown> = {}) {
  return buildReleaseManifest({ base, artifacts, publicCheck, installTest: "passed", publishedAt: "2026-11-19T12:00:00.000Z", ...over })
}

describe("contrato pipeline → web", () => {
  it("o manifesto gerado pelo pipeline é aceito pelos dois validadores", () => {
    const m = build()
    const r = parseReleaseManifest(m, baseUrl, TRUSTED)
    expect(r.installerUrl).toBe(`${base}/${objectKeys("1.0.4").setup}`)
    expect(checkReleaseManifest(m, base, TRUSTED).sha256).toBe(SHA)
  })

  // Mesmos casos nos dois lados: o promote (.mjs) nunca torna oficial o que a página (TS) recusaria.
  const mutations: Array<[string, (m: Record<string, any>) => void]> = [
    ["sem assinatura", (m) => (m.signature.status = "NotSigned")],
    ["sem carimbo de tempo", (m) => (m.signature.timestamped = false)],
    ["certificado não confiável", (m) => (m.signature.thumbprint = "1".repeat(40))],
    ["canal qa", (m) => (m.channel = "qa")],
    ["arm64", (m) => (m.arch = "arm64")],
    ["schema 2", (m) => (m.schema = 2)],
    ["versão inválida", (m) => (m.version = "1.0")],
    ["outro host", (m) => (m.installer.url = "https://evil.example/desktop/production/1.0.4/OmniGestaoPro-Setup.exe")],
    ["diretório mutável", (m) => (m.installer.url = `${base}/desktop/production/latest/OmniGestaoPro-Setup.exe`)],
    ["tamanho implausível", (m) => (m.installer.bytes = 1000)],
    ["sha inválido", (m) => (m.installer.sha256 = "xyz")],
    ["download público divergente", (m) => (m.verification.publicDownloadSha256 = "0".repeat(64))],
    ["instalação reprovada", (m) => (m.verification.installTest = "failed")],
    ["commit inválido", (m) => (m.buildCommit = "abc")],
    ["data inválida", (m) => (m.publishedAt = "ontem")],
  ]
  it.each(mutations)("ambos recusam: %s", (_n, mutate) => {
    const m = JSON.parse(JSON.stringify(build()))
    mutate(m)
    expect(() => parseReleaseManifest(m, baseUrl, TRUSTED)).toThrow()
    expect(() => checkReleaseManifest(m, base, TRUSTED)).toThrow()
  })

  it("lista de certificados igual nos dois lados", () => {
    const raw = ` ${THUMB.toUpperCase()}, lixo ,${"a".repeat(40)}`
    expect(parseTrustedThumbprints(raw)).toEqual(parseTrustedMjs(raw))
    expect(parseTrustedThumbprints(raw)).toEqual([THUMB, "a".repeat(40)])
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
