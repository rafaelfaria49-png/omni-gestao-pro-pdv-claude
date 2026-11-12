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
 * Conteúdo que pode continuar nesses caches. HTML, JSON, RSC (text/x-component) ou resposta sem
 * tipo são apagados mesmo dentro de um cache "estático": provado na QA real que o SW guardou em
 * `static-js-assets` um `.js` inexistente respondido com o HTML da tela logada (nome e e-mail).
 */
export const STATIC_ASSET_CONTENT_TYPE =
  /^\s*(application\/(javascript|x-javascript|wasm)|text\/(javascript|css)|font\/|image\/|application\/font|application\/vnd\.ms-fontobject)/i

/**
 * Proteção de logout do desktop.
 *
 * Ao chegar em /login vindo de outra tela (logout ou sessão expirada):
 * 1. remove JÁ o cookie de sessão e arma a guarda: qualquer resposta atrasada que regrave o
 *    cookie (corrida conhecida, #342/#345) é desfeita enquanto o operador está no /login;
 * 2. a guarda desarma no primeiro POST da tela de login (o novo usuário entrando), então o
 *    cookie do usuário B nunca é apagado;
 * 3. apaga do Cache Storage só os caches com dados (mantém o precache estático do PWA);
 * 4. limpa o cache HTTP.
 *
 * NÃO limpa localStorage/IndexedDB: é onde o PDV guarda vendas pendentes de sincronização.
 */
export class LogoutGuard {
  private armed = false

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
    // Única interceptação de rede do desktop: só observa, nunca altera a requisição.
    session.webRequest.onBeforeRequest({ urls: [`${appOrigin}/*`] }, (details, callback) => {
      if (this.armed && details.method === "POST") {
        this.armed = false
        let p = ""
        try {
          p = new URL(details.url).pathname
        } catch {
          /* url inválida */
        }
        this.log(`logout-guard desarmada (POST ${p})`)
      }
      callback({})
    })
  }

  get isArmed() {
    return this.armed
  }

  /** Chamado ao entrar no /login vindo de outra tela. */
  async engage(page: WebContents): Promise<string[]> {
    this.armed = true
    const done: string[] = []
    for (const c of await this.session.cookies.get({ url: this.appOrigin })) {
      if (!isAuthSessionCookie(c.name)) continue
      await this.session.cookies.remove(this.appOrigin, c.name)
      done.push(`cookie:${c.name}`)
    }
    try {
      const result = (await page.executeJavaScript(
        `(async () => {
          if (!("caches" in self)) return { caches: [], entries: 0 }
          const keep = ${SHARED_SAFE_CACHE.toString()}
          const staticType = ${STATIC_ASSET_CONTENT_TYPE.toString()}
          const all = await caches.keys()
          const names = all.filter((n) => !keep.test(n))
          await Promise.all(names.map((n) => caches.delete(n)))
          // Caches "estáticos" mantidos: só ficam respostas que são de fato JS/CSS/fonte/imagem.
          // Um .js inexistente pode ter sido respondido com HTML da tela logada e guardado como script.
          let entries = 0
          for (const n of all.filter((x) => keep.test(x) && !/^workbox-precache/.test(x))) {
            const c = await caches.open(n)
            for (const req of await c.keys()) {
              const res = await c.match(req)
              const type = (res && res.headers.get("content-type")) || ""
              if (!staticType.test(type)) {
                await c.delete(req)
                entries++
              }
            }
          }
          return { caches: names, entries }
        })()`,
        true,
      )) as { caches: string[]; entries: number }
      done.push(`caches:${result.caches.join("|") || "-"}`, `entradas-nao-estaticas:${result.entries}`)
    } catch {
      // Página já saiu: apaga tudo da origem (perde o precache, mas nunca vaza dado).
      await this.session.clearStorageData({ origin: this.appOrigin, storages: ["cachestorage"] })
      done.push("cachestorage:all")
    }
    await this.session.clearCache()
    done.push("http-cache")
    return done
  }
}
