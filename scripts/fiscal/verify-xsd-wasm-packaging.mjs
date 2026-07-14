import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const tracePath = resolve(".next/server/app/api/version/route.js.nft.json")
const trace = JSON.parse(await readFile(tracePath, "utf8"))
const tracedFiles = trace.files.map((file) => String(file).replaceAll("\\", "/"))

const expected = new Map([
  ["lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/DFeTiposBasicos_v1.00.xsd", "7fe1dbd89a1dd80826c5134c2406b7eb5df4fa7a9177c5aa6e72319caba7c6d2"],
  ["lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/leiauteNFe_v4.00.xsd", "598c71780cbc6b54f170464bd6d5538c2d01a99d987a1666b662d4e166b84bf7"],
  ["lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/nfe_v4.00.xsd", "adce3646c13ceb54922ec3142fc1dc45bd4fb839ac35ad583e86c733c07d27df"],
  ["lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/tiposBasico_v4.00.xsd", "772619c85723e598840667ca66e7298a250442df47eeb94b397d2a333ce62047"],
  ["lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/xmldsig-core-schema_v1.01.xsd", "f56744a5f51c03f027de13f39f869307091781a9ef1d91b1ebe14719ce28e1ac"],
  ["node_modules/xmllint-wasm/index-node.js", null],
  ["node_modules/xmllint-wasm/xmllint-node.js", null],
  ["node_modules/xmllint-wasm/xmllint.wasm", "4e3cc21a67e8dd40ccb59822e4193fd1923b4cda08b40fe8ff8973de5eed9515"],
  ["node_modules/xmllint-wasm/package.json", null],
])

const canonicalLfHashes = new Map([
  ["lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/nfe_v4.00.xsd", "920fd7c04a35b49d0b7f56792e650e63cef76cf1b23f10995b1bbec1f0202774"],
  ["lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/xmldsig-core-schema_v1.01.xsd", "78f924e7c9cbeb1e4be900b3b1e7faf2d901972635842980fd43dabb533c512b"],
])

const results = []
for (const [suffix, expectedSha256] of expected) {
  const traced = tracedFiles.find((file) => file.endsWith(suffix))
  if (!traced) {
    results.push({ suffix, traced: false, exists: false, sha256: null, hashMatches: false })
    continue
  }
  const absolute = resolve(dirname(tracePath), traced)
  let exists = true
  let bytes = 0
  let hash = null
  let canonicalHash = null
  try {
    bytes = (await stat(absolute)).size
    const contents = await readFile(absolute)
    const canonical = suffix.endsWith(".xsd")
      ? Buffer.from(contents.toString("utf8").replaceAll("\r\n", "\n"), "utf8")
      : contents
    hash = createHash("sha256").update(contents).digest("hex")
    canonicalHash = createHash("sha256").update(canonical).digest("hex")
  } catch {
    exists = false
  }
  results.push({
    suffix,
    traced: true,
    exists,
    bytes,
    sha256: hash,
    canonicalLfSha256: canonicalHash,
    hashMatches: expectedSha256 === null
      ? exists
      : hash === expectedSha256 || canonicalHash === (canonicalLfHashes.get(suffix) ?? expectedSha256),
  })
}

const ok = results.every((result) => result.traced && result.exists && result.hashMatches)
console.log(JSON.stringify({ tracePath, traceVersion: trace.version, traceFileCount: trace.files.length, ok, results }, null, 2))
if (!ok) process.exitCode = 1
