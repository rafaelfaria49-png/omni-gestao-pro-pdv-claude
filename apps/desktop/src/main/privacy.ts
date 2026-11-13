import type { Session, WebContents } from "electron"

/** Cookies de sessão do NextAuth v5 (inclui os pedaços .0, .1… quando o JWT é grande). */
export function isAuthSessionCookie(name: string): boolean {
  return /^(__Secure-)?authjs\.session-token(\.\d+)?$/.test(name)
}

/**
 * Caches do Service Worker que podem ser mantidos entre usuários: só arquivos estáticos do build
 * (precache do Workbox, JS/CSS/fontes/imagens). Tudo o mais — `apis`, `pages`, `pages-rsc*`,
 * `next-data`, `others`, `start-url`, caches de privacidade — pode conter dados do usuário anterior.
 */
export const SHARED_SAFE_CACHE = /^(workbox-precache|static-|next-static-|next-image|google-fonts)/

/**
 * Conteúdo que pode continuar nesses caches. HTML, JSON, RSC (text/x-component), SVG (é texto e
 * pode carregar nome) ou resposta sem tipo são apagados mesmo dentro de um cache "estático":
 * provado na QA real que o SW guardou em `static-js-assets` um `.js` inexistente respondido com
 * o HTML da tela logada (nome e e-mail).
 */
export const STATIC_ASSET_CONTENT_TYPE =
  /^\s*(application\/(javascript|x-javascript|wasm)|text\/(javascript|css)|font\/|image\/(png|jpe?g|gif|webp|avif|x-icon|vnd\.microsoft\.icon)|application\/font|application\/vnd\.ms-fontobject)/i

/** Só arquivos do build (imutáveis, iguais para todos) sobrevivem; fotos/imagens de usuário não. */
export const STATIC_ASSET_PATH = /^\/_next\/static\//

/** A entrada de um cache "estático" pode ficar para o próximo usuário? */
export function keepStaticEntry(pathname: string, contentType: string): boolean {
  return STATIC_ASSET_PATH.test(pathname) && STATIC_ASSET_CONTENT_TYPE.test(contentType)
}

/**
 * O POST é o envio de login do próximo usuário? Só isso desarma a guarda.
 * - Server Action do formulário de /login (`POST /login` com cabeçalho `next-action`);
 * - callback de credenciais do NextAuth.
 * Analytics (`/_vercel/insights/*`), APIs de operação etc. NÃO desarmam: o Vercel Analytics faz
 * POST em toda visualização de página, inclusive no próprio /login.
 */
export function isLoginSubmit(method: string, pathname: string, headers: Record<string, string>): boolean {
  if (method !== "POST") return false
  if (pathname === "/api/auth/callback/credentials") return true
  if (pathname !== "/login") return false
  return Object.keys(headers).some((k) => k.toLowerCase() === "next-action")
}

const PURGE_CACHES_SCRIPT = `(async () => {
  if (!("caches" in self)) return { caches: [], entries: 0 }
  const keepCache = ${SHARED_SAFE_CACHE.toString()}
  const staticType = ${STATIC_ASSET_CONTENT_TYPE.toString()}
  const staticPath = ${STATIC_ASSET_PATH.toString()}
  const all = await caches.keys()
  const names = all.filter((n) => !keepCache.test(n))
  await Promise.all(names.map((n) => caches.delete(n)))
  let entries = 0
  for (const n of all.filter((x) => keepCache.test(x) && !/^workbox-precache/.test(x))) {
    const c = await caches.open(n)
    const reqs = await c.keys()
    await Promise.all(reqs.map(async (req) => {
      const res = await c.match(req)
      const type = (res && res.headers.get("content-type")) || ""
      if (!(staticPath.test(new URL(req.url).pathname) && staticType.test(type))) {
        await c.delete(req)
        entries++
      }
    }))
  }
  return { caches: names, entries }
})()`

/**
 * Proteção de troca de usuário do desktop.
 *
 * Ao chegar em /login (logout, sessão expirada ou abertura do app já sem sessão):
 * 1. remove JÁ o cookie de sessão e arma a guarda: qualquer resposta atrasada que regrave o
 *    cookie (corrida conhecida, #342/#345) é desfeita enquanto o operador está no /login;
 * 2. apaga do Cache Storage os caches com dados e, nos caches estáticos, tudo que não é arquivo
 *    do build; limpa o cache HTTP;
 * 3. a guarda só desarma no envio de login do próximo usuário — e nesse instante a limpeza de
 *    caches roda de novo, pegando respostas atrasadas do usuário anterior gravadas pelo SW.
 *
 * NÃO limpa localStorage/IndexedDB: é onde o PDV guarda vendas pendentes de sincronização.
 */
export class LogoutGuard {
  private armed = false
  private page: WebContents | null = null
  /** Quantos envios de login já passaram (com ou sem guarda armada). */
  private submits = 0

  constructor(
    private readonly session: Session,
    private readonly appOrigin: string,
    private readonly log: (msg: string) => void,
  ) {
    const host = new URL(appOrigin).hostname
    session.cookies.on("changed", (_e, cookie, _cause, removed) => {
      if (!this.armed || removed || !isAuthSessionCookie(cookie.name)) return
      const domain = (cookie.domain ?? "").replace(/^\./, "")
      if (domain !== host) return
      void session.cookies
        .remove(appOrigin, cookie.name)
        .then(() => this.log(`logout-guard removeu cookie regravado ${cookie.name}`))
    })
    // Única interceptação de rede do desktop: só OBSERVA (devolve os cabeçalhos intactos).
    session.webRequest.onBeforeSendHeaders({ urls: [`${appOrigin}/*`] }, (details, callback) => {
      let p = ""
      if (details.method === "POST") {
        try {
          p = new URL(details.url).pathname
        } catch {
          /* url inválida */
        }
        if (isLoginSubmit(details.method, p, details.requestHeaders)) this.submits++
      }
      if (this.armed && details.method === "POST") {
        if (isLoginSubmit(details.method, p, details.requestHeaders)) {
          this.armed = false
          this.log(`logout-guard desarmada (envio de login ${p})`)
          // Segunda passada: respostas do usuário anterior que o SW gravou depois da primeira.
          const page = this.page
          if (page && !page.isDestroyed()) {
            void this.purgeCaches(page)
              .then((d) => this.log(`privacy-purge-2 ${d.join(",")}`))
              .catch(() => this.log("privacy-purge-2-falhou"))
          }
        } else {
          this.log(`logout-guard ignorou POST ${p}`)
        }
      }
      callback({ requestHeaders: details.requestHeaders })
    })
  }

  get isArmed() {
    return this.armed
  }

  get loginSubmits() {
    return this.submits
  }

  /** Só caches (sem cookie, sem guarda): usado na abertura do app que termina parada no /login. */
  async purgeCaches(page: WebContents): Promise<string[]> {
    try {
      const result = (await page.executeJavaScript(PURGE_CACHES_SCRIPT, true)) as { caches: string[]; entries: number }
      return [`caches:${result.caches.join("|") || "-"}`, `entradas-nao-estaticas:${result.entries}`]
    } catch {
      // Página indisponível: apaga tudo da origem (perde o precache, mas nunca vaza dado).
      await this.session.clearStorageData({ origin: this.appOrigin, storages: ["cachestorage"] })
      return ["cachestorage:all"]
    }
  }

  /** Chamado ao entrar no /login (vindo de outra tela, ou primeira tela da abertura do app). */
  async engage(page: WebContents): Promise<string[]> {
    this.armed = true
    this.page = page
    const done: string[] = []
    for (const c of await this.session.cookies.get({ url: this.appOrigin })) {
      if (!isAuthSessionCookie(c.name)) continue
      await this.session.cookies.remove(this.appOrigin, c.name)
      done.push(`cookie:${c.name}`)
    }
    done.push(...(await this.purgeCaches(page)))
    await this.session.clearCache()
    done.push("http-cache")
    return done
  }
}
