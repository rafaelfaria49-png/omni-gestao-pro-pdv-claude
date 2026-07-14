import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { XMLLintOptions, XMLValidationResult } from "xmllint-wasm"
import {
  NFCE_XML_EXTERNAL_DECLARATION,
  NFCE_XML_INTERNAL_ENTITY,
  NFCE_XML_FIELD_TOO_LONG,
  NFCE_XML_INVALID_TYPE,
  NFCE_XML_MALFORMED,
  NFCE_XML_MISSING_REQUIRED,
  NFCE_XML_VERPROC_21,
  NFCE_XML_WRONG_NAMESPACE,
  VALID_NFCE_XML_VERPROC_20,
} from "./__fixtures__/nfce-xsd-spike-fixtures"
import {
  OFFICIAL_XSD_PACKAGE,
  XsdSpikeInfrastructureError,
  resetOfficialXsdSpikeCacheForTests,
  validateXmlAgainstOfficialXsdSpike,
} from "./xmllint-wasm-spike"

const VALID_ENGINE_RESULT: XMLValidationResult = {
  valid: true,
  errors: [],
  rawOutput: "",
  normalized: "",
}

describe("xmllint-wasm spike · pacote oficial NFC-e", () => {
  it("aceita XML estruturalmente válido e exercita includes + import XMLDSig offline", async () => {
    await expect(validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20)).resolves.toEqual({
      valid: true,
      issues: [],
    })
  })

  it("aceita entrada UTF-8 em bytes", async () => {
    const bytes = new TextEncoder().encode(VALID_NFCE_XML_VERPROC_20)
    await expect(validateXmlAgainstOfficialXsdSpike(bytes)).resolves.toEqual({
      valid: true,
      issues: [],
    })
  })

  it.each([
    ["campo obrigatório ausente", NFCE_XML_MISSING_REQUIRED],
    ["tipo inválido", NFCE_XML_INVALID_TYPE],
    ["campo acima do tamanho", NFCE_XML_FIELD_TOO_LONG],
    ["namespace incorreto", NFCE_XML_WRONG_NAMESPACE],
    ["XML malformado", NFCE_XML_MALFORMED],
  ])("rejeita %s com mensagem utilizável", async (_case, xml) => {
    const result = await validateXmlAgainstOfficialXsdSpike(xml)
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues.every((issue) => issue.message.length > 0)).toBe(true)
    expect(result.issues.every((issue) => issue.message.length <= 500)).toBe(true)
  })

  it("aceita verProc com 20 caracteres e rejeita 21", async () => {
    expect((await validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20)).valid).toBe(true)
    const tooLong = await validateXmlAgainstOfficialXsdSpike(NFCE_XML_VERPROC_21)
    expect(tooLong.valid).toBe(false)
    if (!tooLong.valid) {
      expect(tooLong.issues.some((issue) => /maxLength|length|comprimento/i.test(issue.message))).toBe(true)
    }
  })

  it.each([
    ["declaração externa", NFCE_XML_EXTERNAL_DECLARATION],
    ["entidade interna", NFCE_XML_INTERNAL_ENTITY],
  ])("bloqueia %s antes do motor e mantém a validação sem rede", async (_name, xml) => {
    let engineCalled = false
    const result = await validateXmlAgainstOfficialXsdSpike(xml, {
      engine: async () => {
        engineCalled = true
        return VALID_ENGINE_RESULT
      },
    })
    expect(engineCalled).toBe(false)
    expect(result).toEqual({
      valid: false,
      issues: [
        {
          code: "xml_external_declaration_blocked",
          message: "DOCTYPE e declarações de entidade não são aceitos pela validação offline.",
        },
      ],
    })
  })

  it("fornece somente os cinco schemas em memória e acrescenta --nonet", async () => {
    let captured: XMLLintOptions | undefined
    const result = await validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20, {
      engine: async (options) => {
        captured = options
        return VALID_ENGINE_RESULT
      },
    })
    expect(result.valid).toBe(true)
    expect(captured).toBeDefined()
    const schema = captured && "schema" in captured ? captured.schema : []
    expect(Array.isArray(schema) ? schema : [schema]).toHaveLength(1)
    expect(Array.isArray(captured?.preload) ? captured.preload : [captured?.preload]).toHaveLength(4)
    expect(captured?.modifyArguments?.(["--schema", "nfe_v4.00.xsd"])).toEqual([
      "--nonet",
      "--schema",
      "nfe_v4.00.xsd",
    ])
  })

  it("não expõe XML completo nem identificadores sintéticos nas mensagens", async () => {
    const result = await validateXmlAgainstOfficialXsdSpike(NFCE_XML_INVALID_TYPE)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      const messages = result.issues.map((issue) => issue.message).join(" ")
      expect(messages).not.toContain("<NFe")
      expect(messages).not.toContain("00000000000000")
    }
  })

  it("é estável em validações repetidas", async () => {
    const first = await validateXmlAgainstOfficialXsdSpike(NFCE_XML_INVALID_TYPE)
    const second = await validateXmlAgainstOfficialXsdSpike(NFCE_XML_INVALID_TYPE)
    expect(second).toEqual(first)
  })

  it("mantém estado íntegro em pequeno lote concorrente", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20)),
    )
    expect(results.every((result) => result.valid)).toBe(true)
  })

  it("retorna falha de infraestrutura clara quando o WASM está ausente", async () => {
    const missing = join(tmpdir(), "xmllint-wasm-ausente", "xmllint.wasm")
    await expect(
      validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20, { wasmPath: missing }),
    ).rejects.toMatchObject({ code: "xsd_wasm_missing" } satisfies Partial<XsdSpikeInfrastructureError>)
  })

  it("retorna falha de infraestrutura clara quando o pacote XSD está ausente", async () => {
    resetOfficialXsdSpikeCacheForTests()
    const missing = join(tmpdir(), "xsd-oficial-ausente")
    await expect(
      validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20, { schemaDirectory: missing }),
    ).rejects.toMatchObject({ code: "xsd_package_missing" } satisfies Partial<XsdSpikeInfrastructureError>)
  })

  it("distingue falha inesperada do motor de XML inválido", async () => {
    await expect(
      validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20, {
        engine: async () => {
          throw new Error("falha sintética do worker")
        },
      }),
    ).rejects.toMatchObject({ code: "xsd_engine_failed" } satisfies Partial<XsdSpikeInfrastructureError>)
  })

  it("falha fechado quando um XSD versionado diverge do hash", async () => {
    const source = join(
      process.cwd(),
      "lib",
      "fiscal",
      "xsd",
      "schemas",
      OFFICIAL_XSD_PACKAGE.name,
      "NFe",
    )
    const target = await mkdtemp(join(tmpdir(), "xsd-spike-integridade-"))
    await Promise.all(
      OFFICIAL_XSD_PACKAGE.files.map(async (file) => {
        const contents = await readFile(join(source, file.name))
        await writeFile(join(target, file.name), contents)
      }),
    )
    await writeFile(join(target, "nfe_v4.00.xsd"), "<schema adulterado='true'/>")
    resetOfficialXsdSpikeCacheForTests()
    await expect(
      validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20, { schemaDirectory: target }),
    ).rejects.toMatchObject({ code: "xsd_integrity_failed" } satisfies Partial<XsdSpikeInfrastructureError>)
  })

  it("preserva o hash oficial quando o checkout Windows materializa CRLF", async () => {
    const source = join(
      process.cwd(),
      "lib",
      "fiscal",
      "xsd",
      "schemas",
      OFFICIAL_XSD_PACKAGE.name,
      "NFe",
    )
    const target = await mkdtemp(join(tmpdir(), "xsd-spike-crlf-"))
    await Promise.all(
      OFFICIAL_XSD_PACKAGE.files.map(async (file) => {
        const contents = await readFile(join(source, file.name), "utf8")
        await writeFile(join(target, file.name), contents.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"))
      }),
    )
    resetOfficialXsdSpikeCacheForTests()
    await expect(
      validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20, {
        schemaDirectory: target,
        engine: async () => VALID_ENGINE_RESULT,
      }),
    ).resolves.toEqual({ valid: true, issues: [] })
  })

  it("aplica limite de entrada antes de inicializar o motor", async () => {
    const result = await validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20, {
      maxXmlBytes: 64,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.issues[0]?.code).toBe("xml_size_limit")
  })
})
