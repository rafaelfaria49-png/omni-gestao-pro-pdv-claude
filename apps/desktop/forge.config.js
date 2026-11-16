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
        // Ícone em "Aplicativos instalados". Sem URL pública, aponta para o arquivo local do build.
        iconUrl: pathToFileURL(icon).toString(),
        noMsi: true,
        // Assinatura: só com certificado real fornecido por variável de ambiente no build.
        ...(process.env.OMNI_DESKTOP_CERT_FILE
          ? {
              certificateFile: process.env.OMNI_DESKTOP_CERT_FILE,
              certificatePassword: process.env.OMNI_DESKTOP_CERT_PASSWORD,
            }
          : {}),
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
