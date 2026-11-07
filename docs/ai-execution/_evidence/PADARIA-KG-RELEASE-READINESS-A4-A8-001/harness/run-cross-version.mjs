#!/usr/bin/env node
/**
 * PADARIA-KG-RELEASE-READINESS-A4-A8-001 — ensaio sintético do rollout integrado #315 → #335 → #336.
 *
 * Tudo acontece num cluster PostgreSQL 17 DESCARTÁVEL criado aqui (loopback, porta própria).
 * Nenhuma URL do ambiente, `.env` ou segredo é lida; as variáveis PG/Prisma herdadas são removidas.
 *
 * Uso (Node 22+):
 *   node run-cross-version.mjs <oldRoot> <newRoot> <workDir> <outDir>
 *     oldRoot = worktree da main (cliente Int, ex.: 37acc3b)
 *     newRoot = worktree do topo da pilha (#336 ou esta branch)
 *     workDir = diretório descartável (scratchpad) para o cluster
 *     outDir  = onde gravar os JSON de evidência
 */
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const [oldRoot, newRoot, workDir, outDir] = process.argv.slice(2).map((p) => p && resolve(p))
if (!oldRoot || !newRoot || !workDir || !outDir) throw Error("uso: run-cross-version.mjs <oldRoot> <newRoot> <workDir> <outDir>")
const PGBIN = process.env.KG_PGBIN ?? "C:/Program Files/PostgreSQL/17/bin"
const PORT = Number(process.env.KG_PORT ?? "55493")
const DB = "omnigestao_prod_sim"
const NODE = process.execPath
const pw = { migrator: "sim-migrator-" + Math.random().toString(36).slice(2), runtime: "sim-runtime-" + Math.random().toString(36).slice(2) }
const pgdata = join(workDir, "pgdata")
if (existsSync(pgdata)) throw Error("KG_WORKDIR_NOT_FRESH: " + pgdata)
mkdirSync(workDir, { recursive: true }); mkdirSync(outDir, { recursive: true })

const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/^(PG|DATABASE_URL|DIRECT_URL|PRISMA|NEON|VERCEL|MIGRATOR|POSTGRES)/i.test(k)))
const log = []
const step = (name, data) => { log.push({ at: new Date().toISOString(), step: name, ...data }); console.log("•", name, data?.ok === false ? "FAIL" : "") }
const url = (user, db = DB, extra = "") => `postgresql://${user}@127.0.0.1:${PORT}/${db}${extra}`

function psql({ user, db = DB, file, sql, vars = {}, single = false, env = {}, expectFail = null }) {
  const args = ["-X", "-q", "-h", "127.0.0.1", "-p", String(PORT), "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]
  if (single) args.push("-1")
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`)
  if (file) args.push("-f", file); else args.push("-c", sql)
  const r = spawnSync(join(PGBIN, "psql.exe"), args, { env: { ...cleanEnv, PGCLIENTENCODING: "UTF8", LC_MESSAGES: "C", ...env }, encoding: "utf8", windowsHide: true, timeout: 180000 })
  const out = (r.stdout ?? "") + (r.stderr ?? "")
  if (expectFail) {
    if (r.status === 0 || !out.includes(expectFail)) throw Error(`KG_EXPECTED_FAILURE_MISSING ${expectFail}\n${out}`)
    return out
  }
  if (r.status !== 0) throw Error(`psql falhou (${user}@${db} ${file ?? sql}):\n${out}`)
  return out
}
function must(out, marker) { if (!out.includes(marker)) throw Error("KG_MARKER_MISSING " + marker + "\n" + out); return marker }
function prisma(root, args, dbUrl, { expectFail = null } = {}) {
  const r = spawnSync(NODE, [join(root, "node_modules/prisma/build/index.js"), ...args], {
    cwd: root, env: { ...cleanEnv, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl, MIGRATION_AUTHORITY_ENABLED: "false", PRISMA_HIDE_UPDATE_MESSAGE: "1" }, encoding: "utf8", windowsHide: true, timeout: 180000 })
  const out = (r.stdout ?? "") + (r.stderr ?? "")
  if (expectFail) { if (r.status === 0) throw Error("KG_PRISMA_EXPECTED_FAILURE " + args.join(" ")); return out }
  if (r.status !== 0) throw Error(`prisma ${args.join(" ")} falhou:\n${out}`)
  return out
}
function phase(root, name, user, extraEnv = {}, file = "cross-version.phase.ts") {
  const dir = join(root, "test-results", "kg-readiness"); mkdirSync(dir, { recursive: true })
  const target = join(dir, name + "." + file.replace(".phase.ts", ".test.ts"))
  copyFileSync(join(here, file), target)
  const out = join(outDir, `phase-${name}.json`)
  const userPw = user === "omni_runtime_v2" ? pw.runtime : ""
  const dbUrl = `postgresql://${user}${userPw ? ":" + userPw : ""}@127.0.0.1:${PORT}/${extraEnv.KG_DB ?? DB}?connection_limit=5`
  const r = spawnSync(NODE, [join(root, "node_modules/vitest/vitest.mjs"), "run", target.replace(/\\/g, "/"), "--root", root, "--reporter=verbose", "--maxWorkers=1"], {
    cwd: root, env: { ...cleanEnv, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl, KG_PHASE: name.replace(/-guard|-noguard$/, ""), KG_OUT: out, KG_PORT: String(PORT), KG_EXPECTED_USER: user, ...extraEnv },
    encoding: "utf8", windowsHide: true, timeout: 300000 })
  const text = (r.stdout ?? "") + (r.stderr ?? "")
  writeFileSync(join(outDir, `phase-${name}.log.txt`), text.replace(/postgresql:\/\/[^@\s]+@/g, "postgresql://***@"))
  if (r.status !== 0) throw Error(`fase ${name} falhou (ver phase-${name}.log.txt)`)
  return JSON.parse(readFileSync(out, "utf8"))
}

const evidence = { goal: "PADARIA-KG-RELEASE-READINESS-A4-A8-001", startedAt: new Date().toISOString(), cluster: { port: PORT, db: DB }, oldRoot, newRoot }
let postmaster = false
try {
  // ── Cluster descartável ──────────────────────────────────────────────────────────────
  let r = spawnSync(join(PGBIN, "initdb.exe"), ["-D", pgdata, "-U", "sim_admin", "--auth=trust", "-E", "UTF8", "--no-locale"], { encoding: "utf8", windowsHide: true })
  if (r.status !== 0) throw Error("initdb: " + r.stderr)
  r = spawnSync(join(PGBIN, "pg_ctl.exe"), ["-D", pgdata, "-o", `-p ${PORT} -c listen_addresses=127.0.0.1`, "-l", join(workDir, "pg.log"), "-w", "-t", "60", "start"], { stdio: "ignore", windowsHide: true, timeout: 90000 })
  if (r.status !== 0) throw Error("pg_ctl start falhou")
  postmaster = true
  const version = psql({ user: "sim_admin", db: "postgres", sql: "SELECT version()" })
  step("cluster", { version: version.trim().split("\n").find((l) => l.includes("PostgreSQL"))?.trim() })

  // Topologia legada: papel antigo único, com pg_write_all_data herdado (como neondb_owner → neon_superuser).
  psql({ user: "sim_admin", db: "postgres", sql: [
    "CREATE ROLE neon_superuser NOLOGIN", "GRANT pg_write_all_data TO neon_superuser",
    "CREATE ROLE neondb_owner LOGIN CREATEDB CREATEROLE", "GRANT neon_superuser TO neondb_owner"].join(";") })
  psql({ user: "sim_admin", db: "postgres", sql: `CREATE DATABASE ${DB} OWNER neondb_owner` })

  // Schema da main (Int) criado como o papel antigo + histórico Prisma resolvido (como o Preview P2.1).
  const baseSql = join(workDir, "base-main.sql")
  writeFileSync(baseSql, prisma(oldRoot, ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"], url("neondb_owner")))
  psql({ user: "neondb_owner", file: baseSql, single: true })
  const oldMigrations = readdirSync(join(oldRoot, "prisma/migrations")).filter((d) => existsSync(join(oldRoot, "prisma/migrations", d, "migration.sql"))).sort()
  for (const m of oldMigrations) prisma(oldRoot, ["migrate", "resolve", "--applied", m], url("neondb_owner"))
  step("schema-main", { migrationsResolved: oldMigrations.length, status: prisma(oldRoot, ["migrate", "status"], url("neondb_owner")).includes("Database schema is up to date") })

  // ── A3 (já executado em produção): 01 no database de serviço, 02 no database da loja ─────
  const rollout = join(newRoot, "docs/padaria/pesagem/rollout")
  // O 07 revisado no A6 (sha256 LF dea40868…) ainda não está versionado: KG_ROLLOUT_07 aponta para ele.
  const script07 = process.env.KG_ROLLOUT_07 ? resolve(process.env.KG_ROLLOUT_07) : join(rollout, "07-guard-check-opcional.sql")
  const lfSha = (f) => createHash("sha256").update(readFileSync(f, "utf8").split("\r\n").join("\n")).digest("hex")
  evidence.scripts = Object.fromEntries([...["01-papeis", "02-grants-runtime", "03-corte-posse", "04-corte-conexao", "05-encerrar-sessoes", "06-verificacao", "99-desfazer-corte"].map((n) => [n, lfSha(join(rollout, n + ".sql"))]),
    ["07-guard-check-opcional", lfSha(script07)], ["estoque-kg-migration-apply", lfSha(join(newRoot, "docs/padaria/pesagem/estoque-kg-migration-apply.sql"))],
    ...["20261025120000_estoque_quantidade_fracionada", "20261029120000_manual_kg_sale_quantity", "20261106120000_manual_kg_title_guard_indexed"].map((m) => [m, lfSha(join(newRoot, "prisma/migrations", m, "migration.sql"))])])
  step("scripts", evidence.scripts)
  const o1 = psql({ user: "neondb_owner", db: "postgres", file: join(rollout, "01-papeis.sql"), single: true, env: { KG_MIGRATOR_PASSWORD: pw.migrator, KG_RUNTIME_V2_PASSWORD: pw.runtime } })
  const o2 = psql({ user: "neondb_owner", file: join(rollout, "02-grants-runtime.sql"), single: true, vars: { prod_db: DB } })
  step("A3-sim", { m01: must(o1, "KG_PAPEIS_OK"), m02: must(o2, "KG_RUNTIME_GRANTS_OK") })

  // ── Fase ANTIGA: main, papel antigo, vendas v1 + v2 com respostas perdidas ───────────────
  evidence.old = phase(oldRoot, "old", "neondb_owner")
  step("phase-old", { created: evidence.old.created, counts: evidence.old.countsAfterOld })

  // Sessão antiga "esquecida" (aba/pooler) que precisa ser encerrada pelo 05.
  const lingering = spawn(join(PGBIN, "psql.exe"), ["-X", "-h", "127.0.0.1", "-p", String(PORT), "-U", "neondb_owner", "-d", DB, "-c", "SELECT pg_sleep(900)"], { stdio: "ignore", windowsHide: true, env: cleanEnv })
  await new Promise((res) => setTimeout(res, 1500))

  // ── Janela J6: corte do papel antigo ─────────────────────────────────────────────────────
  const migratorUrl = (db = DB, extra = "") => `postgresql://omni_migrator:${pw.migrator}@127.0.0.1:${PORT}/${db}${extra}`
  const o3 = psql({ user: "neondb_owner", file: join(rollout, "03-corte-posse.sql"), single: true, vars: { old_role: "neondb_owner", prod_db: DB } })
  const o4 = psql({ user: "omni_migrator", file: join(rollout, "04-corte-conexao.sql"), single: true, vars: { old_role: "neondb_owner", prod_db: DB }, env: { PGPASSWORD: pw.migrator } })
  const o5 = psql({ user: "neondb_owner", db: "postgres", file: join(rollout, "05-encerrar-sessoes.sql"), vars: { old_role: "neondb_owner", prod_db: DB } })
  const o6 = psql({ user: "omni_migrator", file: join(rollout, "06-verificacao.sql"), vars: { old_role: "neondb_owner" }, env: { PGPASSWORD: pw.migrator } })
  const denied = psql({ user: "neondb_owner", sql: "SELECT 1", expectFail: "permission denied for database" })
  lingering.kill()
  step("J6-sim", { m03: must(o3, "KG_CORTE_POSSE_OK"), m04: must(o4, "KG_CORTE_CONEXAO_OK"), m05: must(o5, "KG_SESSOES_ANTIGAS_ZERO"),
    m06OldRoleNoConnect: /papel neondb_owner connect=false/.test(o6), oldRoleDenied: denied.includes("permission denied"), o6: o6.trim().split("\n") })

  // ── J8: migration de estoque pelo script verificado, depois resolve ─────────────────────
  const o8 = psql({ user: "omni_migrator", file: join(newRoot, "docs/padaria/pesagem/estoque-kg-migration-apply.sql"), single: true, env: { PGPASSWORD: pw.migrator } })
  prisma(newRoot, ["migrate", "resolve", "--applied", "20261025120000_estoque_quantidade_fracionada"], migratorUrl())
  step("J8-sim", { marker: must(o8, "KG_MIGRATION_OK"), line: o8.split("\n").find((l) => l.includes("KG_MIGRATION_OK"))?.trim() })

  // 99 deve recusar depois da migration.
  const o99 = psql({ user: "omni_migrator", file: join(rollout, "99-desfazer-corte.sql"), single: true, vars: { old_role: "neondb_owner", prod_db: DB }, env: { PGPASSWORD: pw.migrator }, expectFail: "KG_DESFAZER_PROIBIDO_MIGRATION_JA_APLICADA" })
  step("99-refuses-after-J8", { ok: o99.includes("KG_DESFAZER_PROIBIDO") })

  // ── Migration aditiva da #335: sem SET ROLE é recusada; com role=omni_owner aplica ─────
  const additive = join(newRoot, "prisma/migrations/20261029120000_manual_kg_sale_quantity/migration.sql")
  const noRole = psql({ user: "omni_migrator", file: additive, env: { PGPASSWORD: pw.migrator }, expectFail: "KG_MIGRATION_OWNER_PUBLIC_SCHEMA_REQUIRED" })
  prisma(newRoot, ["migrate", "deploy"], migratorUrl(), { expectFail: true })
  prisma(newRoot, ["migrate", "resolve", "--rolled-back", "20261029120000_manual_kg_sale_quantity"], migratorUrl())
  // 20261029 com o papel de sessão = dono (PGOPTIONS), depois resolve; retrato para a prova de equivalência.
  psql({ user: "omni_migrator", file: additive, env: { PGPASSWORD: pw.migrator, PGOPTIONS: "-c role=omni_owner" } })
  prisma(newRoot, ["migrate", "resolve", "--applied", "20261029120000_manual_kg_sale_quantity"], migratorUrl())
  psql({ user: "sim_admin", db: "postgres", sql: `CREATE DATABASE sim_eq TEMPLATE ${DB}` })
  psql({ user: "sim_admin", db: "postgres", sql: "ALTER DATABASE sim_eq OWNER TO omni_owner" })
  // 20261106 (esta branch) pelo caminho normal do Prisma, com role=omni_owner na conexão.
  const deployed = prisma(newRoot, ["migrate", "deploy"], migratorUrl(DB, "?options=-c%20role%3Domni_owner"))
  const fnOwners = psql({ user: "omni_migrator", env: { PGPASSWORD: pw.migrator }, sql:
    "SELECT 'owners=' || string_agg(DISTINCT pg_get_userbyid(proowner), ',') FROM pg_proc WHERE proname LIKE 'manual_kg_%'" })
  step("additive-sim", { refusedWithoutRole: noRole.includes("KG_MIGRATION_OWNER_PUBLIC_SCHEMA_REQUIRED"), prismaDeployWithoutRoleFails: true,
    appliedWithRoleOption: true, titleGuardDeployed: /20261106120000_manual_kg_title_guard_indexed/.test(deployed),
    functionOwners: fnOwners.split("\n").find((l) => l.includes("owners="))?.trim() })

  // ── J10: conferências ────────────────────────────────────────────────────────────────────
  const status = prisma(newRoot, ["migrate", "status"], migratorUrl())
  const diff = prisma(newRoot, ["migrate", "diff", "--from-url", migratorUrl(), "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"], migratorUrl(), { expectFail: false })
  const j10 = psql({ user: "omni_migrator", env: { PGPASSWORD: pw.migrator }, sql: `SELECT 'J10 fracoes=' || (
      (SELECT count(*) FROM estoque_produtos WHERE stock <> trunc(stock)) + (SELECT count(*) FROM produto_depositos WHERE quantidade <> trunc(quantidade))
    + (SELECT count(*) FROM movimentacoes_estoque WHERE quantidade <> trunc(quantidade) OR "estoqueAntes" <> trunc("estoqueAntes") OR "estoqueDepois" <> trunc("estoqueDepois")))
    || ' nan_denormais=' || ((SELECT count(*) FROM estoque_produtos WHERE stock = 'NaN' OR (stock <> 0 AND abs(stock) < 2.2250738585072014e-308))
    + (SELECT count(*) FROM movimentacoes_estoque WHERE quantidade = 'NaN' OR (quantidade <> 0 AND abs(quantidade) < 2.2250738585072014e-308)))` })
  step("J10-sim", { upToDate: status.includes("Database schema is up to date"), diffEmpty: /No difference detected|empty migration/i.test(diff), j10: j10.trim() })

  // ── Fase NOVA: #336, omni_runtime_v2, replays + 1º envio de venda da fila ────────────────
  evidence.new = phase(newRoot, "new", "omni_runtime_v2", { KG_OLD_OUT: join(outDir, "phase-old.json") })
  step("phase-new", { replays: evidence.new.replays, counts: evidence.new.countsAfterNew })
  evidence.kg = phase(newRoot, "kg", "omni_runtime_v2", { PDV_MANUAL_KG_RELEASE: "PDV-PADARIA-KG-RELEASE-HARDENING-002", PDV_MANUAL_KG_STORES: "loja-sim-1" }, "kg-topology.phase.ts")
  step("phase-kg", evidence.kg.summary ?? {})

  // ── Redeploy proibido: cliente Int com a credencial nova, sem e com o 07 ─────────────────
  for (const target of ["sim_noguard", "sim_guard"]) psql({ user: "sim_admin", db: "postgres", sql: `CREATE DATABASE ${target} TEMPLATE ${DB}` })
  const o7 = psql({ user: "omni_migrator", db: "sim_guard", file: script07, single: true, env: { PGPASSWORD: pw.migrator } })
  step("07-sim", { applied: true, tail: o7.trim().split("\n").slice(-3) })
  evidence.oldAfterNoGuard = phase(oldRoot, "old-after-noguard", "omni_runtime_v2", { KG_DB: "sim_noguard", KG_DB_EXPECTED: "sim_noguard" })
  evidence.oldAfterGuard = phase(oldRoot, "old-after-guard", "omni_runtime_v2", { KG_DB: "sim_guard", KG_DB_EXPECTED: "sim_guard", KG_EXPECT_GUARD: "1" })
  step("redeploy-int-sim", { noGuard: evidence.oldAfterNoGuard.oldAfter, guard: evidence.oldAfterGuard.oldAfter })

  // ── Custo dos gatilhos da #335 com volume ≫ produção (banco inteiro ~41 MB no A1) ────────
  // sim_eq = retrato com o corpo ORIGINAL da 20261029; mede, prova equivalência e mede de novo.
  const kgLines = (out) => out.split("\n").filter((l) => /KG_(PERF|EQ)/.test(l)).map((l) => l.trim())
  const lines = []
  lines.push(...kgLines(psql({ user: "sim_admin", db: "sim_eq", file: join(here, "trigger-overhead.sql"), vars: { popular: "1" } })))
  psql({ user: "sim_admin", db: "sim_eq", file: join(here, "title-guard-equivalence.sql"), vars: { fase_antes: "1" } })
  lines.push(...kgLines(psql({ user: "sim_admin", db: "sim_eq", file: join(here, "trigger-overhead.sql"), vars: { rotulo: "antes" } })))
  psql({ user: "sim_admin", db: "sim_eq", file: join(newRoot, "prisma/migrations/20261106120000_manual_kg_title_guard_indexed/migration.sql"), env: { PGOPTIONS: "-c role=omni_owner" } })
  const eq = psql({ user: "sim_admin", db: "sim_eq", file: join(here, "title-guard-equivalence.sql") })
  lines.push(...kgLines(eq))
  must(eq, "KG_EQ_OK")
  lines.push(...kgLines(psql({ user: "sim_admin", db: "sim_eq", file: join(here, "trigger-overhead.sql"), vars: { rotulo: "depois" } })))
  evidence.triggerOverhead = lines
  step("trigger-overhead-and-equivalence", { lines })

  evidence.result = "PASS"
} catch (error) {
  evidence.result = "FAIL"
  evidence.error = String(error?.stack ?? error).replace(/sim-(migrator|runtime)-[a-z0-9]+/g, "***")
  console.error(evidence.error)
  process.exitCode = 1
} finally {
  if (postmaster) spawnSync(join(PGBIN, "pg_ctl.exe"), ["-D", pgdata, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true, timeout: 60000 })
  evidence.finishedAt = new Date().toISOString()
  evidence.steps = log
  writeFileSync(join(outDir, "cross-version-summary.json"), JSON.stringify(evidence, null, 2).replace(/sim-(migrator|runtime)-[a-z0-9]+/g, "***"))
}
