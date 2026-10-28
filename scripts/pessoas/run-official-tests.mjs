#!/usr/bin/env node
/**
 * Runner oficial compartilhado: HEAD imutÃ¡vel por git archive, npm ci/Prisma,
 * PostgreSQL local descartÃ¡vel, drift + invariantes ratificados, toda lib/pessoas.
 * Hardening acrescenta build PWA real/inspeÃ§Ã£o e validaÃ§Ãµes do mesmo HEAD.
 * Nenhum node_modules/.env da worktree Ã© usado. Limpeza verificada em finally.
 */
import { spawnSync } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
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
function binPostgres({ requireServer = false } = {}) {
  const exe = process.platform === "win32" ? ".exe" : ""
  const binaries = ["initdb", "pg_ctl", "psql", ...(requireServer ? ["postgres"] : [])]
  const ok = (d) => d && binaries.every((b) => fs.existsSync(path.join(d, b + exe)))
  const candidatos = [process.env.PESSOAS_PG_BIN, ...(process.env.PATH ?? "").split(path.delimiter)]
  if (process.platform === "win32") {
    const raiz = "C:/Program Files/PostgreSQL"
    if (fs.existsSync(raiz)) {
      for (const v of fs.readdirSync(raiz).sort((a, b) => Number(b) - Number(a))) candidatos.push(path.join(raiz, v, "bin"))
    }
  }
  const dir = candidatos.find(ok)
  if (!dir) throw new Falha(5, "binÃ¡rios PostgreSQL (initdb/pg_ctl/psql) nÃ£o encontrados â€” defina PESSOAS_PG_BIN")
  return (b) => path.join(dir, b + exe)
}
function npmCli() {
  const base = path.dirname(process.execPath)
  for (const c of [path.join(base, "node_modules/npm/bin/npm-cli.js"), path.join(base, "../lib/node_modules/npm/bin/npm-cli.js")]) {
    if (fs.existsSync(c)) return c
  }
  throw new Falha(5, "npm-cli.js nÃ£o encontrado ao lado do Node")
}
function portaLivre(porta) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once("error", () => resolve(false))
    s.listen({ host: "127.0.0.1", port: porta, exclusive: true }, () => s.close(() => resolve(true)))
  })
}
function envFilho(tmp) {
  // npm nÃ£o lÃª a configuraÃ§Ã£o/credenciais pessoais do operador.
  const userConfig = path.join(tmp, "npm-user.config")
  const globalConfig = path.join(tmp, "npm-global.config")
  fs.writeFileSync(userConfig, "registry=https://registry.npmjs.org/\n")
  fs.writeFileSync(globalConfig, "")
  const env = {
    ...safeEnvironment(), DATABASE_URL: URL_DB, DIRECT_URL: URL_DB,
    PESSOAS_HOMOLOGATION_DATABASE_URL: URL_DB, CI: "1", NEXT_TELEMETRY_DISABLED: "1",
    // Next usa cpus = CIRCLE_NODE_TOTAL - 1; limitar sÃ³ o job descartÃ¡vel.
    CIRCLE_NODE_TOTAL: "2",
    NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig,
  }
  if (["VERCEL", "VERCEL_ENV", "VERCEL_PROJECT_ID", "MIGRATION_AUTHORITY_ENABLED", "AUTH_SECRET", "PESSOAS_DP_ENABLED", "NODE_OPTIONS"]
    .some((key) => Object.hasOwn(env, key))) throw new Falha(5, "autoridade de produÃ§Ã£o herdada")
  return env
}
function invariantesPessoas(ws, tmp, restaurar, aplicar, consultar) {
  const sql = fs.readFileSync(path.join(ws, "prisma/migrations", MIGRACAO_PESSOAS, "migration.sql"), "utf8")
  const marker = "-- RestriÃ§Ãµes de domÃ­nio que o datamodel Prisma nÃ£o expressa."
  const inicio = sql.indexOf(marker)
  if (inicio < 0) throw new Falha(1, "contrato da migration Pessoas mudou")
  const tail = sql.slice(inicio)
  if (restaurar) {
    const file = path.join(tmp, "pessoas-invariants.sql")
    fs.writeFileSync(file, tail)
    aplicar(file, "invariantes 001A ratificados (fixture descartÃ¡vel)")
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
    throw new Falha(1, `suÃ­te nÃ£o executou integralmente: ${name}`)
  }
  return passed
}

function frontendSpace(directories, stage, minimum = 12 * 1024 ** 3) {
  const volumes = new Map()
  for (const directory of directories) {
    let existing = path.resolve(directory)
    while (!fs.existsSync(existing)) {
      const parent = path.dirname(existing)
      if (parent === existing) throw new Falha(5, "volume inacessÃ­vel: " + directory)
      existing = parent
    }
    const volume = path.parse(existing).root + ":" + fs.statSync(existing).dev
    if (volumes.has(volume)) continue
    const stats = fs.statfsSync(existing)
    const freeBytes = stats.bavail * stats.bsize
    const entry = { volume, directory: path.resolve(directory), freeBytes, minimumBytes: minimum }
    volumes.set(volume, entry)
    log("reserva " + stage + ": " + JSON.stringify(entry))
    if (!Number.isFinite(freeBytes) || freeBytes < minimum) throw new Falha(5, "reserva insuficiente no volume " + volume + "; nÃ£o iniciar a prÃ³xima etapa")
  }
  return { stage, volumes: [...volumes.values()] }
}
function chromiumPreflight(ws, env) {
  const script = `import fs from "node:fs";
    import { createRequire } from "node:module";
    import { chromium } from "@playwright/test";
    const require = createRequire(import.meta.url);
    const executable = chromium.executablePath();
    if (!fs.existsSync(executable)) throw new Error("Chromium do lockfile ausente: " + executable);
    let browser;
    try {
      browser = await chromium.launch({ headless: true, timeout: 15000 });
      const page = await browser.newPage();
      await page.goto("about:blank");
      process.stdout.write(JSON.stringify({ playwright: require("@playwright/test/package.json").version,
        chromium: browser.version(), executable }) + "\\n");
    } finally { await browser?.close(); }`
  const result = exigir(run(process.execPath, ["--input-type=module", "-e", script], { cwd: ws, env, timeout: 60_000 }), 5, "preflight Chromium launch/page/close")
  return JSON.parse(result.out.trim())
}

export async function runOfficialTests({ hardening = false, frontend = false } = {}) {
  const root = exigir(run("git", ["rev-parse", "--show-toplevel"]), 5, "fora de um repositÃ³rio git").out.trim()
  const head = exigir(run("git", ["rev-parse", "HEAD"], { cwd: root }), 5, "HEAD invÃ¡lido").out.trim()
  const protocolo = JSON.parse(fs.readFileSync(path.join(root, "docs/ai-execution/protocol.json"), "utf8"))
  const def = protocolo.default_branch || "main"
  const base = exigir(run("git", ["merge-base", "HEAD", `origin/${def}`], { cwd: root }), 5, `merge-base com origin/${def} indisponÃ­vel`).out.trim()
  log(`HEAD ${head} Â· base ${base} (merge-base origin/${def})`)
  const migsHead = exigir(run("git", ["ls-tree", "--name-only", `${head}:prisma/migrations`], { cwd: root }), 5, "migrations HEAD").out.split(/\r?\n/).filter((x) => /^\d{4}_/.test(x))
  const migsBase = new Set(exigir(run("git", ["ls-tree", "--name-only", `${base}:prisma/migrations`], { cwd: root }), 5, "migrations base").out.split(/\r?\n/).filter(Boolean))
  const novas = migsHead.filter((m) => !migsBase.has(m)).sort()
  log(`migrations novas no HEAD: ${novas.join(", ") || "(nenhuma)"}`)
  if (!(await portaLivre(PORT))) throw new Falha(5, `porta ${PORT} ocupada â€” o runner nÃ£o reutiliza servidor existente`)
  const pg = binPostgres({ requireServer: frontend })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omni-pessoas-test-"))
  const relativo = path.relative(root, tmp)
  if (!(relativo === ".." || relativo.startsWith(".." + path.sep) || path.isAbsolute(relativo))) {
    throw new Falha(5, "workspace temporÃ¡rio cairia dentro da worktree")
  }
  const ws = path.join(tmp, "ws"), dados = path.join(tmp, "pg")
  let pgLigado = false, summary, preflight
  try {
    fs.mkdirSync(ws)
    const tar = path.join(tmp, "head.tar")
    exigir(run("git", ["archive", "--format=tar", "-o", tar, head], { cwd: root }), 5, "git archive HEAD")
    exigir(run("tar", ["-xf", "head.tar", "-C", "ws"], { cwd: tmp }), 5, "extraÃ§Ã£o do HEAD")
    fs.writeFileSync(path.join(tmp, "base.prisma"), exigir(run("git", ["show", `${base}:prisma/schema.prisma`], { cwd: root }), 5, "schema da base").out)
    if (fs.readdirSync(ws).some((name) => /^\.env(?:$|\.(?:local|production|development|test)(?:\.|$))/.test(name))) {
      throw new Falha(5, "HEAD contÃ©m arquivo .env carregÃ¡vel â€” runner recusado")
    }
    log(`workspace externo: ${tmp}`)
    const env = envFilho(tmp)
    if (frontend) {
      env.AUTH_SECRET = randomBytes(32).toString("base64"); env.AUTH_TRUST_HOST = "true"
      for (const key of ["PESSOAS_CPF_ENC_KEY", "PESSOAS_CPF_HMAC_KEY", "PESSOAS_DOCUMENT_INTENT_KEY"]) env[key] = randomBytes(32).toString("base64")
    }
    if (frontend) {
      if (Number(process.versions.node.split(".")[0]) !== 24) throw new Falha(5, "frontend exige Node 24")
      env.NPM_CONFIG_CACHE = path.join(tmp, "npm-cache")
      fs.mkdirSync(env.NPM_CONFIG_CACHE)
      const directories = [ws, env.NPM_CONFIG_CACHE, path.join(root, "docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002")]
      preflight = { node: process.version, npm: exigir(run(process.execPath, [npmCli(), "--version"], { cwd: ws, env }), 5, "versÃ£o npm").out.trim(),
        os: { platform: os.platform(), release: os.release(), arch: os.arch() },
        workspace: ws, cache: env.NPM_CONFIG_CACHE, evidence: directories[2],
        postgresql: Object.fromEntries(["initdb", "pg_ctl", "psql", "postgres"].map(binary =>
          [binary, exigir(run(pg(binary), ["--version"], { cwd: ws, env }), 5, "versÃ£o " + binary).out.trim()])),
        space: [frontendSpace(directories, "antes da instalaÃ§Ã£o")] }
      log("preflight frontend: " + JSON.stringify(preflight))
    }
    const npm = (args) => run(process.execPath, [npmCli(), ...args], { cwd: ws, env })
    log("npm ci (lockfile) + prisma generate no workspace externoâ€¦")
    exigir(npm(["ci", "--no-audit", "--no-fund", "--prefer-offline", "--loglevel=error"]), 5, "npm ci")
    const prisma = (args) => run(process.execPath, [path.join(ws, "node_modules/prisma/build/index.js"), ...args], { cwd: ws, env })
    exigir(prisma(["generate"]), 5, "prisma generate")
    if (frontend) {
      const initialFree = new Map(preflight.space[0].volumes.map(volume => [volume.volume, volume.freeBytes]))
      const installed = frontendSpace([ws, env.NPM_CONFIG_CACHE, preflight.evidence], "apÃ³s instalaÃ§Ã£o")
      const measured = Math.max(0, ...installed.volumes.map(volume => (initialFree.get(volume.volume) ?? volume.freeBytes) - volume.freeBytes))
      preflight.minimumBytes = Math.max(12 * 1024 ** 3, measured)
      preflight.space.push(frontendSpace([ws, env.NPM_CONFIG_CACHE, preflight.evidence], "reserva medida", preflight.minimumBytes))
      preflight.chromium = chromiumPreflight(ws, env)
      log("Chromium: " + JSON.stringify(preflight.chromium))
      log("npm run typecheck antes das suÃ­tes completas/build/E2Eâ€¦")
      exigir(npm(["run", "typecheck"]), 1, "npm run typecheck prÃ©vio")
    }
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
    const consultar = (sql) => exigir(run(pg("psql"), [...psqlArgs, "-Atqc", sql], { env: { ...env, PGPASSWORD: SENHA } }), 1, "catÃ¡logo de invariantes")
    const baseline = path.join(tmp, "baseline.sql")
    fs.writeFileSync(baseline, exigir(prisma(["migrate", "diff", "--from-empty", "--to-schema-datamodel", path.join(tmp, "base.prisma"), "--script"]), 5, "baseline da base").out)
    aplicar(baseline, "baseline da base")
    for (const m of novas) {
      aplicar(path.join(ws, "prisma/migrations", m, "migration.sql"), `migration ${m}`)
      log(`aplicada ${m} (transaÃ§Ã£o Ãºnica, ON_ERROR_STOP)`)
    }
    const invariants = invariantesPessoas(ws, tmp, migsBase.has(MIGRACAO_PESSOAS), aplicar, consultar)
    const drift = prisma(["migrate", "diff", "--from-url", URL_DB, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"])
    if (drift.code !== 0) throw new Falha(1, `drift migration Ã— schema.prisma: ${(drift.out + drift.err).trim().slice(0, 1500)}`)
    log("drift migration Ã— schema.prisma: nenhum")
    const json = path.join(tmp, "vitest.json")
    const t = run(process.execPath, [path.join(ws, "node_modules/vitest/vitest.mjs"), "run", "lib/pessoas", ...(frontend ? ["scripts/pessoas/frontend.contract.test.ts", "scripts/pessoas/frontend.integration.test.ts", "lib/auth/page-access.test.ts", "lib/auth/proxy-enterprise-dashboard.test.ts"] : []), "--no-file-parallelism", "--reporter=default", "--reporter=json", `--outputFile.json=${json}`], { cwd: ws, env, inherit: true })
    if (!fs.existsSync(json)) throw new Falha(1, `vitest nÃ£o produziu relatÃ³rio (exit ${t.code})`)
    const rel = JSON.parse(fs.readFileSync(json, "utf8"))
    log(`vitest: ${rel.numPassedTests} passaram Â· ${rel.numFailedTests} falharam Â· ${rel.numPendingTests} pulados Â· ${rel.numTodoTests} todo`)
    const localFailures = []
    if (t.code !== 0 || !rel.success || rel.numFailedTests > 0) {
      if (!frontend) throw new Falha(1, "testes falharam")
      localFailures.push("testes falharam")
    }
    if (rel.numPendingTests > 0 || rel.numTodoTests > 0 || !rel.numTotalTests ||
        rel.testResults.some((f) => f.assertionResults.some((a) => !["passed", ...(frontend ? ["failed"] : [])].includes(a.status)))) throw new Falha(1, "testes pulados/todo/nÃ£o executados â€” PASS oco recusado")
    const suite = (name) => { try { return suiteInteira(rel, name) } catch (error) { if (!frontend) throw error; localFailures.push(error.message); return 0 } }
    summary = { head, base, total: rel.numTotalTests, skipped: rel.numPendingTests, todo: rel.numTodoTests,
      integration: suite(INTEGRACAO), invariants,
      ...(frontend ? { preflight, typecheck: "PASS", frontendContract: suite("scripts/pessoas/frontend.contract.test.ts"),
        frontendIntegration: suite("scripts/pessoas/frontend.integration.test.ts"), pageAccess: suite("lib/auth/page-access.test.ts"), proxyDashboard: suite("lib/auth/proxy-enterprise-dashboard.test.ts"), historicoPrivacidade: suite("lib/pessoas/historico-privacidade.test.ts") } : {}) }
    if (hardening) {
      summary.hardening = suite(HARDENING)
      const { inspectPwaBuild } = await import(pathToFileURL(path.join(ws, "scripts/pessoas/inspect-pwa-build.mjs")).href)
      const build = () => {
        if (frontend) preflight.space.push(frontendSpace([ws, env.NPM_CONFIG_CACHE, preflight.evidence, preflight.chromium.executable], "antes do build", preflight.minimumBytes))
        log("npm run build (PWA habilitado, sem autoridade de migration)â€¦")
        const b = exigir(npm(["run", "build"]), 1, "npm run build")
        if (!b.out.includes("MIGRATION_SKIPPED") || /MIGRATION_(?:RUN|SUCCEEDED)/.test(b.out)) throw new Falha(1, "build nÃ£o confirmou MIGRATION_SKIPPED")
        log("npm run build PASS Â· MIGRATION_SKIPPED")
      }
      const failures = [...localFailures]
      const conferirEtapa = async (name, executar) => {
        try { await executar(); log(name + " PASS") }
        catch (error) { failures.push(name + ": " + error.message); log(name + " FAIL: " + error.message) }
      }
      let built = false
      await conferirEtapa("build oficial", () => { build(); built = true })
      if (built) await conferirEtapa("aceite PWA", async () => { summary.pwa = await inspectPwaBuild(ws, log) })
      // DiagnÃ³sticos independentes continuam mesmo se o aceite PWA falhar.
      if (!frontend) await conferirEtapa("npm run typecheck", () => {
        exigir(npm(["run", "typecheck"]), 1, "npm run typecheck")
        summary.typecheck = "PASS"
      })
      await conferirEtapa("ESLint focado", () => {
        exigir(run(process.execPath, [path.join(ws, "node_modules/eslint/bin/eslint.js"), "lib/pessoas", "scripts/pessoas", "next.config.mjs", ...(frontend ? ["app/dashboard/pessoas", "components/dashboard/pessoas", "app/api/pessoas/disponibilidade", "lib/navigation/dashboard-nav-items.ts", "components/painel-inicial/Sidebar.tsx", "components/painel-inicial/MobileNavSheet.tsx", "lib/auth/page-access.ts", "lib/auth/page-access.test.ts", "lib/auth/proxy-enterprise-dashboard.test.ts"] : []), "--max-warnings=0"], { cwd: ws, env }), 1, "ESLint focado")
        summary.lint = "PASS"
      })
      if (failures.length) throw new Falha(1, failures.join("\n"))
      // Build adicional solicitado depois do runner/aceite, no mesmo HEAD.
      build()
      await inspectPwaBuild(ws, log)
      summary.build = "PASS"
      summary.p2034MaxAttempts = 3
      if (frontend) {
        const port = await new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)) }) })
        summary.globalLintExit = npm(["run", "lint"]).code
        summary.e2e = {}
        for (const flag of ["on", "off"]) {
          const report = path.join(tmp, "playwright-" + flag + ".json")
          const e2eEnv = { ...env, PESSOAS_E2E_ARTIFACTS: path.join(tmp, "visual-" + flag), PESSOAS_DP_ENABLED: flag, PESSOAS_TEST_PORT: String(port), NEXTAUTH_URL: "http://127.0.0.1:" + port, PESSOAS_E2E_REPORT: report }
          exigir(run(process.execPath, [path.join(ws, "node_modules/@playwright/test/cli.js"), "test", "--config=scripts/pessoas/playwright.frontend.config.ts"], { cwd: ws, env: e2eEnv, inherit: true }), 1, "E2E " + flag)
          if (!fs.existsSync(report)) throw new Falha(1, "E2E sem relatÃ³rio")
          const result = JSON.parse(fs.readFileSync(report, "utf8"))
          if (!result.stats.expected || result.stats.unexpected || result.stats.skipped || result.stats.flaky) throw new Falha(1, "E2E incompleto")
          summary.e2e[flag] = result.stats
          const visual = path.join(tmp, "visual-" + flag)
          const destination = path.join(root, "docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002/visual")
          if (fs.existsSync(visual)) {
            fs.mkdirSync(destination, { recursive: true })
            for (const file of fs.readdirSync(visual, { recursive: true })) if (file.endsWith(".png")) {
              fs.copyFileSync(path.join(visual, file), path.join(destination, path.basename(file)))
            }
          }
          if (!(await portaLivre(port))) throw new Falha(5, "E2E deixou servidor ativo")
        }
        summary.previewR2 = "PENDENTE_NAO_AUTORIZADO"
      }
    }
  } finally {
    let cleanupError
    if (pgLigado && fs.existsSync(path.join(dados, "postmaster.pid"))) {
      try { exigir(run(pg("pg_ctl"), ["-D", dados, "-m", "fast", "-w", "stop"], { ignore: true, timeout: 120_000 }), 5, "pg_ctl stop") } catch (error) { cleanupError = error }
    }
    // Alvo absoluto resolvido e conferido antes de qualquer remoÃ§Ã£o recursiva.
    if (path.dirname(path.resolve(tmp)) !== path.resolve(os.tmpdir()) || !/^omni-pessoas-test-/.test(path.basename(tmp))) {
      throw new Falha(5, "alvo de limpeza fora do diretÃ³rio temporÃ¡rio autorizado")
    }
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); break } catch { await new Promise((resolve) => setTimeout(resolve, 1000)) }
    }
    if (fs.existsSync(tmp) || !(await portaLivre(PORT))) cleanupError = new Falha(5, "limpeza incompleta: workspace ou porta ainda presentes")
    if (cleanupError) throw cleanupError
    log("CLEANUP PASS Â· cluster/workspace/node_modules/.next/SW/relatÃ³rios removidos Â· porta 55439 livre")
  }
  summary.cleanup = "PASS"
  log(`PASS Â· HEAD ${head} Â· testes ${summary.total} Â· skipped ${summary.skipped} Â· todo ${summary.todo}`)
  return summary
}
export function reportFailure(error) {
  process.stderr.write(`[pessoas-test] FALHA${error instanceof Falha ? "" : " inesperada"}: ${error.message}\n`)
  process.exitCode = error instanceof Falha ? error.exitCode : 1
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runOfficialTests().catch(reportFailure)
}
