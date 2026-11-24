// Confere os Electron Fuses gravados no executável empacotado.
//
// Uso: node scripts/check-fuses.mjs "<caminho do OmniGestaoPro.exe>"
import { FuseV1Options, getCurrentFuseWire } from "@electron/fuses"

const exe = process.argv[2]
if (!exe) throw new Error("informe o caminho do OmniGestaoPro.exe")

const ON = 49 // '1'
const OFF = 48 // '0'
const expected = {
  RunAsNode: OFF,
  EnableCookieEncryption: ON,
  EnableNodeOptionsEnvironmentVariable: OFF,
  EnableNodeCliInspectArguments: OFF,
  EnableEmbeddedAsarIntegrityValidation: ON,
  OnlyLoadAppFromAsar: ON,
  LoadBrowserProcessSpecificV8Snapshot: OFF,
  GrantFileProtocolExtraPrivileges: OFF,
}

const wire = await getCurrentFuseWire(exe)
let failed = 0
for (const [name, want] of Object.entries(expected)) {
  const got = wire[FuseV1Options[name]]
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? "PASS" : "FAIL"} fuse ${name} = ${got === ON ? "ON" : got === OFF ? "OFF" : String(got)}`)
}
if (failed) {
  console.error(`${failed} fuse(s) fora do esperado`)
  process.exit(1)
}
console.log(`fuses ok (${Object.keys(expected).length}/${Object.keys(expected).length})`)
