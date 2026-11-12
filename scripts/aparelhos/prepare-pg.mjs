#!/usr/bin/env node
/**
 * OMNI-APARELHOS-ENDTOEND-001 — prepara um PostgreSQL DESCARTÁVEL para os testes de integração.
 *
 * 1. Baseline = schema da base (`APARELHOS_BASE_REF`, default origin/main) via `prisma migrate diff --from-empty`.
 * 2. Aplica a migration aditiva `20261110120000_aparelhos_fisicos_serializados/migration.sql` (prova a migration).
 * 3. Confere drift ZERO entre o banco e `prisma/schema.prisma` da branch.
 *
 * Recusa qualquer host que não seja loopback (nunca toca Production).
 * Uso: APARELHOS_TEST_DATABASE_URL=postgresql://user@127.0.0.1:55471/aparelhos_pg node scripts/aparelhos/prepare-pg.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const url = (process.env.APARELHOS_TEST_DATABASE_URL ?? "").trim()
if (!url) throw new Error("BLOQUEIO_EXPLICITO_PG: defina APARELHOS_TEST_DATABASE_URL (PostgreSQL descartável).")
const host = new URL(url).hostname.toLowerCase()
if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("BLOQUEIO_EXPLICITO_PG: somente loopback.")

const baseRef = process.env.APARELHOS_BASE_REF || "origin/main"
const migration = "prisma/migrations/20261110120000_aparelhos_fisicos_serializados/migration.sql"
const prisma = process.platform === "win32" ? "npx.cmd" : "npx"
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url }
const run = (args, opts = {}) => execFileSync(prisma, ["prisma", ...args], { env, stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32", ...opts }).toString()

const dir = mkdtempSync(join(tmpdir(), "aparelhos-pg-"))
try {
  const baseSchema = execFileSync("git", ["show", `${baseRef}:prisma/schema.prisma`]).toString()
  writeFileSync(join(dir, "base.prisma"), baseSchema)
  // Banco precisa estar vazio: recria o schema public.
  writeFileSync(join(dir, "reset.sql"), "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
  run(["db", "execute", "--url", url, "--file", join(dir, "reset.sql")])
  const baseline = run(["migrate", "diff", "--from-empty", "--to-schema-datamodel", join(dir, "base.prisma"), "--script"])
  writeFileSync(join(dir, "baseline.sql"), baseline)
  run(["db", "execute", "--url", url, "--file", join(dir, "baseline.sql")])
  console.log(`BASELINE_OK (${baseRef})`)
  run(["db", "execute", "--url", url, "--file", migration])
  console.log("MIGRATION_OK")
  const drift = run(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--script"])
  const statements = drift.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"))
  if (statements.length > 0) {
    console.error(drift)
    throw new Error("DRIFT: banco migrado difere do schema da branch.")
  }
  console.log("DRIFT_ZERO")
} finally {
  rmSync(dir, { recursive: true, force: true })
}
