import {
  XSD_CONTRACT_VERSION,
  XSD_MAX_OUTPUT_BYTES,
  infrastructureFailure,
  type XsdValidationAdapter,
  type XsdValidationRequest,
  type XsdValidationResult,
} from "../xsd"

const DEFAULT_CLIENT_TIMEOUT_MS = 4_000

export type XsdWorkerHttpClientOptions = {
  baseUrl: string
  timeoutMs?: number
  allowedHosts?: readonly string[]
  fetchImpl?: typeof fetch
}

function isAllowedWorkerUrl(value: string, allowedHosts: readonly string[]): URL | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.username || url.password || url.search || url.hash) return null
  const host = url.hostname.toLowerCase()
  const allowlisted = allowedHosts.map((item) => item.toLowerCase())
  if (
    host !== "127.0.0.1" &&
    host !== "localhost" &&
    host !== "::1" &&
    !host.endsWith(".internal") &&
    !allowlisted.includes(host)
  ) {
    return null
  }
  return url
}

const OUTCOMES = new Set([
  "VALIDACAO_APROVADA", "XML_INVALIDO", "XML_MALFORMADO", "POLITICA_REJEITADA",
  "FALHA_TRANSITORIA", "FALHA_PERMANENTE", "TIMEOUT", "WORKER_INDISPONIVEL",
  "VERSAO_NAO_PERMITIDA", "HASH_DIVERGENTE", "PACOTE_XSD_AUSENTE", "RESPOSTA_INCERTA",
])

export function isValidationResult(value: unknown): value is XsdValidationResult {
  if (!value || typeof value !== "object") return false
  const result = value as Record<string, unknown>
  if (typeof result.valid !== "boolean" || typeof result.outcome !== "string" || !OUTCOMES.has(result.outcome)) return false
  if (!Array.isArray(result.issues) || !Number.isFinite(result.durationMs) || Number(result.durationMs) < 0) return false
  if (!result.issues.every((issue) => issue && typeof issue === "object" && typeof (issue as Record<string, unknown>).message === "string")) return false
  const engineValid = result.engine !== null && typeof result.engine === "object" &&
    (result.engine as Record<string, unknown>).name === "xmllint" &&
    typeof (result.engine as Record<string, unknown>).xmllintVersion === "string" &&
    typeof (result.engine as Record<string, unknown>).libxml2Version === "string" &&
    /^[a-f0-9]{64}$/.test(String((result.engine as Record<string, unknown>).binaryHash ?? "")) &&
    typeof (result.engine as Record<string, unknown>).schemaPackage === "string" &&
    /^[a-f0-9]{64}$/.test(String((result.engine as Record<string, unknown>).schemaManifestHash ?? ""))
  if (result.valid) return result.outcome === "VALIDACAO_APROVADA" && result.issues.length === 0 && engineValid
  return result.outcome !== "VALIDACAO_APROVADA" && (result.engine === null || engineValid)
}

export function createXsdWorkerHttpClient(
  options: XsdWorkerHttpClientOptions,
): XsdValidationAdapter {
  const baseUrl = isAllowedWorkerUrl(options.baseUrl, options.allowedHosts ?? [])
  const timeoutMs = Math.max(100, options.timeoutMs ?? DEFAULT_CLIENT_TIMEOUT_MS)
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    async validate(request: XsdValidationRequest): Promise<XsdValidationResult> {
      if (!baseUrl) {
        return infrastructureFailure(
          "WORKER_INDISPONIVEL",
          "xsd_worker_url_forbidden",
          "URL do worker XSD ausente ou fora da allowlist interna.",
          true,
        )
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const endpoint = new URL("validate", baseUrl.href.endsWith("/") ? baseUrl : `${baseUrl.href}/`)
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-fiscal-xsd-contract": XSD_CONTRACT_VERSION,
          },
          body: JSON.stringify(request),
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        })
        const contentLength = Number(response.headers.get("content-length") ?? "0")
        if (contentLength > XSD_MAX_OUTPUT_BYTES) {
          return infrastructureFailure(
            "RESPOSTA_INCERTA",
            "xsd_worker_output_limit",
            "Resposta do worker XSD excedeu o limite permitido.",
          )
        }
        const body = await response.text()
        if (Buffer.byteLength(body, "utf8") > XSD_MAX_OUTPUT_BYTES) {
          return infrastructureFailure(
            "RESPOSTA_INCERTA",
            "xsd_worker_output_limit",
            "Resposta do worker XSD excedeu o limite permitido.",
          )
        }
        if (!response.ok) {
          return infrastructureFailure(
            response.status >= 500 ? "FALHA_TRANSITORIA" : "FALHA_PERMANENTE",
            "xsd_worker_http_error",
            `Worker XSD respondeu com status HTTP ${response.status}.`,
            response.status >= 500,
          )
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(body)
        } catch {
          return infrastructureFailure(
            "RESPOSTA_INCERTA",
            "xsd_worker_response_invalid",
            "Worker XSD devolveu resposta JSON inválida.",
          )
        }
        if (!isValidationResult(parsed)) {
          return infrastructureFailure(
            "RESPOSTA_INCERTA",
            "xsd_worker_response_invalid",
            "Worker XSD devolveu contrato inválido.",
          )
        }
        const envelope = parsed as unknown as Record<string, unknown>
        const engine = parsed.engine as unknown as Record<string, unknown> | null
        if (
          envelope.jobId !== request.jobId ||
          envelope.storeId !== request.storeId ||
          envelope.correlationId !== request.correlationId ||
          envelope.xmlSha256 !== request.xmlSha256 ||
          (engine !== null &&
            (engine.schemaManifestHash !== request.schemaManifestHash ||
              engine.schemaPackage !== request.schemaVersion))
        ) {
          return infrastructureFailure(
            "RESPOSTA_INCERTA",
            "xsd_worker_response_mismatch",
            "Worker XSD devolveu envelope divergente.",
          )
        }
        return parsed
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return infrastructureFailure(
            "TIMEOUT",
            "xsd_worker_timeout",
            "Worker XSD excedeu o timeout externo.",
            true,
          )
        }
        return infrastructureFailure(
          "WORKER_INDISPONIVEL",
          "xsd_worker_unavailable",
          "Worker XSD interno indisponível.",
          true,
        )
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

export function createConfiguredXsdWorkerClient(): XsdValidationAdapter {
  return createXsdWorkerHttpClient({
    baseUrl: process.env.FISCAL_XSD_WORKER_URL ?? "",
    allowedHosts: (process.env.FISCAL_XSD_WORKER_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  })
}
