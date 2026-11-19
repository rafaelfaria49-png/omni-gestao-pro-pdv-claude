/**
 * Manifesto da release PÚBLICA do instalador Windows (OmniGestão Pro Desktop).
 *
 * Gravado pelo workflow `desktop-release.yml` no armazenamento de downloads (bucket
 * público com CDN, fora da Vercel) em `<base>/desktop/production/latest.json`,
 * depois que o MESMO Setup.exe foi assinado, enviado, baixado de volta pela URL
 * pública, conferido (SHA-256 + Authenticode) e instalado no runner Windows.
 *
 * Esta validação é FAIL-CLOSED: qualquer campo fora do contrato derruba o
 * download público (a página volta para "acesso pelo navegador"). Em especial,
 * instalador sem assinatura Authenticode válida nunca é oferecido.
 */

export const RELEASE_MANIFEST_SCHEMA = 1
export const SETUP_FILE_NAME = "OmniGestaoPro-Setup.exe"
export const RELEASE_CHANNEL = "production"

export interface DesktopRelease {
  version: string
  arch: "x64"
  installerUrl: string
  fileName: string
  bytes: number
  sha256: string
  signer: string
  thumbprint: string
  buildCommit: string
  publishedAt: string
  notes: string | null
}

export class ReleaseManifestError extends Error {}

const SEMVER = /^(\d{1,4})\.(\d{1,4})\.(\d{1,6})$/
const HEX64 = /^[a-f0-9]{64}$/
const HEX40 = /^[a-f0-9]{40}$/

/** Valida a origem pública configurada para downloads (só https, sem caminho/credencial). */
export function parseReleasesBaseUrl(raw: string | undefined | null): URL | null {
  const value = raw?.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null
  if (url.pathname !== "/" && url.pathname !== "") return null
  // Nunca a própria aplicação: o executável não passa por funções da Vercel.
  if (url.hostname.endsWith(".vercel.app")) return null
  return url
}

export function latestManifestUrl(base: URL): string {
  return `${base.origin}/desktop/${RELEASE_CHANNEL}/latest.json`
}

export function versionDirUrl(base: URL, version: string): string {
  return `${base.origin}/desktop/${RELEASE_CHANNEL}/${version}/`
}

function str(r: Record<string, unknown>, key: string): string {
  const v = r[key]
  if (typeof v !== "string" || v.trim() === "") throw new ReleaseManifestError(`${key} ausente`)
  return v
}

function obj(r: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = r[key]
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ReleaseManifestError(`${key} ausente`)
  return v as Record<string, unknown>
}

export function parseReleaseManifest(raw: unknown, base: URL): DesktopRelease {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ReleaseManifestError("manifesto ausente")
  const r = raw as Record<string, unknown>
  if (r.schema !== RELEASE_MANIFEST_SCHEMA) throw new ReleaseManifestError("schema não suportado")
  if (r.channel !== RELEASE_CHANNEL) throw new ReleaseManifestError("canal diferente de production")
  if (r.arch !== "x64") throw new ReleaseManifestError("arquitetura não suportada")
  const version = str(r, "version")
  if (!SEMVER.test(version)) throw new ReleaseManifestError("versão inválida")

  const installer = obj(r, "installer")
  const fileName = str(installer, "fileName")
  if (fileName !== SETUP_FILE_NAME) throw new ReleaseManifestError("nome do instalador inesperado")
  let url: URL
  try {
    url = new URL(str(installer, "url"))
  } catch {
    throw new ReleaseManifestError("url do instalador inválida")
  }
  // Release imutável: o arquivo mora no diretório da própria versão, na origem configurada.
  if (url.origin !== base.origin || url.search || url.hash || url.username || url.password) {
    throw new ReleaseManifestError("instalador fora da origem de downloads")
  }
  if (url.pathname !== `/desktop/${RELEASE_CHANNEL}/${version}/${SETUP_FILE_NAME}`) {
    throw new ReleaseManifestError("instalador fora do diretório imutável da versão")
  }
  const sha256 = str(installer, "sha256").toLowerCase()
  if (!HEX64.test(sha256)) throw new ReleaseManifestError("sha256 inválido")
  const bytes = installer.bytes
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 50 * 1024 * 1024 || bytes > 400 * 1024 * 1024) {
    throw new ReleaseManifestError("tamanho do instalador implausível")
  }

  const signature = obj(r, "signature")
  if (signature.status !== "Valid") throw new ReleaseManifestError("instalador sem assinatura Authenticode válida")
  if (signature.timestamped !== true) throw new ReleaseManifestError("assinatura sem carimbo de tempo")
  const signer = str(signature, "signer").slice(0, 200)
  const thumbprint = str(signature, "thumbprint").toLowerCase()
  if (!HEX40.test(thumbprint)) throw new ReleaseManifestError("thumbprint inválido")

  const verification = obj(r, "verification")
  if (verification.publicDownloadSha256 !== sha256) throw new ReleaseManifestError("download público não conferido")
  if (verification.publicDownloadSignature !== "Valid") throw new ReleaseManifestError("assinatura do download público não conferida")
  if (verification.installTest !== "passed") throw new ReleaseManifestError("teste de instalação não aprovado")

  const buildCommit = str(r, "buildCommit").toLowerCase()
  if (!HEX40.test(buildCommit)) throw new ReleaseManifestError("commit inválido")
  const publishedAt = str(r, "publishedAt")
  if (Number.isNaN(Date.parse(publishedAt))) throw new ReleaseManifestError("data de publicação inválida")

  return {
    version,
    arch: "x64",
    installerUrl: url.toString(),
    fileName,
    bytes,
    sha256,
    signer,
    thumbprint,
    buildCommit,
    publishedAt,
    notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim().slice(0, 500) : null,
  }
}
