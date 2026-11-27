#!/usr/bin/env node
/**
 * OMNI-VESTUARIO-P02-PERSISTENCIA-GRADES-CATALOGO-001 — prepara um PostgreSQL DESCARTÁVEL para os testes de integração.
 *
 * 1. Baseline = schema da base (`VESTUARIO_P02_BASE_REF`, default origin/main) via `prisma migrate diff --from-empty`
 *    — mas no ponto IMEDIATAMENTE ANTERIOR à migration P02 de vestuário. Depois do merge da P02 a base já
 *    tem as tabelas; usar o schema atual da base e reaplicar a migration recriaria `vestuario_*`,
 *    e pular a migration perderia os CHECKs e triggers dela (que não estão no datamodel). Partir de antes dela
 *    mantém a prova completa.
 * 2. Aplica, em ordem, a migration P02 de vestuário e todas as posteriores presentes na branch
 *    (inclusive as que a base já incorporou e as novas desta branch), exatamente como em produção.
 *    Se a migration P02 de vestuário não existir na branch, falha (nada é pulado).
 * 3. Confere drift ZERO entre o banco e `prisma/schema.prisma` da branch.
 *
 * Exige loopback, banco vest_p02_*, identidade positiva e banco vazio antes de qualquer DDL.
 * Fora do CI exige também data_directory em scratchpad; nunca reseta um banco populado.
 * Uso: VESTUARIO_P02_TEST_DATABASE_URL=postgresql://user@127.0.0.1:55457/vest_p02_pg node scripts/vestuario/prepare-pg.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { assertFreshDisposableDatabase } from "../cadastros/disposable-db-preflight.mjs"

const url = (process.env.VESTUARIO_P02_TEST_DATABASE_URL ?? "").trim()
if (!url) throw new Error("BLOQUEIO_EXPLICITO_PG: defina VESTUARIO_P02_TEST_DATABASE_URL (PostgreSQL descartável).")
let target
try { target = new URL(url) } catch { throw new Error("BLOQUEIO_EXPLICITO_PG: URL de QA inválida.") }
if (!["postgresql:", "postgres:"].includes(target.protocol)
  || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname.toLowerCase())
  || !/^\/vest_p02_[a-z0-9_]+$/.test(target.pathname)
  || !target.username || !target.port || target.hash
  || [...target.searchParams.keys()].some((key) => target.searchParams.getAll(key).length > 1)
  || (target.searchParams.has("schema") && target.searchParams.get("schema") !== "public")
  || ["host", "hostaddr", "dbname", "database", "service", "options"].some((key) => target.searchParams.has(key))) {
  throw new Error("BLOQUEIO_EXPLICITO_PG: somente banco vest_p02_* loopback com porta explícita e schema public.")
}

const baseRef = process.env.VESTUARIO_P02_BASE_REF || "origin/main"
const MIGRATION_P02 = "20261115120000_vestuario_p02_grades_catalogo"
const MIG_DIR = "prisma/migrations"
const isMigration = (name) => /^\d/.test(name) && existsSync(join(MIG_DIR, name, "migration.sql"))
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url }
const run = (args, opts = {}) => execFileSync(process.execPath, [join(process.cwd(), "node_modules/prisma/build/index.js"), ...args], { env, stdio: ["ignore", "pipe", "inherit"], ...opts }).toString()

const dir = mkdtempSync(join(tmpdir(), "vestuario-p02-pg-"))
try {
  if (!isMigration(MIGRATION_P02)) throw new Error(`MIGRATION_AUSENTE: ${MIGRATION_P02} não está na branch.`)
  const { PrismaClient } = await import("../../generated/prisma/index.js")
  const db = new PrismaClient({ datasourceUrl: url })
  try {
    await assertFreshDisposableDatabase(db, { database: target.pathname.slice(1), role: decodeURIComponent(target.username) })
    if (process.env.CI !== "true") {
      const [row] = await db.$queryRaw`SELECT current_setting('data_directory') AS dir`
      if (!/scratchpad/.test(row?.dir ?? "")) throw new Error("BLOQUEIO_EXPLICITO_PG: servidor local fora do scratchpad.")
    }
  } finally { await db.$disconnect() }
  // Commit da base que introduziu a migration P02 de vestuário (vazio = a base ainda não a tem).
  const introducao = execFileSync("git", ["log", baseRef, "--diff-filter=A", "--format=%H", "-1", "--", join(MIG_DIR, MIGRATION_P02, "migration.sql").replace(/\\/g, "/")])
    .toString()
    .trim()
  const baselineRef = introducao ? `${introducao}^` : baseRef
  const baseSchema = execFileSync("git", ["show", `${baselineRef}:prisma/schema.prisma`]).toString()
  writeFileSync(join(dir, "base.prisma"), baseSchema)
  // O preflight já provou identidade positiva e ausência de tabelas de usuário.
  writeFileSync(join(dir, "reset.sql"), "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
  run(["db", "execute", "--url", url, "--file", join(dir, "reset.sql")])
  const baseline = run(["migrate", "diff", "--from-empty", "--to-schema-datamodel", join(dir, "base.prisma"), "--script"])
  writeFileSync(join(dir, "baseline.sql"), baseline)
  run(["db", "execute", "--url", url, "--file", join(dir, "baseline.sql")])
  console.log(`BASELINE_OK (${baselineRef === baseRef ? baseRef : `${baseRef} antes de ${MIGRATION_P02}`})`)
  const noBaseline = new Set(
    execFileSync("git", ["ls-tree", "--name-only", `${baselineRef}:${MIG_DIR}`]).toString().split("\n").map((l) => l.trim()).filter(Boolean),
  )
  const aplicar = readdirSync(MIG_DIR).filter((n) => isMigration(n) && !noBaseline.has(n)).sort()
  if (!aplicar.includes(MIGRATION_P02)) throw new Error(`BASELINE_INVALIDO: ${MIGRATION_P02} já estava no baseline.`)
  for (const name of aplicar) {
    if (name === "20261116090000_identificadores_etiquetas_p03" && process.env.VESTUARIO_P03_QA_SEED_LEGACY === "1") {
      const { seedP03LegacyFixture } = await import("./p03-legacy-fixture.mjs")
      await seedP03LegacyFixture(PrismaClient, url)
    }
    run(["db", "execute", "--url", url, "--file", join(MIG_DIR, name, "migration.sql")])
    console.log(`MIGRATION_OK ${name}`)
  }
  // OMNI-PRINT D02-A (PR #327): as tabelas print_* já estão no schema da branch, mas as migrations delas ficam
  // preparadas em tools/print-d02/migrations até a aplicação manual (docs/print-004c-e2e/RUNBOOK_D02.md) — nunca em
  // prisma/migrations antes disso. Aplicá-las aqui espelha o banco depois dessa aplicação; o drift abaixo segue exigindo zero.
  const D02_DIR = "tools/print-d02/migrations"
  if (existsSync(D02_DIR)) {
    for (const name of readdirSync(D02_DIR).filter((n) => /^\d/.test(n) && existsSync(join(D02_DIR, n, "migration.sql"))).sort()) {
      run(["db", "execute", "--url", url, "--file", join(D02_DIR, name, "migration.sql")])
      console.log(`MIGRATION_OK ${name} (D02 preparada)`)
    }
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
