/**
 * Spike isolado de validação XSD oficial da NFC-e com xmllint-wasm.
 *
 * Não é importado por validarXsd, pipeline fiscal, rotas ou emissão. A finalidade
 * é provar portabilidade, fechamento offline do pacote e qualidade dos erros.
 */
import { createHash } from "node:crypto"
import { access, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { validateXML, type XMLLintOptions, type XMLValidationResult } from "xmllint-wasm"

export type XsdValidationIssue = {
  message: string
  line?: number
  column?: number
  code?: string
  schemaPath?: string
}

export type XsdValidationResult =
  | { valid: true; issues: [] }
  | { valid: false; issues: XsdValidationIssue[] }

export type XsdSpikeInfrastructureCode =
  | "xsd_package_missing"
  | "xsd_integrity_failed"
  | "xsd_dependency_forbidden"
  | "xsd_wasm_missing"
  | "xsd_schema_compile_failed"
  | "xsd_engine_failed"

export class XsdSpikeInfrastructureError extends Error {
  readonly name = "XsdSpikeInfrastructureError"

  constructor(
    readonly code: XsdSpikeInfrastructureCode,
    message: string,
  ) {
    super(message)
  }
}

type XsdSpikeEngine = (options: XMLLintOptions) => Promise<XMLValidationResult>

export type XsdSpikeOptions = {
  schemaDirectory?: string
  wasmPath?: string
  maxXmlBytes?: number
  engine?: XsdSpikeEngine
}

type OfficialXsdFile = {
  readonly name: string
  readonly sha256: string
  readonly canonicalLfSha256?: string
  readonly entrypoint?: true
}

export const OFFICIAL_XSD_PACKAGE = {
  name: "PL_010e_v1.02",
  layout: "4.00",
  capturedAt: "2026-07-13",
  files: [
    {
      name: "nfe_v4.00.xsd",
      sha256: "adce3646c13ceb54922ec3142fc1dc45bd4fb839ac35ad583e86c733c07d27df",
      canonicalLfSha256: "920fd7c04a35b49d0b7f56792e650e63cef76cf1b23f10995b1bbec1f0202774",
      entrypoint: true,
    },
    {
      name: "leiauteNFe_v4.00.xsd",
      sha256: "598c71780cbc6b54f170464bd6d5538c2d01a99d987a1666b662d4e166b84bf7",
    },
    {
      name: "tiposBasico_v4.00.xsd",
      sha256: "772619c85723e598840667ca66e7298a250442df47eeb94b397d2a333ce62047",
    },
    {
      name: "DFeTiposBasicos_v1.00.xsd",
      sha256: "7fe1dbd89a1dd80826c5134c2406b7eb5df4fa7a9177c5aa6e72319caba7c6d2",
    },
    {
      name: "xmldsig-core-schema_v1.01.xsd",
      sha256: "f56744a5f51c03f027de13f39f869307091781a9ef1d91b1ebe14719ce28e1ac",
      canonicalLfSha256: "78f924e7c9cbeb1e4be900b3b1e7faf2d901972635842980fd43dabb533c512b",
    },
  ] satisfies readonly OfficialXsdFile[],
} as const

export const XSD_SPIKE_DEFAULT_MAX_XML_BYTES = 2 * 1024 * 1024

const DEFAULT_SCHEMA_DIRECTORY = join(
  process.cwd(),
  "lib",
  "fiscal",
  "xsd",
  "schemas",
  OFFICIAL_XSD_PACKAGE.name,
  "NFe",
)

const ALLOWED_SCHEMA_LOCATIONS = new Set(
  OFFICIAL_XSD_PACKAGE.files.map((file) => file.name),
)
const ENTRYPOINT = OFFICIAL_XSD_PACKAGE.files.find((file) => file.entrypoint)!
const packageCache = new Map<string, Promise<LoadedXsdPackage>>()

type LoadedXsdPackage = {
  entrypoint: { fileName: string; contents: Uint8Array }
  preload: Array<{ fileName: string; contents: Uint8Array }>
}

function defaultWasmPath(): string {
  const require = createRequire(import.meta.url)
  const packageJson = require.resolve("xmllint-wasm/package.json")
  return join(dirname(packageJson), "xmllint.wasm")
}

function infrastructureMessage(code: XsdSpikeInfrastructureCode): string {
  switch (code) {
    case "xsd_package_missing":
      return "Pacote XSD oficial indisponível para o spike."
    case "xsd_integrity_failed":
      return "Integridade do pacote XSD oficial não confere com o manifesto."
    case "xsd_dependency_forbidden":
      return "O pacote XSD contém uma dependência fora da allowlist offline."
    case "xsd_wasm_missing":
      return "Binário WebAssembly do validador indisponível."
    case "xsd_schema_compile_failed":
      return "O motor não conseguiu compilar o pacote XSD oficial."
    default:
      return "Falha de infraestrutura no motor experimental de validação XSD."
  }
}

function infrastructureError(code: XsdSpikeInfrastructureCode): XsdSpikeInfrastructureError {
  return new XsdSpikeInfrastructureError(code, infrastructureMessage(code))
}

function sha256(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex")
}

function canonicalXsdBytes(contents: Uint8Array): Uint8Array {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(contents)
  return new TextEncoder().encode(text.replaceAll("\r\n", "\n"))
}

function assertOfflineDependencyGraph(fileName: string, contents: Uint8Array): void {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(contents)
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(text)) {
    throw infrastructureError("xsd_dependency_forbidden")
  }

  const locations = text.matchAll(/schemaLocation\s*=\s*["']([^"']+)["']/g)
  for (const match of locations) {
    const location = match[1]
    if (!ALLOWED_SCHEMA_LOCATIONS.has(location)) {
      throw infrastructureError("xsd_dependency_forbidden")
    }
  }

  if (fileName === ENTRYPOINT.name && !text.includes("leiauteNFe_v4.00.xsd")) {
    throw infrastructureError("xsd_dependency_forbidden")
  }
}

async function readOfficialPackage(schemaDirectory: string): Promise<LoadedXsdPackage> {
  const loaded = await Promise.all(
    OFFICIAL_XSD_PACKAGE.files.map(async (file) => {
      let contents: Uint8Array
      try {
        contents = await readFile(join(schemaDirectory, file.name))
      } catch {
        throw infrastructureError("xsd_package_missing")
      }

      // O pacote oficial mistura LF e CRLF. Git pode materializar qualquer XSD
      // textual com o EOL da plataforma; somente CRLF -> LF é canonicalizado.
      const rawHash = sha256(contents)
      const canonicalHash = sha256(canonicalXsdBytes(contents))
      const canonicalExpected = file.canonicalLfSha256 ?? file.sha256
      if (rawHash !== file.sha256 && canonicalHash !== canonicalExpected) {
        throw infrastructureError("xsd_integrity_failed")
      }
      assertOfflineDependencyGraph(file.name, contents)
      return { file, contents }
    }),
  )

  return {
    entrypoint: {
      fileName: ENTRYPOINT.name,
      contents: loaded.find(({ file }) => file.entrypoint)!.contents,
    },
    preload: loaded
      .filter(({ file }) => !file.entrypoint)
      .map(({ file, contents }) => ({ fileName: file.name, contents })),
  }
}

async function loadOfficialPackage(schemaDirectory: string): Promise<LoadedXsdPackage> {
  const key = resolve(schemaDirectory)
  let pending = packageCache.get(key)
  if (!pending) {
    pending = readOfficialPackage(key)
    packageCache.set(key, pending)
  }
  try {
    return await pending
  } catch (error) {
    packageCache.delete(key)
    throw error
  }
}

function invalidInputIssue(xml: string, maxXmlBytes: number): XsdValidationIssue | null {
  if (Buffer.byteLength(xml, "utf8") > maxXmlBytes) {
    return {
      code: "xml_size_limit",
      message: `XML excede o limite experimental de ${maxXmlBytes} bytes.`,
    }
  }
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
    return {
      code: "xml_external_declaration_blocked",
      message: "DOCTYPE e declarações de entidade não são aceitos pela validação offline.",
    }
  }
  return null
}

function toUtf8String(xml: string | Uint8Array): string | XsdValidationIssue {
  if (typeof xml === "string") return xml
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(xml)
  } catch {
    return { code: "xml_encoding_invalid", message: "XML não está codificado em UTF-8 válido." }
  }
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/[A-Za-z]:[\\/][^\s:]+/g, "[caminho-local]")
    .replace(/\/(?:[^\s/:]+\/){2,}[^\s:]+/g, "[caminho-local]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500)
}

function issueCode(message: string): string {
  const facet = message.match(/\[facet '([^']+)'\]/i)?.[1]
  if (facet) return `xsd_facet_${facet}`
  if (/parser error|premature end|opening and ending tag mismatch/i.test(message)) {
    return "xml_malformed"
  }
  return "xsd_invalid"
}

function mapValidationResult(result: XMLValidationResult): XsdValidationResult {
  if (result.valid) return { valid: true, issues: [] }

  const sourceErrors = result.errors.length
    ? result.errors
    : [{ message: "XML rejeitado pelo schema oficial.", loc: null, rawMessage: "" }]
  const issues = sourceErrors.map((error): XsdValidationIssue => {
    const sanitized = sanitizeMessage(error.message)
    const message = sanitized || "XML rejeitado pelo schema oficial."
    const fileName = error.loc?.fileName
    return {
      code: issueCode(message),
      message,
      line: error.loc?.lineNumber,
      schemaPath: fileName?.endsWith(".xsd") ? fileName : undefined,
    }
  })
  return { valid: false, issues }
}

function mapEngineFailure(error: unknown): XsdSpikeInfrastructureError {
  if (error instanceof XsdSpikeInfrastructureError) return error
  const candidate = error as { code?: unknown; message?: unknown }
  const message = String(candidate?.message ?? "")
  if (/\.wasm|ENOENT.*xmllint/i.test(message)) {
    return infrastructureError("xsd_wasm_missing")
  }
  if (candidate?.code === 5 || /schema.*(compile|parse)/i.test(message)) {
    return infrastructureError("xsd_schema_compile_failed")
  }
  return infrastructureError("xsd_engine_failed")
}

/**
 * Valida somente para fins do spike. XML inválido retorna `valid: false`;
 * falha de pacote, integridade, WASM ou motor lança erro de infraestrutura tipado.
 */
export async function validateXmlAgainstOfficialXsdSpike(
  input: string | Uint8Array,
  options: XsdSpikeOptions = {},
): Promise<XsdValidationResult> {
  const decoded = toUtf8String(input)
  if (typeof decoded !== "string") return { valid: false, issues: [decoded] }

  const inputIssue = invalidInputIssue(
    decoded,
    options.maxXmlBytes ?? XSD_SPIKE_DEFAULT_MAX_XML_BYTES,
  )
  if (inputIssue) return { valid: false, issues: [inputIssue] }

  const wasmPath = options.wasmPath ?? defaultWasmPath()
  try {
    await access(wasmPath)
  } catch {
    throw infrastructureError("xsd_wasm_missing")
  }

  const xsdPackage = await loadOfficialPackage(
    options.schemaDirectory ?? DEFAULT_SCHEMA_DIRECTORY,
  )
  const engine = options.engine ?? validateXML

  try {
    const result = await engine({
      xml: { fileName: "nfce-spike.xml", contents: decoded },
      schema: xsdPackage.entrypoint,
      preload: xsdPackage.preload,
      initialMemoryPages: 256,
      maxMemoryPages: 512,
      modifyArguments: (args) => ["--nonet", ...args],
    })
    return mapValidationResult(result)
  } catch (error) {
    throw mapEngineFailure(error)
  }
}

/** Uso exclusivo de testes para isolar cenários de pacote ausente/corrompido. */
export function resetOfficialXsdSpikeCacheForTests(): void {
  packageCache.clear()
}
