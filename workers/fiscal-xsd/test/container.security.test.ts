import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createXsdWorkerHttpClient } from "../../../lib/fiscal/xsd-worker"
import { XSD_CONTRACT_VERSION, XSD_MAX_PAYLOAD_BYTES, XSD_SCHEMA_PACKAGE, type XsdValidationRequest } from "../../../lib/fiscal/xsd"
import { OFFICIAL_XSD_MANIFEST_SHA256 } from "../../../lib/fiscal/xsd/official-package"
import {
  NFCE_XML_COMMAND_INJECTION, NFCE_XML_DTD_XXE, NFCE_XML_FILE_REFERENCE,
  NFCE_XML_HTTP_REFERENCE, NFCE_XML_TRAVERSAL, oversizedNfceXml,
} from "../../../lib/fiscal/xsd/__fixtures__/nfce-xsd-fixtures"

const baseUrl = process.env.FISCAL_XSD_WORKER_URL
const security = baseUrl ? describe : describe.skip
const client = createXsdWorkerHttpClient({ baseUrl: baseUrl ?? "http://127.0.0.1:18080" })
function request(xml: string, suffix: string): XsdValidationRequest {
  const hash = createHash("sha256").update(xml).digest("hex")
  return { jobId: `security-${suffix}`, storeId: "synthetic-store", correlationId: `security-${suffix}`,
    contractVersion: XSD_CONTRACT_VERSION, schemaVersion: XSD_SCHEMA_PACKAGE,
    schemaManifestHash: OFFICIAL_XSD_MANIFEST_SHA256, xmlSha256: hash, xmlPayload: xml,
    payloadBytes: Buffer.byteLength(xml), maxPayloadBytes: XSD_MAX_PAYLOAD_BYTES, attempt: 1,
    requestedAt: new Date().toISOString(), deadline: new Date(Date.now() + 5_000).toISOString() }
}

security("segurança do container XSD", () => {
  it.each([
    ["xxe", NFCE_XML_DTD_XXE], ["http", NFCE_XML_HTTP_REFERENCE],
    ["file", NFCE_XML_FILE_REFERENCE], ["traversal", NFCE_XML_TRAVERSAL],
  ])("rejeita política %s sem resolver referência", async (name, xml) => {
    const result = await client.validate(request(xml, name))
    expect(result.outcome).toBe("POLITICA_REJEITADA")
  })

  it("rejeita XML acima de 2 MiB no envelope", async () => {
    const result = await client.validate(request(oversizedNfceXml(), "large"))
    expect(result.valid).toBe(false)
    expect(["FALHA_PERMANENTE", "POLITICA_REJEITADA"]).toContain(result.outcome)
  })

  it("trata command injection como dados, nunca como argumento", async () => {
    const result = await client.validate(request(NFCE_XML_COMMAND_INJECTION, "command"))
    expect(result.outcome).not.toBe("RESPOSTA_INCERTA")
    expect(result.outcome).not.toBe("FALHA_PERMANENTE")
  })
})
