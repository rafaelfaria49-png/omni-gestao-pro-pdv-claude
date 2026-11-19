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

/** Histórico de versões publicadas (para rollback): acrescenta sem duplicar, mais nova primeiro. */
export function appendHistory(history, release) {
  const list = Array.isArray(history?.versions) ? history.versions.filter((v) => v.version !== release.version) : []
  list.unshift({ version: release.version, sha256: release.installer.sha256, url: release.installer.url, publishedAt: release.publishedAt, buildCommit: release.buildCommit })
  return { channel: "production", versions: list }
}
