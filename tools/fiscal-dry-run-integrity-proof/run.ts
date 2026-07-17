/**
 * Runner CLI da prova FISCAL-DRY-RUN-INTEGRITY-PROOF-005.
 *
 * Uso:
 *   npx tsx tools/fiscal-dry-run-integrity-proof/run.ts
 *   npx tsx tools/fiscal-dry-run-integrity-proof/run.ts --update-manifest
 *
 * Default: somente verificação (compara manifesto golden).
 * Não grava banco, não chama SEFAZ, não emite.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  STORE_PROOF_A,
  STORE_PROOF_B,
  PROOF_CLOCK_ISO,
  PROOF_SEED,
} from "./fixtures"
import {
  buildManifestFromProof,
  createCompositionXsdAdapter,
  runFiscalDryRunIntegrityProof,
  stableStringify,
  toPublicProofView,
} from "./proof"
import { verifyNfceSignature } from "@/lib/fiscal/signing"

const HERE = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = resolve(HERE, "evidence/manifest.json")
const REPO_ROOT = resolve(HERE, "../..")

async function main(): Promise<void> {
  const update = process.argv.includes("--update-manifest")
  const xsdAdapter = createCompositionXsdAdapter()
  const deps = {
    clockIso: PROOF_CLOCK_ISO,
    seed: PROOF_SEED,
    storeId: STORE_PROOF_A,
    xsdAdapter,
    runExternalJava: true,
    repoRoot: REPO_ROOT,
    databaseWriteProbe: { writes: 0 },
    externalEgressProbe: { calls: 0 },
    sefazProbe: { calls: 0 },
  }

  const r1 = await runFiscalDryRunIntegrityProof(deps)
  const r2 = await runFiscalDryRunIntegrityProof(deps)
  const r3 = await runFiscalDryRunIntegrityProof(deps)
  const b1 = await runFiscalDryRunIntegrityProof({ ...deps, storeId: STORE_PROOF_B })
  const a2 = await runFiscalDryRunIntegrityProof(deps)

  const deterministic =
    r1.hashes.signedXmlSha256 === r2.hashes.signedXmlSha256 &&
    r2.hashes.signedXmlSha256 === r3.hashes.signedXmlSha256
  const idempotent = r1.hashes.snapshotSha256 === r2.hashes.snapshotSha256
  const storeIsolation =
    r1.hashes.signedXmlSha256 !== b1.hashes.signedXmlSha256 &&
    a2.hashes.signedXmlSha256 === r1.hashes.signedXmlSha256
  const tampered = r1.artifacts.signedXml.replace("<vNF>10.00</vNF>", "<vNF>99.99</vNF>")
  const tamperDetected = verifyNfceSignature(tampered).valido === false

  const manifest = buildManifestFromProof(r1, {
    deterministic,
    idempotent,
    tamperDetected,
    storeIsolation,
  })
  const serialized = stableStringify(manifest)

  if (update) {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
    writeFileSync(MANIFEST_PATH, serialized, "utf8")
    console.log(`manifest atualizado: ${MANIFEST_PATH}`)
  } else {
    if (!existsSync(MANIFEST_PATH)) {
      console.error("manifest golden ausente — rode com --update-manifest uma vez")
      process.exit(2)
    }
    const golden = readFileSync(MANIFEST_PATH, "utf8")
    if (golden !== serialized) {
      console.error("manifest divergente do golden")
      console.error("esperado bytes:", golden.length, "obtido:", serialized.length)
      process.exit(1)
    }
    console.log("manifest OK (byte-igual ao golden)")
  }

  const publicView = toPublicProofView(r1)
  console.log(
    JSON.stringify(
      {
        ok:
          publicView.verification.internal &&
          publicView.verification.externalJava17 &&
          publicView.verification.xsd &&
          deterministic &&
          idempotent &&
          storeIsolation &&
          tamperDetected,
        verification: publicView.verification,
        integrity: { deterministic, idempotent, storeIsolation, tamperDetected },
        hashes: publicView.hashes,
        safety: publicView.safety,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
