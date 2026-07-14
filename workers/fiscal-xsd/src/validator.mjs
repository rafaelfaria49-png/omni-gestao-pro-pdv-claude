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
import { tmpdir } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const POLICY = Object.freeze({
  contractVersion: "1.0",
  schemaPackage: "PL_010e_v1.02/NFe/nfe_v4.00.xsd",
  schemaManifestHash: "fc42d03e1c4a676d5ea5fe813cd2941672caa18540856cac5208ccdff049cae1",
  libxml2Version: "2.15.3",
  maxPayloadBytes: 2 * 1024 * 1024,
  maxOutputBytes: 64 * 1024,
  timeoutMs: 3_000,
  concurrency: 1,
})

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(HERE, "..")

export class FiscalXsdWorkerError extends Error {
  constructor(code, outcome, message, retryable = false) {
    super(message)
    this.name = "FiscalXsdWorkerError"
    this.code = code
    this.outcome = outcome
    this.retryable = retryable
  }
}

function workerError(code, outcome, message, retryable = false) {
  return new FiscalXsdWorkerError(code, outcome, message, retryable)
}

export function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex")
}

function parseHashFile(contents, expectedName) {
  const match = contents.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i)
  if (!match || basename(match[2]) !== expectedName) {
    throw workerError(
      "integrity_manifest_invalid",
      "HASH_DIVERGENTE",
      "Manifesto de integridade inválido.",
    )
  }
  return match[1].toLowerCase()
}

function parseLibxmlVersion(output) {
  const numeric = output.match(/(?:using\s+)?libxml version\s+(\d{5,6})/i)?.[1]
  if (numeric) {
    const padded = numeric.padStart(5, "0")
    return `${Number(padded.slice(0, -4))}.${Number(padded.slice(-4, -2))}.${Number(padded.slice(-2))}`
  }
  return output.match(/(?:libxml|xmllint)[^\d]*(\d+\.\d+\.\d+)/i)?.[1] ?? null
}

function restrictedEnvironment(temporaryDirectory) {
  return {
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    HOME: temporaryDirectory,
    TMPDIR: temporaryDirectory,
    PATH: "",
    SGML_CATALOG_FILES: "",
    XML_CATALOG_FILES: "",
  }
}

export async function runProcess(executablePath, args, request) {
  if (!isAbsolute(executablePath) || executablePath.includes("\0")) {
    throw workerError(
      "binary_path_invalid",
      "VERSAO_NAO_PERMITIDA",
      "Caminho absoluto do xmllint é obrigatório.",
    )
  }

  return await new Promise((resolvePromise, rejectPromise) => {
    const startedAt = performance.now()
    const stdout = []
    const stderr = []
    let outputBytes = 0
    let settled = false
    let forcedError = null

    const child = spawn(executablePath, [...args], {
      cwd: request.cwd,
      env: request.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    })

    const stop = (error) => {
      if (forcedError) return
      forcedError = error
      child.kill("SIGKILL")
    }

    const timer = setTimeout(() => {
      stop(workerError("xmllint_timeout", "TIMEOUT", "xmllint excedeu o timeout externo.", true))
    }, request.timeoutMs)

    const collect = (target, chunk) => {
      outputBytes += chunk.byteLength
      if (outputBytes > request.maxOutputBytes) {
        stop(
          workerError(
            "xmllint_output_limit",
            "FALHA_PERMANENTE",
            "Saída do xmllint excedeu o limite permitido.",
          ),
        )
        return
      }
      target.push(chunk)
    }

    child.stdout.on("data", (chunk) => collect(stdout, chunk))
    child.stderr.on("data", (chunk) => collect(stderr, chunk))
    child.on("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(
        workerError(
          "xmllint_spawn_failed",
          "FALHA_TRANSITORIA",
          `Não foi possível iniciar xmllint (${String(error?.code ?? "erro")}).`,
          true,
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

function assertClosedDependencyGraph(contents, allowedNames) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(contents)
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(text)) {
    throw workerError(
      "schema_external_declaration",
      "HASH_DIVERGENTE",
      "DTD ou entidade não autorizada no pacote XSD.",
    )
  }
  for (const match of text.matchAll(/schemaLocation\s*=\s*["']([^"']+)["']/g)) {
    const location = match[1]
    if (
      !allowedNames.has(location) ||
      location.includes("..") ||
      isAbsolute(location) ||
      /^(?:https?|file):/i.test(location)
    ) {
      throw workerError(
        "schema_dependency_forbidden",
        "HASH_DIVERGENTE",
        "Import/include fora da allowlist local.",
      )
    }
  }
}

async function readRegularFileInside(root, path, missingCode) {
  let rootReal
  try {
    const rootInfo = await lstat(root)
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error("invalid-root")
    rootReal = await realpath(root)
    const info = await lstat(path)
    if (info.isSymbolicLink() || !info.isFile()) {
      throw workerError(
        "symlink_escape",
        "HASH_DIVERGENTE",
        "Symlink não permitido em artefato do worker.",
      )
    }
    const pathReal = await realpath(path)
    const rel = relative(rootReal, pathReal)
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw workerError(
        "path_escape",
        "HASH_DIVERGENTE",
        "Artefato fora da raiz allowlisted.",
      )
    }
    return await readFile(pathReal)
  } catch (error) {
    if (error instanceof FiscalXsdWorkerError) throw error
    throw workerError(missingCode, "PACOTE_XSD_AUSENTE", "Artefato obrigatório do worker ausente.")
  }
}

export function preflightXml(xml, maxPayloadBytes = POLICY.maxPayloadBytes) {
  if (typeof xml !== "string" || xml.trim() === "") {
    return {
      code: "xml_empty",
      category: "XML_SYNTAX",
      message: "XML ausente para validação XSD.",
      outcome: "XML_MALFORMADO",
    }
  }
  if (Buffer.byteLength(xml, "utf8") > maxPayloadBytes) {
    return {
      code: "xml_size_limit",
      category: "POLICY",
      message: `XML excede o limite de ${maxPayloadBytes} bytes.`,
      outcome: "POLITICA_REJEITADA",
    }
  }
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
    return {
      code: "xml_external_declaration_blocked",
      category: "POLICY",
      message: "DOCTYPE e declarações de entidade são proibidos.",
      outcome: "POLITICA_REJEITADA",
    }
  }
  if (/\b(?:xsi:)?(?:schemaLocation|noNamespaceSchemaLocation)\s*=/i.test(xml)) {
    return {
      code: "xml_schema_hint_blocked",
      category: "POLICY",
      message: "Referências de schema fornecidas pelo XML são proibidas.",
      outcome: "POLITICA_REJEITADA",
    }
  }
  if (/\b(?:href|src)\s*=\s*["'](?:https?:|file:|\/|\.\.)/i.test(xml) || /file:\/\//i.test(xml)) {
    return {
      code: "xml_external_reference_blocked",
      category: "POLICY",
      message: "Referência externa ou caminho local no XML é proibido.",
      outcome: "POLITICA_REJEITADA",
    }
  }
  return null
}

export function sanitizeMessage(message, sensitivePaths = []) {
  let sanitized = String(message ?? "")
  for (const path of sensitivePaths.filter(Boolean)) {
    sanitized = sanitized.replaceAll(path, "[caminho-isolado]")
  }
  return sanitized
    .replace(/[A-Za-z]:[\\/][^\s:]+/g, "[caminho-local]")
    .replace(/\/(?:[^\s/:]+\/){2,}[^\s:]+/g, "[caminho-local]")
    .replace(/<[^>]{0,500}>/g, "[xml-omitido]")
    .replace(/\b\d{11,44}\b/g, "[identificador-omitido]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500)
}

function mapIssues(stderr, temporaryDirectory) {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/\b(?:fails to validate|validates)\b/i.test(line))
    .slice(0, 20)

  const malformed = lines.some((line) =>
    /parser error|premature end|opening and ending tag mismatch|document is empty/i.test(line),
  )
  const issues = lines.map((line) => {
    const location = line.match(/:(\d+)(?::(\d+))?:/)
    return {
      code: malformed ? "xml_malformed" : "xsd_invalid",
      category: malformed ? "XML_SYNTAX" : "XSD_VALIDATION",
      message:
        sanitizeMessage(line, [temporaryDirectory]) ||
        (malformed ? "XML malformado." : "XML rejeitado pelo schema oficial."),
      line: location ? Number(location[1]) : undefined,
      column: location?.[2] ? Number(location[2]) : undefined,
      schemaPath: line.match(/([^/\\\s:]+\.xsd)/i)?.[1],
      retryable: false,
    }
  })
  return {
    outcome: malformed ? "XML_MALFORMADO" : "XML_INVALIDO",
    issues: issues.length
      ? issues
      : [
          {
            code: "xsd_invalid",
            category: "XSD_VALIDATION",
            message: "XML rejeitado pelo schema oficial.",
            retryable: false,
          },
        ],
  }
}

export function createFiscalXsdValidator(options = {}) {
  const root = resolve(options.root ?? DEFAULT_ROOT)
  const xmllintPath = resolve(options.xmllintPath ?? "/opt/fiscal-xsd/bin/xmllint")
  const schemaRoot = resolve(
    options.schemaRoot ?? join(root, "schemas", "PL_010e_v1.02", "NFe"),
  )
  const manifestPath = resolve(options.manifestPath ?? join(root, "manifest", "manifest.json"))
  const manifestHashPath = resolve(
    options.manifestHashPath ?? join(root, "manifest", "manifest.sha256"),
  )
  const binaryHashPath = resolve(
    options.binaryHashPath ?? join(root, "manifest", "binary.sha256"),
  )
  const processRunner = options.processRunner ?? runProcess

  async function inspectIntegrity() {
    const manifestBytes = await readRegularFileInside(
      dirname(manifestPath),
      manifestPath,
      "schema_manifest_missing",
    )
    const manifestHashBytes = await readRegularFileInside(
      dirname(manifestHashPath),
      manifestHashPath,
      "schema_manifest_hash_missing",
    )
    const expectedManifestHash = parseHashFile(
      manifestHashBytes.toString("utf8"),
      basename(manifestPath),
    )
    const actualManifestHash = sha256(manifestBytes)
    if (actualManifestHash !== expectedManifestHash) {
      throw workerError(
        "schema_manifest_hash_mismatch",
        "HASH_DIVERGENTE",
        "Hash do manifesto XSD divergente.",
      )
    }

    let manifest
    try {
      manifest = JSON.parse(manifestBytes.toString("utf8"))
    } catch {
      throw workerError(
        "schema_manifest_invalid",
        "HASH_DIVERGENTE",
        "Manifesto XSD não é JSON válido.",
      )
    }
    if (manifest.schemaPackage !== "PL_010e_v1.02" || manifest.entrypoint !== "nfe_v4.00.xsd") {
      throw workerError(
        "schema_version_forbidden",
        "VERSAO_NAO_PERMITIDA",
        "Pacote XSD não autorizado.",
      )
    }
    const allowedNames = new Set(manifest.files.map((file) => file.name))
    if (allowedNames.size !== 5) {
      throw workerError(
        "schema_file_set_invalid",
        "HASH_DIVERGENTE",
        "Manifesto deve conter exatamente cinco XSDs.",
      )
    }
    const schemaContents = new Map()
    for (const file of manifest.files) {
      const contents = await readRegularFileInside(
        schemaRoot,
        join(schemaRoot, file.name),
        "schema_file_missing",
      )
      if (contents.byteLength !== file.bytes || sha256(contents) !== file.sha256) {
        throw workerError(
          "schema_file_hash_mismatch",
          "HASH_DIVERGENTE",
          `Integridade XSD divergente: ${file.name}.`,
        )
      }
      assertClosedDependencyGraph(contents, allowedNames)
      schemaContents.set(file.name, contents)
    }

    let binaryInfo
    let binaryBytes
    try {
      binaryInfo = await lstat(xmllintPath)
      if (binaryInfo.isSymbolicLink() || !binaryInfo.isFile()) throw new Error("not-file")
      binaryBytes = await readFile(await realpath(xmllintPath))
    } catch {
      throw workerError(
        "xmllint_missing",
        "FALHA_PERMANENTE",
        "Binário xmllint provisionado ausente.",
      )
    }
    const binaryHashBytes = await readRegularFileInside(
      dirname(binaryHashPath),
      binaryHashPath,
      "xmllint_hash_missing",
    )
    const expectedBinaryHash = parseHashFile(
      binaryHashBytes.toString("utf8"),
      basename(xmllintPath),
    )
    const actualBinaryHash = sha256(binaryBytes)
    if (actualBinaryHash !== expectedBinaryHash) {
      throw workerError(
        "xmllint_hash_mismatch",
        "HASH_DIVERGENTE",
        "Hash do binário xmllint divergente.",
      )
    }

    const versionProbeDirectory = await mkdtemp(join(tmpdir(), "fiscal-xsd-version-"))
    try {
      const versionResult = await processRunner(xmllintPath, ["--version"], {
        cwd: versionProbeDirectory,
        env: restrictedEnvironment(versionProbeDirectory),
        timeoutMs: Math.min(POLICY.timeoutMs, 1_500),
        maxOutputBytes: 8_192,
      })
      const version = parseLibxmlVersion(`${versionResult.stdout}\n${versionResult.stderr}`)
      if (version !== POLICY.libxml2Version) {
        throw workerError(
          "xmllint_version_forbidden",
          "VERSAO_NAO_PERMITIDA",
          "Versão do libxml2/xmllint não autorizada.",
        )
      }
      return {
        manifest,
        schemaContents,
        engine: {
          name: "xmllint",
          xmllintVersion: version,
          libxml2Version: version,
          binaryHash: actualBinaryHash,
          schemaPackage: POLICY.schemaPackage,
          schemaManifestHash: actualManifestHash,
        },
      }
    } finally {
      await rm(versionProbeDirectory, { recursive: true, force: true })
    }
  }

  async function validate(xml, requestOptions = {}) {
    const startedAt = performance.now()
    let integrity = null
    let temporaryDirectory = null
    try {
      integrity = await inspectIntegrity()
      const inputIssue = preflightXml(
        xml,
        Math.min(requestOptions.maxPayloadBytes ?? POLICY.maxPayloadBytes, POLICY.maxPayloadBytes),
      )
      if (inputIssue) {
        return {
          valid: false,
          outcome: inputIssue.outcome,
          issues: [{
            code: inputIssue.code,
            category: inputIssue.category,
            message: inputIssue.message,
            retryable: false,
          }],
          engine: integrity.engine,
          durationMs: performance.now() - startedAt,
        }
      }

      temporaryDirectory = await mkdtemp(join(tmpdir(), "fiscal-xsd-job-"))
      await chmod(temporaryDirectory, 0o700)
      for (const [name, contents] of integrity.schemaContents) {
        const source = join(schemaRoot, name)
        const destination = join(temporaryDirectory, name)
        await copyFile(source, destination)
        if (sha256(await readFile(destination)) !== sha256(contents)) {
          throw workerError(
            "schema_copy_hash_mismatch",
            "HASH_DIVERGENTE",
            "Falha de integridade ao materializar XSD.",
          )
        }
      }

      const schemaPath = join(temporaryDirectory, integrity.manifest.entrypoint)
      const result = await processRunner(
        xmllintPath,
        ["--noout", "--nonet", "--nocatalogs", "--schema", schemaPath, "-"],
        {
          cwd: temporaryDirectory,
          env: restrictedEnvironment(temporaryDirectory),
          stdin: xml,
          timeoutMs: Math.min(requestOptions.timeoutMs ?? POLICY.timeoutMs, POLICY.timeoutMs),
          maxOutputBytes: Math.min(
            requestOptions.maxOutputBytes ?? POLICY.maxOutputBytes,
            POLICY.maxOutputBytes,
          ),
        },
      )
      if (result.exitCode === 0) {
        return {
          valid: true,
          outcome: "VALIDACAO_APROVADA",
          issues: [],
          engine: integrity.engine,
          durationMs: performance.now() - startedAt,
        }
      }
      if ([1, 3, 4].includes(result.exitCode)) {
        const mapped = mapIssues(result.stderr, temporaryDirectory)
        return {
          valid: false,
          outcome: mapped.outcome,
          issues: mapped.issues,
          engine: integrity.engine,
          durationMs: performance.now() - startedAt,
        }
      }
      if (result.exitCode === 5) {
        throw workerError(
          "schema_compile_failed",
          "PACOTE_XSD_AUSENTE",
          "Falha ao compilar o pacote XSD oficial local.",
        )
      }
      throw workerError(
        "xmllint_engine_failed",
        "FALHA_PERMANENTE",
        `xmllint encerrou com código técnico ${String(result.exitCode)}.`,
      )
    } catch (error) {
      const known =
        error instanceof FiscalXsdWorkerError
          ? error
          : workerError(
              "worker_unexpected_error",
              "RESPOSTA_INCERTA",
              "Falha interna inconclusiva no worker XSD.",
            )
      return {
        valid: false,
        outcome: known.outcome,
        issues: [
          {
            code: known.code,
            category:
              known.outcome === "HASH_DIVERGENTE" ? "INTEGRITY" : "INFRASTRUCTURE",
            message: sanitizeMessage(known.message, [temporaryDirectory, schemaRoot, root]),
            retryable: known.retryable,
          },
        ],
        engine: integrity?.engine ?? null,
        durationMs: performance.now() - startedAt,
      }
    } finally {
      if (temporaryDirectory) {
        await rm(temporaryDirectory, { recursive: true, force: true })
      }
    }
  }

  return { inspectIntegrity, validate }
}
