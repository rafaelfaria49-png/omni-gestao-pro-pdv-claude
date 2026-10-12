#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { runOfficialTests, reportFailure } from "./run-official-tests.mjs"
try {
  const summary = await runOfficialTests({ hardening: true, frontend: true })
  const evidence = path.resolve("docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/runner.json")
  fs.mkdirSync(path.dirname(evidence), { recursive: true })
  fs.writeFileSync(evidence, JSON.stringify(summary, null, 2) + "\n")
} catch (error) { reportFailure(error) }
