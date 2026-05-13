/**
 * Executa o CLI do Playwright com cwd na raiz e IPv4-first.
 * Remove `SKIP_WEBSERVER` herdado do shell (ex.: PowerShell de IDE) para `npm run test:e2e`
 * arrancar sempre o `webServer` do config — use `PLAYWRIGHT_E2E_SKIP_WEBSERVER=1` para omitir.
 */
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(root)

delete process.env.SKIP_WEBSERVER

const cli = join(root, "node_modules", "@playwright", "test", "cli.js")
const passArgs = process.argv.slice(2)

const result = spawnSync(process.execPath, ["--dns-result-order=ipv4first", cli, ...passArgs], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
  shell: false,
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 1)
