import { describe, expect, it } from "vitest"
import {
  classifyNavigation,
  classifyPopupNavigation,
  classifyWindowOpen,
  isLoginPath,
  isOpenableExternally,
  isSameAppOrigin,
  isTrustedExternal,
} from "../../src/shared/url-policy"

const O = "https://omni-gestao-pro.vercel.app"

describe("isSameAppOrigin", () => {
  it("aceita caminhos da própria origem", () => {
    expect(isSameAppOrigin(`${O}/dashboard/vendas?x=1#y`, O)).toBe(true)
    expect(isSameAppOrigin(`${O}`, O)).toBe(true)
  })

  it("recusa truques que um startsWith aceitaria", () => {
    expect(isSameAppOrigin("https://omni-gestao-pro.vercel.app.evil.com/", O)).toBe(false)
    expect(isSameAppOrigin("https://omni-gestao-pro.vercel.app@evil.com/", O)).toBe(false)
    expect(isSameAppOrigin("https://user:pw@omni-gestao-pro.vercel.app/", O)).toBe(false)
    expect(isSameAppOrigin("http://omni-gestao-pro.vercel.app/", O)).toBe(false)
    expect(isSameAppOrigin("https://omni-gestao-pro.vercel.app:8443/", O)).toBe(false)
    expect(isSameAppOrigin("https://evil.com/?https://omni-gestao-pro.vercel.app", O)).toBe(false)
    expect(isSameAppOrigin("https://omni-gestao-pi.vercel.app/", O)).toBe(false)
  })

  it("trata blob: pela origem que o criou", () => {
    expect(isSameAppOrigin(`blob:${O}/3f1c`, O)).toBe(true)
    expect(isSameAppOrigin("blob:https://evil.com/3f1c", O)).toBe(false)
  })

  it("recusa protocolos perigosos e lixo", () => {
    for (const u of ["javascript:alert(1)", "file:///C:/Windows/win.ini", "data:text/html,<b>x</b>", "chrome://settings", "devtools://x", "", "not a url"]) {
      expect(isSameAppOrigin(u, O)).toBe(false)
    }
  })

  it("normaliza maiúsculas no host via URL", () => {
    expect(isSameAppOrigin("HTTPS://OMNI-GESTAO-PRO.VERCEL.APP/login", O)).toBe(true)
  })
})

describe("classifyNavigation (frame principal)", () => {
  it("permite a origem, manda https externo para o navegador e nega o resto", () => {
    expect(classifyNavigation(`${O}/dashboard`, O)).toBe("allow")
    expect(classifyNavigation("https://wa.me/5511999999999", O)).toBe("external")
    expect(classifyNavigation("http://example.com", O)).toBe("deny")
    expect(classifyNavigation("javascript:void(0)", O)).toBe("deny")
    expect(classifyNavigation("file:///C:/", O)).toBe("deny")
    expect(classifyNavigation("about:blank", O)).toBe("deny")
    expect(classifyNavigation(`blob:${O}/abc`, O)).toBe("deny")
    expect(classifyNavigation("ms-settings:privacy", O)).toBe("deny")
  })
})

describe("classifyWindowOpen", () => {
  it("permite popup em branco (impressão via document.write)", () => {
    expect(classifyWindowOpen("", O)).toBe("allow-blank")
    expect(classifyWindowOpen("about:blank", O)).toBe("allow-blank")
  })
  it("permite documento/PDF da mesma origem", () => {
    expect(classifyWindowOpen(`${O}/api/ops/os/1/pdf`, O)).toBe("allow-same-origin")
    expect(classifyWindowOpen(`blob:${O}/pdf-1`, O)).toBe("allow-same-origin")
  })
  it("externo vai para o navegador; perigosos negados", () => {
    expect(classifyWindowOpen("https://checkout.stripe.com/c/pay", O)).toBe("external")
    expect(classifyWindowOpen("javascript:alert(1)", O)).toBe("deny")
    expect(classifyWindowOpen("data:text/html,x", O)).toBe("deny")
    expect(classifyWindowOpen("file:///C:/", O)).toBe("deny")
    expect(classifyWindowOpen("about:srcdoc", O)).toBe("deny")
  })
})

describe("classifyPopupNavigation", () => {
  it("janela de documento fica em about:blank ou na origem", () => {
    expect(classifyPopupNavigation("about:blank", O)).toBe("allow")
    expect(classifyPopupNavigation(`${O}/x`, O)).toBe("allow")
    expect(classifyPopupNavigation("https://evil.com", O)).toBe("external")
    expect(classifyPopupNavigation("file:///C:/", O)).toBe("deny")
  })
})

describe("externos", () => {
  it("só https sem credencial pode ir ao navegador", () => {
    expect(isOpenableExternally("https://example.com")).toBe(true)
    expect(isOpenableExternally("http://example.com")).toBe(false)
    expect(isOpenableExternally("https://a:b@example.com")).toBe(false)
    expect(isOpenableExternally("mailto:x@y.z")).toBe(false)
    expect(isOpenableExternally("ms-msdt:/id")).toBe(false)
  })
  it("hosts confiáveis são exatos", () => {
    expect(isTrustedExternal("https://wa.me/55")).toBe(true)
    expect(isTrustedExternal("https://wa.me.evil.com/55")).toBe(false)
    expect(isTrustedExternal("http://wa.me/55")).toBe(false)
  })
})

describe("isLoginPath", () => {
  it("reconhece /login e subcaminhos só na origem", () => {
    expect(isLoginPath(`${O}/login`, O)).toBe(true)
    expect(isLoginPath(`${O}/login/sair?x=1`, O)).toBe(true)
    expect(isLoginPath(`${O}/loginx`, O)).toBe(false)
    expect(isLoginPath(`${O}/dashboard`, O)).toBe(false)
    expect(isLoginPath("https://evil.com/login", O)).toBe(false)
  })
})

describe("esquema local omni-app (tela de status)", async () => {
  const path = await import("node:path")
  const { resolveLocalFile } = await import("../../src/main/local-protocol")
  const dir = path.resolve("dist", "renderer")
  it("serve só arquivos conhecidos dentro da pasta da tela", () => {
    expect(resolveLocalFile("omni-app://status/status.html", dir)).toBe(path.join(dir, "status.html"))
    // O próprio URL normaliza "/../" para dentro da pasta: nunca sai de dist/renderer.
    const normalized = resolveLocalFile("omni-app://status/../main/main.js", dir)
    expect(normalized === null || normalized.startsWith(dir + path.sep)).toBe(true)
    expect(resolveLocalFile("omni-app://status/%2e%2e/%2e%2e/package.json", dir)).toBeNull()
    expect(resolveLocalFile("omni-app://status/..%5C..%5Cbuild-config.json", dir)).toBeNull()
    expect(resolveLocalFile("omni-app://outro/status.html", dir)).toBeNull()
    expect(resolveLocalFile("file:///C:/Windows/win.ini", dir)).toBeNull()
    expect(resolveLocalFile("omni-app://status/", dir)).toBeNull()
    expect(resolveLocalFile("omni-app://status/x.exe", dir)).toBeNull()
  })
})
