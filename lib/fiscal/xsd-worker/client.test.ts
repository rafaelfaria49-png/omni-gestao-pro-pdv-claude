import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { validarXsd } from "../dry-run/dry-run-validation"
import {
  XSD_CONTRACT_VERSION,
  XSD_MAX_PAYLOAD_BYTES,
  XSD_SCHEMA_PACKAGE,
  type XsdValidationRequest,
  type XsdValidationResult,
} from "../xsd"
import { TEST_XSD_ENGINE as TEST_ENGINE, XSD_OK_ADAPTER } from "../xsd/__fixtures__/xsd-adapter-fixtures"
import { OFFICIAL_XSD_MANIFEST_SHA256 } from "../xsd/official-package"
import { createXsdWorkerHttpClient, isValidationResult } from "./client"

function request(xml = "<NFe/>"): XsdValidationRequest {
  const xmlSha256 = createHash("sha256").update(xml).digest("hex")
  return {
    jobId: "job-1", storeId: "store-1", correlationId: "correlation-1",
    contractVersion: XSD_CONTRACT_VERSION, schemaVersion: XSD_SCHEMA_PACKAGE,
    schemaManifestHash: OFFICIAL_XSD_MANIFEST_SHA256, xmlSha256, xmlPayload: xml,
    payloadBytes: Buffer.byteLength(xml), maxPayloadBytes: XSD_MAX_PAYLOAD_BYTES, attempt: 1,
    requestedAt: new Date().toISOString(), deadline: new Date(Date.now() + 3_000).toISOString(),
  }
}

describe("contrato do cliente XSD", () => {
  it("aceita apenas resultado coerente", () => {
    expect(isValidationResult({ valid: true, outcome: "VALIDACAO_APROVADA", issues: [], engine: TEST_ENGINE, durationMs: 1 })).toBe(true)
    expect(isValidationResult({ valid: true, outcome: "XML_INVALIDO", issues: [], engine: TEST_ENGINE, durationMs: 1 })).toBe(false)
    expect(isValidationResult({ valid: false, outcome: "VALIDACAO_APROVADA", issues: [], engine: null, durationMs: 1 })).toBe(false)
  })

  it("rejeita URL pública antes de usar fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const result = await createXsdWorkerHttpClient({ baseUrl: "https://public.example", fetchImpl }).validate(request())
    expect(result.outcome).toBe("WORKER_INDISPONIVEL")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("falha fechada para worker indisponível, timeout e resposta excessiva", async () => {
    const unavailable = createXsdWorkerHttpClient({
      baseUrl: "http://127.0.0.1:18080",
      fetchImpl: vi.fn(async () => { throw new TypeError("offline") }),
    })
    expect((await unavailable.validate(request())).outcome).toBe("WORKER_INDISPONIVEL")

    const timeout = createXsdWorkerHttpClient({
      baseUrl: "http://127.0.0.1:18080", timeoutMs: 100,
      fetchImpl: vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      })),
    })
    expect((await timeout.validate(request())).outcome).toBe("TIMEOUT")

    const output = createXsdWorkerHttpClient({
      baseUrl: "http://127.0.0.1:18080",
      fetchImpl: vi.fn(async () => new Response("x", { headers: { "content-length": String(65 * 1024) } })),
    })
    expect((await output.validate(request())).outcome).toBe("RESPOSTA_INCERTA")
  })

  it("detecta envelope cross-store divergente", async () => {
    const req = request()
    const client = createXsdWorkerHttpClient({
      baseUrl: "http://worker.internal",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        valid: true, outcome: "VALIDACAO_APROVADA", issues: [], engine: TEST_ENGINE, durationMs: 1,
        jobId: req.jobId, storeId: "other-store", correlationId: req.correlationId, xmlSha256: req.xmlSha256,
      }), { status: 200, headers: { "content-type": "application/json" } })),
    })
    expect((await client.validate(req)).outcome).toBe("RESPOSTA_INCERTA")
  })
})

describe("validarXsd", () => {
  it("aprova somente quando o adapter real aprova", async () => {
    const result = await validarXsd("<NFe/>", { adapter: XSD_OK_ADAPTER, storeId: "store-1" })
    expect(result.status).toBe("xsd_ok")
    expect(result.engine?.libxml2Version).toBe("2.15.3")
  })

  it("propaga XML inválido e infraestrutura sem fallback", async () => {
    const invalid = await validarXsd("<NFe/>", { adapter: { async validate() {
      return { valid: false, outcome: "XML_INVALIDO", issues: [{ message: "Elemento ausente." }], engine: TEST_ENGINE, durationMs: 1 }
    } } })
    expect(invalid.status).toBe("xsd_invalido")
    expect(invalid.violacoes).toEqual(["Elemento ausente."])

    const unavailable = await validarXsd("<NFe/>", { adapter: { async validate() {
      return { valid: false, outcome: "WORKER_INDISPONIVEL", issues: [{ message: "Worker indisponível." }], engine: null, durationMs: 0 }
    } } })
    expect(unavailable.status).toBe("xsd_falha_infraestrutura")
  })

  it("sanitiza XML, caminho e identificador mesmo em adapter injetado", async () => {
    const result = await validarXsd("<NFe/>", { adapter: { async validate() {
      return { valid: false, outcome: "XML_INVALIDO", issues: [{ message: "C:\\private\\job.xml <CNPJ>12345678901234</CNPJ>" }], engine: TEST_ENGINE, durationMs: 1 }
    } } })
    expect(result.violacoes[0]).not.toContain("private")
    expect(result.violacoes[0]).not.toContain("CNPJ")
    expect(result.violacoes[0]).not.toContain("12345678901234")
  })
})
