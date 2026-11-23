// AppxManifest.xml do pacote MSIX do OmniGestão Pro (canal Microsoft Store) — puro e testável.
//
// A identidade (Name / Publisher / PublisherDisplayName) da Store é EMITIDA pelo Partner Center quando o
// proprietário reserva o nome do app; nunca é inventada aqui. Sem ela, o build usa a identidade de TESTE
// do CI (`OmniGestaoPro.CITeste` / `CN=OmniGestao CI Teste`), que serve só para instalar no runner e é
// recusada pelo modo `--store`.
//
// Versão: a Store exige quatro partes com a última = 0. `1.0.4` vira `1.0.4.0`.

export const CI_TEST_IDENTITY = Object.freeze({
  name: "OmniGestaoPro.CITeste",
  publisher: "CN=OmniGestao CI Teste",
  publisherDisplayName: "OmniGestão Pro (teste de CI)",
})

export const MSIX_APP_ID = "OmniGestaoPro"
export const MSIX_EXECUTABLE = "OmniGestaoPro.exe"
/** Windows 10 1809 — mínimo do Electron 45 ("Windows 10 and up") com redirecionamento de AppData do MSIX. */
export const MIN_WINDOWS_VERSION = "10.0.17763.0"

export class MsixManifestError extends Error {}

export function msixVersion(semver) {
  const m = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/.exec(String(semver ?? ""))
  if (!m) throw new MsixManifestError(`versão inválida para MSIX: ${semver} (esperado x.y.z)`)
  const parts = m.slice(1).map(Number)
  if (parts.some((n) => n > 65535)) throw new MsixManifestError(`versão fora do limite do MSIX: ${semver}`)
  if (parts[0] === 0) throw new MsixManifestError("a Store recusa versão principal 0")
  return `${parts.join(".")}.0`
}

/** Valida a identidade. `store=true` recusa a identidade de teste do CI. */
export function validateIdentity(identity, { store = false } = {}) {
  const { name, publisher, publisherDisplayName } = identity ?? {}
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{2,49}$/.test(name ?? "")) throw new MsixManifestError(`Identity Name inválido: ${name}`)
  // Partner Center: Publisher = "CN=<GUID>" (conta de empresa) ou DN completo do certificado.
  if (!/^CN=[^,<>"&]{1,200}(,\s?[A-Z]{1,3}=[^,<>"&]{1,200})*$/.test(publisher ?? "")) throw new MsixManifestError(`Publisher inválido: ${publisher}`)
  if (!publisherDisplayName || /[<>&"]/.test(publisherDisplayName) || publisherDisplayName.length > 256) {
    throw new MsixManifestError("PublisherDisplayName ausente ou inválido")
  }
  if (store && (name === CI_TEST_IDENTITY.name || publisher === CI_TEST_IDENTITY.publisher)) {
    throw new MsixManifestError("identidade de teste do CI não pode ir para a Microsoft Store")
  }
  return { name, publisher, publisherDisplayName }
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * @param {{ identity: {name:string,publisher:string,publisherDisplayName:string}, version: string,
 *           displayName: string, description: string, store?: boolean }} opts
 */
export function buildAppxManifest(opts) {
  const id = validateIdentity(opts.identity, { store: !!opts.store })
  const version = msixVersion(opts.version)
  if (!opts.displayName || !opts.description) throw new MsixManifestError("displayName e description obrigatórios")
  return `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="${esc(id.name)}" Publisher="${esc(id.publisher)}" Version="${version}" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>${esc(opts.displayName)}</DisplayName>
    <PublisherDisplayName>${esc(id.publisherDisplayName)}</PublisherDisplayName>
    <Logo>assets\\msix\\StoreLogo.png</Logo>
    <Description>${esc(opts.description)}</Description>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="${MIN_WINDOWS_VERSION}" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="pt-BR" />
  </Resources>
  <Applications>
    <Application Id="${MSIX_APP_ID}" Executable="${MSIX_EXECUTABLE}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="${esc(opts.displayName)}"
        Description="${esc(opts.description)}"
        BackgroundColor="transparent"
        Square150x150Logo="assets\\msix\\Square150x150Logo.png"
        Square44x44Logo="assets\\msix\\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="assets\\msix\\Wide310x150Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
`
}
