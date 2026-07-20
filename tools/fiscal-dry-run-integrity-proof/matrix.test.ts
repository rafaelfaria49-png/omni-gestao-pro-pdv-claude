/**
 * Matriz oficial XSD do GOAL-005B: 1 positivo + 8 negativos contra o worker XSD REAL
 * (libxml2/`xmllint`, worker B2 do 005A), separando corretamente as cinco naturezas de resultado —
 * XML_INVALIDO · POLITICA_REJEITADA · TIMEOUT · falha de transporte · falha de segurança — para que
 * transporte/timeout/política JAMAIS sejam confundidos com "XML inválido" (rejeição real de schema).
 *
 * Java-free por construção: roda no container Node-only da FASE DE PROVA (rede Docker `--internal`,
 * `worker.internal:8080`), enquanto `proof.test.ts` (com Java 17 + net-guard) roda no host. O
 * positivo é o XML assinado produzido pelo PRÓPRIO harness; os negativos de schema reutilizam o
 * corpus sintético já provado no 005A (run 29669361609). Sem `FISCAL_XSD_WORKER_URL`, a suíte contra
 * o worker real é pulada; a taxonomia determinística abaixo roda sempre e cobre a separação.
 *
 * Nunca grava banco, nunca chama SEFAZ, nunca usa credencial/dado real.
 */

import { createHash } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"
import { validarXsd, type DryRunXsd } from "@/lib/fiscal/dry-run"
import { createXsdWorkerHttpClient } from "@/lib/fiscal/xsd-worker"
import {
  XSD_CONTRACT_VERSION,
  XSD_MAX_PAYLOAD_BYTES,
  XSD_SCHEMA_PACKAGE,
  type XsdValidationOutcome,
  type XsdValidationRequest,
} from "@/lib/fiscal/xsd"
import { OFFICIAL_XSD_MANIFEST_SHA256 } from "@/lib/fiscal/xsd/official-package"
import {
  VALID_NFCE_XML,
  NFCE_XML_MISSING_REQUIRED,
  NFCE_XML_OUT_OF_ORDER,
  NFCE_XML_INVALID_TYPE,
  NFCE_XML_WRONG_NAMESPACE,
  NFCE_XML_MALFORMED,
  oversizedNfceXml,
} from "@/lib/fiscal/xsd/__fixtures__/nfce-xsd-fixtures"
import { PROOF_CLOCK_ISO, PROOF_SEED, STORE_PROOF_A } from "./fixtures"
import {
  categorizeXsdOutcome,
  createRealWorkerXsdAdapter,
  runFiscalDryRunIntegrityProof,
  type IntegrityProofResult,
  type XsdMatrixCategory,
} from "./proof"
import { withNetGuard, type EgressAttempt } from "./net-guard"

const WORKER_URL = process.env.FISCAL_XSD_WORKER_URL ?? "http://worker.internal:8080"

/** Elemento inesperado (`elemento inesperado`): injeta filho fora do vocabulário no fim de `emit`. */
const NFCE_XML_UNEXPECTED_ELEMENT = VALID_NFCE_XML.replace(
  "<CRT>1</CRT>",
  "<CRT>1</CRT><zzElementoInesperado>1</zzElementoInesperado>",
)

function buildXsdRequest(xml: string, suffix: string): XsdValidationRequest {
  const now = new Date()
  return {
    jobId: `matrix-${suffix}`,
    storeId: STORE_PROOF_A,
    correlationId: `matrix-${suffix}`,
    contractVersion: XSD_CONTRACT_VERSION,
    schemaVersion: XSD_SCHEMA_PACKAGE,
    schemaManifestHash: OFFICIAL_XSD_MANIFEST_SHA256,
    xmlSha256: createHash("sha256").update(xml, "utf8").digest("hex"),
    xmlPayload: xml,
    payloadBytes: Buffer.byteLength(xml, "utf8"),
    maxPayloadBytes: XSD_MAX_PAYLOAD_BYTES,
    attempt: 1,
    requestedAt: now.toISOString(),
    deadline: new Date(now.getTime() + 5_000).toISOString(),
  }
}

/**
 * `fetch` que respeita o AbortSignal e nunca resolve — rejeita com AbortError quando o cliente
 * dispara o timeout. Prova o caminho de TIMEOUT do transporte de forma determinística, sem depender
 * de o worker real demorar (o que seria intrinsecamente instável).
 */
function abortableHangingFetch(): typeof fetch {
  const impl = (_input: unknown, init?: { signal?: AbortSignal | null }) =>
    new Promise((_resolve, reject) => {
      const abort = () =>
        reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }))
      const signal = init?.signal
      if (signal?.aborted) {
        abort()
        return
      }
      signal?.addEventListener("abort", abort, { once: true })
    })
  return impl as unknown as typeof fetch
}

async function runTimeoutNegative(): Promise<XsdValidationOutcome> {
  const client = createXsdWorkerHttpClient({
    baseUrl: WORKER_URL,
    timeoutMs: 80,
    fetchImpl: abortableHangingFetch(),
  })
  const result = await client.validate(buildXsdRequest(VALID_NFCE_XML, "timeout"))
  return result.outcome
}

// --- Taxonomia determinística (offline, sem worker) — separação das 5 categorias. -----------------
describe("FISCAL-DRY-RUN-INTEGRITY-PROOF-005B · taxonomia XSD determinística (offline)", () => {
  const CASES: ReadonlyArray<[XsdValidationOutcome, XsdMatrixCategory]> = [
    ["VALIDACAO_APROVADA", "XSD_APROVADO"],
    ["XML_INVALIDO", "XML_INVALIDO"],
    ["XML_MALFORMADO", "XML_INVALIDO"],
    ["POLITICA_REJEITADA", "POLITICA_REJEITADA"],
    ["TIMEOUT", "TIMEOUT"],
    ["FALHA_TRANSITORIA", "FALHA_TRANSPORTE"],
    ["FALHA_PERMANENTE", "FALHA_TRANSPORTE"],
    ["WORKER_INDISPONIVEL", "FALHA_TRANSPORTE"],
    ["RESPOSTA_INCERTA", "FALHA_TRANSPORTE"],
    ["HASH_DIVERGENTE", "FALHA_TRANSPORTE"],
    ["VERSAO_NAO_PERMITIDA", "FALHA_TRANSPORTE"],
    ["PACOTE_XSD_AUSENTE", "FALHA_TRANSPORTE"],
  ]

  it.each(CASES)("outcome %s → categoria %s", (outcome, category) => {
    expect(categorizeXsdOutcome(outcome)).toBe(category)
  })

  it("transporte/timeout/política nunca são confundidos com XML inválido nem aprovação", () => {
    const naoSchema: XsdValidationOutcome[] = [
      "TIMEOUT",
      "FALHA_TRANSITORIA",
      "FALHA_PERMANENTE",
      "WORKER_INDISPONIVEL",
      "RESPOSTA_INCERTA",
      "HASH_DIVERGENTE",
      "VERSAO_NAO_PERMITIDA",
      "PACOTE_XSD_AUSENTE",
      "POLITICA_REJEITADA",
    ]
    for (const outcome of naoSchema) {
      expect(categorizeXsdOutcome(outcome)).not.toBe("XML_INVALIDO")
      expect(categorizeXsdOutcome(outcome)).not.toBe("XSD_APROVADO")
    }
    // Só um veredito real de schema/parser é XML_INVALIDO.
    expect(categorizeXsdOutcome("XML_INVALIDO")).toBe("XML_INVALIDO")
    expect(categorizeXsdOutcome("XML_MALFORMADO")).toBe("XML_INVALIDO")
  })

  it("negativo timeout: cliente com deadline curto classifica TIMEOUT (não schema)", async () => {
    const outcome = await runTimeoutNegative()
    expect(outcome).toBe("TIMEOUT")
    expect(categorizeXsdOutcome(outcome)).toBe("TIMEOUT")
  })
})

// --- Matriz 1 positivo + 8 negativos contra o worker XSD REAL (só com FISCAL_XSD_WORKER_URL). ------
const SCHEMA_NEGATIVES: ReadonlyArray<{ id: string; xml: string }> = [
  { id: "campo_obrigatorio_ausente", xml: NFCE_XML_MISSING_REQUIRED },
  { id: "elemento_inesperado", xml: NFCE_XML_UNEXPECTED_ELEMENT },
  { id: "ordem_invalida", xml: NFCE_XML_OUT_OF_ORDER },
  { id: "tipo_invalido", xml: NFCE_XML_INVALID_TYPE },
  { id: "namespace_incorreto", xml: NFCE_XML_WRONG_NAMESPACE },
  { id: "xml_malformado", xml: NFCE_XML_MALFORMED },
]

type MatrixResults = {
  positive: IntegrityProofResult
  negatives: Record<string, { outcome: XsdValidationOutcome; status?: DryRunXsd["status"] }>
}

async function runFullMatrix(): Promise<MatrixResults> {
  const adapter = createRealWorkerXsdAdapter()
  // Positivo: o XML assinado produzido pelo PRÓPRIO harness, aprovado no XSD oficial real.
  const positive = await runFiscalDryRunIntegrityProof({
    clockIso: PROOF_CLOCK_ISO,
    seed: PROOF_SEED,
    storeId: STORE_PROOF_A,
    xsdAdapter: adapter,
    runExternalJava: false,
    databaseWriteProbe: { writes: 0 },
    externalEgressProbe: { calls: 0 },
    sefazProbe: { calls: 0 },
  })
  const negatives: MatrixResults["negatives"] = {}
  for (const neg of SCHEMA_NEGATIVES) {
    const xsd = await validarXsd(neg.xml, {
      storeId: STORE_PROOF_A,
      correlationId: `matrix-${neg.id}`,
      jobId: `matrix-${neg.id}`,
    })
    negatives[neg.id] = { outcome: xsd.outcome, status: xsd.status }
  }
  const oversized = await validarXsd(oversizedNfceXml(), {
    storeId: STORE_PROOF_A,
    correlationId: "matrix-payload",
    jobId: "matrix-payload",
  })
  negatives.payload_acima_do_limite = { outcome: oversized.outcome, status: oversized.status }
  negatives.timeout = { outcome: await runTimeoutNegative() }
  return { positive, negatives }
}

const realXsdSuite = process.env.FISCAL_XSD_WORKER_URL ? describe : describe.skip

realXsdSuite("FISCAL-DRY-RUN-INTEGRITY-PROOF-005B · matriz 1+8 contra o worker XSD real", () => {
  let matrix: MatrixResults
  let egressAttempts: EgressAttempt[]

  beforeAll(async () => {
    // A matriz inteira roda sob o net-guard: worker.internal é permitido (loopback/`.internal`);
    // qualquer alcance externo seria barrado e contado. Complementa a rede Docker `--internal`.
    const guarded = await withNetGuard(() => runFullMatrix())
    matrix = guarded.result
    egressAttempts = guarded.attempts
    console.log(
      JSON.stringify({
        event: "matrix_005b",
        positive: {
          xsd: matrix.positive.verification.xsd,
          status: matrix.positive.xsdStatus,
          workerReal: matrix.positive.xsdEvidence.workerReal,
        },
        negatives: Object.fromEntries(
          Object.entries(matrix.negatives).map(([id, r]) => [
            id,
            { outcome: r.outcome, category: categorizeXsdOutcome(r.outcome) },
          ]),
        ),
        egressExternal: egressAttempts.length,
      }),
    )
  }, 180_000)

  it("positivo — XML assinado do harness aprovado no XSD oficial real", () => {
    expect(matrix.positive.verification.xsd).toBe(true)
    expect(matrix.positive.xsdStatus).toBe("xsd_ok")
    expect(matrix.positive.xsdEvidence.kind).toBe("xmllint-worker")
    expect(matrix.positive.xsdEvidence.workerReal).toBe(true)
    expect(matrix.positive.xsdEvidence.realValidationPassed).toBe(true)
    expect(categorizeXsdOutcome("VALIDACAO_APROVADA")).toBe("XSD_APROVADO")
  })

  it.each(SCHEMA_NEGATIVES.map((n) => n.id))(
    "negativo %s — rejeitado como XML_INVALIDO pelo schema real",
    (id) => {
      const result = matrix.negatives[id]
      expect(result.status).toBe("xsd_invalido")
      expect(categorizeXsdOutcome(result.outcome)).toBe("XML_INVALIDO")
    },
  )

  it("negativo payload_acima_do_limite — política/transporte, nunca veredito de schema", () => {
    const result = matrix.negatives.payload_acima_do_limite
    const category = categorizeXsdOutcome(result.outcome)
    // Via transporte HTTP o preflight do worker responde 422 → FALHA_PERMANENTE; in-process o
    // validador responde POLITICA_REJEITADA. Ambos são política/transporte — nunca XML inválido.
    expect(["POLITICA_REJEITADA", "FALHA_TRANSPORTE"]).toContain(category)
    expect(category).not.toBe("XML_INVALIDO")
    expect(category).not.toBe("XSD_APROVADO")
  })

  it("negativo timeout — classificado como TIMEOUT (transporte), nunca schema", () => {
    const result = matrix.negatives.timeout
    expect(result.outcome).toBe("TIMEOUT")
    expect(categorizeXsdOutcome(result.outcome)).toBe("TIMEOUT")
  })

  it("os 8 negativos e o positivo cobrem a matriz sem confundir categorias", () => {
    expect(Object.keys(matrix.negatives)).toHaveLength(8)
    // Nenhum negativo aprovou; o positivo aprovou.
    for (const [id, result] of Object.entries(matrix.negatives)) {
      expect(categorizeXsdOutcome(result.outcome), `negativo ${id} não pode aprovar`).not.toBe(
        "XSD_APROVADO",
      )
    }
    expect(matrix.positive.verification.xsd).toBe(true)
  })

  it("a matriz inteira não gera egress externo (rede --internal + net-guard)", () => {
    expect(egressAttempts).toHaveLength(0)
    expect(matrix.positive.safety.externalEgress).toBe(0)
    expect(matrix.positive.safety.databaseWrites).toBe(0)
    expect(matrix.positive.safety.sefazCalls).toBe(0)
  })
})
