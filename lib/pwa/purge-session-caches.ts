/**
 * Limpeza dos caches de runtime do service worker no logout confirmado (SEC-342 · cache).
 *
 * As regras padrão do next-pwa guardam por 24 h respostas autenticadas: `/api/stores`
 * (para a plataforma, a lista de lojas de TODAS as empresas), `/api/ops/inventory`,
 * `/api/ops/ordens` (clientes da OS), `/api/ops/credito-cliente`, `/api/user/credits`, o
 * HTML/RSC das páginas do painel… Depois do logout isso fica em disco e, offline, o SW
 * serviria o painel do usuário anterior para quem abrir o navegador compartilhado.
 *
 * Só apaga caches com dado de sessão. NÃO toca no precache (o app continua abrindo
 * offline na tela de login), nos assets estáticos, nem em localStorage/IndexedDB: vendas
 * offline pendentes, carrinho, caixa local e tentativas de venda continuam onde estão e
 * voltam a sincronizar no próximo login da loja.
 */
export const SESSION_RUNTIME_CACHES = [
  "apis",
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "next-data",
  "static-data-assets",
  "cross-origin",
  "start-url",
] as const

type CacheStorageLike = Pick<CacheStorage, "keys" | "delete">

export async function purgeSessionRuntimeCaches(storage: CacheStorageLike | undefined): Promise<string[]> {
  if (!storage) return []
  const removable = new Set<string>(SESSION_RUNTIME_CACHES)
  const removed: string[] = []
  let names: string[] = []
  try {
    names = await storage.keys()
  } catch {
    return removed
  }
  for (const name of names) {
    if (!removable.has(name)) continue
    try {
      if (await storage.delete(name)) removed.push(name)
    } catch {
      /* cache em uso/indisponível: segue com os demais */
    }
  }
  return removed
}
