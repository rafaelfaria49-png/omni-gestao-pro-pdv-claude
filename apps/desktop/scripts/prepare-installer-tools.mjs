// Prepara o 7-Zip que o electron-winstaller (Squirrel.Windows) usa no `electron-forge make`.
//
// O pacote copia `vendor/7z-<arch>.exe|dll` para `vendor/7z.exe|dll` num script de instalação.
// O npm 12 bloqueia scripts de instalação por padrão, e sem essa cópia o `make` falha sem gerar o
// Setup.exe. Este passo faz a mesma cópia de forma explícita e verificável (arquivos do próprio
// pacote instalado pelo `npm ci`, sem download).
import { copyFileSync, existsSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { arch } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vendor = path.join(root, "node_modules", "electron-winstaller", "vendor")
if (!existsSync(vendor)) throw new Error("electron-winstaller ausente — rode `npm ci` antes")

const hostArch = arch() // o 7-Zip é do HOST, mesmo gerando para outra arquitetura
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex")
for (const ext of ["exe", "dll"]) {
  const src = path.join(vendor, `7z-${hostArch}.${ext}`)
  const dst = path.join(vendor, `7z.${ext}`)
  if (!existsSync(src)) throw new Error(`7-Zip para ${hostArch} não existe no electron-winstaller (${src})`)
  if (!existsSync(dst) || sha(src) !== sha(dst)) copyFileSync(src, dst)
  if (sha(src) !== sha(dst)) throw new Error(`cópia de ${path.basename(dst)} divergiu`)
}
console.log(`7-Zip do Squirrel pronto (host ${hostArch})`)
