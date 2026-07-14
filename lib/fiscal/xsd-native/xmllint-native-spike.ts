/**
 * Spike isolado de validação XSD oficial da NFC-e com xmllint nativo.
 *
 * Não é importado por validarXsd, pipeline fiscal, rotas ou emissão.
 */
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import {
  chmod,
  copyFile,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"
import { tmpdir } from "node:os"

export type NativeXsdValidationIssue = {
  message: string
  line?: number
  column?: number
  code?: string
}

export type NativeXsdEngine = {
  name: "xmllint"
  version: string
}

export type NativeXsdValidationResult =
  | { valid: true; issues: []; engine: NativeXsdEngine }
  | { valid: false; issues: NativeXsdValidationIssue[]; engine: NativeXsdEngine }

export type NativeXmllintTrust =
  | { mode: "system" }
  | { mode: "provisioned"; expectedSha256: string }

export type NativeXmllintSpikeOptions = {
  executablePath: string
  trust: NativeXmllintTrust
  schemaDirectory?: string
  minimumVersion?: string
  blockedVersions?: readonly string[]
  timeoutMs?: number
  maxOutputBytes?: number
  maxXmlBytes?: number
  maxMemoryBytes?: number
  runner?: NativeProcessRunner
}

export type NativeProcessRequest = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: string
  timeoutMs: number
  maxOutputBytes: number
}

export type NativeProcessResult = {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
}

export type NativeProcessRunner = (
  executablePath: string,
  args: readonly string[],
  request: NativeProcessRequest,
) => Promise<NativeProcessResult>

export type NativeXmllintInspection = {
  executablePath: string
  resolvedExecutablePath: string
  executableSha256: string
  executableBytes: number
  version: string
  versionDiscoveryMs: number
  platform: NodeJS.Platform
  architecture: string
}

export type NativeSpikeProcessErrorCode =
  | "native_executable_path_invalid"
  | "native_executable_missing"
  | "native_executable_hash_required"
  | "native_executable_hash_mismatch"
  | "native_version_unidentified"
  | "native_version_unsupported"
  | "native_process_timeout"
  | "native_output_limit"
  | "native_process_spawn_failed"
  | "native_schema_missing"
  | "native_schema_integrity_failed"
  | "native_schema_dependency_forbidden"
  | "native_schema_symlink_forbidden"
  | "native_schema_compile_failed"
  | "native_engine_failed"

export class NativeSpikeProcessError extends Error {
  readonly name = "NativeSpikeProcessError"

  constructor(
    readonly code: NativeSpikeProcessErrorCode,
    message: string,
  ) {
    super(message)
  }
}

type OfficialXsdFile = {
  readonly name: string
  readonly sha256: string
  readonly canonicalLfSha256?: string
  readonly entrypoint?: true
}

export const NATIVE_SPIKE_XSD_PACKAGE = {
  name: "PL_010e_v1.02",
  layout: "4.00",
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

export const NATIVE_SPIKE_MINIMUM_LIBXML_VERSION = "2.15.3"
export const NATIVE_SPIKE_BLOCKED_VERSIONS = ["2.13.8"] as const
export const NATIVE_SPIKE_DEFAULT_MAX_XML_BYTES = 2 * 1024 * 1024
export const NATIVE_SPIKE_DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024
export const NATIVE_SPIKE_DEFAULT_MAX_MEMORY_BYTES = 128 * 1024 * 1024
export const NATIVE_SPIKE_DEFAULT_TIMEOUT_MS = 3_000

const DEFAULT_SCHEMA_DIRECTORY = join(
  process.cwd(),
  "lib",
  "fiscal",
  "xsd-native",
  "schemas",
  NATIVE_SPIKE_XSD_PACKAGE.name,
  "NFe",
)
const ENTRYPOINT = NATIVE_SPIKE_XSD_PACKAGE.files.find((file) => file.entrypoint)!
const ALLOWED_SCHEMA_LOCATIONS = new Set(NATIVE_SPIKE_XSD_PACKAGE.files.map((file) => file.name))

function nativeError(code: NativeSpikeProcessErrorCode, message: string): NativeSpikeProcessError {
  return new NativeSpikeProcessError(code, message)
}

function sha256(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex")
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number)
  const b = right.split(".").map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function numericLibxmlVersion(value: string): string {
  const padded = value.padStart(5, "0")
  const patch = Number(padded.slice(-2))
  const minor = Number(padded.slice(-4, -2))
  const major = Number(padded.slice(0, -4))
  return `${major}.${minor}.${patch}`
}

function parseXmllintVersion(output: string): string | null {
  const numeric = output.match(/(?:using\s+)?libxml version\s+(\d{5,6})/i)?.[1]
  if (numeric) return numericLibxmlVersion(numeric)
  return output.match(/(?:libxml|xmllint)[^\d]*(\d+\.\d+\.\d+)/i)?.[1] ?? null
}

function restrictedEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: process.env.NODE_ENV ?? "production",
    PATH: "",
    SGML_CATALOG_FILES: "",
    XML_CATALOG_FILES: "",
  }
  for (const name of ["SYSTEMROOT", "WINDIR", "TEMP", "TMP"] as const) {
    if (process.env[name]) env[name] = process.env[name]
  }
  return env
}

export const runNativeProcessForSpike: NativeProcessRunner = async (
  executablePath,
  args,
  request,
) => {
  if (!isAbsolute(executablePath) || executablePath.includes("\0")) {
    throw nativeError("native_executable_path_invalid", "O caminho do executável deve ser absoluto.")
  }

  return await new Promise<NativeProcessResult>((resolvePromise, rejectPromise) => {
    const startedAt = performance.now()
    let stdoutBytes = 0
    let stderrBytes = 0
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let settled = false
    let forcedError: NativeSpikeProcessError | null = null

    const child = spawn(executablePath, [...args], {
      cwd: request.cwd,
      env: request.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    })

    const failAndKill = (error: NativeSpikeProcessError) => {
      if (forcedError) return
      forcedError = error
      child.kill("SIGKILL")
    }

    const timer = setTimeout(() => {
      failAndKill(nativeError("native_process_timeout", "O processo xmllint excedeu o timeout."))
    }, request.timeoutMs)

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > request.maxOutputBytes) {
        failAndKill(nativeError("native_output_limit", "A saída do processo xmllint excedeu o limite."))
        return
      }
      stdout.push(chunk)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength
      if (stderrBytes > request.maxOutputBytes) {
        failAndKill(nativeError("native_output_limit", "A saída do processo xmllint excedeu o limite."))
        return
      }
      stderr.push(chunk)
    })
    child.on("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(
        nativeError(
          "native_process_spawn_failed",
          `Não foi possível iniciar o processo xmllint (${String((error as NodeJS.ErrnoException).code ?? "erro")}).`,
        ),
      )
    })
    child.on("close", (exitCode, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (forcedError) {
        rejectPromise(forcedError)
        return
      }
      resolvePromise({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        durationMs: performance.now() - startedAt,
      })
    })

    child.stdin.on("error", () => undefined)
    child.stdin.end(request.stdin ?? "")
  })
}

function assertSupportedVersion(
  version: string,
  minimumVersion: string,
  blockedVersions: readonly string[],
): void {
  if (blockedVersions.includes(version) || compareVersions(version, minimumVersion) < 0) {
    throw nativeError(
      "native_version_unsupported",
      `Versão libxml2 ${version} não autorizada para o spike nativo.`,
    )
  }
}

export async function inspectNativeXmllintSpike(
  options: NativeXmllintSpikeOptions,
): Promise<NativeXmllintInspection> {
  if (!isAbsolute(options.executablePath) || options.executablePath.includes("\0")) {
    throw nativeError("native_executable_path_invalid", "FISCAL_XMLLINT_PATH deve ser absoluto.")
  }

  let resolvedExecutablePath: string
  let executableContents: Uint8Array
  let executableBytes: number
  try {
    resolvedExecutablePath = await realpath(options.executablePath)
    const metadata = await stat(resolvedExecutablePath)
    if (!metadata.isFile()) throw new Error("not-file")
    executableBytes = metadata.size
    executableContents = await readFile(resolvedExecutablePath)
  } catch {
    throw nativeError("native_executable_missing", "Executável xmllint explícito não encontrado.")
  }

  const executableSha256 = sha256(executableContents)
  if (options.trust.mode === "provisioned") {
    if (!/^[a-f\d]{64}$/i.test(options.trust.expectedSha256)) {
      throw nativeError("native_executable_hash_required", "Hash SHA-256 provisionado é obrigatório.")
    }
    if (executableSha256 !== options.trust.expectedSha256.toLowerCase()) {
      throw nativeError("native_executable_hash_mismatch", "Hash do executável xmllint divergente.")
    }
  }

  const runner = options.runner ?? runNativeProcessForSpike
  const versionResult = await runner(resolvedExecutablePath, ["--version"], {
    env: restrictedEnvironment(),
    timeoutMs: Math.min(options.timeoutMs ?? NATIVE_SPIKE_DEFAULT_TIMEOUT_MS, 3_000),
    maxOutputBytes: Math.min(options.maxOutputBytes ?? NATIVE_SPIKE_DEFAULT_MAX_OUTPUT_BYTES, 8_192),
  })
  const version = parseXmllintVersion(`${versionResult.stdout}\n${versionResult.stderr}`)
  if (!version) {
    throw nativeError("native_version_unidentified", "Não foi possível identificar a versão do libxml2.")
  }
  assertSupportedVersion(
    version,
    options.minimumVersion ?? NATIVE_SPIKE_MINIMUM_LIBXML_VERSION,
    options.blockedVersions ?? NATIVE_SPIKE_BLOCKED_VERSIONS,
  )

  return {
    executablePath: options.executablePath,
    resolvedExecutablePath,
    executableSha256,
    executableBytes,
    version,
    versionDiscoveryMs: versionResult.durationMs,
    platform: process.platform,
    architecture: process.arch,
  }
}

function assertSchemaDependencyGraph(contents: Uint8Array): void {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(contents)
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(text)) {
    throw nativeError("native_schema_dependency_forbidden", "DTD ou entidade não autorizada no XSD.")
  }
  for (const match of text.matchAll(/schemaLocation\s*=\s*["']([^"']+)["']/g)) {
    if (!ALLOWED_SCHEMA_LOCATIONS.has(match[1])) {
      throw nativeError(
        "native_schema_dependency_forbidden",
        "Import/include XSD fora da allowlist offline.",
      )
    }
  }
}

async function materializeVerifiedSchemas(schemaDirectory: string, temporaryDirectory: string) {
  let schemaRoot: string
  try {
    const rootMetadata = await lstat(schemaDirectory)
    if (rootMetadata.isSymbolicLink()) {
      throw nativeError("native_schema_symlink_forbidden", "Diretório XSD não pode ser symlink.")
    }
    schemaRoot = await realpath(schemaDirectory)
  } catch (error) {
    if (error instanceof NativeSpikeProcessError) throw error
    throw nativeError("native_schema_missing", "Pacote XSD oficial não encontrado.")
  }

  for (const file of NATIVE_SPIKE_XSD_PACKAGE.files) {
    const sourcePath = join(schemaRoot, file.name)
    let contents: Uint8Array
    try {
      const fileMetadata = await lstat(sourcePath)
      if (fileMetadata.isSymbolicLink()) {
        throw nativeError("native_schema_symlink_forbidden", "Arquivo XSD não pode ser symlink.")
      }
      const resolvedFile = await realpath(sourcePath)
      const outsideRoot = relative(schemaRoot, resolvedFile)
      if (outsideRoot.startsWith("..") || isAbsolute(outsideRoot)) {
        throw nativeError("native_schema_dependency_forbidden", "Arquivo XSD fora do diretório permitido.")
      }
      contents = await readFile(resolvedFile)
    } catch (error) {
      if (error instanceof NativeSpikeProcessError) throw error
      throw nativeError("native_schema_missing", "Arquivo do pacote XSD oficial ausente.")
    }

    const rawHash = sha256(contents)
    const acceptedHashes = new Set([file.sha256, file.canonicalLfSha256].filter(Boolean))
    if (!acceptedHashes.has(rawHash)) {
      throw nativeError(
        "native_schema_integrity_failed",
        `Integridade do pacote XSD divergente: ${file.name}; sha256=${rawHash}.`,
      )
    }
    assertSchemaDependencyGraph(contents)
    await copyFile(sourcePath, join(temporaryDirectory, file.name))
  }
}

function preflightIssue(xml: string, maxXmlBytes: number): NativeXsdValidationIssue | null {
  if (Buffer.byteLength(xml, "utf8") > maxXmlBytes) {
    return { code: "xml_size_limit", message: `XML excede o limite de ${maxXmlBytes} bytes.` }
  }
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
    return {
      code: "xml_external_declaration_blocked",
      message: "DOCTYPE e declarações de entidade não são aceitos.",
    }
  }
  if (/\b(?:xsi:)?(?:schemaLocation|noNamespaceSchemaLocation)\s*=/i.test(xml)) {
    return {
      code: "xml_schema_hint_blocked",
      message: "Referências de schema fornecidas pelo XML não são aceitas.",
    }
  }
  return null
}

function sanitizeMessage(message: string, temporaryDirectory: string): string {
  return message
    .replaceAll(temporaryDirectory, "[diretorio-temporario]")
    .replace(/[A-Za-z]:[\\/][^\s:]+/g, "[caminho-local]")
    .replace(/\/(?:[^\s/:]+\/){2,}[^\s:]+/g, "[caminho-local]")
    .replace(/\b\d{11,44}\b/g, "[identificador-omitido]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500)
}

function mapIssues(stderr: string, temporaryDirectory: string): NativeXsdValidationIssue[] {
  const issues = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/\b(?:fails to validate|validates)\b/i.test(line))
    .slice(0, 20)
    .map((line): NativeXsdValidationIssue => {
      const location = line.match(/:(\d+)(?::(\d+))?:/)
      const message = sanitizeMessage(line, temporaryDirectory) || "XML rejeitado pelo schema oficial."
      return {
        code: /parser error|premature end|opening and ending tag mismatch/i.test(message)
          ? "xml_malformed"
          : "xsd_invalid",
        message,
        line: location ? Number(location[1]) : undefined,
        column: location?.[2] ? Number(location[2]) : undefined,
      }
    })
  return issues.length
    ? issues
    : [{ code: "xsd_invalid", message: "XML rejeitado pelo schema oficial." }]
}

export async function validateXmlWithNativeXmllintSpike(
  input: string | Uint8Array,
  options: NativeXmllintSpikeOptions,
): Promise<NativeXsdValidationResult> {
  let xml: string
  try {
    xml = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input)
  } catch {
    return {
      valid: false,
      issues: [{ code: "xml_encoding_invalid", message: "XML não está em UTF-8 válido." }],
      engine: { name: "xmllint", version: "não-inicializado" },
    }
  }

  const inputIssue = preflightIssue(
    xml,
    options.maxXmlBytes ?? NATIVE_SPIKE_DEFAULT_MAX_XML_BYTES,
  )
  if (inputIssue) {
    return {
      valid: false,
      issues: [inputIssue],
      engine: { name: "xmllint", version: "não-inicializado" },
    }
  }

  const inspection = await inspectNativeXmllintSpike(options)
  const engine: NativeXsdEngine = { name: "xmllint", version: inspection.version }
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "nfce-xmllint-native-"))
  await chmod(temporaryDirectory, 0o700)
  try {
    await materializeVerifiedSchemas(
      resolve(options.schemaDirectory ?? DEFAULT_SCHEMA_DIRECTORY),
      temporaryDirectory,
    )
    const runner = options.runner ?? runNativeProcessForSpike
    const result = await runner(
      inspection.resolvedExecutablePath,
      [
        "--noout",
        "--nonet",
        "--nocatalogs",
        "--maxmem",
        String(options.maxMemoryBytes ?? NATIVE_SPIKE_DEFAULT_MAX_MEMORY_BYTES),
        "--schema",
        ENTRYPOINT.name,
        "-",
      ],
      {
        cwd: temporaryDirectory,
        env: restrictedEnvironment(),
        stdin: xml,
        timeoutMs: options.timeoutMs ?? NATIVE_SPIKE_DEFAULT_TIMEOUT_MS,
        maxOutputBytes: options.maxOutputBytes ?? NATIVE_SPIKE_DEFAULT_MAX_OUTPUT_BYTES,
      },
    )

    if (result.exitCode === 0) return { valid: true, issues: [], engine }
    if (
      result.exitCode === 3 ||
      result.exitCode === 4 ||
      (result.exitCode === 1 && /parser error|validity error|fails to validate/i.test(result.stderr))
    ) {
      return { valid: false, issues: mapIssues(result.stderr, temporaryDirectory), engine }
    }
    if (result.exitCode === 5) {
      throw nativeError("native_schema_compile_failed", "Falha ao compilar o pacote XSD oficial.")
    }
    throw nativeError(
      "native_engine_failed",
      `xmllint encerrou com código técnico ${String(result.exitCode)}.`,
    )
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}
