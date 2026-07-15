import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const fiscalXsd = join(root, "lib", "fiscal", "xsd")
const manifestPath = join(fiscalXsd, "manifest.json")
const expectedFiles = new Set([
  "nfe_v4.00.xsd", "leiauteNFe_v4.00.xsd", "tiposBasico_v4.00.xsd",
  "DFeTiposBasicos_v1.00.xsd", "xmldsig-core-schema_v1.01.xsd",
])

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function regularInside(directory, path) {
  const [directoryReal, info] = await Promise.all([realpath(directory), lstat(path)])
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Artefato não regular: ${basename(path)}`)
  const pathReal = await realpath(path)
  const rel = relative(directoryReal, pathReal)
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Escape de path: ${basename(path)}`)
  return readFile(pathReal)
}

const manifestBytes = await regularInside(dirname(manifestPath), manifestPath)
const manifestHashLine = (await readFile(join(fiscalXsd, "manifest.sha256"), "utf8")).trim()
const match = manifestHashLine.match(/^([a-f0-9]{64})\s+manifest\.json$/)
if (!match || match[1] !== sha256(manifestBytes)) throw new Error("Hash do manifesto XSD divergente.")
const manifest = JSON.parse(manifestBytes.toString("utf8"))
if (manifest.schemaPackage !== "PL_010e_v1.02" || manifest.layoutVersion !== "4.00" || manifest.documentModel !== "65") {
  throw new Error("Identidade do pacote oficial divergente.")
}
if (manifest.files.length !== 5 || manifest.files.some((file) => !expectedFiles.delete(file.name)) || expectedFiles.size) {
  throw new Error("Conjunto de XSDs não é exatamente o allowlisted.")
}
const schemaRoot = join(fiscalXsd, "schemas", "PL_010e_v1.02", "NFe")
for (const file of manifest.files) {
  const bytes = await regularInside(schemaRoot, join(schemaRoot, file.name))
  if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`Integridade divergente: ${file.name}`)
  const text = bytes.toString("utf8")
  for (const dependency of text.matchAll(/schemaLocation\s*=\s*["']([^"']+)["']/g)) {
    if (!manifest.files.some((candidate) => candidate.name === dependency[1])) throw new Error(`Dependência externa: ${dependency[1]}`)
  }
}
console.log(JSON.stringify({ ok: true, package: manifest.schemaPackage, manifestSha256: match[1], files: manifest.files.length }))
