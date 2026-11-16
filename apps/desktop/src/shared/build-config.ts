/**
 * Configuração de build do OmniGestão Desktop.
 *
 * A origem do servidor é fixada NO MOMENTO DO EMPACOTAMENTO (scripts/write-build-config.mjs)
 * e nunca pode ser digitada pelo operador. Cada canal tem regras próprias e nenhum canal
 * de QA pode se passar por Produção.
 */

export type DesktopChannel = "production" | "qa" | "development"

export interface DesktopBuildConfig {
  channel: DesktopChannel
  /** Origem única que o app carrega (ex.: https://omni-gestao-pro.vercel.app). */
  origin: string
  /** Manifesto de atualização do executável (opcional). Ausente = verificação desligada. */
  updateManifestUrl: string | null
  buildCommit: string
  buildTime: string
}

export const PRODUCTION_ORIGIN = "https://omni-gestao-pro.vercel.app"

/** Domínio legado: nunca pode ser carregado por nenhum canal. */
export const FORBIDDEN_HOSTS = new Set(["omni-gestao-pi.vercel.app"])

/** Previews de QA autorizados: só os deste projeto/time na Vercel. */
export const QA_HOST_PREFIX = "omni-gestao-"
export const QA_HOST_SUFFIX = "-rafaelfaria49-4373s-projects.vercel.app"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

export class BuildConfigError extends Error {}

function parseOrigin(raw: unknown, field: string): URL {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new BuildConfigError(`${field} ausente`)
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BuildConfigError(`${field} não é uma URL válida`)
  }
  if (url.username || url.password) throw new BuildConfigError(`${field} não pode conter credenciais`)
  if (url.search || url.hash) throw new BuildConfigError(`${field} não pode conter query ou fragmento`)
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new BuildConfigError(`${field} deve ser apenas a origem, sem caminho`)
  }
  if (FORBIDDEN_HOSTS.has(url.hostname)) {
    throw new BuildConfigError(`${field} usa o domínio legado proibido ${url.hostname}`)
  }
  return url
}

/** Valida a origem de acordo com o canal. Lança BuildConfigError em qualquer desvio. */
export function validateOriginForChannel(channel: DesktopChannel, rawOrigin: unknown): string {
  const url = parseOrigin(rawOrigin, "origin")
  switch (channel) {
    case "production":
      if (url.origin !== PRODUCTION_ORIGIN) {
        throw new BuildConfigError(`canal production só aceita ${PRODUCTION_ORIGIN}`)
      }
      return url.origin
    case "qa": {
      if (url.protocol !== "https:") throw new BuildConfigError("canal qa exige https")
      if (url.origin === PRODUCTION_ORIGIN) {
        throw new BuildConfigError("canal qa não pode apontar para a origem de Produção")
      }
      if (
        !url.hostname.startsWith(QA_HOST_PREFIX) ||
        !url.hostname.endsWith(QA_HOST_SUFFIX) ||
        url.hostname.length <= QA_HOST_PREFIX.length + QA_HOST_SUFFIX.length ||
        url.port !== ""
      ) {
        throw new BuildConfigError(`canal qa só aceita preview ${QA_HOST_PREFIX}*${QA_HOST_SUFFIX}`)
      }
      return url.origin
    }
    case "development":
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new BuildConfigError("canal development exige http(s)")
      }
      if (!LOOPBACK_HOSTS.has(url.hostname)) {
        throw new BuildConfigError("canal development só aceita localhost/127.0.0.1")
      }
      return url.origin
    default:
      throw new BuildConfigError(`canal desconhecido: ${String(channel)}`)
  }
}

export function validateBuildConfig(raw: unknown): DesktopBuildConfig {
  if (!raw || typeof raw !== "object") throw new BuildConfigError("configuração de build ausente")
  const r = raw as Record<string, unknown>
  const channel = r.channel
  if (channel !== "production" && channel !== "qa" && channel !== "development") {
    throw new BuildConfigError(`canal inválido: ${String(channel)}`)
  }
  const origin = validateOriginForChannel(channel, r.origin)

  let updateManifestUrl: string | null = null
  if (r.updateManifestUrl != null && r.updateManifestUrl !== "") {
    if (typeof r.updateManifestUrl !== "string") throw new BuildConfigError("updateManifestUrl inválida")
    let u: URL
    try {
      u = new URL(r.updateManifestUrl)
    } catch {
      throw new BuildConfigError("updateManifestUrl inválida")
    }
    // O manifesto só pode vir da própria origem do sistema e por HTTPS (exceto dev local).
    if (u.origin !== origin) throw new BuildConfigError("updateManifestUrl deve estar na mesma origem")
    if (channel !== "development" && u.protocol !== "https:") {
      throw new BuildConfigError("updateManifestUrl exige https")
    }
    updateManifestUrl = u.toString()
  }

  return {
    channel,
    origin,
    updateManifestUrl,
    buildCommit: typeof r.buildCommit === "string" ? r.buildCommit.slice(0, 40) : "desconhecido",
    buildTime: typeof r.buildTime === "string" ? r.buildTime : "desconhecido",
  }
}

export function channelLabel(channel: DesktopChannel): string {
  if (channel === "production") return "Produção"
  if (channel === "qa") return "QA"
  return "Desenvolvimento"
}

/** Título fixo da janela: QA e desenvolvimento sempre aparecem identificados. */
export function windowTitle(config: Pick<DesktopBuildConfig, "channel" | "origin">): string {
  if (config.channel === "production") return "OmniGestão Pro"
  const host = new URL(config.origin).host
  return `OmniGestão Pro — ${channelLabel(config.channel)} (${host})`
}
