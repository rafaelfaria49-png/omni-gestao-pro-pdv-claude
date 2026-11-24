/**
 * Instalação do OmniGestão Pro como aplicativo do navegador (PWA) — lógica pura e testável.
 *
 * O app instalado é o MESMO site (mesma origem, mesmo login, mesmos dados): o navegador só cria o
 * atalho e abre o sistema em janela própria. Não há binário, assinatura nem download de executável.
 *
 * Decisão por ordem:
 *  1. já aberto como app (`display-mode: standalone` / `window-controls-overlay` / iOS `navigator.standalone`)
 *     ou confirmação efetiva de instalação (`appinstalled`) → "instalado";
 *  2. usuário aceitou o diálogo nativo (`userChoice.outcome === "accepted"`), aguardando conclusão → "instalacao-aceita";
 *  3. navegador entregou o pedido de instalação (`beforeinstallprompt`) → botão de um clique (desktop ou Android);
 *  4. mobile sem pedido → passos específicos por sistema/navegador (iOS Safari, iOS outro, Android Chrome/Chromium, Android Edge, Android outro);
 *  5. desktop Edge/Chrome/Chromium sem pedido → instruções do menu do navegador;
 *  6. demais navegadores desktop (Firefox, Safari, Opera, outro) → orientação honesta sem promessa fictícia.
 */

export type BrowserId = "edge" | "chrome" | "firefox" | "safari" | "opera" | "outro"

export interface InstallEnvironment {
  userAgent: string
  /** `navigator.userAgentData.brands[].brand`, quando existir (Chromium). */
  brands?: string[]
  /** `navigator.userAgentData.mobile`, quando existir. */
  mobile?: boolean
  /** `navigator.maxTouchPoints`, usado para detectar iPadOS em modo desktop. */
  maxTouchPoints?: number
  /** `matchMedia("(display-mode: standalone)")`, `window-controls-overlay` ou iOS `navigator.standalone`. */
  standalone: boolean
  /** O navegador já entregou `beforeinstallprompt` nesta página. */
  promptAvailable: boolean
  /** O usuário aceitou o diálogo nativo (`userChoice.outcome === "accepted"`), aguardando `appinstalled`. */
  promptAccepted?: boolean
  /** O navegador confirmou a conclusão via evento `appinstalled`. */
  justInstalled?: boolean
}

export type InstallMode =
  | { kind: "instalado"; browser: BrowserId; mobile: boolean }
  | { kind: "instalacao-aceita"; browser: BrowserId; mobile: boolean }
  | { kind: "um-clique"; browser: BrowserId; mobile: boolean }
  | { kind: "manual-edge" }
  | { kind: "manual-chrome" }
  | { kind: "manual-android-chrome" }
  | { kind: "manual-android-edge" }
  | { kind: "manual-android-outro"; browser: BrowserId }
  | { kind: "manual-ios-safari" }
  | { kind: "manual-ios-outro"; browser: BrowserId }
  | { kind: "navegador-sem-suporte"; browser: BrowserId }

export function detectBrowser(userAgent: string, brands: string[] = []): BrowserId {
  const ua = userAgent || ""
  const b = brands.map((x) => x.toLowerCase())
  // Em iPhone/iPad (WebKit), o UA define o navegador real; ignora marcas Chromium de emulação.
  if (/\b(iPhone|iPad|iPod)\b/i.test(ua)) {
    if (/\bEdgiOS\//.test(ua)) return "edge"
    if (/\bOPiOS\//.test(ua)) return "opera"
    if (/\bFxiOS\//.test(ua)) return "firefox"
    if (/\bCriOS\//.test(ua)) return "chrome"
    if (/\bSafari\//.test(ua)) return "safari"
    return "outro"
  }
  if (b.some((x) => x.includes("microsoft edge")) || /\bEdg(e|A|iOS)?\//.test(ua)) return "edge"
  if (b.some((x) => x === "opera") || /\bOPR\//.test(ua) || /\bOPiOS\//.test(ua)) return "opera"
  if (/\bFirefox\//.test(ua) || /\bFxiOS\//.test(ua)) return "firefox"
  // "Chromium" (Chromium, Brave, Vivaldi e afins) instala PWA como o Chrome.
  if (
    b.some((x) => x === "google chrome" || x === "chromium" || x === "brave") ||
    /\bChrome\//.test(ua) ||
    /\bCriOS\//.test(ua)
  ) {
    return "chrome"
  }
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return "safari"
  return "outro"
}

export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  const ua = userAgent || ""
  if (/\b(iPhone|iPad|iPod)\b/i.test(ua)) return true
  // iPadOS 13+ pode enviar UA de Macintosh com múltiplos pontos de toque.
  return /\bMacintosh\b/i.test(ua) && maxTouchPoints > 1
}

export function isMobile(userAgent: string, mobileHint?: boolean, maxTouchPoints = 0): boolean {
  if (isIos(userAgent, maxTouchPoints)) return true
  if (typeof mobileHint === "boolean") return mobileHint
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent || "")
}

export function resolveInstallMode(env: InstallEnvironment): InstallMode {
  const browser = detectBrowser(env.userAgent, env.brands)
  const ios = isIos(env.userAgent, env.maxTouchPoints)
  const mobile = isMobile(env.userAgent, env.mobile, env.maxTouchPoints)

  if (env.standalone || env.justInstalled) return { kind: "instalado", browser, mobile }
  if (env.promptAccepted) return { kind: "instalacao-aceita", browser, mobile }
  if (env.promptAvailable) return { kind: "um-clique", browser, mobile }

  if (ios) {
    if (browser === "safari") return { kind: "manual-ios-safari" }
    return { kind: "manual-ios-outro", browser }
  }

  if (mobile) {
    if (browser === "edge") return { kind: "manual-android-edge" }
    if (browser === "chrome") return { kind: "manual-android-chrome" }
    return { kind: "manual-android-outro", browser }
  }

  if (browser === "edge") return { kind: "manual-edge" }
  if (browser === "chrome") return { kind: "manual-chrome" }
  return { kind: "navegador-sem-suporte", browser }
}

export type ManualInstallKind =
  | "manual-edge"
  | "manual-chrome"
  | "manual-android-chrome"
  | "manual-android-edge"
  | "manual-ios-safari"

/** Passos manuais por navegador/plataforma quando `beforeinstallprompt` não está disponível. */
export const PASSOS_MANUAIS: Record<ManualInstallKind, string[]> = {
  "manual-edge": [
    "Clique no ícone de instalar na barra de endereço (um quadrado com um sinal de mais) ou abra o menu ··· no canto superior direito.",
    "No menu, escolha Aplicativos → Instalar este site como um aplicativo.",
    "Confirme em Instalar. Na tela seguinte, marque Fixar na barra de tarefas, Fixar em Iniciar e Criar atalho na área de trabalho, e clique em Permitir.",
  ],
  "manual-chrome": [
    "Clique no ícone de instalar na barra de endereço (um monitor com uma seta para baixo) ou abra o menu ⋮ no canto superior direito.",
    "No menu, escolha Transmitir, salvar e compartilhar → Instalar página como app (em versões antigas: Instalar OmniGestão Pro).",
    "Confirme em Instalar. O Chrome cria o atalho no Menu Iniciar e na Área de Trabalho e abre o sistema em janela própria.",
  ],
  "manual-android-chrome": [
    "Toque no menu ⋮ no canto superior direito do Chrome.",
    "Escolha Adicionar à tela inicial e depois Instalar (ou Instalar aplicativo).",
    "Confirme. O ícone do OmniGestão Pro aparece na tela inicial do celular.",
  ],
  "manual-android-edge": [
    "Toque no menu ≡ na barra inferior do Microsoft Edge.",
    "Escolha Adicionar ao telefone e confirme em Instalar.",
    "O ícone do OmniGestão Pro aparece na tela inicial do celular.",
  ],
  "manual-ios-safari": [
    "Toque no botão Compartilhar na barra do Safari (ícone de quadrado com seta para cima).",
    "Role as opções e toque em Adicionar à Tela de Início.",
    "Confirme em Adicionar no canto superior direito. O ícone do OmniGestão Pro aparece na Tela de Início.",
  ],
}

export const TITULO_PASSOS_MANUAIS: Record<ManualInstallKind, string> = {
  "manual-edge": "Instalar pelo menu do Microsoft Edge:",
  "manual-chrome": "Instalar pelo menu do Google Chrome ou navegador Chromium:",
  "manual-android-chrome": "Instalar no Android pelo Google Chrome:",
  "manual-android-edge": "Instalar no Android pelo Microsoft Edge:",
  "manual-ios-safari": "Adicionar à Tela de Início no iPhone ou iPad (Safari):",
}

export const NOME_BROWSER: Record<BrowserId, string> = {
  edge: "Microsoft Edge",
  chrome: "Google Chrome",
  firefox: "Firefox",
  safari: "Safari",
  opera: "Opera",
  outro: "este navegador",
}

/** Globais e eventos usados pelo script inline de captura antes da hidratação do React. */
export const PROMPT_GLOBAL = "__omniInstallPrompt"
export const INSTALLED_GLOBAL = "__omniAppInstalled"
export const PROMPT_EVENT = "omni-install-prompt"
export const INSTALLED_EVENT = "omni-app-installed"
