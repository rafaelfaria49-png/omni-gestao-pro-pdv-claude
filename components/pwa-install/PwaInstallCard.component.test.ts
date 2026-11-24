// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PwaInstallCard } from "./PwaInstallCard"
import { INSTALLED_GLOBAL, PROMPT_GLOBAL } from "@/lib/pwa-install/install-state"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

function stubEnv(ua: string, standalone = false, iosStandalone = false) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true })
  Object.defineProperty(window.navigator, "standalone", { value: iosStandalone, configurable: true })
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: standalone && query.includes("display-mode: standalone"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

beforeEach(() => {
  const w = window as unknown as Record<string, unknown>
  w[PROMPT_GLOBAL] = null
  w[INSTALLED_GLOBAL] = false
  stubEnv(CHROME_UA)
})

afterEach(() => {
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

describe("PwaInstallCard — ciclo de instalação honesto e multiplataforma", () => {
  it("trata instalação recusada (dismissed) sem sucesso fictício e volta aos passos manuais", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(PwaInstallCard))
    })

    const promptSpy = vi.fn(async () => {})
    await act(async () => {
      const evt = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>
        userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
      }
      evt.prompt = promptSpy
      evt.userChoice = Promise.resolve({ outcome: "dismissed" })
      window.dispatchEvent(evt)
    })

    const card = container.querySelector('[data-testid="pwa-install-card"]')!
    expect(card.getAttribute("data-mode")).toBe("um-clique")

    const btn = container.querySelector("button")!
    await act(async () => {
      btn.click()
    })

    expect(promptSpy).toHaveBeenCalledTimes(1)
    expect(card.getAttribute("data-mode")).toBe("manual-chrome")
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Instalação cancelada")
    expect(container.textContent).not.toContain("Instalado neste computador")

    await act(async () => {
      root.unmount()
    })
  })

  it("trata aceite (accepted) sem afirmar instalado antes de appinstalled, e confirma ao receber appinstalled", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(PwaInstallCard))
    })

    await act(async () => {
      const evt = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>
        userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
      }
      evt.prompt = async () => {}
      evt.userChoice = Promise.resolve({ outcome: "accepted" })
      window.dispatchEvent(evt)
    })

    const card = container.querySelector('[data-testid="pwa-install-card"]')!
    await act(async () => {
      container.querySelector("button")!.click()
    })

    expect(card.getAttribute("data-mode")).toBe("instalacao-aceita")
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Instalação confirmada no navegador")
    expect(container.querySelector("button")).toBeNull()

    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"))
    })

    expect(card.getAttribute("data-mode")).toBe("instalado")
    expect(container.querySelector('[role="status"]')?.textContent).toContain("instalado")

    await act(async () => {
      root.unmount()
    })
  })

  it("trata falha ao abrir prompt nativo retornando aos passos manuais", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(PwaInstallCard))
    })

    await act(async () => {
      const evt = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>
        userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
      }
      evt.prompt = async () => {
        throw new Error("prompt blocked")
      }
      evt.userChoice = Promise.resolve({ outcome: "dismissed" })
      window.dispatchEvent(evt)
    })

    await act(async () => {
      container.querySelector("button")!.click()
    })

    const card = container.querySelector('[data-testid="pwa-install-card"]')!
    expect(card.getAttribute("data-mode")).toBe("manual-chrome")
    expect(container.querySelector('[role="status"]')?.textContent).toContain("não abriu a instalação")

    await act(async () => {
      root.unmount()
    })
  })

  it("exibe passos de iOS Safari e reconhece navigator.standalone no iPhone", async () => {
    stubEnv(IOS_SAFARI_UA, false, false)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(PwaInstallCard))
    })

    let card = container.querySelector('[data-testid="pwa-install-card"]')!
    expect(card.getAttribute("data-mode")).toBe("manual-ios-safari")
    expect(card.textContent).toContain("Adicionar à Tela de Início")

    await act(async () => {
      root.unmount()
    })

    stubEnv(IOS_SAFARI_UA, false, true)
    const root2 = createRoot(container)
    await act(async () => {
      root2.render(React.createElement(PwaInstallCard))
    })

    card = container.querySelector('[data-testid="pwa-install-card"]')!
    expect(card.getAttribute("data-mode")).toBe("instalado")
    expect(card.textContent).toContain("Instalado neste dispositivo")

    await act(async () => {
      root2.unmount()
    })
  })
})
