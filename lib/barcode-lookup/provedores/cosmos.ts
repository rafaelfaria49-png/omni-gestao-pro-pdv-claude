import type { ProdutoNormalizado, ProvedorLookup, ResultadoLookup } from "../types"

/**
 * Adapter Cosmos/Bluesoft (GOAL 004A).
 *
 * Endpoint: https://api.cosmos.bluesoft.com.br/gtins/{codigo}.json
 * Auth: header X-Cosmos-Token (chave server-side; nunca logada; nunca no client).
 * Headers obrigatórios (doc oficial): User-Agent: Cosmos-API-Request e
 * Content-Type: application/json.
 * Token é normalizado com trim() no adapter (GOAL 011) — defesa em profundidade
 * contra espaço/quebra de linha colado no painel de env; o trim primário e o
 * erro_config de chave ausente vivem em fabricaProvedorPadrao (resolver.ts).
 *
 * Mapeamento de status:
 * - 200 + payload válido        => encontrado (ProdutoNormalizado)
 * - 404                         => nao_encontrado
 * - 429                         => limite_excedido (resetEm se informado)
 * - 401/403                     => erro tipo auth
 * - abort/timeout               => erro tipo timeout
 * - falha de rede               => erro tipo rede
 * - payload malformado          => erro tipo parse
 *
 * Regras:
 * - NCM/CEST só entram se vierem do provedor e passarem como string limpa (8/7 dígitos).
 * - Campos ausentes permanecem ausentes; nada é inventado.
 * - imagemUrl guarda apenas a URL; sem download/hospedagem.
 */

export type CosmosDeps = {
  apiKey: string
  /** Permite injetar fetch em testes (sem chamada externa real). */
  fetchImpl?: typeof fetch
  baseUrl?: string
}

const BASE_URL_DEFAULT = "https://api.cosmos.bluesoft.com.br"

function asString(v: unknown): string | undefined {
  if (typeof v === "string") {
    const s = v.trim()
    return s.length > 0 ? s : undefined
  }
  return undefined
}

function asStringFromObj(v: unknown, key: string): string | undefined {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return asString((v as Record<string, unknown>)[key])
  }
  return undefined
}

/** Marca pode vir como string ou objeto { name }. */
function extractMarca(brand: unknown): string | undefined {
  if (typeof brand === "string") return asString(brand)
  return asStringFromObj(brand, "name") ?? asStringFromObj(brand, "description")
}

/** NCM: string limpa de 8 dígitos, ou objeto { code }. */
function extractNcm(ncm: unknown): string | undefined {
  if (!ncm) return undefined
  if (typeof ncm === "string") {
    const s = ncm.replace(/\D/g, "")
    return s.length === 8 ? s : undefined
  }
  const code = asStringFromObj(ncm, "code")
  if (code) {
    const s = code.replace(/\D/g, "")
    return s.length === 8 ? s : undefined
  }
  return undefined
}

/** CEST: string limpa de 7 dígitos, ou objeto { code }. */
function extractCest(cest: unknown): string | undefined {
  if (!cest) return undefined
  if (typeof cest === "string") {
    const s = cest.replace(/\D/g, "")
    return s.length === 7 ? s : undefined
  }
  const code = asStringFromObj(cest, "code")
  if (code) {
    const s = code.replace(/\D/g, "")
    return s.length === 7 ? s : undefined
  }
  return undefined
}

/**
 * Normaliza o payload do Cosmos para ProdutoNormalizado.
 * Retorna null se o payload for inesperado ou não contiver nome.
 * NÃO armazena payload bruto — apenas os campos do contrato.
 */
export function normalizarCosmos(body: unknown): ProdutoNormalizado | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const obj = body as Record<string, unknown>

  const nome = asString(obj.description) ?? asString(obj.name) ?? asString(obj.title)
  if (!nome) return null

  const marca = extractMarca(obj.brand)
  const categoria =
    asString(obj.gpc_category) ??
    asString(obj.gpc_category_name) ??
    asString(obj.category)
  const descricao = asString(obj.full_description) ?? asString(obj.description_long)
  const ncm = extractNcm(obj.ncm)
  const cest = extractCest(obj.cest)
  const imagemUrl =
    asString(obj.photo) ??
    asString(obj.thumbnail) ??
    asString(obj.image_url) ??
    asString(obj.image)

  return {
    nome,
    ...(marca ? { marca } : {}),
    ...(categoria ? { categoria } : {}),
    ...(descricao ? { descricao } : {}),
    ...(ncm ? { ncm } : {}),
    ...(cest ? { cest } : {}),
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

/** Cria o provedor Cosmos. A chave é capturada por closure; nunca logada. */
export function criarProvedorCosmos(deps: CosmosDeps): ProvedorLookup {
  const baseUrl = (deps.baseUrl ?? BASE_URL_DEFAULT).replace(/\/$/, "")
  const fetchFn = deps.fetchImpl ?? fetch
  const apiKey = deps.apiKey.trim()

  return {
    id: "cosmos",
    async consultar(gtin: string, signal: AbortSignal): Promise<ResultadoLookup> {
      if (!apiKey) {
        // Chave vazia após trim: falha determinística sem gastar chamada externa.
        // Chave ausente na env vira erro_config na fábrica (resolver.ts); no
        // contrato ResultadoLookup deste adapter o caso se expressa como auth.
        console.warn("[barcode-lookup] cosmos: token vazio após trim; consulta não enviada")
        return { status: "erro", tipo: "auth" }
      }
      const url = `${baseUrl}/gtins/${encodeURIComponent(gtin)}.json`
      try {
        const res = await fetchFn(url, {
          method: "GET",
          headers: {
            "X-Cosmos-Token": apiKey,
            "User-Agent": "Cosmos-API-Request",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal,
        })

        if (res.status === 401 || res.status === 403) {
          // Diagnóstico seguro: só o status HTTP — jamais token, headers ou body.
          console.warn(`[barcode-lookup] cosmos: auth rejeitada (HTTP ${res.status})`)
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

        const normalizado = normalizarCosmos(body)
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
