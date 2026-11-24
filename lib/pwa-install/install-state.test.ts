import { describe, expect, it } from "vitest"
import { detectBrowser, isIos, isMobile, resolveInstallMode } from "./install-state"

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
const EDGE = CHROME + " Edg/142.0.0.0"
const OPERA = CHROME + " OPR/120.0.0.0"
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0"
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36"
const ANDROID_EDGE = ANDROID_CHROME + " EdgA/142.0.0.0"
const ANDROID_FIREFOX = "Mozilla/5.0 (Android 14; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0"
const IOS_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const IOS_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1"
const IOS_EDGE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/142.0.0.0 Mobile/15E148 Safari/604.1"
const IOS_FIREFOX = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/145.0 Mobile/15E148 Safari/605.1.15"

const base = { standalone: false, promptAvailable: false }

describe("detectBrowser", () => {
  it("distingue Edge, Chrome, Opera, Firefox e Safari no desktop e mobile", () => {
    expect(detectBrowser(EDGE)).toBe("edge")
    expect(detectBrowser(CHROME)).toBe("chrome")
    expect(detectBrowser(OPERA)).toBe("opera")
    expect(detectBrowser(FIREFOX)).toBe("firefox")
    expect(detectBrowser(SAFARI_MAC)).toBe("safari")
    expect(detectBrowser(ANDROID_EDGE)).toBe("edge")
    expect(detectBrowser(ANDROID_CHROME)).toBe("chrome")
    expect(detectBrowser(ANDROID_FIREFOX)).toBe("firefox")
    expect(detectBrowser(IOS_SAFARI)).toBe("safari")
    expect(detectBrowser(IOS_CHROME)).toBe("chrome")
    expect(detectBrowser(IOS_EDGE)).toBe("edge")
    expect(detectBrowser(IOS_FIREFOX)).toBe("firefox")
    expect(detectBrowser("")).toBe("outro")
  })

  it("usa as marcas do userAgentData quando existem (incluindo Chromium e Brave)", () => {
    expect(detectBrowser(CHROME, ["Chromium", "Microsoft Edge", "Not.A/Brand"])).toBe("edge")
    expect(detectBrowser(CHROME, ["Chromium", "Google Chrome"])).toBe("chrome")
    expect(detectBrowser(CHROME, ["Chromium", "Brave"])).toBe("chrome")
    expect(detectBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) HeadlessChrome/142.0.0.0", ["HeadlessChrome", "Chromium"])).toBe("chrome")
    // iOS Safari emulado em Chromium (userAgentData mantém marca Chromium) ainda resolve Safari.
    expect(detectBrowser(IOS_SAFARI, ["HeadlessChrome", "Chromium"])).toBe("safari")
  })
})

describe("resolveInstallMode", () => {
  it("aberto em janela própria = instalado, mesmo com pedido disponível", () => {
    expect(resolveInstallMode({ ...base, userAgent: EDGE, standalone: true, promptAvailable: true })).toEqual({
      kind: "instalado",
      browser: "edge",
      mobile: false,
    })
    expect(resolveInstallMode({ ...base, userAgent: IOS_SAFARI, standalone: true })).toEqual({
      kind: "instalado",
      browser: "safari",
      mobile: true,
    })
  })

  it("evento appinstalled confirmado = instalado; aceite pendente = instalacao-aceita (sem sucesso fictício)", () => {
    expect(resolveInstallMode({ ...base, userAgent: CHROME, promptAccepted: true })).toEqual({
      kind: "instalacao-aceita",
      browser: "chrome",
      mobile: false,
    })
    expect(resolveInstallMode({ ...base, userAgent: CHROME, promptAccepted: true, justInstalled: true })).toEqual({
      kind: "instalado",
      browser: "chrome",
      mobile: false,
    })
  })

  it("com pedido do navegador = um clique (desktop e Android)", () => {
    expect(resolveInstallMode({ ...base, userAgent: EDGE, promptAvailable: true })).toEqual({
      kind: "um-clique",
      browser: "edge",
      mobile: false,
    })
    expect(resolveInstallMode({ ...base, userAgent: ANDROID_CHROME, promptAvailable: true })).toEqual({
      kind: "um-clique",
      browser: "chrome",
      mobile: true,
    })
  })

  it("desktop sem pedido: Edge e Chrome/Chromium recebem passos do menu; Firefox/Safari/Opera recebem orientação honesta", () => {
    expect(resolveInstallMode({ ...base, userAgent: EDGE }).kind).toBe("manual-edge")
    expect(resolveInstallMode({ ...base, userAgent: CHROME }).kind).toBe("manual-chrome")
    expect(resolveInstallMode({ ...base, userAgent: CHROME, brands: ["Chromium", "Brave"] }).kind).toBe("manual-chrome")
    for (const ua of [FIREFOX, SAFARI_MAC, OPERA]) {
      expect(resolveInstallMode({ ...base, userAgent: ua }).kind).toBe("navegador-sem-suporte")
    }
  })

  it("Android sem pedido recebe passos específicos por navegador", () => {
    expect(resolveInstallMode({ ...base, userAgent: ANDROID_CHROME }).kind).toBe("manual-android-chrome")
    expect(resolveInstallMode({ ...base, userAgent: ANDROID_EDGE }).kind).toBe("manual-android-edge")
    expect(resolveInstallMode({ ...base, userAgent: ANDROID_FIREFOX })).toEqual({
      kind: "manual-android-outro",
      browser: "firefox",
    })
  })

  it("iPhone/iPad recebe passos do Safari ou orientação para abrir no Safari", () => {
    expect(resolveInstallMode({ ...base, userAgent: IOS_SAFARI }).kind).toBe("manual-ios-safari")
    expect(resolveInstallMode({ ...base, userAgent: IOS_CHROME })).toEqual({
      kind: "manual-ios-outro",
      browser: "chrome",
    })
    expect(resolveInstallMode({ ...base, userAgent: IOS_EDGE })).toEqual({
      kind: "manual-ios-outro",
      browser: "edge",
    })
    expect(resolveInstallMode({ ...base, userAgent: IOS_FIREFOX })).toEqual({
      kind: "manual-ios-outro",
      browser: "firefox",
    })
    // iPadOS em modo desktop (Macintosh + multi-touch)
    expect(resolveInstallMode({ ...base, userAgent: SAFARI_MAC, maxTouchPoints: 5 }).kind).toBe("manual-ios-safari")
  })
})

describe("isMobile e isIos", () => {
  it("distingue desktop, Android e iOS/iPadOS", () => {
    expect(isMobile(ANDROID_CHROME, false)).toBe(false)
    expect(isMobile(CHROME)).toBe(false)
    expect(isMobile(IOS_SAFARI, false)).toBe(true)
    expect(isIos(IOS_SAFARI)).toBe(true)
    expect(isIos(SAFARI_MAC, 0)).toBe(false)
    expect(isIos(SAFARI_MAC, 5)).toBe(true)
  })
})
