import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { TEST_CERT_PEM, TEST_KEY_PLAIN_PEM } from "./__fixtures__/test-cert"
import { canonicalizeElement, findFirst, parseXml } from "./c14n"
import { loadCertificateMaterialFromPem, signNfceXmlDetailed, verifyNfceSignature } from "./nfce-signer"

const SYNTHETIC_ID = "NFeSINTETICO-C14N-EXTERNAL-PROOF-003"
const NFE_NS = "http://www.portalfiscal.inf.br/nfe"
const PROOF_NS = "urn:omni:fiscal:c14n:synthetic-proof:003"
const SYNTHETIC_XML =
  `<NFe xmlns="${NFE_NS}" xmlns:proof="${PROOF_NS}">` +
  `<infNFe marker="SINTETICO&#x9;SEM-VALOR-FISCAL" versao="4.00" Id="${SYNTHETIC_ID}">` +
  `<ide><cUF>99</cUF><tpAmb>2</tpAmb></ide>` +
  `<!-- comentario excluido pelo C14N sem comentarios -->` +
  `<emit><xNome>FIXTURE SINTETICA SEM VALOR FISCAL</xNome></emit>` +
  `<det nItem="1"><prod><xProd>ITEM A &amp; B&#xD;TESTE</xProd><vProd>0.01</vProd></prod></det>` +
  `<total><vNF>0.01</vNF></total>` +
  `<proof:marker>DADO SINTETICO</proof:marker>` +
  `</infNFe></NFe>`

type ExternalReport = {
  javaRuntime?: string
  provider?: string
  valid: boolean
  coreValid?: boolean
  referenceValid?: boolean
  signatureValueValid?: boolean
  digestMatches?: boolean
  declaredDigestValue?: string
  calculatedDigestValue?: string
  referenceCanonicalSha256?: string
  signedInfoCanonicalSha256?: string
  failureCode?: string | null
}

let tempRoot = ""
let classesDir = ""
let signedXml = ""
let internalDigest = ""
let positiveDir = ""
let positiveReport: ExternalReport
const mutationEvidence: Array<{ name: string; expected: string; actual: string | null }> = []

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(`${command} falhou (${result.status}): ${result.stderr || result.stdout}`)
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`
}

function runExternal(name: string, xml: string): { report: ExternalReport; dir: string } {
  const dir = join(tempRoot, name)
  mkdirSync(dir, { recursive: true })
  const xmlPath = join(dir, "input.xml")
  writeFileSync(xmlPath, xml, "utf8")
  run("java", ["-cp", classesDir, "FiscalXmlDsigVerifier", xmlPath, dir])
  return { report: JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as ExternalReport, dir }
}

function mutateBase64Element(xml: string, element: "DigestValue" | "SignatureValue"): string {
  return xml.replace(new RegExp(`(<${element}>)([A-Za-z0-9+/])`), (_match, open: string, first: string) =>
    `${open}${first === "A" ? "B" : "A"}`,
  )
}

const externalProofSuite = process.env.FISCAL_C14N_EXTERNAL_PROOF === "1" ? describe.sequential : describe.skip

externalProofSuite("prova externa Java JSR 105 — C14N/XMLDSig", () => {
beforeAll(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "fiscal-c14n-external-proof-003-"))
  classesDir = join(tempRoot, "classes")
  mkdirSync(classesDir)
  const javaSource = resolve("tools/fiscal-c14n-proof/src/FiscalXmlDsigVerifier.java")
  run("javac", ["--release", "17", "-d", classesDir, javaSource])

  const signed = signNfceXmlDetailed(
    SYNTHETIC_XML,
    loadCertificateMaterialFromPem(TEST_KEY_PLAIN_PEM, TEST_CERT_PEM),
    "",
    { ignorarValidade: true },
  )
  signedXml = signed.xml
  internalDigest = signed.digestValue
  expect(verifyNfceSignature(signedXml).valido).toBe(true)

  const positive = runExternal("positive", signedXml)
  positiveDir = positive.dir
  positiveReport = positive.report
}, 30_000)

afterAll(() => {
  const evidenceDir = process.env.FISCAL_C14N_EVIDENCE_DIR
  if (evidenceDir && positiveDir && existsSync(positiveDir)) {
    mkdirSync(evidenceDir, { recursive: true })
    for (const file of ["input.xml", "report.json", "hashes.sha256", "reference.c14n", "signed-info.c14n"]) {
      copyFileSync(join(positiveDir, file), join(evidenceDir, file))
    }
    writeFileSync(join(evidenceDir, "mutations.json"), `${JSON.stringify(mutationEvidence, null, 2)}\n`, "utf8")
  }
  const resolvedTemp = resolve(tempRoot)
  if (tempRoot && resolvedTemp.startsWith(resolve(tmpdir()))) rmSync(resolvedTemp, { recursive: true, force: true })
})

  it("valida externamente o XML assinado internamente", () => {
    expect(positiveReport).toMatchObject({
      valid: true,
      coreValid: true,
      referenceValid: true,
      signatureValueValid: true,
      digestMatches: true,
    })
    expect(positiveReport.provider).toMatch(/XMLDSig/i)
    expect(positiveReport.javaRuntime).toMatch(/^17\./)
    const requiredRuntime = process.env.FISCAL_C14N_EXPECT_JAVA_VERSION
    if (requiredRuntime) expect(positiveReport.javaRuntime).toBe(requiredRuntime)
  })

  it("reproduz externamente o DigestValue interno", () => {
    expect(positiveReport.declaredDigestValue).toBe(internalDigest)
    expect(positiveReport.calculatedDigestValue).toBe(internalDigest)
  })

  it("reproduz os mesmos bytes C14N do no referenciado", () => {
    const root = parseXml(signedXml)
    const internalCanonical = canonicalizeElement(findFirst(root, "infNFe")!)
    const externalCanonical = readFileSync(join(positiveDir, "reference.c14n"), "utf8")
    expect(externalCanonical).toBe(internalCanonical)
    expect(positiveReport.referenceCanonicalSha256).toBe(
      createHash("sha256").update(Buffer.from(internalCanonical, "utf8")).digest("hex"),
    )
  })

  it("reproduz os mesmos bytes C14N de SignedInfo e valida SignatureValue", () => {
    const root = parseXml(signedXml)
    const internalCanonical = canonicalizeElement(findFirst(root, "SignedInfo")!)
    const externalCanonical = readFileSync(join(positiveDir, "signed-info.c14n"), "utf8")
    expect(externalCanonical).toBe(internalCanonical)
    expect(positiveReport.signedInfoCanonicalSha256).toBe(
      createHash("sha256").update(Buffer.from(internalCanonical, "utf8")).digest("hex"),
    )
    expect(positiveReport.signatureValueValid).toBe(true)
  })

  it("e deterministico e usa somente material sintetico", () => {
    const second = signNfceXmlDetailed(
      SYNTHETIC_XML,
      loadCertificateMaterialFromPem(TEST_KEY_PLAIN_PEM, TEST_CERT_PEM),
      "",
      { ignorarValidade: true },
    )
    expect(second.xml).toBe(signedXml)
    expect(SYNTHETIC_XML).not.toMatch(/\b\d{11}\b|\b\d{14}\b|\b\d{44}\b/)
    expect(SYNTHETIC_XML).not.toMatch(/<CPF>|<CNPJ>|chave de acesso real/i)
  })

  const infNFe = () => signedXml.match(/<infNFe[\s\S]*?<\/infNFe>/)?.[0] ?? ""
  const cases: Array<{ name: string; expected: string; mutate: () => string }> = [
    { name: "conteudo", expected: "DIGEST_INVALID", mutate: () => signedXml.replace("<vNF>0.01</vNF>", "<vNF>0.02</vNF>") },
    { name: "atributo", expected: "DIGEST_INVALID", mutate: () => signedXml.replace('versao="4.00"', 'versao="4.01"') },
    {
      name: "ordem-semantica",
      expected: "DIGEST_INVALID",
      mutate: () => signedXml.replace("<cUF>99</cUF><tpAmb>2</tpAmb>", "<tpAmb>2</tpAmb><cUF>99</cUF>"),
    },
    { name: "namespace", expected: "DIGEST_INVALID", mutate: () => signedXml.replace(PROOF_NS, `${PROOF_NS}:mutado`) },
    { name: "digest-value", expected: "DIGEST_INVALID", mutate: () => mutateBase64Element(signedXml, "DigestValue") },
    { name: "signature-value", expected: "SIGNATURE_INVALID", mutate: () => mutateBase64Element(signedXml, "SignatureValue") },
    {
      name: "algoritmo",
      expected: "ALGORITHM_REJECTED",
      mutate: () => signedXml.replace(
        "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
        "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
      ),
    },
    { name: "referencia-ausente", expected: "REFERENCE_NOT_FOUND", mutate: () => signedXml.replace(`#${SYNTHETIC_ID}`, "#ID-INEXISTENTE") },
    { name: "referencia-ambigua", expected: "REFERENCE_AMBIGUOUS", mutate: () => signedXml.replace("</NFe>", `${infNFe()}</NFe>`) },
    { name: "referencia-externa", expected: "REFERENCE_URI_REJECTED", mutate: () => signedXml.replace(`#${SYNTHETIC_ID}`, "https://example.invalid/fiscal.xml") },
    {
      name: "xxe-dtd",
      expected: "XML_POLICY_REJECTED",
      mutate: () => `<!DOCTYPE NFe [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${signedXml}`,
    },
  ]

  for (const scenario of cases) {
    it(`rejeita mutacao: ${scenario.name}`, () => {
      const report = runExternal(`negative-${scenario.name}`, scenario.mutate()).report
      mutationEvidence.push({ name: scenario.name, expected: scenario.expected, actual: report.failureCode ?? null })
      expect(report.valid).toBe(false)
      expect(report.failureCode).toBe(scenario.expected)
    })
  }
})
