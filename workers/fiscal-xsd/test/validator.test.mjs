import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  POLICY,
  createFiscalXsdValidator,
  preflightXml,
  runProcess,
  sanitizeMessage,
} from "../src/validator.mjs"
import { XSD_FIXTURE_SCENARIOS, oversizedNfceXml } from "../../../lib/fiscal/xsd/__fixtures__/nfce-xsd-fixtures"

const REPO = resolve(import.meta.dirname, "../../..")
const OFFICIAL = join(REPO, "lib", "fiscal", "xsd")
const temporaryRoots = []
afterEach(async () => Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

async function environment(processRunner) {
  const root = await mkdtemp(join(tmpdir(), "fiscal-xsd-unit-"))
  temporaryRoots.push(root)
  const manifestDirectory = join(root, "manifest")
  const schemaRoot = join(root, "schemas", "PL_010e_v1.02", "NFe")
  const binaryDirectory = join(root, "bin")
  await Promise.all([mkdir(manifestDirectory, { recursive: true }), mkdir(schemaRoot, { recursive: true }), mkdir(binaryDirectory)])
  for (const name of ["manifest.json", "manifest.sha256"]) await copyFile(join(OFFICIAL, name), join(manifestDirectory, name))
  const manifest = JSON.parse(await readFile(join(OFFICIAL, "manifest.json"), "utf8"))
  for (const file of manifest.files) await copyFile(join(OFFICIAL, "schemas", "PL_010e_v1.02", "NFe", file.name), join(schemaRoot, file.name))
  const xmllintPath = join(binaryDirectory, "xmllint")
  const bytes = Buffer.from("synthetic-test-binary")
  await writeFile(xmllintPath, bytes)
  await writeFile(join(manifestDirectory, "binary.sha256"), `${createHash("sha256").update(bytes).digest("hex")}  xmllint\n`)
  const runner = processRunner ?? (async (_path, args, request) => {
    if (args[0] === "--version") return { exitCode: 0, signal: null, stdout: "", stderr: "xmllint: using libxml version 21503", durationMs: 1 }
    return request.stdin.includes("INVALID")
      ? { exitCode: 3, signal: null, stdout: "", stderr: "-:1: element INVALID: Schemas validity error : Element invalid", durationMs: 1 }
      : { exitCode: 0, signal: null, stdout: "", stderr: "", durationMs: 1 }
  })
  return {
    root, schemaRoot, xmllintPath, manifestDirectory,
    validator: createFiscalXsdValidator({ root, schemaRoot, xmllintPath, manifestPath: join(manifestDirectory, "manifest.json"), manifestHashPath: join(manifestDirectory, "manifest.sha256"), binaryHashPath: join(manifestDirectory, "binary.sha256"), processRunner: runner }),
  }
}

describe("worker XSD: integridade e políticas", () => {
  it("verifica versão, binário, manifesto e cinco schemas", async () => {
    const env = await environment()
    const inspection = await env.validator.inspectIntegrity()
    expect(inspection.engine.libxml2Version).toBe("2.15.3")
    expect(inspection.engine.schemaManifestHash).toBe(POLICY.schemaManifestHash)
    expect(inspection.schemaContents.size).toBe(5)
  })

  it("classifica versão bloqueada, hash divergente, XSD e binário ausentes", async () => {
    const blocked = await environment(async (_path, args) => args[0] === "--version"
      ? { exitCode: 0, signal: null, stdout: "", stderr: "using libxml version 21400", durationMs: 1 }
      : { exitCode: 0, signal: null, stdout: "", stderr: "", durationMs: 1 })
    expect((await blocked.validator.validate("<NFe/>" )).outcome).toBe("VERSAO_NAO_PERMITIDA")

    const hash = await environment()
    await writeFile(join(hash.schemaRoot, "nfe_v4.00.xsd"), "changed")
    expect((await hash.validator.validate("<NFe/>" )).outcome).toBe("HASH_DIVERGENTE")

    const missingSchema = await environment()
    await rm(join(missingSchema.schemaRoot, "nfe_v4.00.xsd"))
    expect((await missingSchema.validator.validate("<NFe/>" )).outcome).toBe("PACOTE_XSD_AUSENTE")

    const missingBinary = await environment()
    await rm(missingBinary.xmllintPath)
    expect((await missingBinary.validator.validate("<NFe/>" )).outcome).toBe("FALHA_PERMANENTE")
  })

  it.runIf(process.platform !== "win32")("bloqueia symlink no pacote", async () => {
    const env = await environment()
    const path = join(env.schemaRoot, "nfe_v4.00.xsd")
    await rm(path)
    await symlink(join(OFFICIAL, "schemas", "PL_010e_v1.02", "NFe", "nfe_v4.00.xsd"), path)
    expect((await env.validator.validate("<NFe/>" )).outcome).toBe("HASH_DIVERGENTE")
  })

  it("rejeita DTD, referências externas, traversal e payload grande antes do processo", () => {
    expect(preflightXml('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x/>')?.outcome).toBe("POLITICA_REJEITADA")
    expect(preflightXml('<x href="https://invalid.example"/>')?.code).toBe("xml_external_reference_blocked")
    expect(preflightXml('<x href="../../etc/passwd"/>')?.code).toBe("xml_external_reference_blocked")
    expect(preflightXml(oversizedNfceXml())?.code).toBe("xml_size_limit")
  })

  it("usa argumentos fixos e XML apenas em stdin", async () => {
    const calls = []
    const env = await environment(async (path, args, request) => {
      calls.push({ path, args, stdin: request.stdin })
      return args[0] === "--version"
        ? { exitCode: 0, signal: null, stdout: "", stderr: "using libxml version 21503", durationMs: 1 }
        : { exitCode: 0, signal: null, stdout: "", stderr: "", durationMs: 1 }
    })
    const payload = '<NFe><x>$(touch /tmp/probe); --version</x></NFe>'
    expect((await env.validator.validate(payload)).valid).toBe(true)
    const validation = calls.at(-1)
    expect(validation.args.slice(0, 3)).toEqual(["--noout", "--nonet", "--nocatalogs"])
    expect(validation.args).not.toContain(payload)
    expect(validation.stdin).toBe(payload)
  })

  it("sanitiza caminho, XML e identificador fiscal", () => {
    const message = sanitizeMessage('C:\\secret\\job\\a.xml: <CNPJ>12345678901234</CNPJ>')
    expect(message).not.toContain("secret")
    expect(message).not.toContain("CNPJ")
    expect(message).not.toContain("12345678901234")
  })

  it("impõe timeout e saída agregada ao processo", async () => {
    await expect(runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: tmpdir(), env: {}, timeoutMs: 50, maxOutputBytes: 1024 })).rejects.toMatchObject({ outcome: "TIMEOUT" })
    await expect(runProcess(process.execPath, ["-e", "process.stderr.write('x'.repeat(5000))"], { cwd: tmpdir(), env: {}, timeoutMs: 1000, maxOutputBytes: 256 })).rejects.toMatchObject({ code: "xmllint_output_limit" })
  })

  it("mantém exatamente os 24 cenários obrigatórios", () => {
    expect(XSD_FIXTURE_SCENARIOS).toHaveLength(24)
    expect(new Set(XSD_FIXTURE_SCENARIOS).size).toBe(24)
  })
})
