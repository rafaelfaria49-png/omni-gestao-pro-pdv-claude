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
  classifyProofExit,
  createCompositionXsdAdapter,
  runFiscalDryRunIntegrityProof,
  stableStringify,
  toPublicProofView,
  type ProofExitSignals,
} from "./proof"
import { withNetGuard, type EgressAttempt } from "./net-guard"
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

  // FASE 7-8: a cadeia inteira roda sob o intercept de egress; qualquer tentativa de
  // alcançar host externo é barrada e contada. Java (child_process) não é rede.
  let egressAttempts: EgressAttempt[] = []
  let runs: {
    r1: Awaited<ReturnType<typeof runFiscalDryRunIntegrityProof>>
    r2: Awaited<ReturnType<typeof runFiscalDryRunIntegrityProof>>
    r3: Awaited<ReturnType<typeof runFiscalDryRunIntegrityProof>>
    b1: Awaited<ReturnType<typeof runFiscalDryRunIntegrityProof>>
    a2: Awaited<ReturnType<typeof runFiscalDryRunIntegrityProof>>
  }
  try {
    const guarded = await withNetGuard(async () => {
      const r1 = await runFiscalDryRunIntegrityProof(deps)
      const r2 = await runFiscalDryRunIntegrityProof(deps)
      const r3 = await runFiscalDryRunIntegrityProof(deps)
      const b1 = await runFiscalDryRunIntegrityProof({ ...deps, storeId: STORE_PROOF_B })
      const a2 = await runFiscalDryRunIntegrityProof(deps)
      return { r1, r2, r3, b1, a2 }
    })
    runs = guarded.result
    egressAttempts = guarded.attempts
  } catch (error) {
    // Dependência técnica obrigatória (verificador Java 17) indisponível → exit 2.
    const message = error instanceof Error ? error.message : String(error)
    if (/javac|FiscalXmlDsigVerifier|\bjava\b/i.test(message)) {
      console.error(`dependência Java 17 indisponível (exit 2): ${message}`)
      process.exit(2)
    }
    throw error
  }
  const { r1, r2, r3, b1, a2 } = runs

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

  let manifestMatches: boolean
  if (update) {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
    writeFileSync(MANIFEST_PATH, serialized, "utf8")
    console.log(`manifest atualizado: ${MANIFEST_PATH}`)
    manifestMatches = true
  } else {
    manifestMatches = existsSync(MANIFEST_PATH) && readFileSync(MANIFEST_PATH, "utf8") === serialized
  }

  const goldenPresent = existsSync(MANIFEST_PATH)
  const externalEgress = egressAttempts.length + r1.safety.externalEgress
  const signals: ProofExitSignals = {
    manifestMatches,
    dependencyAvailable: goldenPresent,
    internal: r1.verification.internal,
    externalJava17: r1.verification.externalJava17,
    structural: r1.verification.structural,
    xsdContract: r1.verification.xsd,
    deterministic,
    idempotent,
    tamperDetected,
    storeIsolation,
    databaseWrites: r1.safety.databaseWrites,
    sefazCalls: r1.safety.sefazCalls,
    externalEgress,
  }
  const exitCode = classifyProofExit(signals)

  const publicView = toPublicProofView(r1)
  console.log(
    JSON.stringify(
      {
        ok: exitCode === 0,
        exitCode,
        manifest: update ? "atualizado" : manifestMatches ? "byte-igual ao golden" : "DIVERGENTE",
        verification: publicView.verification,
        integrity: { deterministic, idempotent, storeIsolation, tamperDetected },
        egress: { blockedAttempts: egressAttempts.length, external: externalEgress },
        hashes: publicView.hashes,
        safety: publicView.safety,
      },
      null,
      2,
    ),
  )
  process.exit(exitCode)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
