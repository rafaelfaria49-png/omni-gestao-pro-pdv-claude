// Supplemental checks for a checkout without local dependencies.
// This does not replace the canonical commands recorded in VALIDATION.md.
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { readdirSync, writeFileSync } from "node:fs"

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, "../../../..").replaceAll("\\", "/")
const shared = resolve(process.argv[2] ?? root).replaceAll("\\", "/")
const mode = process.argv[3] ?? "focused"
const dependencies = createRequire(resolve(shared, "package.json"))

if (mode === "focused") {
  const { startVitest } = await import(pathToFileURL(dependencies.resolve("vitest/node")).href)
  const context = await startVitest("test", ["lib/fiscal/archive-offline"], {
    root, config: false, watch: false, cache: false, reporters: ["default", "json"],
    outputFile: { json: resolve(evidence, "focused-tests.json") },
  }, {
    root, configFile: false, cacheDir: root + "/lib/fiscal/archive-offline/node_modules/.vite",
    resolve: { alias: {
      vitest: resolve(dirname(dependencies.resolve("vitest/node")), "index.js"),
      typescript: dependencies.resolve("typescript"),
    }},
    test: { environment: "node", include: ["lib/fiscal/archive-offline/**/*.test.ts"], watch: false },
  })
  await context.close()
} else if (mode === "types" || mode === "global-types") {
  const ts = dependencies("typescript")
  const map = (input) => {
    const path = input.replaceAll("\\", "/")
    for (const sub of ["/node_modules/", "/generated/prisma/"]) if (path.startsWith(root + sub)) return shared + path.slice(root.length)
    for (const sub of ["/node_modules", "/generated", "/generated/prisma"]) if (path === root + sub) return shared + sub
    return input
  }
  const host = ts.createCompilerHost({})
  for (const name of ["fileExists", "readFile", "directoryExists", "getDirectories", "realpath"]) {
    const original = host[name]
    if (original) host[name] = (path, ...args) => original(map(path), ...args)
  }
  const config = ts.readConfigFile(root + "/tsconfig.json", host.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  parsed.options.incremental = false
  const files = mode === "global-types" ? parsed.fileNames : readdirSync(root + "/lib/fiscal/archive-offline")
    .filter((file) => file.endsWith(".ts")).map((file) => root + "/lib/fiscal/archive-offline/" + file)
  const program = ts.createProgram(files, parsed.options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program).map((item) => ({
    file: item.file?.fileName.replaceAll("\\", "/").replace(root + "/", "") ?? null,
    code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, " "),
  }))
  const report = { mode, files: files.length, diagnosticCount: diagnostics.length, diagnostics }
  writeFileSync(resolve(evidence, mode + ".json"), JSON.stringify(report, null, 2) + "\n", "utf8")
  console.log(mode + ": files=" + files.length + " diagnostics=" + diagnostics.length)
  process.exitCode = diagnostics.length ? 1 : 0
} else {
  throw new Error("UNKNOWN_SUPPLEMENTAL_CHECK")
}
