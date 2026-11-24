/**
 * Cliente HTTP da busca de clientes do PDV — `POST /api/clientes/search`.
 *
 * Módulo puro (sem React): roda no harness `node` do Vitest. O hook
 * `hooks/use-pdv-cliente.ts` cuida de debounce/estado; aqui ficam o contrato da
 * requisição e a leitura HONESTA da resposta — HTTP de erro nunca vira lista vazia.
 */

export type PdvClienteResult = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  document?: string | null
}

export type BuscaClientesResultado =
  | { kind: "ok"; clientes: PdvClienteResult[] }
  | { kind: "erro"; status: number | null; message: string }
  | { kind: "aborted" }

/** Limite do servidor para o termo (`app/api/clientes/search/route.ts`). */
export const BUSCA_CLIENTE_MAX_CHARS = 200

export function mensagemErroBuscaClientes(status: number | null, serverError?: string | null): string {
  if (status === null) return "Sem conexão com o servidor. Verifique a rede e tente de novo."
  if (status === 400) return serverError?.trim() || "Busca inválida."
  if (status === 401) return "Sessão expirada. Entre novamente para buscar clientes."
  if (status === 403) return "Sem permissão para consultar clientes nesta loja."
  if (status === 404) return "Serviço de busca de clientes indisponível."
  return `Falha no servidor ao buscar clientes (HTTP ${status}). Tente de novo.`
}

function normalizarCliente(raw: unknown): PdvClienteResult | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === "string" ? o.id.trim() : ""
  const name = typeof o.name === "string" ? o.name.trim() : ""
  if (!id || !name) return null
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  return { id, name, phone: str(o.phone), email: str(o.email), document: str(o.document) }
}

export async function buscarClientesPdv(params: {
  fetchImpl: typeof fetch
  storeId: string
  q: string
  signal?: AbortSignal
  lojaHeader: string
}): Promise<BuscaClientesResultado> {
  const q = params.q.trim().slice(0, BUSCA_CLIENTE_MAX_CHARS)
  try {
    const res = await semThis(params.fetchImpl)("/api/clientes/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", [params.lojaHeader]: params.storeId },
      body: JSON.stringify({ q }),
      credentials: "include",
      cache: "no-store",
      signal: params.signal,
    })
    const data = (await res.json().catch(() => null)) as { clientes?: unknown; error?: unknown } | null
    if (params.signal?.aborted) return { kind: "aborted" }
    if (!res.ok) {
      const serverError = data && typeof data.error === "string" ? data.error : null
      return { kind: "erro", status: res.status, message: mensagemErroBuscaClientes(res.status, serverError) }
    }
    if (!data || !Array.isArray(data.clientes)) {
      return { kind: "erro", status: res.status, message: "Resposta inesperada do servidor ao buscar clientes." }
    }
    const clientes = data.clientes.map(normalizarCliente).filter((c): c is PdvClienteResult => c !== null)
    return { kind: "ok", clientes }
  } catch (e) {
    if (params.signal?.aborted || (e instanceof Error && e.name === "AbortError")) return { kind: "aborted" }
    return { kind: "erro", status: null, message: mensagemErroBuscaClientes(null) }
  }
}

/**
 * `window.fetch` exige `this === window` (ou indefinido): chamá-lo como `params.fetchImpl(...)`
 * lança "Illegal invocation" no navegador ANTES de qualquer requisição — invisível em node/jsdom.
 */
function semThis(f: typeof fetch): typeof fetch {
  return (input, init) => f.call(undefined, input, init)
}
