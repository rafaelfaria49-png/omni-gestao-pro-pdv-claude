// Copia a tela local de status e o ícone oficial para dist/renderer.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = path.join(root, "src", "renderer")
const out = path.join(root, "dist", "renderer")
mkdirSync(out, { recursive: true })
for (const f of readdirSync(src)) copyFileSync(path.join(src, f), path.join(out, f))

// Ícone oficial do sistema. O arquivo público tem o "ã" corrompido (U+FFFD); corrigido só na cópia.
const svg = readFileSync(path.join(root, "..", "..", "public", "omni-gestao-pro-icon.svg"), "utf8")
writeFileSync(path.join(out, "icon.svg"), svg.replace("OmniGest�o", "OmniGestão"))
console.log("renderer copiado para", path.relative(root, out))
