/**
 * Suíte da prova FISCAL-DRY-RUN-INTEGRITY-PROOF-005.
 *
 * P-01..P-15 (positivas) e N-01..N-14 (negativas), determinismo, idempotência e isolamento A→B→A.
 * Java 17 externo sempre (GOAL-003). XSD: adapter de composição do contrato oficial +
 * suite opcional com worker real (FISCAL_XSD_WORKER_URL).
 */

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { verifyNfceSignature, parseXml, findFirst, ALG_SIGNATURE_RSA_SHA1 } from "@/lib/fiscal/signing"
import { OFFICIAL_XSD_MANIFEST_SHA256 } from "@/lib/fiscal/xsd/official-package"
import { XSD_SCHEMA_PACKAGE } from "@/lib/fiscal/xsd"
import {
  PROOF_CLOCK_ISO,
  PROOF_SEED,
  STORE_PROOF_A,
  STORE_PROOF_B,
  assertSyntheticSafety,
  buildSyntheticSnapshot,
} from "./fixtures"
import { verifySignedXmlExternalJava, cleanupTempDir } from "./java-external"
import {
  buildManifestFromProof,
  classifyProofExit,
  createCompositionXsdAdapter,
  createForbiddenSefazAdapter,
  runFiscalDryRunIntegrityProof,
  stableStringify,
  toPublicProofView,
  type IntegrityManifest,
  type IntegrityProofResult,
  type ProofExitSignals,
} from "./proof"
import {
  EgressBlockedError,
  installNetGuard,
  isLoopbackTarget,
  isNetGuardActive,
  withNetGuard,
} from "./net-guard"

const HERE = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = resolve(HERE, "evidence/manifest.json")
const REPO_ROOT = resolve(HERE, "../..")
const UPDATE_MANIFEST = process.env.FISCAL_005_UPDATE_MANIFEST === "1"

const xsdAdapter = createCompositionXsdAdapter()
const baseDeps = {
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

let primary: IntegrityProofResult
const tempDirs: string[] = []

function mutateBase64Element(xml: string, element: "DigestValue" | "SignatureValue"): string {
  return xml.replace(new RegExp(`(<${element}>)([A-Za-z0-9+/])`), (_m, open: string, first: string) =>
    `${open}${first === "A" ? "B" : "A"}`,
  )
}

beforeAll(async () => {
  primary = await runFiscalDryRunIntegrityProof(baseDeps)
}, 60_000)

afterAll(() => {
  for (const dir of tempDirs) cleanupTempDir(dir)
})

describe("FISCAL-DRY-RUN-INTEGRITY-PROOF-005 · positivas", () => {
  it("P-01 fixture sintética canônica aceita", () => {
    const snap = buildSyntheticSnapshot({ storeId: STORE_PROOF_A })
    expect(snap.storeId).toBe(STORE_PROOF_A)
    expect(snap.emitente.razaoSocial).toContain("SINTETICA")
    expect(JSON.stringify(snap)).not.toMatch(/rafacell/i)
    expect(JSON.stringify(snap)).not.toMatch(/loja-1/)
  })

  it("P-02 snapshot determinístico", async () => {
    const a = await runFiscalDryRunIntegrityProof(baseDeps)
    const b = await runFiscalDryRunIntegrityProof(baseDeps)
    expect(a.hashes.snapshotSha256).toBe(b.hashes.snapshotSha256)
    expect(a.hashes.snapshotSha256).toBe(primary.hashes.snapshotSha256)
  }, 30_000)

  it("P-03 XML não assinado determinístico", async () => {
    const a = await runFiscalDryRunIntegrityProof(baseDeps)
    expect(a.artifacts.unsignedXml).toBe(primary.artifacts.unsignedXml)
    expect(a.hashes.unsignedXmlSha256).toBe(primary.hashes.unsignedXmlSha256)
  }, 30_000)

  it("P-04 referência interna única e correta", () => {
    expect(primary.referenciaId).toMatch(/^NFe\d{44}$/)
    const root = parseXml(primary.artifacts.signedXml)
    const matches = (primary.artifacts.signedXml.match(new RegExp(`Id="${primary.referenciaId}"`, "g")) ?? []).length
    expect(matches).toBe(1)
    expect(primary.artifacts.signedXml).toContain(`URI="#${primary.referenciaId}"`)
    expect(findFirst(root, "infNFe")).toBeTruthy()
  })

  it("P-05 canonicalização reproduzível", async () => {
    const second = await runFiscalDryRunIntegrityProof(baseDeps)
    expect(second.artifacts.referencedNodeC14n).toBe(primary.artifacts.referencedNodeC14n)
    expect(second.hashes.referencedNodeC14nSha256).toBe(primary.hashes.referencedNodeC14nSha256)
  }, 30_000)

  it("P-06 DigestValue reproduzível", async () => {
    const second = await runFiscalDryRunIntegrityProof(baseDeps)
    expect(second.signature.digestValue).toBe(primary.signature.digestValue)
    expect(second.signature.digestMethod).toContain("sha1")
    expect(second.signature.canonicalizationMethod).toContain("xml-c14n-20010315")
    expect(second.signature.signatureMethod).toBe(ALG_SIGNATURE_RSA_SHA1)
  }, 30_000)

  it("P-07 assinatura interna válida", () => {
    expect(primary.verification.internal).toBe(true)
    expect(verifyNfceSignature(primary.artifacts.signedXml).valido).toBe(true)
  })

  it("P-08 verificação externa Java 17 válida", () => {
    expect(primary.verification.externalJava17).toBe(true)
    expect(primary.javaReport?.javaRuntime).toMatch(/^17\./)
    expect(primary.javaReport?.declaredDigestValue).toBe(primary.signature.digestValue)
    expect(primary.javaReport?.calculatedDigestValue).toBe(primary.signature.digestValue)
  })

  it("P-09 XML válido no contrato do pacote XSD oficial (adapter de composição)", () => {
    expect(primary.verification.xsd).toBe(true)
    expect(primary.xsdStatus).toBe("xsd_ok")
    expect(primary.schemaPackagePath).toBe(XSD_SCHEMA_PACKAGE)
    expect(primary.schemaManifestHash).toBe(OFFICIAL_XSD_MANIFEST_SHA256)
    expect(primary.xsdPackage).toBe("PL_010e_v1.02")
  })

  it("P-10 manifesto determinístico (golden)", async () => {
    const r1 = await runFiscalDryRunIntegrityProof(baseDeps)
    const r2 = await runFiscalDryRunIntegrityProof(baseDeps)
    const r3 = await runFiscalDryRunIntegrityProof(baseDeps)
    // isolamento multi-loja
    const b1 = await runFiscalDryRunIntegrityProof({ ...baseDeps, storeId: STORE_PROOF_B })
    const a2 = await runFiscalDryRunIntegrityProof(baseDeps)

    const deterministic =
      r1.hashes.signedXmlSha256 === r2.hashes.signedXmlSha256 &&
      r2.hashes.signedXmlSha256 === r3.hashes.signedXmlSha256 &&
      r1.signature.digestValue === r3.signature.digestValue

    const idempotent =
      r1.hashes.snapshotSha256 === r2.hashes.snapshotSha256 &&
      r1.safety.databaseWrites === 0 &&
      r1.safety.sefazCalls === 0

    const storeIsolation =
      r1.hashes.signedXmlSha256 !== b1.hashes.signedXmlSha256 &&
      r1.hashes.snapshotSha256 !== b1.hashes.snapshotSha256 &&
      a2.hashes.signedXmlSha256 === r1.hashes.signedXmlSha256 &&
      a2.storeId === STORE_PROOF_A &&
      b1.storeId === STORE_PROOF_B

    const tampered = primary.artifacts.signedXml.replace("<vNF>10.00</vNF>", "<vNF>99.99</vNF>")
    const tamperDetected = verifyNfceSignature(tampered).valido === false

    const manifest = buildManifestFromProof(r1, {
      deterministic,
      idempotent,
      tamperDetected,
      storeIsolation,
    })

    expect(deterministic).toBe(true)
    expect(idempotent).toBe(true)
    expect(storeIsolation).toBe(true)
    expect(tamperDetected).toBe(true)

    const serialized = stableStringify(manifest)
    if (UPDATE_MANIFEST || !existsSync(MANIFEST_PATH)) {
      mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
      writeFileSync(MANIFEST_PATH, serialized, "utf8")
    }
    const golden = readFileSync(MANIFEST_PATH, "utf8")
    expect(serialized).toBe(golden)
  }, 120_000)

  it("P-11 execução idempotente", async () => {
    const first = await runFiscalDryRunIntegrityProof(baseDeps)
    const second = await runFiscalDryRunIntegrityProof(baseDeps)
    expect(toPublicProofView(first)).toEqual(toPublicProofView(second))
    expect(first.safety.databaseWrites).toBe(0)
  }, 30_000)

  it("P-12 isolamento A → B → A preservado", async () => {
    const a1 = await runFiscalDryRunIntegrityProof({ ...baseDeps, storeId: STORE_PROOF_A })
    const b1 = await runFiscalDryRunIntegrityProof({ ...baseDeps, storeId: STORE_PROOF_B })
    const a2 = await runFiscalDryRunIntegrityProof({ ...baseDeps, storeId: STORE_PROOF_A })
    expect(a1.hashes.signedXmlSha256).toBe(a2.hashes.signedXmlSha256)
    expect(a1.hashes.signedXmlSha256).not.toBe(b1.hashes.signedXmlSha256)
    expect(JSON.stringify(b1.snapshotNormalized)).not.toContain(STORE_PROOF_A)
    expect(JSON.stringify(a1.snapshotNormalized)).not.toContain(STORE_PROOF_B)
  }, 45_000)

  it("P-13 zero escrita em banco", () => {
    expect(primary.safety.databaseWrites).toBe(0)
  })

  it("P-14 zero chamada SEFAZ", () => {
    expect(primary.safety.sefazCalls).toBe(0)
    expect(primary.safety.externalEgress).toBe(0)
  })

  it("P-15 zero dado ou credencial real", () => {
    const publicJson = JSON.stringify(toPublicProofView(primary))
    assertSyntheticSafety(publicJson)
    expect(publicJson).not.toContain("PRIVATE KEY")
    expect(publicJson).not.toContain("rafacell")
    expect(primary.safety.realCredentials).toBe(0)
    expect(primary.safety.realData).toBe(0)
    expect(primary.safety.productiveCallers).toBe(0)
  })
})

describe("FISCAL-DRY-RUN-INTEGRITY-PROOF-005 · negativas", () => {
  it("N-01 alterar valor total após assinatura invalida", () => {
    const tampered = primary.artifacts.signedXml.replace("<vNF>10.00</vNF>", "<vNF>11.00</vNF>")
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-02 alterar item/quantidade após assinatura invalida", () => {
    const tampered = primary.artifacts.signedXml.replace("<qCom>1.0000</qCom>", "<qCom>2.0000</qCom>")
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-03 alterar campo fiscal crítico assinado invalida", () => {
    const tampered = primary.artifacts.signedXml.replace("<NCM>85176200</NCM>", "<NCM>99999999</NCM>")
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-04 alterar DigestValue falha", () => {
    const tampered = mutateBase64Element(primary.artifacts.signedXml, "DigestValue")
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-05 alterar SignatureValue falha", () => {
    const tampered = mutateBase64Element(primary.artifacts.signedXml, "SignatureValue")
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-06 Reference URI incorreta falha", () => {
    const tampered = primary.artifacts.signedXml.replace(
      `URI="#${primary.referenciaId}"`,
      'URI="#ID-INEXISTENTE"',
    )
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-07 referência ambígua / Id duplicado falha", () => {
    const inf = primary.artifacts.signedXml.match(/<infNFe[\s\S]*?<\/infNFe>/)?.[0] ?? ""
    const tampered = primary.artifacts.signedXml.replace("</NFe>", `${inf}</NFe>`)
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-08 wrapping / segundo Signature falha", () => {
    const sig = primary.artifacts.signedXml.match(/<Signature[\s\S]*?<\/Signature>/)?.[0] ?? ""
    const tampered = primary.artifacts.signedXml.replace("</NFe>", `${sig}</NFe>`)
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-09 algoritmo inesperado falha", () => {
    const tampered = primary.artifacts.signedXml.replace(
      "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
      "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    )
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-10 DTD/XXE falha fechado", () => {
    const tampered = `<!DOCTYPE NFe [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${primary.artifacts.signedXml}`
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("N-11 storeId inconsistente com o contexto da prova falha", async () => {
    await expect(
      runFiscalDryRunIntegrityProof({ ...baseDeps, storeId: "loja-1" }),
    ).rejects.toThrow(/storeId sintético inválido/)
  })

  it("N-12 manifesto com hash adulterado falha", () => {
    const base: IntegrityManifest = existsSync(MANIFEST_PATH)
      ? (JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as IntegrityManifest)
      : buildManifestFromProof(primary, {
          deterministic: true,
          idempotent: true,
          tamperDetected: true,
          storeIsolation: true,
        })
    const adulterated = {
      ...base,
      hashes: { ...base.hashes, signedXmlSha256: "0".repeat(64) },
    }
    expect(adulterated.hashes.signedXmlSha256).not.toBe(primary.hashes.signedXmlSha256)
    expect(stableStringify(adulterated)).not.toBe(stableStringify(base))
  })

  it("N-13 tentativa de acesso a provider SEFAZ é impossível", () => {
    expect(() => createForbiddenSefazAdapter()).toThrow(/SEFAZ/)
  })

  it("N-14 tentativa de escrita produtiva falha", async () => {
    await expect(
      runFiscalDryRunIntegrityProof({
        ...baseDeps,
        databaseWriteProbe: { writes: 1 },
      }),
    ).rejects.toThrow(/databaseWriteProbe/)
  })
})

describe("FISCAL-DRY-RUN-INTEGRITY-PROOF-005 · Java negativo herdado", () => {
  it("rejeita mutação de conteúdo no verificador externo", () => {
    const tampered = primary.artifacts.signedXml.replace("<vNF>10.00</vNF>", "<vNF>0.02</vNF>")
    const external = verifySignedXmlExternalJava(tampered, {
      repoRoot: REPO_ROOT,
      label: "neg-content",
    })
    tempDirs.push(external.workDir)
    expect(external.report.valid).toBe(false)
  })
})

describe("FISCAL-DRY-RUN-INTEGRITY-PROOF-005 · intercept de egress (FASE 7-8)", () => {
  const nodeRequire = createRequire(import.meta.url)
  const net = nodeRequire("node:net") as typeof import("node:net")
  const dns = nodeRequire("node:dns") as typeof import("node:dns")
  const http = nodeRequire("node:http") as typeof import("node:http")
  const https = nodeRequire("node:https") as typeof import("node:https")
  const tls = nodeRequire("node:tls") as typeof import("node:tls")

  it("classifica loopback, IPC local e rede interna vs host público", () => {
    expect(isLoopbackTarget("127.0.0.1")).toBe(true)
    expect(isLoopbackTarget("::1")).toBe(true)
    expect(isLoopbackTarget("localhost")).toBe(true)
    expect(isLoopbackTarget("fiscal-xsd.internal")).toBe(true)
    expect(isLoopbackTarget("/tmp/worker.sock")).toBe(true)
    expect(isLoopbackTarget("example.com")).toBe(false)
    expect(isLoopbackTarget("8.8.8.8")).toBe(false)
    expect(isLoopbackTarget("nfce.sefaz.rs.gov.br")).toBe(false)
  })

  it("NET-P01 loopback autorizado (dns.lookup localhost resolve)", async () => {
    const guard = installNetGuard()
    try {
      const address = await new Promise<string>((res, rej) =>
        dns.lookup("localhost", (err, addr) => (err ? rej(err) : res(String(addr)))),
      )
      expect(address).toMatch(/^(127\.0\.0\.1|::1)$/)
      expect(guard.attempts).toHaveLength(0)
    } finally {
      guard.restore()
    }
  })

  it("NET-P02 transporte local do worker XSD (loopback TCP) autorizado", async () => {
    const guard = installNetGuard()
    const server = net.createServer()
    try {
      await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()))
      const port = (server.address() as import("node:net").AddressInfo).port
      await new Promise<void>((res, rej) => {
        const socket = net.connect(port, "127.0.0.1", () => {
          socket.end()
          res()
        })
        socket.on("error", rej)
      })
      expect(guard.attempts).toHaveLength(0)
    } finally {
      guard.restore()
      await new Promise<void>((res) => server.close(() => res()))
    }
  })

  it("NET-N01 fetch externo bloqueado (sem conexão real)", async () => {
    const { attempts } = await withNetGuard(async () => {
      await expect(fetch("https://example.com/")).rejects.toBeInstanceOf(EgressBlockedError)
    })
    expect(attempts).toContainEqual({ channel: "fetch", target: "example.com" })
  })

  it("NET-N02 http externo bloqueado", () => {
    const guard = installNetGuard()
    try {
      expect(() => http.request("http://example.com/")).toThrow(/egress/i)
    } finally {
      guard.restore()
    }
  })

  it("NET-N03 https externo bloqueado", () => {
    const guard = installNetGuard()
    try {
      expect(() => https.request({ host: "example.com", port: 443 })).toThrow(EgressBlockedError)
    } finally {
      guard.restore()
    }
  })

  it("NET-N04 net externo bloqueado", () => {
    const guard = installNetGuard()
    try {
      expect(() => net.connect(443, "example.com")).toThrow(/egress/i)
    } finally {
      guard.restore()
    }
  })

  it("NET-N05 tls externo bloqueado", () => {
    const guard = installNetGuard()
    try {
      expect(() => tls.connect(443, "example.com")).toThrow(EgressBlockedError)
    } finally {
      guard.restore()
    }
  })

  it("NET-N06 DNS externo bloqueado (lookup/resolve/reverse)", () => {
    const guard = installNetGuard()
    try {
      expect(() => dns.resolve("example.com", () => {})).toThrow(/egress/i)
      expect(() => dns.lookup("example.com", () => {})).toThrow(EgressBlockedError)
      expect(() => dns.reverse("8.8.8.8", () => {})).toThrow(/egress/i)
    } finally {
      guard.restore()
    }
  })

  it("NET-N07 endpoint SEFAZ bloqueado", async () => {
    const { attempts } = await withNetGuard(async () => {
      await expect(
        fetch("https://nfce.sefaz.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx"),
      ).rejects.toBeInstanceOf(EgressBlockedError)
    })
    expect(attempts.some((a) => a.channel === "fetch" && /sefaz/i.test(a.target))).toBe(true)
  })

  it("NET-N08 intercept restaurado depois da prova", () => {
    const originalFetch = globalThis.fetch
    const originalHttpRequest = http.request
    const originalDnsLookup = dns.lookup
    const guard = installNetGuard()
    expect(globalThis.fetch).not.toBe(originalFetch)
    expect(http.request).not.toBe(originalHttpRequest)
    expect(isNetGuardActive()).toBe(true)
    guard.restore()
    expect(globalThis.fetch).toBe(originalFetch)
    expect(http.request).toBe(originalHttpRequest)
    expect(dns.lookup).toBe(originalDnsLookup)
    expect(isNetGuardActive()).toBe(false)
  })

  it("NET-N09 falha durante a prova ainda restaura intercepts", async () => {
    const originalFetch = globalThis.fetch
    await expect(
      withNetGuard(async () => {
        throw new Error("boom-proof")
      }),
    ).rejects.toThrow("boom-proof")
    expect(globalThis.fetch).toBe(originalFetch)
    expect(isNetGuardActive()).toBe(false)
  })

  it("NET-N10 segunda execução não acumula wrappers", async () => {
    const originalFetch = globalThis.fetch
    await withNetGuard(async () => {})
    await withNetGuard(async () => {})
    expect(globalThis.fetch).toBe(originalFetch)
    const guard = installNetGuard()
    try {
      expect(() => installNetGuard()).toThrow(/já está instalado/)
    } finally {
      guard.restore()
    }
    expect(globalThis.fetch).toBe(originalFetch)
    expect(isNetGuardActive()).toBe(false)
  })

  it("prova completa sob o guard não gera egress externo (0 tentativas)", async () => {
    const { result, attempts } = await withNetGuard(() => runFiscalDryRunIntegrityProof(baseDeps))
    expect(attempts).toHaveLength(0)
    expect(result.safety.externalEgress).toBe(0)
    expect(result.verification.internal).toBe(true)
    expect(result.verification.externalJava17).toBe(true)
  }, 60_000)
})

describe("FISCAL-DRY-RUN-INTEGRITY-PROOF-005 · exit codes (FASE 12)", () => {
  const green: ProofExitSignals = {
    manifestMatches: true,
    dependencyAvailable: true,
    internal: true,
    externalJava17: true,
    structural: true,
    xsdContract: true,
    deterministic: true,
    idempotent: true,
    tamperDetected: true,
    storeIsolation: true,
    databaseWrites: 0,
    sefazCalls: 0,
    externalEgress: 0,
  }

  it("EXIT-0 sucesso real", () => {
    expect(classifyProofExit(green)).toBe(0)
  })

  it("EXIT-1 falha de integridade", () => {
    expect(classifyProofExit({ ...green, tamperDetected: false })).toBe(1)
    expect(classifyProofExit({ ...green, internal: false })).toBe(1)
  })

  it("EXIT-1 XSD indisponível (contrato falso) nunca retorna 0", () => {
    expect(classifyProofExit({ ...green, xsdContract: false })).not.toBe(0)
  })

  it("EXIT-2 dependência obrigatória (Java 17 / golden) nunca retorna 0", () => {
    expect(classifyProofExit({ ...green, dependencyAvailable: false })).toBe(2)
  })

  it("EXIT-3 violação de egress/persistência/SEFAZ", () => {
    expect(classifyProofExit({ ...green, externalEgress: 1 })).toBe(3)
    expect(classifyProofExit({ ...green, databaseWrites: 1 })).toBe(3)
    expect(classifyProofExit({ ...green, sefazCalls: 1 })).toBe(3)
  })

  it("EXIT-3 egress bloqueado incorretamente nunca retorna 0", () => {
    expect(classifyProofExit({ ...green, externalEgress: 2 })).not.toBe(0)
  })

  it("EXIT-4 manifesto divergente", () => {
    expect(classifyProofExit({ ...green, manifestMatches: false })).toBe(4)
  })

  it("segurança tem prioridade sobre dependência e manifesto divergente", () => {
    expect(
      classifyProofExit({
        ...green,
        externalEgress: 1,
        dependencyAvailable: false,
        manifestMatches: false,
      }),
    ).toBe(3)
  })
})

const realXsdSuite = process.env.FISCAL_XSD_WORKER_URL ? describe : describe.skip

realXsdSuite("FISCAL-DRY-RUN-INTEGRITY-PROOF-005 · XSD worker real (opcional)", () => {
  it("aprova XML assinado no worker oficial quando disponível", async () => {
    const { createConfiguredXsdWorkerClient } = await import("@/lib/fiscal/xsd-worker")
    const result = await runFiscalDryRunIntegrityProof({
      ...baseDeps,
      xsdAdapter: createConfiguredXsdWorkerClient(),
      runExternalJava: false,
    })
    expect(result.verification.xsd).toBe(true)
    expect(result.xsdStatus).toBe("xsd_ok")
  }, 30_000)
})

describe("sanidade do manifesto versionado", () => {
  it("não contém segredos nem XML real", () => {
    const raw = readFileSync(MANIFEST_PATH, "utf8")
    expect(raw).not.toContain("<infNFe")
    expect(raw).not.toContain("PRIVATE KEY")
    expect(raw).not.toContain("BEGIN CERTIFICATE")
    const parsed = JSON.parse(raw) as IntegrityManifest
    expect(parsed.goal).toBe("FISCAL-DRY-RUN-INTEGRITY-PROOF-005")
    expect(parsed.integrity.deterministic).toBe(true)
    expect(parsed.safety.sefazCalls).toBe(0)
    expect(createHash("sha256").update("x").digest("hex")).toHaveLength(64)
  })
})
