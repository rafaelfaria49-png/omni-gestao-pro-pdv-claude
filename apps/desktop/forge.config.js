// Electron Forge — OmniGestão Pro para Windows.
//
// Pré-requisito: `npm run build` + `node scripts/write-build-config.mjs --channel <qa|production> ...`
// O canal development nunca vira pacote instalável.
const { FusesPlugin } = require("@electron-forge/plugin-fuses")
const { FuseV1Options, FuseVersion } = require("@electron/fuses")
const { existsSync, readFileSync } = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

const configPath = path.join(__dirname, "build-config.json")
if (!existsSync(configPath)) throw new Error("build-config.json ausente — rode scripts/write-build-config.mjs")
const { validateBuildConfig } = require("./dist/shared/build-config.js")
const buildConfig = validateBuildConfig(JSON.parse(readFileSync(configPath, "utf8")))
if (buildConfig.channel === "development") throw new Error("canal development não pode ser empacotado")

const isQa = buildConfig.channel === "qa"
const productName = isQa ? "OmniGestão Pro QA" : "OmniGestão Pro"
const squirrelId = isQa ? "OmniGestaoProQA" : "OmniGestaoPro"
const icon = path.join(__dirname, "assets", "icon.ico")
const ciCommit = process.env.GITHUB_ACTIONS === "true" ? process.env.GITHUB_SHA : ""
const SQUIRREL_ICON_URL =
  ciCommit && /^[0-9a-f]{40}$/.test(ciCommit) && /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPOSITORY ?? "")
    ? `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/${ciCommit}/apps/desktop/assets/icon.ico`
    : pathToFileURL(icon).toString()

/**
 * Assinatura Authenticode — SÓ com certificado real fornecido no ambiente do build (nunca no repo):
 *  - OMNI_DESKTOP_SIGN_SHA1: thumbprint de certificado no repositório do Windows. É o caminho dos
 *    certificados de code signing atuais (chave em HSM/nuvem do fornecedor, exposta por KSP/CSP);
 *  - OMNI_DESKTOP_CERT_FILE + OMNI_DESKTOP_CERT_PASSWORD: .pfx legado.
 * OMNI_DESKTOP_TIMESTAMP_URL (RFC 3161 da autoridade certificadora) é obrigatório ao assinar:
 * sem carimbo de tempo a assinatura morre quando o certificado vence.
 * Sem nenhuma das duas, o pacote sai NÃO ASSINADO (uso interno/QA); o workflow de release pública
 * recusa publicar nesse caso.
 */
function windowsSignOptions() {
  const sha1 = (process.env.OMNI_DESKTOP_SIGN_SHA1 ?? "").trim()
  const certFile = (process.env.OMNI_DESKTOP_CERT_FILE ?? "").trim()
  if (!sha1 && !certFile) return null
  if (sha1 && !/^[0-9a-fA-F]{40}$/.test(sha1)) throw new Error("OMNI_DESKTOP_SIGN_SHA1 deve ser o thumbprint SHA-1 (40 hex)")
  const timestampServer = (process.env.OMNI_DESKTOP_TIMESTAMP_URL ?? "").trim()
  if (!/^https?:\/\/[^\s]+$/.test(timestampServer)) throw new Error("OMNI_DESKTOP_TIMESTAMP_URL obrigatório para assinar")
  const common = { timestampServer, description: productName, website: "https://omni-gestao-pro.vercel.app" }
  return sha1
    ? { ...common, signWithParams: ["/sha1", sha1] }
    : { ...common, certificateFile: certFile, certificatePassword: process.env.OMNI_DESKTOP_CERT_PASSWORD }
}
const windowsSign = windowsSignOptions()

/** Só o necessário entra no pacote: código compilado, ícones, config e package.json. */
const ALLOWED = [/^\/package\.json$/, /^\/build-config\.json$/, /^\/dist(\/|$)/, /^\/assets(\/|$)/]

module.exports = {
  packagerConfig: {
    // Nome ASCII para pastas/artefatos; o nome com acento aparece nos metadados e atalhos.
    name: squirrelId,
    executableName: "OmniGestaoPro",
    icon: path.join(__dirname, "assets", "icon"),
    asar: true,
    prune: true,
    appCopyright: `© ${new Date().getFullYear()} RAFACELL`,
    win32metadata: {
      CompanyName: "RAFACELL",
      ProductName: productName,
      FileDescription: productName,
      InternalName: "OmniGestaoPro",
      OriginalFilename: "OmniGestaoPro.exe",
    },
    ignore: (p) => p !== "" && !ALLOWED.some((re) => re.test(p.replace(/\\/g, "/"))),
    // OmniGestaoPro.exe assinado já no empacotamento (depois dos fuses), antes de entrar no .nupkg.
    ...(windowsSign ? { windowsSign } : {}),
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: squirrelId,
        title: productName,
        authors: "RAFACELL",
        description: "OmniGestão Pro para Windows",
        exe: "OmniGestaoPro.exe",
        setupExe: isQa ? "OmniGestaoPro-QA-Setup.exe" : "OmniGestaoPro-Setup.exe",
        setupIcon: icon,
        // Ícone em "Aplicativos instalados": o Squirrel BAIXA este endereço no PC de quem instala.
        // Caminho local só funciona na máquina que gerou o build; na CI usa o icon.ico do commit exato
        // no GitHub (repositório público; o ícone não é segredo).
        iconUrl: SQUIRREL_ICON_URL,
        noMsi: true,
        // Assina Setup.exe, Update.exe e os executáveis do pacote (ver windowsSignOptions).
        ...(windowsSign ? { windowsSign } : {}),
      },
    },
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
}
