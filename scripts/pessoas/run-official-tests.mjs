#!/usr/bin/env node
/**
 * Runner oficial compartilhado: HEAD imutável por git archive, npm ci/Prisma,
 * PostgreSQL local descartável, drift + invariantes ratificados, toda lib/pessoas.
 * Hardening acrescenta build PWA real/inspeção e validações do mesmo HEAD.
 * Nenhum node_modules/.env da worktree é usado. Limpeza verificada em finally.
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { safeEnvironment } from "./runner-environment.mjs"

const PORT = 55439
const ROLE = "omni_homolog"
const SENHA = "synthetic-local-only"
const DB = "omni_pessoas_001a_homolog"
const URL_DB = `postgresql://${ROLE}:${SENHA}@127.0.0.1:${PORT}/${DB}`
const INTEGRACAO = "lib/pessoas/integration.test.ts"
const HARDENING = "lib/pessoas/hardening.integration.test.ts"
const MIGRACAO_PESSOAS = "0022_pessoas_cadastro_backend"

class Falha extends Error {
  constructor(code, msg) { super(msg); this.exitCode = code }
}
const log = (m) => process.stdout.write(`[pessoas-test] ${m}\n`)

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd, env: opts.env ?? safeEnvironment(), encoding: "utf8",
    stdio: opts.inherit ? "inherit" : opts.ignore ? "ignore" : "pipe", windowsHide: true,
    maxBuffer: 256 * 1024 * 1024, timeout: opts.timeout ?? 45 * 60_000,
  })
  if (r.error) throw new Falha(5, `${path.basename(cmd)}: ${r.error.message}`)
  return { code: r.status ?? 1, out: r.stdout ?? "", err: r.stderr ?? "" }
}
function exigir(r, code, oque) {
  if (r.code !== 0) throw new Falha(code, `${oque} (exit ${r.code}) ${(r.err || r.out).trim().slice(-1500)}`)
  return r
}
function binPostgres() {
  const exe = process.platform === "win32" ? ".exe" : ""
  const ok = (d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b + exe)))
  const candidatos = [process.env.PESSOAS_PG_BIN, ...(process.env.PATH ?? "").split(path.delimiter)]
  if (process.platform === "win32") {
    const raiz = "C:/Program Files/PostgreSQL"
    if (fs.existsSync(raiz)) {
      for (const v of fs.readdirSync(raiz).sort((a, b) => Number(b) - Number(a))) candidatos.push(path.join(raiz, v, "bin"))
    }
  }
  const dir = candidatos.find(ok)
  if (!dir) throw new Falha(5, "binários PostgreSQL (initdb/pg_ctl/psql) não encontrados — defina PESSOAS_PG_BIN")
  return (b) => path.join(dir, b + exe)
}
function npmCli() {
  const base = path.dirname(process.execPath)
  for (const c of [path.join(base, "node_modules/npm/bin/npm-cli.js"), path.join(base, "../lib/node_modules/npm/bin/npm-cli.js")]) {
    if (fs.existsSync(c)) return c
  }
  throw new Falha(5, "npm-cli.js não encontrado ao lado do Node")
}
function portaLivre(porta) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once("error", () => resolve(false))
    s.listen({ host: "127.0.0.1", port: porta, exclusive: true }, () => s.close(() => resolve(true)))
  })
}
function envFilho(tmp) {
  // npm não lê a configuração/credenciais pessoais do operador.
  const userConfig = path.join(tmp, "npm-user.config")
  const globalConfig = path.join(tmp, "npm-global.config")
  fs.writeFileSync(userConfig, "registry=https://registry.npmjs.org/\n")
  fs.writeFileSync(globalConfig, "")
  const env = {
    ...safeEnvironment(), DATABASE_URL: URL_DB, DIRECT_URL: URL_DB,
    PESSOAS_HOMOLOGATION_DATABASE_URL: URL_DB, CI: "1", NEXT_TELEMETRY_DISABLED: "1",
    // Next usa cpus = CIRCLE_NODE_TOTAL - 1; limitar só o job descartável.
    CIRCLE_NODE_TOTAL: "2",
    NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig,
  }
  if (["VERCEL", "VERCEL_ENV", "VERCEL_PROJECT_ID", "MIGRATION_AUTHORITY_ENABLED", "AUTH_SECRET", "PESSOAS_DP_ENABLED", "NODE_OPTIONS"]
    .some((key) => Object.hasOwn(env, key))) throw new Falha(5, "autoridade de produção herdada")
  return env
}
function invariantesPessoas(ws, tmp, restaurar, aplicar, consultar) {
  const sql = fs.readFileSync(path.join(ws, "prisma/migrations", MIGRACAO_PESSOAS, "migration.sql"), "utf8")
  const marker = "-- Restrições de domínio que o datamodel Prisma não expressa."
  const inicio = sql.indexOf(marker)
  if (inicio < 0) throw new Falha(1, "contrato da migration Pessoas mudou")
  const tail = sql.slice(inicio)
  if (restaurar) {
    const file = path.join(tmp, "pessoas-invariants.sql")
    fs.writeFileSync(file, tail)
    aplicar(file, "invariantes 001A ratificados (fixture descartável)")
  }
  const catalogo = consultar(`
    SELECT 'check:' || conname FROM pg_constraint WHERE contype='c' AND convalidated AND conrelid::regclass::text LIKE 'dp_%';
    SELECT 'index:' || c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      WHERE i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL AND c.relname LIKE 'dp_%';
    SELECT 'trigger:' || tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname LIKE 'dp_%';
    SELECT 'function:' || proname FROM pg_proc WHERE prorettype='trigger'::regtype AND proname LIKE 'dp_%';
  `).out.trim().split(/\r?\n/)
  const expected = {
    check: [...tail.matchAll(/ADD CONSTRAINT "([^"]+)" CHECK/g)].map((m) => m[1]),
    index: [...tail.matchAll(/CREATE UNIQUE INDEX "([^"]+)"/g)].map((m) => m[1]),
    trigger: [...tail.matchAll(/CREATE TRIGGER (\w+)/g)].map((m) => m[1]),
    function: [...tail.matchAll(/CREATE FUNCTION (\w+)/g)].map((m) => m[1]),
  }
  for (const [kind, names] of Object.entries(expected)) {
    if (!names.length || names.some((name) => !catalogo.includes(`${kind}:${name}`))) {
      throw new Falha(1, `fixture sem todos os ${kind} ratificados`)
    }
  }
  const counts = Object.fromEntries(Object.entries(expected).map(([kind, names]) => [kind, names.length]))
  log(`invariantes 001A conferidos: ${JSON.stringify(counts)}`)
  return { ...counts, sourceSha256: createHash("sha256").update(tail).digest("hex") }
}
function suiteInteira(rel, name) {
  const suite = rel.testResults.find((f) => f.name.replaceAll("\\", "/").endsWith(name))
  const passed = suite?.assertionResults.filter((a) => a.status === "passed").length ?? 0
  if (!suite || passed === 0 || suite.assertionResults.some((a) => a.status !== "passed")) {
    throw new Falha(1, `suíte não executou integralmente: ${name}`)
  }
  return passed
}

export async function runOfficialTests({ hardening = false } = {}) {
  const root = exigir(run("git", ["rev-parse", "--show-toplevel"]), 5, "fora de um repositório git").out.trim()
  const head = exigir(run("git", ["rev-parse", "HEAD"], { cwd: root }), 5, "HEAD inválido").out.trim()
  const protocolo = JSON.parse(fs.readFileSync(path.join(root, "docs/ai-execution/protocol.json"), "utf8"))
  const def = protocolo.default_branch || "main"
  const base = exigir(run("git", ["merge-base", "HEAD", `origin/${def}`], { cwd: root }), 5, `merge-base com origin/${def} indisponível`).out.trim()
  log(`HEAD ${head} · base ${base} (merge-base origin/${def})`)
  const migsHead = exigir(run("git", ["ls-tree", "--name-only", `${head}:prisma/migrations`], { cwd: root }), 5, "migrations HEAD").out.split(/\r?\n/).filter((x) => /^\d{4}_/.test(x))
  const migsBase = new Set(exigir(run("git", ["ls-tree", "--name-only", `${base}:prisma/migrations`], { cwd: root }), 5, "migrations base").out.split(/\r?\n/).filter(Boolean))
  const novas = migsHead.filter((m) => !migsBase.has(m)).sort()
  log(`migrations novas no HEAD: ${novas.join(", ") || "(nenhuma)"}`)
  if (!(await portaLivre(PORT))) throw new Falha(5, `porta ${PORT} ocupada — o runner não reutiliza servidor existente`)
  const pg = binPostgres()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omni-pessoas-test-"))
  const relativo = path.relative(root, tmp)
  if (!(relativo === ".." || relativo.startsWith(".." + path.sep) || path.isAbsolute(relativo))) {
    throw new Falha(5, "workspace temporário cairia dentro da worktree")
  }
  const ws = path.join(tmp, "ws"), dados = path.join(tmp, "pg")
  let pgLigado = false, summary
  try {
    fs.mkdirSync(ws)
    const tar = path.join(tmp, "head.tar")
    exigir(run("git", ["archive", "--format=tar", "-o", tar, head], { cwd: root }), 5, "git archive HEAD")
    exigir(run("tar", ["-xf", "head.tar", "-C", "ws"], { cwd: tmp }), 5, "extração do HEAD")
    fs.writeFileSync(path.join(tmp, "base.prisma"), exigir(run("git", ["show", `${base}:prisma/schema.prisma`], { cwd: root }), 5, "schema da base").out)
    if (fs.readdirSync(ws).some((name) => /^\.env(?:$|\.(?:local|production|development|test)(?:\.|$))/.test(name))) {
      throw new Falha(5, "HEAD contém arquivo .env carregável — runner recusado")
    }
    log(`workspace externo: ${tmp}`)
    const env = envFilho(tmp)
    const npm = (args) => run(process.execPath, [npmCli(), ...args], { cwd: ws, env })
    log("npm ci (lockfile) + prisma generate no workspace externo…")
    exigir(npm(["ci", "--no-audit", "--no-fund", "--prefer-offline", "--loglevel=error"]), 5, "npm ci")
    const prisma = (args) => run(process.execPath, [path.join(ws, "node_modules/prisma/build/index.js"), ...args], { cwd: ws, env })
    exigir(prisma(["generate"]), 5, "prisma generate")
    const versao = JSON.parse(fs.readFileSync(path.join(ws, "node_modules/@ducanh2912/next-pwa/package.json"), "utf8")).version
    const lock = JSON.parse(fs.readFileSync(path.join(ws, "package-lock.json"), "utf8")).packages["node_modules/@ducanh2912/next-pwa"].version
    if (versao !== lock || (hardening && versao !== "10.2.9")) throw new Falha(1, "contrato instalado next-pwa diverge do planejamento/lockfile")
    log(`next-pwa instalado pelo npm ci: ${versao}`)
    exigir(run(pg("initdb"), ["-D", dados, "-U", "pgadmin", "--auth=trust", "-E", "UTF8", "--locale=C"]), 5, "initdb")
    pgLigado = true
    exigir(run(pg("pg_ctl"), ["-D", dados, "-l", path.join(tmp, "pg.log"), "-w", "-t", "60", "-o", `-p ${PORT} -c listen_addresses=127.0.0.1 -c timezone=UTC`, "start"], { ignore: true, timeout: 120_000 }), 5, "pg_ctl start")
    const psqlAdm = (sql) => exigir(run(pg("psql"), ["-h", "127.0.0.1", "-p", String(PORT), "-U", "pgadmin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qc", sql]), 5, "psql admin")
    psqlAdm(`CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEROLE PASSWORD '${SENHA}'`)
    psqlAdm(`CREATE DATABASE ${DB} OWNER ${ROLE}`)
    exigir(run(process.execPath, ["scripts/pessoas/check-isolated-db.mjs"], { cwd: ws, env }), 5, "guard de destino isolado")
    const psqlArgs = ["-h", "127.0.0.1", "-p", String(PORT), "-U", ROLE, "-d", DB, "-v", "ON_ERROR_STOP=1"]
    const aplicar = (file, what) => exigir(run(pg("psql"), [...psqlArgs, "-1", "-q", "-f", file], { env: { ...env, PGPASSWORD: SENHA } }), 1, what)
    const consultar = (sql) => exigir(run(pg("psql"), [...psqlArgs, "-Atqc", sql], { env: { ...env, PGPASSWORD: SENHA } }), 1, "catálogo de invariantes")
    const baseline = path.join(tmp, "baseline.sql")
    fs.writeFileSync(baseline, exigir(prisma(["migrate", "diff", "--from-empty", "--to-schema-datamodel", path.join(tmp, "base.prisma"), "--script"]), 5, "baseline da base").out)
    aplicar(baseline, "baseline da base")
    for (const m of novas) {
      aplicar(path.join(ws, "prisma/migrations", m, "migration.sql"), `migration ${m}`)
      log(`aplicada ${m} (transação única, ON_ERROR_STOP)`)
    }
    const invariants = invariantesPessoas(ws, tmp, migsBase.has(MIGRACAO_PESSOAS), aplicar, consultar)
    const drift = prisma(["migrate", "diff", "--from-url", URL_DB, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"])
    if (drift.code !== 0) throw new Falha(1, `drift migration × schema.prisma: ${(drift.out + drift.err).trim().slice(0, 1500)}`)
    log("drift migration × schema.prisma: nenhum")
    const json = path.join(tmp, "vitest.json")
    const t = run(process.execPath, [path.join(ws, "node_modules/vitest/vitest.mjs"), "run", "lib/pessoas", "--no-file-parallelism", "--reporter=default", "--reporter=json", `--outputFile.json=${json}`], { cwd: ws, env, inherit: true })
    if (!fs.existsSync(json)) throw new Falha(1, `vitest não produziu relatório (exit ${t.code})`)
    const rel = JSON.parse(fs.readFileSync(json, "utf8"))
    log(`vitest: ${rel.numPassedTests} passaram · ${rel.numFailedTests} falharam · ${rel.numPendingTests} pulados · ${rel.numTodoTests} todo`)
    if (t.code !== 0 || !rel.success || rel.numFailedTests > 0) throw new Falha(1, "testes falharam")
    if (rel.numPendingTests > 0 || rel.numTodoTests > 0 || !rel.numTotalTests ||
        rel.testResults.some((f) => f.assertionResults.some((a) => a.status !== "passed"))) throw new Falha(1, "testes pulados/todo/não executados — PASS oco recusado")
    summary = { head, base, total: rel.numTotalTests, skipped: rel.numPendingTests, todo: rel.numTodoTests,
      integration: suiteInteira(rel, INTEGRACAO), invariants }
    if (hardening) {
      summary.hardening = suiteInteira(rel, HARDENING)
      const { inspectPwaBuild } = await import(pathToFileURL(path.join(ws, "scripts/pessoas/inspect-pwa-build.mjs")).href)
      const build = () => {
        log("npm run build (PWA habilitado, sem autoridade de migration)…")
        const b = exigir(npm(["run", "build"]), 1, "npm run build")
        if (!b.out.includes("MIGRATION_SKIPPED") || /MIGRATION_(?:RUN|SUCCEEDED)/.test(b.out)) throw new Falha(1, "build não confirmou MIGRATION_SKIPPED")
        log("npm run build PASS · MIGRATION_SKIPPED")
      }
      const failures = []
      const conferirEtapa = async (name, executar) => {
        try { await executar(); log(name + " PASS") }
        catch (error) { failures.push(name + ": " + error.message); log(name + " FAIL: " + error.message) }
      }
      let built = false
      await conferirEtapa("build oficial", () => { build(); built = true })
      if (built) await conferirEtapa("aceite PWA", async () => { summary.pwa = await inspectPwaBuild(ws, log) })
      // Diagnósticos independentes continuam mesmo se o aceite PWA falhar.
      await conferirEtapa("npm run typecheck", () => {
        exigir(npm(["run", "typecheck"]), 1, "npm run typecheck")
        summary.typecheck = "PASS"
      })
      await conferirEtapa("ESLint focado", () => {
        exigir(run(process.execPath, [path.join(ws, "node_modules/eslint/bin/eslint.js"), "lib/pessoas", "scripts/pessoas", "next.config.mjs", "--max-warnings=0"], { cwd: ws, env }), 1, "ESLint focado")
        summary.lint = "PASS"
      })
      if (failures.length) throw new Falha(1, failures.join("\n"))
      // Build adicional solicitado depois do runner/aceite, no mesmo HEAD.
      build()
      await inspectPwaBuild(ws, log)
      summary.build = "PASS"
      summary.p2034MaxAttempts = 3
    }
  } finally {
    let cleanupError
    if (pgLigado && fs.existsSync(path.join(dados, "postmaster.pid"))) {
      try { exigir(run(pg("pg_ctl"), ["-D", dados, "-m", "fast", "-w", "stop"], { ignore: true, timeout: 120_000 }), 5, "pg_ctl stop") } catch (error) { cleanupError = error }
    }
    // Alvo absoluto resolvido e conferido antes de qualquer remoção recursiva.
    if (path.dirname(path.resolve(tmp)) !== path.resolve(os.tmpdir()) || !/^omni-pessoas-test-/.test(path.basename(tmp))) {
      throw new Falha(5, "alvo de limpeza fora do diretório temporário autorizado")
    }
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); break } catch { await new Promise((resolve) => setTimeout(resolve, 1000)) }
    }
    if (fs.existsSync(tmp) || !(await portaLivre(PORT))) cleanupError = new Falha(5, "limpeza incompleta: workspace ou porta ainda presentes")
    if (cleanupError) throw cleanupError
    log("CLEANUP PASS · cluster/workspace/node_modules/.next/SW/relatórios removidos · porta 55439 livre")
  }
  summary.cleanup = "PASS"
  log(`PASS · HEAD ${head} · testes ${summary.total} · skipped ${summary.skipped} · todo ${summary.todo}`)
  return summary
}
export function reportFailure(error) {
  process.stderr.write(`[pessoas-test] FALHA${error instanceof Falha ? "" : " inesperada"}: ${error.message}\n`)
  process.exitCode = error instanceof Falha ? error.exitCode : 1
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runOfficialTests().catch(reportFailure)
}
