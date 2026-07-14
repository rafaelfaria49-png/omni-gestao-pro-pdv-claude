import { createHash } from "node:crypto"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  NFCE_XML_EXTERNAL_DECLARATION,
  NFCE_XML_FILE_ENTITY,
  NFCE_XML_HTTP_ENTITY,
  NFCE_XML_INTERNAL_ENTITY,
  NFCE_XML_INVALID_TYPE,
  NFCE_XML_SCHEMA_HINT,
  VALID_NFCE_XML_VERPROC_20,
} from "../xsd/__fixtures__/nfce-xsd-spike-fixtures"
import {
  NATIVE_SPIKE_XSD_PACKAGE,
  NativeSpikeProcessError,
  inspectNativeXmllintSpike,
  runNativeProcessForSpike,
  type NativeProcessRequest,
  type NativeProcessResult,
  type NativeProcessRunner,
  type NativeXmllintSpikeOptions,
  validateXmlWithNativeXmllintSpike,
} from "./xmllint-native-spike"

const VERSION_RESULT: NativeProcessResult = {
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "xmllint: using libxml version 21503\n",
  durationMs: 2.5,
}

const VALID_RESULT: NativeProcessResult = {
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "- validates\n",
  durationMs: 4,
}

let nodeSha256 = ""
const temporaryDirectories: string[] = []

beforeAll(async () => {
  nodeSha256 = createHash("sha256").update(await readFile(process.execPath)).digest("hex")
})

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function fakeRunner(
  validationResult: NativeProcessResult = VALID_RESULT,
  calls: Array<{ args: readonly string[]; request: NativeProcessRequest }> = [],
  versionResult: NativeProcessResult = VERSION_RESULT,
): NativeProcessRunner {
  return async (_executablePath, args, request) => {
    calls.push({ args, request })
    return args[0] === "--version" ? versionResult : validationResult
  }
}

function options(runner: NativeProcessRunner): NativeXmllintSpikeOptions {
  return {
    executablePath: process.execPath,
    trust: { mode: "provisioned", expectedSha256: nodeSha256 },
    runner,
  }
}

describe("spike xmllint nativo · contrato e isolamento", () => {
  it("exige caminho absoluto explícito e não consulta PATH", async () => {
    await expect(
      inspectNativeXmllintSpike({
        executablePath: "xmllint",
        trust: { mode: "system" },
        runner: fakeRunner(),
      }),
    ).rejects.toMatchObject({
      code: "native_executable_path_invalid",
    } satisfies Partial<NativeSpikeProcessError>)
  })

  it("identifica versão, hash, tamanho e arquitetura do executável", async () => {
    const inspection = await inspectNativeXmllintSpike(options(fakeRunner()))
    expect(inspection).toMatchObject({
      executableSha256: nodeSha256,
      version: "2.15.3",
      architecture: process.arch,
      platform: process.platform,
      versionDiscoveryMs: 2.5,
    })
    expect(inspection.executableBytes).toBeGreaterThan(0)
  })

  it("falha fechado para executável inexistente", async () => {
    await expect(
      inspectNativeXmllintSpike({
        executablePath: join(tmpdir(), "xmllint-inexistente", "xmllint"),
        trust: { mode: "system" },
        runner: fakeRunner(),
      }),
    ).rejects.toMatchObject({ code: "native_executable_missing" })
  })

  it("falha fechado para hash provisionado divergente", async () => {
    await expect(
      inspectNativeXmllintSpike({
        executablePath: process.execPath,
        trust: { mode: "provisioned", expectedSha256: "0".repeat(64) },
        runner: fakeRunner(),
      }),
    ).rejects.toMatchObject({ code: "native_executable_hash_mismatch" })
  })

  it.each(["2.13.8", "2.15.2"])("bloqueia libxml2 %s", async (version) => {
    const [major, minor, patch] = version.split(".")
    const numeric = `${major}${minor?.padStart(2, "0")}${patch?.padStart(2, "0")}`
    await expect(
      inspectNativeXmllintSpike(
        options(
          fakeRunner(VALID_RESULT, [], {
            ...VERSION_RESULT,
            stderr: `xmllint: using libxml version ${numeric}\n`,
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: "native_version_unsupported" })
  })

  it("falha fechado quando a versão não é identificável", async () => {
    await expect(
      inspectNativeXmllintSpike(
        options(fakeRunner(VALID_RESULT, [], { ...VERSION_RESULT, stderr: "versão ausente" })),
      ),
    ).rejects.toMatchObject({ code: "native_version_unidentified" })
  })

  it("envia o XML somente por stdin com argumentos fixos, shell indireto ausente e ambiente mínimo", async () => {
    const calls: Array<{ args: readonly string[]; request: NativeProcessRequest }> = []
    const result = await validateXmlWithNativeXmllintSpike(
      VALID_NFCE_XML_VERPROC_20,
      options(fakeRunner(VALID_RESULT, calls)),
    )
    expect(result).toEqual({
      valid: true,
      issues: [],
      engine: { name: "xmllint", version: "2.15.3" },
    })
    expect(calls).toHaveLength(2)
    expect(calls[1]?.args).toEqual([
      "--noout",
      "--nonet",
      "--nocatalogs",
      "--maxmem",
      String(512 * 1024 * 1024),
      "--schema",
      "nfe_v4.00.xsd",
      "-",
    ])
    expect(calls[1]?.request.stdin).toBe(VALID_NFCE_XML_VERPROC_20)
    expect(calls[1]?.args.join(" ")).not.toContain("<NFe")
    expect(calls[1]?.request.env?.PATH).toBe("")
    expect(calls[1]?.request.env?.XML_CATALOG_FILES).toBe("")
    expect(calls[1]?.request.env).not.toHaveProperty("DATABASE_URL")
  })

  it("interpreta rejeição XSD como resultado inválido com mensagem sanitizada", async () => {
    const invalid = {
      ...VALID_RESULT,
      exitCode: 3,
      stderr:
        "C:\\segredo\\nfce.xml:18: element tpNF: Schemas validity error : 12345678901234 não é válido\n- fails to validate\n",
    }
    const result = await validateXmlWithNativeXmllintSpike(
      NFCE_XML_INVALID_TYPE,
      options(fakeRunner(invalid)),
    )
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues[0]).toMatchObject({ code: "xsd_invalid", line: 18 })
      expect(result.issues[0]?.message).not.toContain("C:\\segredo")
      expect(result.issues[0]?.message).not.toContain("12345678901234")
    }
  })

  it("interpreta XML malformado como entrada inválida, não falha de infraestrutura", async () => {
    const malformed = {
      ...VALID_RESULT,
      exitCode: 4,
      stderr: "-:7: parser error : Premature end of data\n",
    }
    const result = await validateXmlWithNativeXmllintSpike("<NFe>", options(fakeRunner(malformed)))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.issues[0]?.code).toBe("xml_malformed")
  })

  it.each([
    ["DTD externo", NFCE_XML_EXTERNAL_DECLARATION],
    ["entidade interna", NFCE_XML_INTERNAL_ENTITY],
    ["HTTP", NFCE_XML_HTTP_ENTITY],
    ["file", NFCE_XML_FILE_ENTITY],
  ])("bloqueia %s antes de descobrir ou iniciar o executável", async (_case, xml) => {
    let calls = 0
    const runner: NativeProcessRunner = async () => {
      calls += 1
      return VERSION_RESULT
    }
    const result = await validateXmlWithNativeXmllintSpike(xml, options(runner))
    expect(result.valid).toBe(false)
    expect(calls).toBe(0)
    if (!result.valid) expect(result.issues[0]?.code).toBe("xml_external_declaration_blocked")
  })

  it("bloqueia schemaLocation fornecido pela entrada", async () => {
    const result = await validateXmlWithNativeXmllintSpike(
      NFCE_XML_SCHEMA_HINT,
      options(fakeRunner()),
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.issues[0]?.code).toBe("xml_schema_hint_blocked")
  })

  it("aplica o limite de entrada antes de iniciar o executável", async () => {
    let calls = 0
    const runner: NativeProcessRunner = async () => {
      calls += 1
      return VERSION_RESULT
    }
    const result = await validateXmlWithNativeXmllintSpike(
      VALID_NFCE_XML_VERPROC_20,
      { ...options(runner), maxXmlBytes: 32 },
    )
    expect(result.valid).toBe(false)
    expect(calls).toBe(0)
    if (!result.valid) expect(result.issues[0]?.code).toBe("xml_size_limit")
  })

  it("falha fechado para pacote XSD ausente", async () => {
    await expect(
      validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, {
        ...options(fakeRunner()),
        schemaDirectory: join(tmpdir(), "xsd-nativo-ausente"),
      }),
    ).rejects.toMatchObject({ code: "native_schema_missing" })
  })

  it("falha fechado para XSD adulterado", async () => {
    const source = join(
      process.cwd(),
      "lib",
      "fiscal",
      "xsd-native",
      "schemas",
      NATIVE_SPIKE_XSD_PACKAGE.name,
      "NFe",
    )
    const target = await mkdtemp(join(tmpdir(), "xsd-native-adulterado-"))
    temporaryDirectories.push(target)
    await Promise.all(
      NATIVE_SPIKE_XSD_PACKAGE.files.map(async (file) => {
        await writeFile(join(target, file.name), await readFile(join(source, file.name)))
      }),
    )
    await writeFile(join(target, "nfe_v4.00.xsd"), "<schema adulterado='true'/>")
    await expect(
      validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, {
        ...options(fakeRunner()),
        schemaDirectory: target,
      }),
    ).rejects.toMatchObject({ code: "native_schema_integrity_failed" })
  })

  it("aceita somente a variante LF exata produzida pelo checkout Linux", async () => {
    const source = join(
      process.cwd(),
      "lib",
      "fiscal",
      "xsd-native",
      "schemas",
      NATIVE_SPIKE_XSD_PACKAGE.name,
      "NFe",
    )
    const target = await mkdtemp(join(tmpdir(), "xsd-native-lf-"))
    temporaryDirectories.push(target)
    await Promise.all(
      NATIVE_SPIKE_XSD_PACKAGE.files.map(async (file) => {
        const contents = await readFile(join(source, file.name))
        await writeFile(
          join(target, file.name),
          Buffer.from(contents.toString("utf8").replaceAll("\r\n", "\n")),
        )
      }),
    )

    await expect(
      validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, {
        ...options(fakeRunner()),
        schemaDirectory: target,
      }),
    ).resolves.toMatchObject({ valid: true })
  })

  it("aceita somente a variante CRLF exata produzida pelo checkout Windows", async () => {
    const source = join(
      process.cwd(),
      "lib",
      "fiscal",
      "xsd-native",
      "schemas",
      NATIVE_SPIKE_XSD_PACKAGE.name,
      "NFe",
    )
    const target = await mkdtemp(join(tmpdir(), "xsd-native-crlf-"))
    temporaryDirectories.push(target)
    await Promise.all(
      NATIVE_SPIKE_XSD_PACKAGE.files.map(async (file) => {
        const contents = await readFile(join(source, file.name))
        await writeFile(
          join(target, file.name),
          Buffer.from(contents.toString("utf8").replace(/\r?\n/g, "\r\n")),
        )
      }),
    )

    await expect(
      validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, {
        ...options(fakeRunner()),
        schemaDirectory: target,
      }),
    ).resolves.toMatchObject({ valid: true })
  })

  it("remove o diretório temporário em finally", async () => {
    let validationCwd = ""
    const runner: NativeProcessRunner = async (_path, args, request) => {
      if (args[0] === "--version") return VERSION_RESULT
      validationCwd = request.cwd ?? ""
      return VALID_RESULT
    }
    await validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, options(runner))
    expect(validationCwd).toContain("nfce-xmllint-native-")
    await expect(access(validationCwd)).rejects.toBeDefined()
  })

  it("mantém resultado determinístico em repetição", async () => {
    const configured = options(fakeRunner())
    const first = await validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, configured)
    const second = await validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, configured)
    expect(second).toEqual(first)
  })

  it("mantém isolamento em quatro validações concorrentes", async () => {
    const configured = options(fakeRunner())
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, configured),
      ),
    )
    expect(results.every((result) => result.valid)).toBe(true)
  })
})

describe("runner de processo nativo sem shell", () => {
  it("trata metacaracteres como argumento literal, sem command injection", async () => {
    const payload = "valor; Write-Output INJETADO && echo INJETADO"
    const result = await runNativeProcessForSpike(
      process.execPath,
      ["-e", "process.stdout.write(process.argv[1])", payload],
      { timeoutMs: 2_000, maxOutputBytes: 4_096, env: process.env },
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(payload)
  })

  it("aborta processo que excede timeout rígido", async () => {
    await expect(
      runNativeProcessForSpike(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], {
        timeoutMs: 50,
        maxOutputBytes: 4_096,
        env: process.env,
      }),
    ).rejects.toMatchObject({ code: "native_process_timeout" })
  })

  it("aborta processo que excede limite de saída", async () => {
    await expect(
      runNativeProcessForSpike(
        process.execPath,
        ["-e", "process.stdout.write('X'.repeat(10000))"],
        { timeoutMs: 2_000, maxOutputBytes: 128, env: process.env },
      ),
    ).rejects.toMatchObject({ code: "native_output_limit" })
  })
})
