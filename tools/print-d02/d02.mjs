#!/usr/bin/env node
/**
 * OMNI-PRINT D02-A — ferramenta do operador para a aplicação MANUAL das migrations de impressão (RUNBOOK_D02.md).
 *
 * NÃO roda em build, CI ou deploy. Cada comando confere o alvo antes de tocar em qualquer coisa:
 *  - URL obrigatória por --url ou D02_DATABASE_URL; recusa pooler (host com "-pooler", porta 6543, pgbouncer=true);
 *  - --expect-db e --expect-host obrigatórios e iguais ao banco/host reais;
 *  - o papel conectado precisa ser o dono de public.vendas (o SQL faz REVOKE ... FROM PUBLIC e cria objetos);
 *  - recusa réplica de leitura (pg_is_in_recovery).
 * Nunca imprime a senha nem a URL.
 *
 * Comandos:
 *   status                         estado atual (índices, objetos print_*, registro no Prisma)
 *   apply-indexes [--repair-invalid]  passo (i): cada índice CONCURRENTLY com lock_timeout 5s; confere indisvalid
 *   apply-core [--attempts 1..3] [--spacing-s N]  passo (ii): transação única com a guarda; desistência não deixa nada
 *   verify [--prisma]              integridade completa (e, com --prisma, as 3 linhas em _prisma_migrations e checksums)
 *   promote [--migrations-dir D]   copia as pastas para prisma/migrations (bytes idênticos, LF). Não toca o banco
 *   resolve [--schema S]           prisma migrate resolve --applied para as 3 pastas promovidas (só com o banco APLICADO)
 * Códigos de saída: 0 ok · 2 alvo/uso recusado · 3 exige decisão humana · 4 aplicação falhou (nada parcial) · 5 verify falhou
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildMigrations, INDEXES, NAMES, ROOT, STAGED } from "./cut.mjs"

const BIN = process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin"
const PSQL = path.join(BIN, process.platform === "win32" ? "psql.exe" : "psql")
export const EXIT = { OK: 0, REFUSED: 2, HUMAN: 3, APPLY_FAILED: 4, VERIFY_FAILED: 5 }
const EXPECTED = { tables: 11, functions: 7 }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

class Stop extends Error { constructor(code, msg) { super(msg); this.code = code } }

function args(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) { out._.push(a); continue }
    const eq = a.indexOf("=") // split on the FIRST "=" only: URLs and passwords may contain more
    const k = eq < 0 ? a.slice(2) : a.slice(2, eq), v = eq < 0 ? undefined : a.slice(eq + 1)
    if (v !== undefined) out[k] = v
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) out[k] = argv[++i]
    else out[k] = true
  }
  return out
}

/** Target parsed from the URL, refused when it is a pooler or the expectations are missing/different. */
function target(opts) {
  const raw = opts.url || process.env.D02_DATABASE_URL
  if (!raw) throw new Stop(EXIT.REFUSED, "informe --url ou D02_DATABASE_URL (endpoint DIRETO, nunca o -pooler)")
  let u
  try { u = new URL(raw) } catch { throw new Stop(EXIT.REFUSED, "URL inválida") }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Stop(EXIT.REFUSED, "URL não é PostgreSQL")
  const port = u.port || "5432"
  if (/-pooler\./i.test(u.hostname) || port === "6543" || u.searchParams.get("pgbouncer") === "true")
    throw new Stop(EXIT.REFUSED, "endpoint com pooler recusado: CONCURRENTLY e parâmetros de sessão exigem o endpoint direto")
  const db = decodeURIComponent(u.pathname.slice(1))
  if (!opts["expect-db"] || !opts["expect-host"]) throw new Stop(EXIT.REFUSED, "informe --expect-db e --expect-host (conferência do alvo)")
  if (opts["expect-db"] !== db) throw new Stop(EXIT.REFUSED, `banco da URL (${db}) difere de --expect-db`)
  if (opts["expect-host"].toLowerCase() !== u.hostname.toLowerCase()) throw new Stop(EXIT.REFUSED, `host da URL (${u.hostname}) difere de --expect-host`)
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(u.password), PGAPPNAME: "omni-print-d02" }
  delete env.PGOPTIONS // the files carry their own timeouts; nothing inherited from the shell
  const ssl = u.searchParams.get("sslmode")
  if (ssl) env.PGSSLMODE = ssl
  return { host: u.hostname, port, user: decodeURIComponent(u.username), db, env }
}

function psql(t, extra, { input } = {}) {
  const r = spawnSync(PSQL, ["-h", t.host, "-p", t.port, "-U", t.user, "-d", t.db, "-v", "ON_ERROR_STOP=1", "-X", "-q", ...extra],
    { env: t.env, encoding: "utf8", windowsHide: true, input, maxBuffer: 16 << 20 })
  if (r.error) throw new Stop(EXIT.REFUSED, `psql não executou: ${r.error.message}`)
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }
}
/** One row of tab-separated values. */
function query(t, sql) {
  const r = psql(t, ["-At", "-F", "\t", "-c", sql])
  if (r.code !== 0) throw new Stop(EXIT.REFUSED, `consulta falhou: ${r.out.trim()}`)
  return r.out.trim().split(/\r?\n/).filter(Boolean).map(l => l.split("\t")) // psql on Windows ends lines with CRLF
}

function identity(t) {
  const [[db, user, owner, recovery, version]] = query(t, `SELECT current_database(), current_user,
    (SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='vendas'), pg_is_in_recovery(), current_setting('server_version')`)
  if (db !== t.db) throw new Stop(EXIT.REFUSED, `conectado em ${db}, esperado ${t.db}`)
  if (!owner) throw new Stop(EXIT.REFUSED, "public.vendas não existe neste banco: alvo errado")
  if (owner !== user) throw new Stop(EXIT.REFUSED, `papel ${user} não é o dono de public.vendas (${owner}); use o papel da aplicação`)
  if (recovery === "t") throw new Stop(EXIT.REFUSED, "banco em recuperação/réplica de leitura")
  return { db, host: t.host, user, version }
}

export function state(t) {
  const idx = Object.fromEntries(Object.values(INDEXES).map(n => [n, "absent"]))
  for (const [name, valid] of query(t, `SELECT c.relname, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('${Object.values(INDEXES).join("','")}')`))
    idx[name] = valid === "t" ? "valid" : "invalid"
  const [[tables, functions]] = query(t, `SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relkind='r' AND c.relname LIKE 'print\\_%'),
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname LIKE 'p004\\_%')`)
  const [[hasRegistry]] = query(t, `SELECT to_regclass('public._prisma_migrations') IS NOT NULL`)
  const prisma = Object.fromEntries(Object.values(NAMES).map(n => [n, null]))
  if (hasRegistry === "t") for (const [name, checksum, finished, rolledBack] of query(t, `SELECT migration_name, checksum, finished_at IS NOT NULL,
      rolled_back_at IS NOT NULL FROM public._prisma_migrations WHERE migration_name IN ('${Object.values(NAMES).join("','")}')
      ORDER BY started_at`)) {
    // Several rows per migration are possible (failed → rolled back → applied): it counts as applied when ANY row is
    // finished and not rolled back; otherwise the latest row describes it.
    const row = { checksum, finished: finished === "t", rolledBack: rolledBack === "t" }
    if (!(prisma[name]?.finished && !prisma[name].rolledBack)) prisma[name] = row
  }
  const objects = { tables: Number(tables), functions: Number(functions) }
  const ix = Object.values(idx)
  let s
  if (objects.tables === 0 && objects.functions === 0) {
    s = ix.includes("invalid") ? "INDEXES_INVALID" : ix.every(v => v === "valid") ? "INDEXES_READY" : ix.every(v => v === "absent") ? "BASELINE" : "INDEXES_PARTIAL"
  } else if (objects.tables === EXPECTED.tables && objects.functions === EXPECTED.functions && ix.every(v => v === "valid")) s = "CORE_APPLIED"
  else s = "INCONSISTENT"
  return { state: s, indexes: idx, objects, prisma }
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex")
const staged = (name) => path.join(STAGED, name, "migration.sql")
/** The staged files must be exactly what the generator produces (nothing hand-edited before a production run). */
function checkStaged() {
  for (const [name, sql] of Object.entries(buildMigrations()))
    if (!existsSync(staged(name)) || !readFileSync(staged(name)).equals(Buffer.from(sql)))
      throw new Stop(EXIT.REFUSED, `${name} difere do gerador: rode node tools/print-d02/generate.mjs --check`)
}

async function applyIndexes(t, opts, log) {
  checkStaged()
  let st = state(t)
  if (st.state === "INCONSISTENT" || st.state === "CORE_APPLIED") {
    if (st.state === "CORE_APPLIED") { log("passo (ii) já aplicado: os índices existem e são válidos; nada a fazer"); return EXIT.OK }
    throw new Stop(EXIT.HUMAN, `estado inconsistente ${JSON.stringify(st)}: parar e investigar (RUNBOOK_D02.md §8)`)
  }
  for (const key of ["idxVendas", "idxTerminais"]) {
    const name = INDEXES[key]
    if (st.indexes[name] === "valid") { log(`${name}: já existe VÁLIDO, mantido`); continue }
    if (st.indexes[name] === "invalid") {
      if (!opts["repair-invalid"]) throw new Stop(EXIT.HUMAN, `${name} está INVÁLIDO (tentativa anterior desistiu). Rode de novo com --repair-invalid (DROP INDEX CONCURRENTLY + recriar)`)
      const d = psql(t, ["-c", "SET lock_timeout = '5s'", "-c", `DROP INDEX CONCURRENTLY "public"."${name}"`])
      if (d.code !== 0) throw new Stop(EXIT.APPLY_FAILED, `${name}: DROP INDEX CONCURRENTLY falhou: ${d.out.trim()}`)
      log(`${name}: índice inválido removido`)
    }
    const started = Date.now()
    const r = psql(t, ["-c", "SET lock_timeout = '5s'", "-c", "SET statement_timeout = 0", "-f", staged(NAMES[key])])
    st = state(t)
    if (r.code !== 0 || st.indexes[name] !== "valid") {
      const left = st.indexes[name]
      throw new Stop(EXIT.APPLY_FAILED, `${name}: não concluiu em ${Date.now() - started} ms (${r.out.trim().split("\n").pop()}). Ficou: ${left}.` +
        (left === "invalid" ? " Vendas não foram afetadas. Repetir com --repair-invalid num momento calmo." : ""))
    }
    log(`${name}: criado VÁLIDO em ${Date.now() - started} ms`)
  }
  return EXIT.OK
}

async function applyCore(t, opts, log) {
  checkStaged()
  const attempts = Number(opts.attempts ?? 1), spacing = Number(opts["spacing-s"] ?? 30)
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw new Stop(EXIT.REFUSED, "--attempts entre 1 e 3")
  if (!Number.isFinite(spacing) || spacing < 0) throw new Stop(EXIT.REFUSED, "--spacing-s inválido")
  for (let i = 1; i <= attempts; i++) {
    const st = state(t)
    if (st.state === "CORE_APPLIED") { log("passo (ii) já aplicado; nada a fazer"); return EXIT.OK }
    if (st.state !== "INDEXES_READY") throw new Stop(st.state === "INCONSISTENT" ? EXIT.HUMAN : EXIT.REFUSED,
      `passo (ii) exige os dois índices VÁLIDOS e nenhum objeto print_* (estado ${st.state}); rode apply-indexes`)
    const started = Date.now()
    const r = psql(t, ["-f", staged(NAMES.core)]) // no PGOPTIONS: the guard inside the file is what protects sales
    const after = state(t)
    if (r.code === 0 && after.state === "CORE_APPLIED") { log(`passo (ii) aplicado em ${Date.now() - started} ms (tentativa ${i})`); return EXIT.OK }
    if (after.state !== "INDEXES_READY") throw new Stop(EXIT.HUMAN, `após falha o estado é ${after.state}, não o inicial: parar (RUNBOOK_D02.md §8)`)
    const reason = /lock timeout/i.test(r.out) ? "lock_timeout (venda ou operação aberta)" : r.out.trim().split("\n").pop()
    log(`tentativa ${i}: desistiu em ${Date.now() - started} ms por ${reason}; nada ficou aplicado`)
    if (!/lock timeout/i.test(r.out)) return EXIT.APPLY_FAILED // a non-lock error will not go away by waiting
    if (i < attempts) await sleep(spacing * 1000)
  }
  return EXIT.APPLY_FAILED
}

const EXPECTED_TRIGGERS = (() => {
  const core = buildMigrations()[NAMES.core]
  return (core.match(/^CREATE (CONSTRAINT )?TRIGGER /gm) ?? []).length
})()

function verify(t, opts, log) {
  const st = state(t)
  const fail = []
  if (st.state !== "CORE_APPLIED") fail.push(`estado ${st.state}`)
  const [[triggers, badFk, owners, publicGrants, fks]] = query(t, `SELECT
    (SELECT count(*) FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace s ON s.oid=c.relnamespace
      WHERE s.nspname='public' AND NOT g.tgisinternal AND c.relname LIKE 'print\\_%'),
    (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relname LIKE 'print\\_%' AND NOT k.convalidated),
    (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'print\\_%' AND tableowner <> current_user),
    (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'print\\_%' AND grantee='PUBLIC'),
    (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relname LIKE 'print\\_%' AND k.contype='f')`)
  if (Number(triggers) !== EXPECTED_TRIGGERS) fail.push(`gatilhos ${triggers}, esperado ${EXPECTED_TRIGGERS}`)
  if (Number(badFk) !== 0) fail.push(`${badFk} restrição(ões) não validada(s)`)
  if (Number(owners) !== 0) fail.push(`${owners} tabela(s) print_* com outro dono`)
  if (Number(publicGrants) !== 0) fail.push(`PUBLIC com ${publicGrants} privilégio(s) em print_*`)
  if (opts.prisma) {
    for (const [name, sql] of Object.entries(buildMigrations())) {
      const row = st.prisma[name]
      if (!row) fail.push(`${name} ausente em _prisma_migrations`)
      else if (!row.finished || row.rolledBack) fail.push(`${name} não está como aplicada em _prisma_migrations`)
      else if (row.checksum !== sha(Buffer.from(sql))) fail.push(`${name}: checksum ${row.checksum.slice(0, 12)}… ≠ arquivo LF ${sha(Buffer.from(sql)).slice(0, 12)}…`)
    }
  }
  log(JSON.stringify({ ...st, triggers: Number(triggers), foreignKeys: Number(fks) }))
  if (fail.length) { log("VERIFY FAIL: " + fail.join("; ")); return EXIT.VERIFY_FAILED }
  log("VERIFY PASS")
  return EXIT.OK
}

function promote(opts, log) {
  checkStaged()
  const dir = path.resolve(opts["migrations-dir"] || path.join(ROOT, "prisma/migrations"))
  for (const name of Object.values(NAMES)) {
    const dest = path.join(dir, name, "migration.sql")
    if (existsSync(dest)) {
      if (!readFileSync(dest).equals(readFileSync(staged(name)))) throw new Stop(EXIT.HUMAN, `${dest} existe com conteúdo diferente (fim de linha CRLF?)`)
      log(`${name}: já promovida (bytes idênticos)`)
      continue
    }
    mkdirSync(path.dirname(dest), { recursive: true })
    copyFileSync(staged(name), dest)
    log(`${name}: promovida`)
  }
  return EXIT.OK
}

/** Removes the password in both raw and URL-encoded forms (never a replace of ""). */
function redact(text, secret) {
  let out = String(text ?? "")
  for (const s of new Set([secret, encodeURIComponent(secret ?? "")])) if (s) out = out.split(s).join("***")
  return out
}

/** Preserve libpq certificate verification when invoking Prisma's distinct TLS implementation. */
export function prismaResolveUrl(t) {
  const u = new URL(`postgresql://${encodeURIComponent(t.user)}:${encodeURIComponent(t.env.PGPASSWORD)}@${t.host}:${t.port}/${encodeURIComponent(t.db)}`)
  const strict = ['verify-ca', 'verify-full'].includes(t.env.PGSSLMODE)
  if (t.env.PGSSLMODE) u.searchParams.set('sslmode', strict ? 'require' : t.env.PGSSLMODE)
  if (strict) {
    u.searchParams.set('sslaccept', 'strict')
    if (t.env.PGSSLROOTCERT && t.env.PGSSLROOTCERT !== 'system') u.searchParams.set('sslcert', t.env.PGSSLROOTCERT)
  }
  return u.toString()
}

function resolve(t, opts, log) {
  const st = state(t)
  if (st.state !== "CORE_APPLIED") throw new Stop(EXIT.REFUSED, `resolve só com o banco APLICADO (estado ${st.state}): nunca registrar o que não existe`)
  const schema = path.resolve(opts.schema || path.join(ROOT, "prisma/schema.prisma"))
  const dir = path.join(path.dirname(schema), "migrations")
  for (const name of Object.values(NAMES))
    if (!existsSync(path.join(dir, name, "migration.sql")) || !readFileSync(path.join(dir, name, "migration.sql")).equals(readFileSync(staged(name))))
      throw new Stop(EXIT.REFUSED, `${name} não promovida com bytes idênticos em ${dir}: rode promote`)
  const url = prismaResolveUrl(t)
  const cli = path.join(ROOT, "node_modules/prisma/build/index.js")
  for (const name of Object.values(NAMES)) {
    if (st.prisma[name]?.finished && !st.prisma[name].rolledBack) { log(`${name}: já registrada`); continue }
    const r = spawnSync(process.execPath, [cli, "migrate", "resolve", "--applied", name, "--schema", schema],
      { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: url, DIRECT_URL: url } })
    if (r.status !== 0) throw new Stop(EXIT.APPLY_FAILED, `${name}: prisma migrate resolve falhou: ${redact(r.stderr || r.stdout, t.env.PGPASSWORD).trim().split("\n").slice(-3).join(" ")}`)
    log(`${name}: registrada como aplicada`)
  }
  return verify(t, { prisma: true }, log)
}

export async function main(argv = process.argv.slice(2), log = console.log) {
  const opts = args(argv)
  const cmd = opts._[0]
  try {
    if (cmd === "promote") return promote(opts, log)
    if (!["status", "apply-indexes", "apply-core", "verify", "resolve"].includes(cmd)) throw new Stop(EXIT.REFUSED, "comando: status | apply-indexes | apply-core | verify | promote | resolve")
    const t = target(opts)
    const id = identity(t)
    log(`alvo: banco=${id.db} host=${id.host} papel=${id.user} PostgreSQL ${id.version}`)
    if (cmd === "status") { log(JSON.stringify(state(t))); return EXIT.OK }
    if (cmd === "apply-indexes") return await applyIndexes(t, opts, log)
    if (cmd === "apply-core") return await applyCore(t, opts, log)
    if (cmd === "verify") return verify(t, opts, log)
    return resolve(t, opts, log)
  } catch (e) {
    if (e instanceof Stop) { log(`PARADO (${e.code}): ${e.message}`); return e.code }
    throw e
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main()
