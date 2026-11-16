/**
 * Política de navegação. Toda decisão passa pelo objeto URL — nunca por startsWith em string.
 * Funções puras: testadas em tests/unit/url-policy.test.ts.
 */

export type NavigationDecision = "allow" | "external" | "deny"
export type WindowOpenDecision = "allow-blank" | "allow-same-origin" | "external" | "deny"

/** Hosts externos abertos direto no navegador do sistema, sem confirmação. */
export const TRUSTED_EXTERNAL_HOSTS = new Set([
  "wa.me",
  "api.whatsapp.com",
  "web.whatsapp.com",
  "checkout.stripe.com",
  "billing.stripe.com",
])

export function safeParseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/** Mesmo esquema + host + porta da origem do app. `blob:` herda a origem que o criou. */
export function isSameAppOrigin(raw: string, appOrigin: string): boolean {
  const url = safeParseUrl(raw)
  if (!url) return false
  if (url.protocol === "blob:") {
    // new URL("blob:https://host/uuid").origin === "https://host"
    return url.origin === appOrigin
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false
  if (url.username || url.password) return false
  return url.origin === appOrigin
}

/** Pode ser aberto no navegador do sistema? Só https e sem credenciais embutidas. */
export function isOpenableExternally(raw: string): boolean {
  const url = safeParseUrl(raw)
  if (!url) return false
  if (url.protocol !== "https:") return false
  if (url.username || url.password) return false
  return url.hostname.length > 0
}

export function isTrustedExternal(raw: string): boolean {
  const url = safeParseUrl(raw)
  return !!url && isOpenableExternally(raw) && TRUSTED_EXTERNAL_HOSTS.has(url.hostname)
}

/** Navegação do frame principal (will-navigate / will-redirect). */
export function classifyNavigation(raw: string, appOrigin: string): NavigationDecision {
  const url = safeParseUrl(raw)
  if (!url) return "deny"
  if (url.protocol === "blob:") return "deny" // blob só em janela de documento
  if (isSameAppOrigin(raw, appOrigin)) return "allow"
  if (isOpenableExternally(raw)) return "external"
  return "deny"
}

/** window.open / target=_blank. */
export function classifyWindowOpen(raw: string, appOrigin: string): WindowOpenDecision {
  // Popups de impressão do OmniGestão: window.open("", "_blank") + document.write.
  if (raw === "" || raw === "about:blank") return "allow-blank"
  const url = safeParseUrl(raw)
  if (!url) return "deny"
  if (isSameAppOrigin(raw, appOrigin)) return "allow-same-origin"
  if (isOpenableExternally(raw)) return "external"
  return "deny"
}

/** Uma janela de documento (popup) pode navegar para a mesma origem ou ficar em about:blank. */
export function classifyPopupNavigation(raw: string, appOrigin: string): NavigationDecision {
  if (raw === "about:blank") return "allow"
  const url = safeParseUrl(raw)
  if (!url) return "deny"
  if (isSameAppOrigin(raw, appOrigin)) return "allow"
  if (isOpenableExternally(raw)) return "external"
  return "deny"
}

/** Caminho é a tela de login (inclui /login/...)? Usado para a limpeza de privacidade no logout. */
export function isLoginPath(raw: string, appOrigin: string): boolean {
  if (!isSameAppOrigin(raw, appOrigin)) return false
  const { pathname } = new URL(raw)
  return pathname === "/login" || pathname.startsWith("/login/")
}
