// Monta o manifesto da release PÚBLICA (latest.json / release.json) — função pura.
//
// O contrato é validado do lado web por `lib/desktop-distribution/release-manifest.ts`
// (teste de contrato: lib/desktop-distribution/release-contract.test.ts). Mudou um, mude o outro.

export const SETUP_FILE_NAME = "OmniGestaoPro-Setup.exe"

const HEX64 = /^[a-f0-9]{64}$/
const HEX40 = /^[a-f0-9]{40}$/

/** Origem pública de downloads: só https, sem caminho; nunca a própria Vercel. */
export function parseBase(raw) {
  const url = new URL(String(raw ?? "").trim())
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("base de downloads deve ser só uma origem https")
  }
  if (url.hostname.endsWith(".vercel.app")) throw new Error("o executável não pode ser servido pela Vercel")
  return url
}

export function objectKeys(version) {
  const dir = `desktop/production/${version}`
  return {
    dir,
    setup: `${dir}/${SETUP_FILE_NAME}`,
    sums: `${dir}/SHA256SUMS.txt`,
    release: `${dir}/release.json`,
    latest: "desktop/production/latest.json",
    history: "desktop/production/versions.json",
  }
}

/**
 * @param {object} a
 * @param {string} a.base origem pública
 * @param {object} a.artifacts conteúdo de artifacts.json (verify-artifacts.mjs --require-signed)
 * @param {object} a.publicCheck resultado de verify-published-release.mjs sobre a URL pública
 * @param {"passed"|"failed"} a.installTest instalação real do arquivo baixado da URL pública
 * @param {string} a.publishedAt ISO
 * @param {string} [a.notes]
 */
export function buildReleaseManifest({ base, artifacts, publicCheck, installTest, publishedAt, notes }) {
  const origin = parseBase(base)
  if (artifacts.channel !== "production") throw new Error("só o canal production vai para download público")
  const setup = (artifacts.files ?? []).find((f) => f.file === SETUP_FILE_NAME)
  if (!setup || !HEX64.test(setup.sha256)) throw new Error("Setup.exe ausente em artifacts.json")
  const sig = artifacts.authenticode?.setup
  if (!sig || sig.status !== "Valid" || !sig.timestamped || !HEX40.test(sig.thumbprint)) {
    throw new Error("Setup.exe sem assinatura Authenticode válida com carimbo de tempo — release pública recusada")
  }
  if (publicCheck?.sha256 !== setup.sha256) throw new Error("arquivo baixado da URL pública difere do gerado")
  if (publicCheck?.signature?.status !== "Valid" || publicCheck.signature.thumbprint !== sig.thumbprint) {
    throw new Error("assinatura do arquivo baixado da URL pública não confere")
  }
  if (installTest !== "passed") throw new Error("teste de instalação do arquivo público não aprovado")
  const keys = objectKeys(artifacts.version)
  return {
    schema: 1,
    channel: "production",
    arch: "x64",
    version: artifacts.version,
    installer: {
      fileName: SETUP_FILE_NAME,
      url: `${origin.origin}/${keys.setup}`,
      sha256: setup.sha256,
      bytes: setup.bytes,
    },
    signature: { status: "Valid", timestamped: true, signer: sig.signer, thumbprint: sig.thumbprint },
    verification: { publicDownloadSha256: publicCheck.sha256, publicDownloadSignature: "Valid", installTest: "passed" },
    buildCommit: String(artifacts.buildCommit).toLowerCase(),
    publishedAt,
    ...(notes ? { notes: String(notes).slice(0, 500) } : {}),
  }
}

/** Lista de thumbprints confiáveis ("a,b"): SHA-1 hex, minúsculo. Vazia = nenhum confiável. */
export function parseTrustedThumbprints(raw) {
  return String(raw ?? "")
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => HEX40.test(t))
}

/**
 * Mesmo contrato de `lib/desktop-distribution/release-manifest.ts` (teste de contrato garante).
 * Usado pelo promote antes de virar latest.json. Lança Error em qualquer desvio.
 */
export function checkReleaseManifest(raw, base, trusted) {
  const origin = parseBase(base)
  const fail = (m) => {
    throw new Error(m)
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("manifesto ausente")
  if (raw.schema !== 1 || raw.channel !== "production" || raw.arch !== "x64") fail("schema/canal/arquitetura")
  const v = String(raw.version ?? "")
  if (!/^(\d{1,4})\.(\d{1,4})\.(\d{1,6})$/.test(v)) fail("versão inválida")
  const i = raw.installer ?? {}
  if (i.fileName !== SETUP_FILE_NAME) fail("nome do instalador")
  if (i.url !== `${origin.origin}/${objectKeys(v).setup}`) fail("instalador fora do diretório imutável da versão")
  const sha = String(i.sha256 ?? "").toLowerCase()
  if (!HEX64.test(sha)) fail("sha256 inválido")
  if (!Number.isInteger(i.bytes) || i.bytes < 50 * 1024 * 1024 || i.bytes > 400 * 1024 * 1024) fail("tamanho implausível")
  const s = raw.signature ?? {}
  if (s.status !== "Valid" || s.timestamped !== true || typeof s.signer !== "string" || !s.signer.trim()) fail("assinatura")
  const tp = String(s.thumbprint ?? "").toLowerCase()
  if (!HEX40.test(tp) || !trusted.includes(tp)) fail("certificado fora da lista confiável")
  const ver = raw.verification ?? {}
  if (ver.publicDownloadSha256 !== sha || ver.publicDownloadSignature !== "Valid" || ver.installTest !== "passed") fail("verificação")
  if (!HEX40.test(String(raw.buildCommit ?? "").toLowerCase())) fail("commit inválido")
  if (typeof raw.publishedAt !== "string" || Number.isNaN(Date.parse(raw.publishedAt))) fail("data inválida")
  return { version: v, sha256: sha, thumbprint: tp, url: i.url }
}

/** Histórico de versões publicadas (para rollback): acrescenta sem duplicar, mais nova primeiro. */
export function appendHistory(history, release) {
  const list = Array.isArray(history?.versions) ? history.versions.filter((v) => v.version !== release.version) : []
  list.unshift({ version: release.version, sha256: release.installer.sha256, url: release.installer.url, publishedAt: release.publishedAt, buildCommit: release.buildCommit })
  return { channel: "production", versions: list }
}
