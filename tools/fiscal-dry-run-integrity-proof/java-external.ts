/**
 * Verificador externo Java 17 (JSR 105) — reutiliza tools/fiscal-c14n-proof do GOAL-003.
 * Offline: somente javac/java locais; zero rede; zero SEFAZ.
 */

import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

export type JavaExternalReport = {
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

export type JavaExternalResult = {
  ok: boolean
  report: JavaExternalReport
  workDir: string
}

let cachedClassesDir: string | null = null

function run(command: string, args: string[], cwd?: string): string {
  const result = spawnSync(command, args, {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(`${command} falhou (${result.status}): ${result.stderr || result.stdout}`)
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`
}

/** Compila (uma vez por processo) o verificador Java do GOAL-003. */
export function ensureJavaVerifierClasses(repoRoot = process.cwd()): string {
  if (cachedClassesDir && existsSync(join(cachedClassesDir, "FiscalXmlDsigVerifier.class"))) {
    return cachedClassesDir
  }
  const javaSource = resolve(repoRoot, "tools/fiscal-c14n-proof/src/FiscalXmlDsigVerifier.java")
  if (!existsSync(javaSource)) {
    throw new Error("FiscalXmlDsigVerifier.java ausente (GOAL-003).")
  }
  const classesDir = mkdtempSync(join(tmpdir(), "fiscal-005-java-classes-"))
  run("javac", ["--release", "17", "-d", classesDir, javaSource])
  cachedClassesDir = classesDir
  return classesDir
}

/**
 * Verifica XML assinado com o verificador Java 17 independente.
 * Escreve apenas em diretório temporário (efêmero).
 */
export function verifySignedXmlExternalJava(
  signedXml: string,
  options: { repoRoot?: string; label?: string; retainDir?: string } = {},
): JavaExternalResult {
  const classesDir = ensureJavaVerifierClasses(options.repoRoot)
  const workDir =
    options.retainDir ??
    mkdtempSync(join(tmpdir(), `fiscal-005-java-${options.label ?? "run"}-`))
  mkdirSync(workDir, { recursive: true })
  const xmlPath = join(workDir, "input.xml")
  writeFileSync(xmlPath, signedXml, "utf8")
  run("java", ["-cp", classesDir, "FiscalXmlDsigVerifier", xmlPath, workDir])
  const report = JSON.parse(readFileSync(join(workDir, "report.json"), "utf8")) as JavaExternalReport
  return {
    ok: report.valid === true && report.coreValid !== false && report.digestMatches !== false,
    report,
    workDir,
  }
}

export function cleanupTempDir(dir: string): void {
  const resolved = resolve(dir)
  if (resolved.startsWith(resolve(tmpdir()))) {
    rmSync(resolved, { recursive: true, force: true })
  }
}
