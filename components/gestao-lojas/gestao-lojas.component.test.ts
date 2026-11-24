// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/font/google", () => ({
  Plus_Jakarta_Sans: () => ({ variable: "--gl-font-jakarta" }),
  IBM_Plex_Mono: () => ({ variable: "--gl-font-plex-mono" }),
}))

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { priority: _p, ...rest } = props
    return React.createElement("img", rest)
  },
}))

import GestaoLojasPage from "@/app/gestao-lojas/page"
import { GestaoLojasHeader } from "@/components/gestao-lojas/GestaoLojasHeader"
import { SistemaShowcase } from "@/components/gestao-lojas/SistemaShowcase"
import { SolicitacaoTesteForm } from "@/components/gestao-lojas/SolicitacaoTesteForm"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

describe("Landing /gestao-lojas — oferta autorizada, WhatsApp configurável e /baixar", () => {
  it("exibe a oferta única autorizada (R$ 69,90, até 2 usuários, 7 dias) e oculta propostas antigas", () => {
    vi.stubEnv("GESTAO_LOJAS_CONTATO_WHATSAPP", "")
    vi.stubEnv("GESTAO_LOJAS_CONTATO_EMAIL", "")
    const html = renderToStaticMarkup(React.createElement(GestaoLojasPage))

    expect(html).toContain("69,90")
    expect(html).toContain("Até 2")
    expect(html).toContain("7 dias")
    expect(html).toContain("Vendas e Estoque")
    expect(html).toContain('href="/baixar"')
    expect(html).toContain('href="/login"')
    expect(html).toContain('href="/privacy"')

    // Nunca exibe as 3 propostas antigas, links diretos .exe, número fixo nem afirmações proibidas.
    expect(html).not.toMatch(/39,90|99,90|Comércio Plus|99861-0730|wa\.me\/|href="[^"]*\.exe"/i)
    expect(html).not.toMatch(/créditos IA|depoimento|\+\s?\d+ (lojas|clientes)/i)
  })

  it("exibe o WhatsApp comercial configurado via GESTAO_LOJAS_CONTATO_WHATSAPP sem número fixo no código", () => {
    vi.stubEnv("GESTAO_LOJAS_CONTATO_WHATSAPP", "+55 (14) 99861-0730")
    vi.stubEnv("GESTAO_LOJAS_CONTATO_EMAIL", "comercial@exemplo.invalid")
    const html = renderToStaticMarkup(React.createElement(GestaoLojasPage))

    expect(html).toContain("(14) 99861-0730")
    expect(html).toContain("https://wa.me/5514998610730")
    expect(html).toContain("mailto:comercial@exemplo.invalid")
  })
})

describe("Interações da landing (vitrine, lightbox, menu mobile e formulário real)", () => {
  it("alterna abas reais do sistema e abre/fecha a ampliação acessível com Escape", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(SistemaShowcase))
    })

    const tabCaixa = container.querySelector('[role="tab"]:nth-child(2)') as HTMLButtonElement
    expect(tabCaixa?.textContent).toContain("Fechamento de Caixa")
    await act(async () => {
      tabCaixa.click()
    })
    expect(tabCaixa.getAttribute("aria-selected")).toBe("true")
    expect(container.textContent).toContain("Fechamento de caixa conferido por forma de pagamento")

    const btnAmpliar = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Ampliar captura"),
    ) as HTMLButtonElement
    await act(async () => {
      btnAmpliar.click()
    })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => { root.unmount() })
  })

  it("abre e fecha o menu mobile preservando /login e ocultando links quando fechado", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(GestaoLojasHeader, { contatoWhatsapp: null }))
    })

    const drawer = container.querySelector("#gl-mobile-drawer") as HTMLElement
    const toggle = container.querySelector(".gl-menu-toggle") as HTMLButtonElement
    expect(drawer.hidden).toBe(true)

    await act(async () => { toggle.click() })
    expect(drawer.hidden).toBe(false)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(drawer.hidden).toBe(true)

    await act(async () => { root.unmount() })
  })

  it("envia POST /api/comercial/solicitacoes-teste e mostra confirmação com protocolo sem criar conta automática", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, protocolo: "GL-TEST-2345", repetida: false }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(SolicitacaoTesteForm))
    })

    const setVal = (selector: string, value: string) => {
      const el = container.querySelector(selector) as HTMLInputElement | HTMLSelectElement
      const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
      setter?.call(el, value)
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
    }

    await act(async () => {
      setVal('input[name="nome"]', "Ana Silva")
      setVal('input[name="nomeLoja"]', "Central Variedades")
      setVal('input[name="email"]', "ana@central.invalid")
      setVal('input[name="whatsapp"]', "14998610730")
      setVal('select[name="ramo"]', "variedades")
      const cb = container.querySelector('input[name="consentimento"]') as HTMLInputElement
      cb.click()
    })

    const form = container.querySelector("form") as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/comercial/solicitacoes-teste",
      expect.objectContaining({ method: "POST" }),
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({
      nome: "Ana Silva",
      nomeLoja: "Central Variedades",
      email: "ana@central.invalid",
      ramo: "variedades",
      consentimento: true,
    })
    expect(container.textContent).toContain("Pedido de teste recebido")
    expect(container.querySelector('[data-testid="protocolo"]')?.textContent).toBe("GL-TEST-2345")
    expect(container.textContent).toContain("O acesso ainda não foi criado")

    await act(async () => { root.unmount() })
  })
})
