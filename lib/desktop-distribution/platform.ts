/**
 * Detecção de plataforma para a página /baixar — pura e testável.
 *
 * A fonte confiável é `navigator.userAgentData.getHighEntropyValues` (Chromium/Edge).
 * Sem ela (Firefox), o user-agent só revela Windows 32 bits puro; x64 e ARM ficam "desconhecido".
 * Windows 10 e 11 têm o MESMO user-agent ("Windows NT 10.0"): só o `platformVersion` do
 * userAgentData separa (>= 13 = Windows 11).
 */

export type PlatformKind =
  | "windows-x64"
  | "windows-arm"
  | "windows-32"
  | "windows-desconhecido"
  | "mac"
  | "linux"
  | "android"
  | "ios"
  | "outro"

export interface PlatformHints {
  userAgent: string
  /** userAgentData.platform (ex.: "Windows"). */
  platform?: string
  /** userAgentData high entropy: "x86" | "arm". */
  architecture?: string
  /** userAgentData high entropy: "64" | "32". */
  bitness?: string
  /** userAgentData high entropy (Windows: "15.0.0" = Win11, "10.0.0" = Win10 recente). */
  platformVersion?: string
}

export interface PlatformInfo {
  kind: PlatformKind
  /** "11" | "10" | null (desconhecido). */
  windowsVersion: "11" | "10" | null
}

export function classifyPlatform(h: PlatformHints): PlatformInfo {
  const ua = h.userAgent || ""
  const plat = (h.platform || "").toLowerCase()
  if (/android/i.test(ua) || plat === "android") return { kind: "android", windowsVersion: null }
  if (/iphone|ipad|ipod/i.test(ua)) return { kind: "ios", windowsVersion: null }
  const isWindows = plat === "windows" || /windows nt/i.test(ua)
  if (!isWindows) {
    if (plat === "macos" || /mac os x|macintosh/i.test(ua)) return { kind: "mac", windowsVersion: null }
    if (plat === "linux" || plat === "chrome os" || plat === "chromeos" || /linux|cros/i.test(ua)) return { kind: "linux", windowsVersion: null }
    return { kind: "outro", windowsVersion: null }
  }

  let windowsVersion: PlatformInfo["windowsVersion"] = null
  if (h.platformVersion) {
    const major = Number(h.platformVersion.split(".")[0])
    if (Number.isFinite(major)) windowsVersion = major >= 13 ? "11" : major >= 1 ? "10" : null
  }

  const arch = (h.architecture || "").toLowerCase()
  if (arch === "arm") return { kind: "windows-arm", windowsVersion }
  if (arch === "x86") {
    if (h.bitness === "64") return { kind: "windows-x64", windowsVersion }
    if (h.bitness === "32") return { kind: "windows-32", windowsVersion }
  }
  // Sem userAgentData: Windows ARM se apresenta como "Win64; x64", então não dá para afirmar x64.
  // Só o 32 bits puro (sem Win64/WOW64) é identificável.
  if (!/win64|x64|wow64/i.test(ua)) return { kind: "windows-32", windowsVersion }
  return { kind: "windows-desconhecido", windowsVersion }
}

/** Versão do OmniGestão Pro Desktop no user-agent (`OmniGestaoDesktop/1.0.3`), ou null. */
export function desktopVersionFromUserAgent(ua: string | null | undefined): string | null {
  const m = /\bOmniGestaoDesktop\/(\d{1,4}\.\d{1,4}\.\d{1,6})\b/.exec(ua || "")
  return m ? m[1] : null
}
