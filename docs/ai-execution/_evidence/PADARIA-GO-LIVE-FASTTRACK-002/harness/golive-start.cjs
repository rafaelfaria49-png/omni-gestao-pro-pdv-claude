// GO-LIVE padaria: credenciais SINTÉTICAS de teste (só PG descartável 55443), seed e `next start` local.
// Uso: node golive-start.cjs seed | serve     (valores em golive.env no scratchpad; nunca impressos)
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto")
const { spawnSync, spawn } = require("node:child_process")
const WT = "C:/Projetos/omni-gestao/.worktrees/estoque-manual-kg-001"
const ENVF = path.join(__dirname, "golive.env")
const DB = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:55443/platform_pilot_isolated"
if (!fs.existsSync(ENVF)) {
  const pw = () => "aA1!" + crypto.randomBytes(18).toString("hex")
  fs.writeFileSync(ENVF, [
    "GOLIVE_DONO_PASSWORD=" + pw(), "GOLIVE_CAIXA_PASSWORD=" + pw(),
    "GOLIVE_SUPERVISOR_PIN=" + String(crypto.randomInt(10_000_000, 100_000_000)),
    "GOLIVE_AUTH_SECRET=" + pw(), ""].join("\n"), { flag: "wx" })
}
const g = Object.fromEntries(fs.readFileSync(ENVF, "utf8").split(/\r?\n/).filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
const env = { ...process.env, ...g, DATABASE_URL: DB, DIRECT_URL: DB, MIGRATION_AUTHORITY_ENABLED: "false", VERCEL: "0", NEXT_TELEMETRY_DISABLED: "1" }
const phase = process.argv[2]
if (phase === "seed") {
  const r = spawnSync(process.execPath, ["--import", "tsx", "test-results/pp-local/golive/seed-golive.mjs"], { cwd: WT, env, encoding: "utf8" })
  process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status)
}
if (phase === "test") {
  const r = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "test-results/pp-local/golive/golive.playwright.config.ts", ...process.argv.slice(3)], { cwd: WT, env, encoding: "utf8" })
  const red = (s) => Object.values(g).reduce((o, v) => o.split(v).join("[REDACTED]"), String(s || ""))
  process.stdout.write(red(r.stdout)); process.stderr.write(red(r.stderr)); process.exit(r.status)
}
if (phase === "serve") {
  const origin = "http://localhost:3000"
  const s = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "localhost", "-p", "3000"], {
    cwd: WT, stdio: "inherit",
    env: { ...env, NODE_ENV: "production", AUTH_SECRET: g.GOLIVE_AUTH_SECRET, AUTH_TRUST_HOST: "true", NEXTAUTH_URL: origin },
  })
  s.on("exit", (c) => process.exit(c ?? 0))
}
