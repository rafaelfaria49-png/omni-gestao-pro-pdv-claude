#!/usr/bin/env node
/**
 * OMNI-APARELHOS-ENDTOEND-001 — prepara um PostgreSQL DESCARTÁVEL para os testes de integração.
 *
 * 1. Baseline = schema da base (`APARELHOS_BASE_REF`, default origin/main) via `prisma migrate diff --from-empty`
 *    — mas no ponto IMEDIATAMENTE ANTERIOR à migration de aparelhos. Depois do merge do #347 a base já
 *    tem as tabelas; usar o schema atual da base e reaplicar a migration recriaria `aparelhos_fisicos`,
 *    e pular a migration perderia os CHECKs dela (que não estão no datamodel). Partir de antes dela
 *    mantém a prova completa.
 * 2. Aplica, em ordem, a migration de aparelhos e todas as posteriores presentes na branch
 *    (inclusive as que a base já incorporou e as novas desta branch), exatamente como em produção.
 *    Se a migration de aparelhos não existir na branch, falha (nada é pulado).
 * 3. Confere drift ZERO entre o banco e `prisma/schema.prisma` da branch.
 *
 * Recusa qualquer host que não seja loopback (nunca toca Production).
 * Uso: APARELHOS_TEST_DATABASE_URL=postgresql://user@127.0.0.1:55471/aparelhos_pg node scripts/aparelhos/prepare-pg.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const url = (process.env.APARELHOS_TEST_DATABASE_URL ?? "").trim()
if (!url) throw new Error("BLOQUEIO_EXPLICITO_PG: defina APARELHOS_TEST_DATABASE_URL (PostgreSQL descartável).")
const host = new URL(url).hostname.toLowerCase()
if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("BLOQUEIO_EXPLICITO_PG: somente loopback.")

const baseRef = process.env.APARELHOS_BASE_REF || "origin/main"
const APARELHOS = "20261110120000_aparelhos_fisicos_serializados"
const MIG_DIR = "prisma/migrations"
const isMigration = (name) => /^\d/.test(name) && existsSync(join(MIG_DIR, name, "migration.sql"))
const prisma = process.platform === "win32" ? "npx.cmd" : "npx"
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url }
const run = (args, opts = {}) => execFileSync(prisma, ["prisma", ...args], { env, stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32", ...opts }).toString()

const dir = mkdtempSync(join(tmpdir(), "aparelhos-pg-"))
try {
  if (!isMigration(APARELHOS)) throw new Error(`MIGRATION_AUSENTE: ${APARELHOS} não está na branch.`)
  // Commit da base que introduziu a migration de aparelhos (vazio = a base ainda não a tem).
  const introducao = execFileSync("git", ["log", baseRef, "--diff-filter=A", "--format=%H", "-1", "--", join(MIG_DIR, APARELHOS, "migration.sql").replace(/\\/g, "/")])
    .toString()
    .trim()
  const baselineRef = introducao ? `${introducao}^` : baseRef
  const baseSchema = execFileSync("git", ["show", `${baselineRef}:prisma/schema.prisma`]).toString()
  writeFileSync(join(dir, "base.prisma"), baseSchema)
  // Banco precisa estar vazio: recria o schema public.
  writeFileSync(join(dir, "reset.sql"), "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
  run(["db", "execute", "--url", url, "--file", join(dir, "reset.sql")])
  const baseline = run(["migrate", "diff", "--from-empty", "--to-schema-datamodel", join(dir, "base.prisma"), "--script"])
  writeFileSync(join(dir, "baseline.sql"), baseline)
  run(["db", "execute", "--url", url, "--file", join(dir, "baseline.sql")])
  console.log(`BASELINE_OK (${baselineRef === baseRef ? baseRef : `${baseRef} antes de ${APARELHOS}`})`)
  const noBaseline = new Set(
    execFileSync("git", ["ls-tree", "--name-only", `${baselineRef}:${MIG_DIR}`]).toString().split("\n").map((l) => l.trim()).filter(Boolean),
  )
  const aplicar = readdirSync(MIG_DIR).filter((n) => isMigration(n) && !noBaseline.has(n)).sort()
  if (!aplicar.includes(APARELHOS)) throw new Error(`BASELINE_INVALIDO: ${APARELHOS} já estava no baseline.`)
  for (const name of aplicar) {
    run(["db", "execute", "--url", url, "--file", join(MIG_DIR, name, "migration.sql")])
    console.log(`MIGRATION_OK ${name}`)
  }
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
