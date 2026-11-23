import { describe, expect, it } from "vitest"
import { DESKTOP_COMPATIBILIDADE, type CompatEntry } from "./compatibility"
import { resolveWindowsOptions, suggestedWindowsOption } from "./download-options"
import { classifyPlatform } from "./platform"
import { noticeFor } from "@/components/desktop-download/PlatformNotice"

const URL_OFICIAL = "https://downloads.exemplo.test/desktop/production/1.0.4/OmniGestaoPro-Setup.exe"
const release = { installerUrl: URL_OFICIAL, version: "1.0.4" }

const homologarTudo: CompatEntry[] = DESKTOP_COMPATIBILIDADE.map((c) =>
  c.sistema.startsWith("Windows 1") ? { ...c, status: "verificado", versoesHomologadas: ["1.0.4"] } : c,
)

describe("resolveWindowsOptions", () => {
  it("só oferece Windows 10 e Windows 11 de 64 bits (sem 32 bits nem ARM)", () => {
    const opts = resolveWindowsOptions(release)
    expect(opts.map((o) => o.id)).toEqual(["windows-10", "windows-11"])
    expect(opts.every((o) => o.arquitetura === "64 bits")).toBe(true)
    expect(opts.map((o) => o.botao)).toEqual(["Baixar para Windows 10", "Baixar para Windows 11"])
  })

  it("sem release pública válida, nenhum botão funciona", () => {
    for (const o of resolveWindowsOptions(null, homologarTudo)) {
      expect(o.installerUrl).toBeNull()
      expect(o.bloqueio).toMatch(/não liberado/)
    }
  })

  it("estado atual: nenhuma versão pública homologada — os dois ficam bloqueados mesmo com release", () => {
    const [w10, w11] = resolveWindowsOptions(release)
    expect(w10.status).toBe("em-validacao")
    expect(w10.installerUrl).toBeNull()
    expect(w10.bloqueio).toMatch(/Versão 1.0.4 em validação no Windows 10/)
    // Win 11 foi testado com a 1.0.3 interna (não assinada): não homologa a versão pública.
    expect(w11.status).toBe("em-validacao")
    expect(w11.installerUrl).toBeNull()
    expect(w11.bloqueio).toMatch(/Versão 1.0.4 em validação no Windows 11/)
  })

  it("homologação vale por versão: versão nova volta a ficar em validação", () => {
    const [w10, w11] = resolveWindowsOptions({ ...release, version: "1.0.5" }, homologarTudo)
    expect([w10.installerUrl, w11.installerUrl]).toEqual([null, null])
    expect([w10.status, w11.status]).toEqual(["em-validacao", "em-validacao"])
  })

  it("sem release, mostra o histórico (Windows 11 testado na piloto) sem botão", () => {
    const [w10, w11] = resolveWindowsOptions(null)
    expect(w10.status).toBe("em-validacao")
    expect(w11.status).toBe("verificado")
    expect(w11.installerUrl).toBeNull()
  })

  it("versão listada mas sistema não verificado continua bloqueado", () => {
    const compat = DESKTOP_COMPATIBILIDADE.map((c) => ({ ...c, versoesHomologadas: ["1.0.4"] }))
    const [w10] = resolveWindowsOptions(release, compat)
    expect(w10.installerUrl).toBeNull()
  })

  it("homologados os dois, ambos apontam para o MESMO artefato oficial", () => {
    const [w10, w11] = resolveWindowsOptions(release, homologarTudo)
    expect(w10.installerUrl).toBe(URL_OFICIAL)
    expect(w11.installerUrl).toBe(URL_OFICIAL)
  })

  it("sistema ausente da lista de compatibilidade nunca é tratado como homologado", () => {
    const opts = resolveWindowsOptions(release, [])
    expect(opts.every((o) => o.installerUrl === null && o.status === "em-validacao")).toBe(true)
  })
})

describe("suggestedWindowsOption", () => {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36"
  it("Windows 11 x64 → sugere Windows 11", () => {
    expect(suggestedWindowsOption(classifyPlatform({ userAgent: ua, platform: "Windows", architecture: "x86", bitness: "64", platformVersion: "15.0.0" }))).toBe("windows-11")
  })
  it("Windows 10 x64 → sugere Windows 10", () => {
    expect(suggestedWindowsOption(classifyPlatform({ userAgent: ua, platform: "Windows", architecture: "x86", bitness: "64", platformVersion: "10.0.0" }))).toBe("windows-10")
  })
  it("sem userAgentData (Firefox) não sugere: Win10 e Win11 têm o mesmo user-agent", () => {
    expect(suggestedWindowsOption(classifyPlatform({ userAgent: ua }))).toBeNull()
  })
  it("ARM, 32 bits, celular e Mac não recebem sugestão", () => {
    expect(suggestedWindowsOption(classifyPlatform({ userAgent: ua, platform: "Windows", architecture: "arm", bitness: "64", platformVersion: "15.0.0" }))).toBeNull()
    expect(suggestedWindowsOption(classifyPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/142" }))).toBeNull()
    expect(suggestedWindowsOption(classifyPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/142 Mobile" }))).toBeNull()
    expect(suggestedWindowsOption(classifyPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605" }))).toBeNull()
    expect(suggestedWindowsOption(null)).toBeNull()
  })
  it("ARM e 32 bits são orientados a usar o navegador", () => {
    expect(noticeFor({ kind: "windows-arm", windowsVersion: "11" })).toMatch(/navegador/)
    expect(noticeFor({ kind: "windows-32", windowsVersion: null })).toMatch(/navegador/)
  })
})
