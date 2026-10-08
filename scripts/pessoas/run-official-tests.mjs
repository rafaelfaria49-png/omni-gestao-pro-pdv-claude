#!/usr/bin/env node
/**
 * Teste oficial do GOAL Pessoas (test_command do AEP).
 *
 * Testa exatamente o HEAD commitado, fora da worktree, contra PostgreSQL descartável:
 *   1. `git archive HEAD` → workspace temporário externo (nada é escrito na worktree);
 *   2. `npm ci` pelo lockfile + Prisma Client gerado no workspace temporário;
 *   3. cluster PostgreSQL efêmero (initdb) em 127.0.0.1:55439 — recusa porta ocupada;
 *   4. baseline = schema.prisma do merge-base com origin/<default_branch>; depois, em
 *      ordem, cada migration presente no HEAD e ausente na base (psql, transação única,
 *      ON_ERROR_STOP); gate de drift migration × schema.prisma;
 *   5. `vitest run lib/pessoas` com reporter JSON: falha se algum teste falhar, for
 *      pulado/todo, ou se a suíte de integração não executar;
 *   6. derruba o cluster e apaga o workspace no `finally`; propaga o exit code.
 *
 * Exit: 0 PASS · 1 teste/drift falhou · 5 pré-condição de ambiente.
 * Dados e credenciais 100% sintéticos; não lê .env; remove do ambiente filho as
 * variáveis de banco/storage/segredos do operador.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"

const PORT = 55439
const ROLE = "omni_homolog"
const SENHA = "synthetic-local-only"
const DB = "omni_pessoas_001a_homolog"
const URL_DB = `postgresql://${ROLE}:${SENHA}@127.0.0.1:${PORT}/${DB}`
const ALVO_TESTE = "lib/pessoas"
const INTEGRACAO = "lib/pessoas/integration.test.ts"

class Falha extends Error {
  constructor(code, msg) { super(msg); this.exitCode = code }
}
const log = (m) => process.stdout.write(`[pessoas-test] ${m}\n`)

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd, env: opts.env ?? process.env, encoding: "utf8",
    stdio: opts.inherit ? "inherit" : opts.ignore ? "ignore" : "pipe", windowsHide: true,
    maxBuffer: 256 * 1024 * 1024, timeout: opts.timeout,
  })
  if (r.error) throw new Falha(5, `${path.basename(cmd)}: ${r.error.message}`)
  return { code: r.status ?? 1, out: r.stdout ?? "", err: r.stderr ?? "" }
}
function exigir(r, code, oque) {
  if (r.code !== 0) throw new Falha(code, `${oque} (exit ${r.code}) ${(r.err || r.out).trim().slice(-800)}`)
  return r
}

function binPostgres() {
  const exe = process.platform === "win32" ? ".exe" : ""
  const ok = (d) => d && ["initdb", "pg_ctl", "psql"].every((b) => fs.existsSync(path.join(d, b + exe)))
  const candidatos = [process.env.PESSOAS_PG_BIN]
  for (const d of (process.env.PATH ?? "").split(path.delimiter)) candidatos.push(d)
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
    const s = net.connect({ host: "127.0.0.1", port: porta })
    s.once("connect", () => { s.destroy(); resolve(false) })
    s.once("error", () => resolve(true))
  })
}

/** Ambiente do filho: sem banco/storage/segredos do operador; só o destino sintético. */
function envFilho() {
  const env = {}
  const proibido = /(DATABASE|DIRECT_URL|^PG[A-Z]+$|R2_|SUPABASE|STRIPE|WHATSAPP|OPENAI|OPENROUTER|NEON|AUTH_SECRET|NEXTAUTH|PESSOAS_)/
  for (const [k, v] of Object.entries(process.env)) if (!proibido.test(k)) env[k] = v
  return { ...env, DATABASE_URL: URL_DB, DIRECT_URL: URL_DB, PESSOAS_HOMOLOGATION_DATABASE_URL: URL_DB, CI: "1" }
}

async function main() {
  const root = exigir(run("git", ["rev-parse", "--show-toplevel"]), 5, "fora de um repositório git").out.trim()
  const head = exigir(run("git", ["rev-parse", "HEAD"], { cwd: root }), 5, "HEAD inválido").out.trim()
  const protocolo = JSON.parse(fs.readFileSync(path.join(root, "docs/ai-execution/protocol.json"), "utf8"))
  const def = protocolo.default_branch || "main"
  const base = exigir(run("git", ["merge-base", "HEAD", `origin/${def}`], { cwd: root }), 5,
    `merge-base com origin/${def} indisponível — rode git fetch origin`).out.trim()
  log(`HEAD ${head} · base ${base} (merge-base origin/${def})`)

  const migsHead = run("git", ["ls-tree", "--name-only", `${head}:prisma/migrations`], { cwd: root }).out.split("\n").filter((x) => /^\d{4}_/.test(x))
  const migsBase = new Set(run("git", ["ls-tree", "--name-only", `${base}:prisma/migrations`], { cwd: root }).out.split("\n").filter(Boolean))
  const novas = migsHead.filter((m) => !migsBase.has(m)).sort()
  log(`migrations novas no HEAD: ${novas.join(", ") || "(nenhuma)"}`)

  if (!(await portaLivre(PORT))) throw new Falha(5, `porta ${PORT} ocupada — o runner não reutiliza servidor existente`)
  const pg = binPostgres()

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omni-pessoas-test-"))
  if (!path.relative(root, tmp).startsWith("..")) throw new Falha(5, "workspace temporário cairia dentro da worktree")
  const ws = path.join(tmp, "ws")
  const dados = path.join(tmp, "pg")
  let pgLigado = false
  try {
    fs.mkdirSync(ws)
    const tar = path.join(tmp, "head.tar")
    exigir(run("git", ["archive", "--format=tar", "-o", tar, head], { cwd: root }), 5, "git archive HEAD")
    // caminhos relativos: o tar GNU (Git Bash) leria "C:" de um caminho absoluto como host remoto
    exigir(run("tar", ["-xf", "head.tar", "-C", "ws"], { cwd: tmp }), 5, "extração do HEAD")
    fs.writeFileSync(path.join(tmp, "base.prisma"),
      exigir(run("git", ["show", `${base}:prisma/schema.prisma`], { cwd: root }), 5, "schema da base").out)
    log(`workspace externo: ${tmp}`)

    const env = envFilho()
    log("npm ci (lockfile) + prisma generate no workspace externo…")
    exigir(run(process.execPath, [npmCli(), "ci", "--no-audit", "--no-fund", "--prefer-offline", "--loglevel=error"], { cwd: ws, env }), 5, "npm ci")
    const prisma = (args) => run(process.execPath, [path.join(ws, "node_modules/prisma/build/index.js"), ...args], { cwd: ws, env })

    exigir(run(pg("initdb"), ["-D", dados, "-U", "pgadmin", "--auth=trust", "-E", "UTF8", "--locale=C"]), 5, "initdb")
    // stdio "ignore": com pipe, o postmaster herda o handle (Windows) e o spawnSync nunca vê EOF.
    pgLigado = true
    exigir(run(pg("pg_ctl"), ["-D", dados, "-l", path.join(tmp, "pg.log"), "-w", "-t", "60", "-o", `-p ${PORT} -c listen_addresses=127.0.0.1 -c timezone=UTC`, "start"],
      { ignore: true, timeout: 120_000 }), 5, "pg_ctl start (ver pg.log)")
    const psqlAdm = (sql) => exigir(run(pg("psql"), ["-h", "127.0.0.1", "-p", String(PORT), "-U", "pgadmin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qc", sql]), 5, "psql admin")
    psqlAdm(`CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEROLE PASSWORD '${SENHA}'`)
    psqlAdm(`CREATE DATABASE ${DB} OWNER ${ROLE}`)
    exigir(run(process.execPath, ["scripts/pessoas/check-isolated-db.mjs"], { cwd: ws, env }), 5, "guard de destino isolado")

    const aplicar = (arquivo, oque) => exigir(run(pg("psql"), ["-h", "127.0.0.1", "-p", String(PORT), "-U", ROLE, "-d", DB,
      "-1", "-q", "-v", "ON_ERROR_STOP=1", "-f", arquivo], { env: { ...env, PGPASSWORD: SENHA } }), 1, oque)
    const baseline = path.join(tmp, "baseline.sql")
    fs.writeFileSync(baseline, exigir(prisma(["migrate", "diff", "--from-empty", "--to-schema-datamodel", path.join(tmp, "base.prisma"), "--script"]), 5, "baseline da base").out)
    aplicar(baseline, "baseline da base")
    for (const m of novas) {
      aplicar(path.join(ws, "prisma/migrations", m, "migration.sql"), `migration ${m}`)
      log(`aplicada ${m} (transação única, ON_ERROR_STOP)`)
    }
    const drift = prisma(["migrate", "diff", "--from-url", URL_DB, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"])
    if (drift.code !== 0) throw new Falha(1, `drift migration × schema.prisma: ${(drift.out + drift.err).trim().slice(0, 1500)}`)
    log("drift migration × schema.prisma: nenhum")

    const json = path.join(tmp, "vitest.json")
    const t = run(process.execPath, [path.join(ws, "node_modules/vitest/vitest.mjs"), "run", ALVO_TESTE,
      "--reporter=default", "--reporter=json", `--outputFile.json=${json}`], { cwd: ws, env, inherit: true })
    if (!fs.existsSync(json)) throw new Falha(1, `vitest não produziu relatório (exit ${t.code})`)
    const rel = JSON.parse(fs.readFileSync(json, "utf8"))
    const integ = rel.testResults.find((f) => f.name.replaceAll("\\", "/").endsWith(INTEGRACAO))
    const integOk = integ ? integ.assertionResults.filter((a) => a.status === "passed").length : 0
    log(`vitest: ${rel.numPassedTests} passaram · ${rel.numFailedTests} falharam · ${rel.numPendingTests} pulados · ${rel.numTodoTests} todo · integração ${integOk} executados`)
    if (t.code !== 0 || !rel.success || rel.numFailedTests > 0) throw new Falha(1, "testes falharam")
    if (rel.numPendingTests > 0 || rel.numTodoTests > 0) throw new Falha(1, "há testes pulados/todo — PASS oco recusado")
    if (!integ || integOk === 0 || integ.assertionResults.some((a) => a.status !== "passed")) {
      throw new Falha(1, "suíte de integração não executou integralmente")
    }
    log(`PASS · HEAD ${head}`)
  } finally {
    if (pgLigado && fs.existsSync(path.join(dados, "postmaster.pid"))) {
      run(pg("pg_ctl"), ["-D", dados, "-m", "fast", "-w", "stop"], { ignore: true, timeout: 120_000 })
    }
    for (let i = 0; i < 5; i += 1) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); break } catch { await new Promise((r) => setTimeout(r, 1000)) }
    }
    if (fs.existsSync(tmp)) log(`AVISO: não consegui remover ${tmp}`)
  }
}

main().then(() => process.exit(0), (e) => {
  process.stderr.write(`[pessoas-test] FALHA${e instanceof Falha ? "" : " inesperada"}: ${e.message}\n`)
  process.exit(e instanceof Falha ? e.exitCode : 1)
})
