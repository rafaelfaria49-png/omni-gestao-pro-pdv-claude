/** Fronteira de respostas de leitura no browser; nunca é prova de autorização do servidor. */
export function criarCacheLeituraFinanceira(storeId: string | null, aoNegar: () => void, fetcher: typeof fetch = fetch) {
  let geracao = 0
  let ativo = true
  let controller = new AbortController()
  const expirada = () => new Error("Leitura financeira expirada. Atualize a sessão.")
  const descartar = () => { ativo = false; geracao++; controller.abort() }
  return {
    descartar,
    iniciar() { descartar(); controller = new AbortController(); ativo = true },
    async buscar(url: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
      if (!ativo || !storeId || (init.method && init.method.toUpperCase() !== "GET")) throw expirada()
      const versao = geracao
      const headers = new Headers(init.headers)
      headers.set("x-assistec-loja-id", storeId)
      const response = await fetcher(url, { ...init, headers, cache: "no-store", signal: controller.signal })
      const bytes = await response.arrayBuffer()
      if (!ativo || geracao !== versao) throw expirada()
      if (response.status === 401 || response.status === 403) {
        descartar()
        aoNegar()
      }
      return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers })
    },
  }
}
