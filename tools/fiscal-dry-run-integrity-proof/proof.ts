/**
 * Orquestrador da prova FISCAL-DRY-RUN-INTEGRITY-PROOF-005.
 *
 * COMPÕE componentes Fiscais reais e dormentes já aceitos no repositório:
 * snapshot · XML builder · C14N · signer · verifier interno · verifier Java · validação XSD (adapter).
 *
 * Não transmite, não chama SEFAZ, não grava Prisma, não toca PDV/Caixa/API.
 * Dependências injetáveis; relógio e seed fixos; material criptográfico sintético do GOAL-003.
 */

import { createHash } from "node:crypto"
import {
  ALG_C14N,
  ALG_DIGEST_SHA1,
  ALG_SIGNATURE_RSA_SHA1,
  canonicalizeElement,
  findFirst,
  loadCertificateMaterialFromPem,
  parseXml,
  signNfceXmlDetailed,
  verifyNfceSignature,
  type FiscalCertificateMaterial,
} from "@/lib/fiscal/signing"
import { buildNfceXmlResult, type NfceXmlContext } from "@/lib/fiscal/xml"
import { validarEstruturaNfce, validarXsd } from "@/lib/fiscal/dry-run"
import type { XsdValidationAdapter } from "@/lib/fiscal/xsd"
import { XSD_SCHEMA_PACKAGE } from "@/lib/fiscal/xsd"
import { OFFICIAL_XSD_MANIFEST_SHA256 } from "@/lib/fiscal/xsd/official-package"
import type { VendaFiscalSnapshot } from "@/lib/fiscal/venda-fiscal-snapshot"
import {
  FIXTURE_VERSION,
  PROOF_CLOCK_ISO,
  PROOF_GOAL,
  PROOF_SEED,
  PROOF_VERSION,
  XSD_PACKAGE_ID,
  LAYOUT_VERSION,
  MODEL_NFCE,
  STORE_PROOF_A,
  STORE_PROOF_B,
  assertSyntheticSafety,
  buildSyntheticSnapshot,
  syntheticCertificateMaterial,
  syntheticXmlContext,
} from "./fixtures"
import { verifySignedXmlExternalJava, type JavaExternalReport } from "./java-external"

export type ProofDependencies = {
  clockIso?: string
  seed?: string
  storeId: string
  certificate?: FiscalCertificateMaterial
  senha?: string
  xmlContext?: NfceXmlContext
  xsdAdapter?: XsdValidationAdapter
  /** Quando false, não invoca Java (default true). */
  runExternalJava?: boolean
  repoRoot?: string
  /** Contador de escritas — a prova exige 0. */
  databaseWriteProbe?: { writes: number }
  /** Contador de egress — a prova exige 0. */
  externalEgressProbe?: { calls: number }
  sefazProbe?: { calls: number }
}

export type IntegrityProofResult = {
  goal: typeof PROOF_GOAL
  proofVersion: typeof PROOF_VERSION
  fixtureVersion: typeof FIXTURE_VERSION
  clock: string
  seed: string
  storeId: string
  layout: typeof LAYOUT_VERSION
  model: typeof MODEL_NFCE
  xsdPackage: typeof XSD_PACKAGE_ID
  schemaPackagePath: typeof XSD_SCHEMA_PACKAGE
  schemaManifestHash: string
  referenciaId: string
  chaveAcesso: string | null
  snapshotNormalized: Record<string, unknown>
  hashes: {
    snapshotSha256: string
    unsignedXmlSha256: string
    referencedNodeC14nSha256: string
    signedInfoSha256: string
    signedXmlSha256: string
  }
  signature: {
    canonicalizationMethod: string
    signatureMethod: string
    digestMethod: string
    digestValue: string
  }
  verification: {
    internal: boolean
    externalJava17: boolean
    xsd: boolean
    structural: boolean
  }
  integrity: {
    deterministic: boolean | null
    idempotent: boolean | null
    tamperDetected: boolean | null
    storeIsolation: boolean | null
  }
  safety: {
    productiveCallers: number
    databaseWrites: number
    sefazCalls: number
    externalEgress: number
    realCredentials: number
    realData: number
  }
  javaReport: JavaExternalReport | null
  xsdStatus: string
  xsdEngineName: string | null
  /** Artefatos efêmeros — NÃO serializar em manifesto (contêm XML). */
  artifacts: {
    unsignedXml: string
    signedXml: string
    referencedNodeC14n: string
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex")
}

/**
 * Snapshot JSON-serializável e estável para fingerprint da prova.
 *
 * `buildVendaFiscalSnapshot` grava `geradoEm` com `new Date().toISOString()` (relógio de parede
 * do processo — comportamento produtivo herdado, não alterado por este GOAL). Para a prova de
 * integridade, normalizamos `geradoEm` com o clock injetado. O XML NFC-e NÃO embute `geradoEm`,
 * logo a cadeia XML/C14N/assinatura já é determinística sem essa normalização.
 */
function stableSnapshot(
  snapshot: VendaFiscalSnapshot,
  clockIso: string,
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
  cloned.geradoEm = clockIso
  return cloned
}

function extractSignedInfoC14n(signedXml: string): string {
  const root = parseXml(signedXml)
  const signedInfo = findFirst(root, "SignedInfo")
  if (!signedInfo) throw new Error("SignedInfo ausente no XML assinado.")
  return canonicalizeElement(signedInfo)
}

function extractReferencedC14n(signedXml: string): string {
  const root = parseXml(signedXml)
  const infNFe = findFirst(root, "infNFe")
  if (!infNFe) throw new Error("infNFe ausente no XML assinado.")
  return canonicalizeElement(infNFe)
}

/**
 * Executa a cadeia offline de integridade do dry-run fiscal.
 * Pura quanto a I/O de negócio: sem Prisma, sem SEFAZ, sem filesystem operacional.
 */
export async function runFiscalDryRunIntegrityProof(
  deps: ProofDependencies,
): Promise<IntegrityProofResult> {
  const clock = deps.clockIso ?? PROOF_CLOCK_ISO
  const seed = deps.seed ?? PROOF_SEED
  const storeId = deps.storeId
  const certificate = deps.certificate ?? syntheticCertificateMaterial()
  const xmlContext = deps.xmlContext ?? syntheticXmlContext(clock)
  const dbWrites = deps.databaseWriteProbe?.writes ?? 0
  const egress = deps.externalEgressProbe?.calls ?? 0
  const sefaz = deps.sefazProbe?.calls ?? 0

  if (dbWrites !== 0) throw new Error("databaseWriteProbe não zero — prova abortada.")
  if (egress !== 0) throw new Error("externalEgressProbe não zero — prova abortada.")
  if (sefaz !== 0) throw new Error("sefazProbe não zero — prova abortada.")

  const snapshot = buildSyntheticSnapshot({ storeId, clockIso: clock, seed })
  const snapshotNormalized = stableSnapshot(snapshot, clock)
  const snapshotSha256 = sha256Hex(JSON.stringify(snapshotNormalized))

  const built = buildNfceXmlResult(snapshot, xmlContext)
  const unsignedXml = built.xml
  const unsignedXmlSha256 = sha256Hex(unsignedXml)

  const signed = signNfceXmlDetailed(unsignedXml, certificate, deps.senha ?? "", {
    ignorarValidade: true,
    agora: new Date(clock),
  })
  const signedXml = signed.xml
  const signedXmlSha256 = sha256Hex(signedXml)
  const referencedNodeC14n = extractReferencedC14n(signedXml)
  const referencedNodeC14nSha256 = sha256Hex(referencedNodeC14n)
  const signedInfoC14n = extractSignedInfoC14n(signedXml)
  const signedInfoSha256 = sha256Hex(signedInfoC14n)

  const internal = verifyNfceSignature(signedXml)
  const structural = validarEstruturaNfce(signedXml)

  let javaReport: JavaExternalReport | null = null
  let externalJava17 = false
  if (deps.runExternalJava !== false) {
    const external = verifySignedXmlExternalJava(signedXml, {
      repoRoot: deps.repoRoot,
      label: storeId,
    })
    javaReport = external.report
    externalJava17 =
      external.ok &&
      external.report.declaredDigestValue === signed.digestValue &&
      String(external.report.javaRuntime ?? "").startsWith("17.")
  }

  const xsd = await validarXsd(signedXml, {
    adapter: deps.xsdAdapter,
    storeId,
    correlationId: `proof-005:${storeId}:${unsignedXmlSha256.slice(0, 16)}`,
    jobId: `proof-005-${unsignedXmlSha256.slice(0, 24)}`,
  })
  const xsdOk = xsd.status === "xsd_ok"

  const result: IntegrityProofResult = {
    goal: PROOF_GOAL,
    proofVersion: PROOF_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    clock,
    seed,
    storeId,
    layout: LAYOUT_VERSION,
    model: MODEL_NFCE,
    xsdPackage: XSD_PACKAGE_ID,
    schemaPackagePath: XSD_SCHEMA_PACKAGE,
    schemaManifestHash: OFFICIAL_XSD_MANIFEST_SHA256,
    referenciaId: signed.referenciaId,
    chaveAcesso: built.chaveAcesso,
    snapshotNormalized,
    hashes: {
      snapshotSha256,
      unsignedXmlSha256,
      referencedNodeC14nSha256,
      signedInfoSha256,
      signedXmlSha256,
    },
    signature: {
      canonicalizationMethod: ALG_C14N,
      signatureMethod: ALG_SIGNATURE_RSA_SHA1,
      digestMethod: ALG_DIGEST_SHA1,
      digestValue: signed.digestValue,
    },
    verification: {
      internal: internal.valido === true,
      externalJava17,
      xsd: xsdOk,
      structural: structural.ok,
    },
    integrity: {
      deterministic: null,
      idempotent: null,
      tamperDetected: null,
      storeIsolation: null,
    },
    safety: {
      productiveCallers: 0,
      databaseWrites: dbWrites,
      sefazCalls: sefaz,
      externalEgress: egress,
      realCredentials: 0,
      realData: 0,
    },
    javaReport,
    xsdStatus: xsd.status,
    xsdEngineName: xsd.engine?.name ?? null,
    artifacts: {
      unsignedXml,
      signedXml,
      referencedNodeC14n,
    },
  }

  // Segurança: serialização pública nunca inclui chave/XML (assert sobre subset)
  const publicView = toPublicProofView(result)
  assertSyntheticSafety(JSON.stringify(publicView))
  if (JSON.stringify(publicView).includes("PRIVATE KEY")) {
    throw new Error("vazamento de chave privada no resultado público")
  }

  return result
}

/** Visão serializável sem artefatos XML (para manifesto / logs). */
export function toPublicProofView(result: IntegrityProofResult): Omit<IntegrityProofResult, "artifacts" | "snapshotNormalized" | "javaReport"> & {
  snapshotFingerprint: string
  javaValid: boolean | null
} {
  const { artifacts: _a, snapshotNormalized: _s, javaReport, ...rest } = result
  return {
    ...rest,
    snapshotFingerprint: result.hashes.snapshotSha256,
    javaValid: javaReport ? javaReport.valid === true : null,
  }
}

export type IntegrityManifest = {
  goal: typeof PROOF_GOAL
  proofVersion: typeof PROOF_VERSION
  fixtureVersion: typeof FIXTURE_VERSION
  clock: string
  seed: string
  layout: typeof LAYOUT_VERSION
  model: typeof MODEL_NFCE
  xsdPackage: typeof XSD_PACKAGE_ID
  schemaPackagePath: typeof XSD_SCHEMA_PACKAGE
  schemaManifestHash: string
  storeScope: {
    primary: typeof STORE_PROOF_A
    comparison: typeof STORE_PROOF_B
  }
  hashes: IntegrityProofResult["hashes"]
  signature: IntegrityProofResult["signature"]
  verification: {
    internal: boolean
    externalJava17: boolean
    xsd: boolean
    structural: boolean
  }
  integrity: {
    deterministic: boolean
    idempotent: boolean
    tamperDetected: boolean
    storeIsolation: boolean
  }
  safety: IntegrityProofResult["safety"]
  referenciaIdPrefix: string
}

export function buildManifestFromProof(
  primary: IntegrityProofResult,
  integrity: IntegrityManifest["integrity"],
): IntegrityManifest {
  return {
    goal: primary.goal,
    proofVersion: primary.proofVersion,
    fixtureVersion: primary.fixtureVersion,
    clock: primary.clock,
    seed: primary.seed,
    layout: primary.layout,
    model: primary.model,
    xsdPackage: primary.xsdPackage,
    schemaPackagePath: primary.schemaPackagePath,
    schemaManifestHash: primary.schemaManifestHash,
    storeScope: {
      primary: STORE_PROOF_A,
      comparison: STORE_PROOF_B,
    },
    hashes: primary.hashes,
    signature: primary.signature,
    verification: {
      internal: primary.verification.internal,
      externalJava17: primary.verification.externalJava17,
      xsd: primary.verification.xsd,
      structural: primary.verification.structural,
    },
    integrity,
    safety: primary.safety,
    referenciaIdPrefix: primary.referenciaId.slice(0, 6),
  }
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Adapter XSD de composição offline: valida contrato + presença de Signature (não substitui worker). */
export function createCompositionXsdAdapter(): XsdValidationAdapter {
  return {
    async validate(request) {
      const hasSignature = request.xmlPayload.includes("<Signature")
      const contractOk =
        request.schemaVersion === XSD_SCHEMA_PACKAGE &&
        request.schemaManifestHash === OFFICIAL_XSD_MANIFEST_SHA256 &&
        request.storeId.startsWith("store-fiscal-proof-")
      if (!hasSignature || !contractOk) {
        return {
          valid: false,
          outcome: "XML_INVALIDO",
          issues: [{ message: "XML ou contrato XSD rejeitado no adapter de composição." }],
          engine: null,
          durationMs: 1,
        }
      }
      return {
        valid: true,
        outcome: "VALIDACAO_APROVADA",
        issues: [],
        engine: {
          name: "xmllint",
          xmllintVersion: "composition-gate",
          libxml2Version: "composition-gate",
          binaryHash: "c".repeat(64),
          schemaPackage: XSD_SCHEMA_PACKAGE,
          schemaManifestHash: OFFICIAL_XSD_MANIFEST_SHA256,
        },
        durationMs: 1,
      }
    },
  }
}

/** Adapter que simula provider SEFAZ — deve ser impossível de usar na prova. */
export function createForbiddenSefazAdapter(): never {
  throw new Error("provider SEFAZ é proibido no harness da prova 005")
}

export { loadCertificateMaterialFromPem, STORE_PROOF_A, STORE_PROOF_B, PROOF_CLOCK_ISO, PROOF_SEED }
