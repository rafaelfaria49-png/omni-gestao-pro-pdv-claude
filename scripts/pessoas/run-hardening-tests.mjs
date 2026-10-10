#!/usr/bin/env node
/** Test command AEP PESSOAS-DP-HARDENING-P2-PRE-001B-001. */
import fs from "node:fs"
import path from "node:path"
import { runOfficialTests, reportFailure } from "./run-official-tests.mjs"

try {
  const summary = await runOfficialTests({ hardening: true })
  const evidence = process.argv.find((arg) => arg.startsWith("--evidence="))?.slice("--evidence=".length)
  if (evidence) {
    const root = path.resolve(process.cwd())
    const destino = path.resolve(root, evidence)
    const autorizado = path.join(root, "docs/ai-execution/_evidence") + path.sep
    if (!destino.startsWith(autorizado) || !destino.endsWith(".json")) throw new Error("EVIDENCIA_FORA_DA_ALLOWLIST")
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, JSON.stringify(summary, null, 2) + "\n")
  }
} catch (error) {
  reportFailure(error)
}
