import type { ProdutoNormalizado, ProvedorLookup, ResultadoLookup } from "../types"

/**
 * Adapter UPCitemdb (GOAL 004B).
 *
 * Endpoint FREE/trial: https://api.upcitemdb.com/prod/trial/lookup?upc={gtin}
 * Auth: NENHUMA — FREE/trial não exige cadastro, token ou user_key.
 * O parâmetro de query é `upc` (documentação oficial); `barcode` não é aceito
 * pela API e resulta em 400 (GOAL 010).
 *
 * Limites (FREE/trial):
 * - 100 requests combinadas por dia.
 * - Burst: 6 lookup requests/minuto.
 * - Headers de rate limit: X-RateLimit-Limit, X-RateLimit-Remaining,
 *   X-RateLimit-Reset, Retry-After (em 429).
 *
 * Mapeamento de status:
 * - 200 + items[0] com title   => encontrado (ProdutoNormalizado)
 * - 200 + items vazio/total=0  => nao_encontrado
 * - 404                         => nao_encontrado
 * - 429                         => limite_excedido (resetEm se informado)
 * - 401/403                     => erro tipo auth (não esperado no FREE, mas defensivo)
 * - abort/timeout               => erro tipo timeout
 * - falha de rede               => erro tipo rede
 * - payload malformado          => erro tipo parse
 *
 * Regras CRÍTICAS:
 * - NCM/CEST JAMAIS são populados por este provedor. UPCitemdb é uma base
 *   global sem dados fiscais brasileiros; usar dados globais para NCM/CEST
 *   seria inventar informação fiscal. Constraint do arquiteto (GOAL 004B).
 * - Campos ausentes permanecem ausentes; nada é inventado.
 * - imagemUrl guarda apenas a URL (primeira de images[]); sem download/hospedagem.
 */

export type UpcItemdbDeps = {
  /** Permite injetar fetch em testes (sem chamada externa real). */
  fetchImpl?: typeof fetch
  baseUrl?: string
}

const BASE_URL_DEFAULT = "https://api.upcitemdb.com"

function asString(v: unknown): string | undefined {
  if (typeof v === "string") {
    const s = v.trim()
    return s.length > 0 ? s : undefined
  }
  return undefined
}

function asStringArrayFirst(v: unknown): string | undefined {
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = asString(item)
      if (s) return s
    }
  }
  return undefined
}

/**
 * Extrai o primeiro item válido do payload do UPCitemdb.
 * Retorna null se items estiver vazio, total=0, ou estrutura inesperada.
 * NÃO normaliza — apenas valida que há um item para normalizar.
 */
export function extrairPrimeiroItemUpcItemdb(body: unknown): unknown | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const obj = body as Record<string, unknown>
  const items = obj.items
  if (!Array.isArray(items)) return null
  if (items.length === 0) return null
  const total = typeof obj.total === "number" ? obj.total : null
  if (total === 0) return null
  return items[0]
}

/**
 * Normaliza um item individual do UPCitemdb para ProdutoNormalizado.
 * Retorna null se o item não contiver title (campo obrigatório).
 *
 * NCM/CEST são intencionalmente OMITIDOS — constraint do arquiteto.
 */
export function normalizarItemUpcItemdb(item: unknown): ProdutoNormalizado | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null
  const obj = item as Record<string, unknown>

  const nome = asString(obj.title) ?? asString(obj.name)
  if (!nome) return null

  const marca = asString(obj.brand)
  const categoria = asString(obj.category)
  const descricao = asString(obj.description)
  const imagemUrl = asStringArrayFirst(obj.images)

  return {
    nome,
    ...(marca ? { marca } : {}),
    ...(categoria ? { categoria } : {}),
    ...(descricao ? { descricao } : {}),
    ...(imagemUrl ? { imagemUrl } : {}),
  }
}

function isAbortError(err: unknown): boolean {
  if (!err) return false
  const name = (err as { name?: unknown })?.name
  const code = (err as { code?: unknown })?.code
  if (name === "AbortError") return true
  if (code === "ABORT_ERR") return true
  if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
    return true
  }
  return false
}

/** Tenta ler um instante de reset a partir de headers do 429. */
function parseResetEm(res: { headers?: { get?: (name: string) => string | null } }): Date | undefined {
  const headers = res.headers
  if (!headers || typeof headers.get !== "function") return undefined
  const retry = headers.get("X-RateLimit-Reset") ?? headers.get("Retry-After")
  if (!retry) return undefined
  const segs = Number(retry)
  if (Number.isFinite(segs) && segs > 0) {
    return new Date(Date.now() + segs * 1000)
  }
  const iso = Date.parse(retry)
  if (Number.isFinite(iso)) return new Date(iso)
  return undefined
}

/** Cria o provedor UPCitemdb (FREE/trial). Sem chave, sem env. */
export function criarProvedorUpcItemdb(deps?: UpcItemdbDeps): ProvedorLookup {
  const baseUrl = (deps?.baseUrl ?? BASE_URL_DEFAULT).replace(/\/$/, "")
  const fetchFn = deps?.fetchImpl ?? fetch

  return {
    id: "upcitemdb",
    async consultar(gtin: string, signal: AbortSignal): Promise<ResultadoLookup> {
      const url = `${baseUrl}/prod/trial/lookup?upc=${encodeURIComponent(gtin)}`
      try {
        const res = await fetchFn(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal,
        })

        if (res.status === 401 || res.status === 403) {
          return { status: "erro", tipo: "auth" }
        }
        if (res.status === 429) {
          return { status: "limite_excedido", resetEm: parseResetEm(res) }
        }
        if (res.status === 404) {
          return { status: "nao_encontrado" }
        }
        if (res.status >= 500) {
          return { status: "erro", tipo: "rede" }
        }
        if (!res.ok) {
          return { status: "erro", tipo: "rede" }
        }

        let body: unknown
        try {
          body = await res.json()
        } catch {
          return { status: "erro", tipo: "parse" }
        }

        const item = extrairPrimeiroItemUpcItemdb(body)
        if (item === null) {
          return { status: "nao_encontrado" }
        }

        const normalizado = normalizarItemUpcItemdb(item)
        if (!normalizado) return { status: "erro", tipo: "parse" }
        return { status: "encontrado", dados: normalizado }
      } catch (err) {
        if (isAbortError(err) || signal.aborted) {
          return { status: "erro", tipo: "timeout" }
        }
        return { status: "erro", tipo: "rede" }
      }
    },
  }
}
