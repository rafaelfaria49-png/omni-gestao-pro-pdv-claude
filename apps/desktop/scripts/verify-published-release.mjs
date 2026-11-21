// Baixa o instalador pela URL PÚBLICA (https) e confere SHA-256 e assinatura Authenticode.
// Prova que o arquivo entregue aos clientes é o mesmo gerado e assinado pelo pipeline.
//
// Uso:
//   node scripts/verify-published-release.mjs --url https://<downloads>/desktop/production/<v>/OmniGestaoPro-Setup.exe \
//        --sha256 <esperado> --trusted <thumbprint[,thumbprint]> --out <arquivo baixado> [--report <json>]
//
// Também serve para o proprietário conferir uma release já publicada a partir de qualquer Windows.
// Sai com código 1 em qualquer divergência.
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { authenticode } from "./lib/authenticode.mjs"
import { parseTrustedThumbprints } from "./lib/release-manifest-builder.mjs"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith("--") ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
)
const url = new URL(args.url ?? "")
if (url.protocol !== "https:") throw new Error("--url deve ser https")
const expectedSha = String(args.sha256 ?? "").toLowerCase()
if (!/^[a-f0-9]{64}$/.test(expectedSha)) throw new Error("--sha256 inválido")
// Certificados aceitos vêm da configuração do proprietário, nunca do manifesto que está sendo conferido.
const trusted = parseTrustedThumbprints(args.trusted)
if (!trusted.length) throw new Error("--trusted obrigatório (thumbprint do certificado da empresa)")
const out = path.resolve(args.out ?? "downloaded-Setup.exe")

// Sem redirecionamento: o arquivo tem de estar exatamente na URL imutável publicada.
const res = await fetch(url, { redirect: "error", cache: "no-store" })
if (!res.ok) fail(`download HTTP ${res.status}`)
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(await res.arrayBuffer()))
const sha256 = createHash("sha256").update(readFileSync(out)).digest("hex")
const signature = authenticode(out)

const report = {
  url: url.toString(),
  contentType: res.headers.get("content-type"),
  cacheControl: res.headers.get("cache-control"),
  sha256,
  shaMatches: sha256 === expectedSha,
  signature,
  thumbprintTrusted: trusted.includes(signature.thumbprint),
  checkedAt: new Date().toISOString(),
}
console.log(JSON.stringify(report, null, 2))
if (args.report) writeFileSync(path.resolve(args.report), JSON.stringify(report, null, 2) + "\n")
if (!report.shaMatches) fail("SHA-256 do download público difere do esperado")
if (signature.status !== "Valid" || !signature.timestamped) fail(`assinatura do download público: ${signature.status}`)
if (!report.thumbprintTrusted) fail("certificado do download público fora da lista confiável")
console.log("OK download público confere (SHA-256 + Authenticode)")

function fail(msg) {
  console.error(`FAIL ${msg}`)
  process.exit(1)
}
