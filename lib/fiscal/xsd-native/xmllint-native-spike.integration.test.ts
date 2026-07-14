import { describe, expect, it } from "vitest"
import {
  NFCE_XML_FIELD_TOO_LONG,
  NFCE_XML_INVALID_TYPE,
  NFCE_XML_MALFORMED,
  NFCE_XML_MISSING_REQUIRED,
  NFCE_XML_VERPROC_21,
  NFCE_XML_WRONG_NAMESPACE,
  VALID_NFCE_XML_VERPROC_20,
} from "../xsd/__fixtures__/nfce-xsd-spike-fixtures"
import {
  inspectNativeXmllintSpike,
  type NativeXmllintSpikeOptions,
  validateXmlWithNativeXmllintSpike,
} from "./xmllint-native-spike"

const executablePath = process.env.FISCAL_XMLLINT_PATH
const executableSha256 = process.env.FISCAL_XMLLINT_SHA256
const enabled = Boolean(executablePath && executableSha256)

function realOptions(): NativeXmllintSpikeOptions {
  if (!executablePath || !executableSha256) {
    throw new Error("FISCAL_XMLLINT_PATH e FISCAL_XMLLINT_SHA256 são obrigatórios no teste real")
  }
  return {
    executablePath,
    trust: { mode: "provisioned", expectedSha256: executableSha256 },
    timeoutMs: 5_000,
    maxMemoryBytes: Number(process.env.FISCAL_XMLLINT_MAX_MEMORY_BYTES ?? 512 * 1024 * 1024),
  }
}

describe.skipIf(!enabled)("integração real · xmllint 2.15.3 compilado do source oficial", () => {
  it("identifica a versão e o hash provisionados", async () => {
    const inspection = await inspectNativeXmllintSpike(realOptions())
    expect(inspection.version).toBe("2.15.3")
    expect(inspection.executableSha256).toBe(executableSha256)
  })

  it("valida o grafo oficial completo offline", async () => {
    await expect(
      validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, realOptions()),
    ).resolves.toEqual({
      valid: true,
      issues: [],
      engine: { name: "xmllint", version: "2.15.3" },
    })
  })

  it.each([
    ["obrigatório ausente", NFCE_XML_MISSING_REQUIRED],
    ["tipo inválido", NFCE_XML_INVALID_TYPE],
    ["tamanho excessivo", NFCE_XML_FIELD_TOO_LONG],
    ["namespace incorreto", NFCE_XML_WRONG_NAMESPACE],
    ["XML malformado", NFCE_XML_MALFORMED],
  ])("rejeita %s com mensagem útil", async (_case, xml) => {
    const result = await validateXmlWithNativeXmllintSpike(xml, realOptions())
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues.every((issue) => issue.message.length <= 500)).toBe(true)
    }
  })

  it("aceita verProc 20 e rejeita verProc 21", async () => {
    expect(
      (await validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, realOptions())).valid,
    ).toBe(true)
    expect(
      (await validateXmlWithNativeXmllintSpike(NFCE_XML_VERPROC_21, realOptions())).valid,
    ).toBe(false)
  })

  it("é determinístico e suporta quatro processos concorrentes", async () => {
    const sequential = await Promise.all([
      validateXmlWithNativeXmllintSpike(NFCE_XML_INVALID_TYPE, realOptions()),
      validateXmlWithNativeXmllintSpike(NFCE_XML_INVALID_TYPE, realOptions()),
    ])
    expect(sequential[1]).toEqual(sequential[0])
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () =>
        validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, realOptions()),
      ),
    )
    expect(concurrent.every((result) => result.valid)).toBe(true)
  })
})
