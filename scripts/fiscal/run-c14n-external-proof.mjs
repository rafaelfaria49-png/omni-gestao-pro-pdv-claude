import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const vitestEntrypoint = fileURLToPath(new URL("../../node_modules/vitest/vitest.mjs", import.meta.url))
const proofTest = fileURLToPath(
  new URL("../../lib/fiscal/signing/c14n-external-proof.test.ts", import.meta.url),
)

const result = spawnSync(process.execPath, [vitestEntrypoint, "run", proofTest, "--no-cache"], {
  cwd: process.cwd(),
  env: { ...process.env, FISCAL_C14N_EXTERNAL_PROOF: "1" },
  stdio: "inherit",
  windowsHide: true,
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
