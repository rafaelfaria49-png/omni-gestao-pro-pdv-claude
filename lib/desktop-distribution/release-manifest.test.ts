import { describe, expect, it } from "vitest"
import { parseReleaseManifest, parseReleasesBaseUrl, latestManifestUrl, ReleaseManifestError } from "./release-manifest"
import { classifyPlatform, desktopVersionFromUserAgent } from "./platform"
import { compareSemver } from "./semver"

const base = parseReleasesBaseUrl("https://downloads.exemplo.com.br")!
const SHA = "a".repeat(64)

function manifest(over: Record<string, unknown> = {}) {
  return {
    schema: 1,
    channel: "production",
    arch: "x64",
    version: "1.0.4",
    installer: {
      fileName: "OmniGestaoPro-Setup.exe",
      url: "https://downloads.exemplo.com.br/desktop/production/1.0.4/OmniGestaoPro-Setup.exe",
      sha256: SHA,
      bytes: 160 * 1024 * 1024,
    },
    signature: { status: "Valid", timestamped: true, signer: "CN=RAFACELL LTDA", thumbprint: "b".repeat(40) },
    verification: { publicDownloadSha256: SHA, publicDownloadSignature: "Valid", installTest: "passed" },
    buildCommit: "c".repeat(40),
    publishedAt: "2026-11-19T12:00:00Z",
    ...over,
  }
}

describe("origem de downloads", () => {
  it.each([
    ["", null],
    ["http://downloads.exemplo.com.br", null],
    ["https://downloads.exemplo.com.br/desktop", null],
    ["https://user:pw@downloads.exemplo.com.br", null],
    ["https://omni-gestao-pro.vercel.app", null],
    ["não é url", null],
  ])("recusa %s", (raw, expected) => {
    expect(parseReleasesBaseUrl(raw)).toBe(expected)
  })

  it("monta a URL do latest.json", () => {
    expect(latestManifestUrl(base)).toBe("https://downloads.exemplo.com.br/desktop/production/latest.json")
  })
})

describe("manifesto da release pública (fail-closed)", () => {
  it("aceita release assinada, conferida e instalada", () => {
    const r = parseReleaseManifest(manifest(), base)
    expect(r.version).toBe("1.0.4")
    expect(r.installerUrl).toBe("https://downloads.exemplo.com.br/desktop/production/1.0.4/OmniGestaoPro-Setup.exe")
    expect(r.signer).toBe("CN=RAFACELL LTDA")
  })

  const bad: Array<[string, Record<string, unknown>]> = [
    ["sem assinatura", { signature: { status: "NotSigned", timestamped: true, signer: "x", thumbprint: "b".repeat(40) } }],
    ["assinatura sem carimbo de tempo", { signature: { status: "Valid", timestamped: false, signer: "x", thumbprint: "b".repeat(40) } }],
    ["canal QA", { channel: "qa" }],
    ["ARM", { arch: "arm64" }],
    ["schema desconhecido", { schema: 2 }],
    ["versão inválida", { version: "1.0" }],
    ["download público não conferido", { verification: { publicDownloadSha256: "d".repeat(64), publicDownloadSignature: "Valid", installTest: "passed" } }],
    ["instalação não aprovada", { verification: { publicDownloadSha256: SHA, publicDownloadSignature: "Valid", installTest: "failed" } }],
    ["commit inválido", { buildCommit: "abc" }],
  ]
  it.each(bad)("recusa: %s", (_name, over) => {
    expect(() => parseReleaseManifest(manifest(over), base)).toThrow(ReleaseManifestError)
  })

  it.each([
    ["outro host", "https://evil.example/desktop/production/1.0.4/OmniGestaoPro-Setup.exe"],
    ["http", "http://downloads.exemplo.com.br/desktop/production/1.0.4/OmniGestaoPro-Setup.exe"],
    ["outra versão (diretório mutável)", "https://downloads.exemplo.com.br/desktop/production/latest/OmniGestaoPro-Setup.exe"],
    ["query", "https://downloads.exemplo.com.br/desktop/production/1.0.4/OmniGestaoPro-Setup.exe?x=1"],
  ])("recusa instalador em %s", (_n, url) => {
    const m = manifest()
    expect(() => parseReleaseManifest({ ...m, installer: { ...m.installer, url } }, base)).toThrow(ReleaseManifestError)
  })

  it("recusa tamanho implausível e sha inválido", () => {
    const m = manifest()
    expect(() => parseReleaseManifest({ ...m, installer: { ...m.installer, bytes: 1000 } }, base)).toThrow()
    expect(() => parseReleaseManifest({ ...m, installer: { ...m.installer, sha256: "xyz" } }, base)).toThrow()
  })

  it("recusa entrada que não é objeto", () => {
    expect(() => parseReleaseManifest(null, base)).toThrow()
    expect(() => parseReleaseManifest([], base)).toThrow()
  })
})

describe("plataforma do visitante", () => {
  const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36"
  it("Windows 11 x64 pelo userAgentData", () => {
    expect(classifyPlatform({ userAgent: WIN_UA, platform: "Windows", architecture: "x86", bitness: "64", platformVersion: "15.0.0" })).toEqual({ kind: "windows-x64", windowsVersion: "11" })
  })
  it("Windows 10 x64", () => {
    expect(classifyPlatform({ userAgent: WIN_UA, platform: "Windows", architecture: "x86", bitness: "64", platformVersion: "10.0.0" }).windowsVersion).toBe("10")
  })
  it("Windows ARM se apresenta como x64 no UA, mas o userAgentData revela", () => {
    expect(classifyPlatform({ userAgent: WIN_UA, platform: "Windows", architecture: "arm", bitness: "64" }).kind).toBe("windows-arm")
  })
  it("sem userAgentData não afirma x64", () => {
    expect(classifyPlatform({ userAgent: WIN_UA }).kind).toBe("windows-desconhecido")
  })
  it("Windows 32 bits puro", () => {
    expect(classifyPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/140.0" }).kind).toBe("windows-32")
  })
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", "mac"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "linux"],
    ["Mozilla/5.0 (Linux; Android 14; SM-A515F)", "android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "ios"],
  ])("%s → %s", (ua, kind) => {
    expect(classifyPlatform({ userAgent: ua }).kind).toBe(kind)
  })

  it("lê a versão do programa no user-agent", () => {
    expect(desktopVersionFromUserAgent(`${WIN_UA} OmniGestaoDesktop/1.0.3`)).toBe("1.0.3")
    expect(desktopVersionFromUserAgent(WIN_UA)).toBeNull()
    expect(desktopVersionFromUserAgent(null)).toBeNull()
  })

  it("compara versões", () => {
    expect(compareSemver("1.0.10", "1.0.9")).toBe(1)
    expect(compareSemver("1.0.3", "1.0.3")).toBe(0)
    expect(() => compareSemver("1.0", "1.0.0")).toThrow()
  })
})
