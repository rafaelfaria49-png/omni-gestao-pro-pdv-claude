import type { Session } from "electron"

/** Cookies de sessão do NextAuth v5 (inclui os pedaços .0, .1… quando o JWT é grande). */
export function isAuthSessionCookie(name: string): boolean {
  return /^(__Secure-)?authjs\.session-token(\.\d+)?$/.test(name)
}

/**
 * Limpeza ao entrar na tela de login vindo de outra tela (logout ou sessão expirada).
 *
 * - Cache Storage do Service Worker: o SW do next-pwa guarda GETs de /api/* por até 24 h e os
 *   devolve offline para QUALQUER sessão do mesmo perfil. Em caixa compartilhado, o usuário B
 *   veria respostas do usuário A. Limpar aqui fecha esse vazamento no desktop.
 * - Cache HTTP do Chromium.
 * - Cookie de sessão do NextAuth: se uma resposta em voo regravou o cookie depois do signOut
 *   (corrida conhecida, PR #345), o desktop o remove ao chegar no /login.
 *
 * NÃO limpa localStorage/IndexedDB: é onde o PDV guarda vendas pendentes de sincronização.
 * Apagar ali poderia perder venda confirmada no balcão e ainda não enviada.
 */
export async function purgeSessionPrivacy(session: Session, appOrigin: string): Promise<string[]> {
  const done: string[] = []
  await session.clearStorageData({ origin: appOrigin, storages: ["cachestorage"] })
  done.push("cachestorage")
  await session.clearCache()
  done.push("http-cache")
  const cookies = await session.cookies.get({ url: appOrigin })
  for (const c of cookies) {
    if (!isAuthSessionCookie(c.name)) continue
    await session.cookies.remove(appOrigin, c.name)
    done.push(`cookie:${c.name}`)
  }
  return done
}
