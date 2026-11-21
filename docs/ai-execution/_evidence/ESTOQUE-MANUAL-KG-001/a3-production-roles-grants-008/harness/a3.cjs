// A3 do runbook KG: papéis (01, database neondb) e grants (02, database omnigestao_prod) em PRODUÇÃO.
// Alvo único: Neon dry-mouse-36002471 / br-muddy-meadow-ac7ah2wl / ep-summer-tooth-acltc6wi (conexão direta).
// Fases: url (sem conectar) | pre (read-only) | s01 | s02 | pos (read-only)
//  - pre/pos: PGOPTIONS default_transaction_read_only=on; o SQL confere a identidade com \if antes de qualquer consulta.
//  - s01/s02: exigem A3_AUTORIZADO=1; a trava de identidade roda NA MESMA transação (-1) antes do script oficial
//    (divisão por zero aborta tudo se o servidor não for o esperado). Scripts oficiais executados sem cópia/edição.
// Segredos: papel antigo de C:\Projetos\secrets\neon-production.env (NEON_PROD_DIRECT_URL); senhas novas de
// C:\Projetos\secrets\neon-production-kg\.env (A2), só no ambiente do psql do s01. Nunca em argv nem stdout.
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const OWNER_FILE = "C:/Projetos/secrets/neon-production.env"
const KG_FILE = "C:/Projetos/secrets/neon-production-kg/.env"
const EXPECT = { ep: "ep-summer-tooth-acltc6wi", db: "omnigestao_prod", admin: "neondb", project: "dry-mouse-36002471", branch: "br-muddy-meadow-ac7ah2wl", user: "neondb_owner" }
const PSQL = "C:/Program Files/PostgreSQL/17/bin/psql.exe"
const HERE = __dirname
const ROLLOUT = path.resolve(HERE, "../../../../../padaria/pesagem/rollout").replace(/\\/g, "/")
const RO = "-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=60000"
const RW = "-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=60000"

const SECRETS = []
const red = (s) => { let o = String(s || ""); for (const x of SECRETS) if (x) o = o.split(x).join("<redacted>"); return o }
const die = (m) => { console.error("ABORTADO: " + red(m)); process.exit(1) }

function readEnv(file) {
  const o = {}
  for (const l of fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim().replace(/^"|"$/g, "")
  }
  return o
}

const raw = readEnv(OWNER_FILE).NEON_PROD_DIRECT_URL || die("NEON_PROD_DIRECT_URL ausente")
SECRETS.push(raw)
const u = new URL(raw)
const ownerPw = decodeURIComponent(u.password)
SECRETS.push(ownerPw, u.password, encodeURIComponent(ownerPw))
const kg = readEnv(KG_FILE)
for (const k of Object.keys(kg)) if (kg[k]) SECRETS.push(kg[k], encodeURIComponent(kg[k]))
const label = u.hostname.split(".")[0]
if (label !== EXPECT.ep) die(`endpoint ${label} ≠ ${EXPECT.ep} (pooler não aceito)`)
if (u.pathname.slice(1) !== EXPECT.db) die("database da URL ≠ " + EXPECT.db)
if (decodeURIComponent(u.username) !== EXPECT.user) die("usuário ≠ " + EXPECT.user)
if (!ownerPw) die("senha ausente")
if (!/^[A-Za-z0-9_-]{43}$/.test(kg.KG_MIGRATOR_PASSWORD || "") || !/^[A-Za-z0-9_-]{43}$/.test(kg.KG_RUNTIME_V2_PASSWORD || "")) die("senhas do A2 ausentes ou fora do formato")
if (kg.KG_MIGRATOR_PASSWORD === kg.KG_RUNTIME_V2_PASSWORD || [kg.KG_MIGRATOR_PASSWORD, kg.KG_RUNTIME_V2_PASSWORD].includes(ownerPw)) die("senhas do A2 inválidas")
console.log(`url: OK sem conectar · endpoint=${label} pooler=off usuário=${EXPECT.user} dbs=${EXPECT.admin},${EXPECT.db} senhas_a2=2 (formato ok, distintas)`)

function guard(db) {
  return `SELECT 'A3_GUARD_OK' WHERE 1 / CASE WHEN current_setting('neon.project_id', true) = '${EXPECT.project}'`
    + ` AND current_setting('neon.branch_id', true) = '${EXPECT.branch}' AND current_setting('neon.endpoint_id', true) = '${EXPECT.ep}'`
    + ` AND current_database() = '${db}' AND current_user = '${EXPECT.user}' AND NOT pg_is_in_recovery() THEN 1 ELSE 0 END = 1`
}

function psql(db, opts, args, extraEnv = {}) {
  const r = spawnSync(PSQL, ["-X", "-v", "ON_ERROR_STOP=1", "-P", "pager=off", ...args], {
    encoding: "utf8", timeout: 120000,
    env: { ...process.env, PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: EXPECT.user, PGPASSWORD: ownerPw, PGDATABASE: db,
      PGSSLMODE: "require", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "20", PGAPPNAME: "kg-a3-" + process.argv[2], PGOPTIONS: opts,
      ...extraEnv },
  })
  process.stdout.write(red(r.stdout))
  if (r.stderr) process.stdout.write("[stderr] " + red(r.stderr))
  console.log(`exit=${r.status}`)
  return r
}

const phase = process.argv[2]
if (phase === "url") process.exit(0)
console.log(`fase=${phase} início=${new Date().toISOString()}`)

if (phase === "pre" || phase === "pos") {
  let ok = true
  for (const db of [EXPECT.admin, EXPECT.db]) {
    console.log(`\n===== ${phase} · ${db} =====`)
    const r = psql(db, RO, ["-q", "-v", `alvo_db=${db}`, "-v", `old_role=${EXPECT.user}`, "-f", path.join(HERE, `a3-${phase}.sql`).replace(/\\/g, "/")])
    ok = ok && r.status === 0
  }
  if (phase === "pos") {
    console.log(`\n===== 06-verificacao.sql (oficial) · ${EXPECT.db} =====`)
    const r = psql(EXPECT.db, RO, ["-At", "-v", `old_role=${EXPECT.user}`, "-f", `${ROLLOUT}/06-verificacao.sql`])
    ok = ok && r.status === 0
  }
  console.log(`fim=${new Date().toISOString()}`)
  process.exit(ok ? 0 : 1)
}

if (phase === "s01" || phase === "s02") {
  if (process.env.A3_AUTORIZADO !== "1") die("A3_AUTORIZADO=1 ausente")
  const s01 = phase === "s01"
  const db = s01 ? EXPECT.admin : EXPECT.db
  const file = `${ROLLOUT}/${s01 ? "01-papeis.sql" : "02-grants-runtime.sql"}`
  const args = ["-1", ...(s01 ? [] : ["-v", `prod_db=${EXPECT.db}`]), "-c", guard(db), "-f", file]
  const env = s01 ? { KG_MIGRATOR_PASSWORD: kg.KG_MIGRATOR_PASSWORD, KG_RUNTIME_V2_PASSWORD: kg.KG_RUNTIME_V2_PASSWORD } : {}
  console.log(`script=${path.basename(file)} database=${db} transação=única (-1) trava=identidade na mesma transação`)
  const r = psql(db, RW, args, env)
  const marker = s01 ? "KG_PAPEIS_OK" : "KG_RUNTIME_GRANTS_OK"
  const seen = (r.stdout + r.stderr).includes(marker) && (r.stdout + r.stderr).includes("A3_GUARD_OK")
  console.log(`${marker}=${seen && r.status === 0 ? "YES" : "NO"} fim=${new Date().toISOString()}`)
  process.exit(seen && r.status === 0 ? 0 : 1)
}
if (phase === "pooler") {
  // Caminho do app em Production: papel antigo pelo pooler (NEON_PROD_DATABASE_URL). Só leitura, sem startup options
  // (o pgbouncer recusa); o READ ONLY vai na própria transação.
  const p = new URL(readEnv(OWNER_FILE).NEON_PROD_DATABASE_URL || die("NEON_PROD_DATABASE_URL ausente"))
  SECRETS.push(p.toString(), p.password, decodeURIComponent(p.password))
  if (p.hostname.split(".")[0] !== EXPECT.ep + "-pooler" || p.pathname.slice(1) !== EXPECT.db || decodeURIComponent(p.username) !== EXPECT.user) die("URL do pooler fora do alvo")
  const r = spawnSync(PSQL, ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", "BEGIN READ ONLY",
    "-c", "SELECT 'pooler user=' || current_user || ' db=' || current_database() || ' endpoint=' || current_setting('neon.endpoint_id', true) || ' tx_ro=' || current_setting('transaction_read_only') || ' produtos=' || (SELECT count(*) FROM estoque_produtos)",
    "-c", "ROLLBACK"], {
    encoding: "utf8", timeout: 60000,
    env: { ...process.env, PGHOST: p.hostname, PGPORT: p.port || "5432", PGUSER: EXPECT.user, PGPASSWORD: decodeURIComponent(p.password), PGDATABASE: EXPECT.db,
      PGSSLMODE: "require", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "20", PGAPPNAME: "kg-a3-pooler" },
  })
  process.stdout.write(red(r.stdout))
  if (r.stderr) process.stdout.write("[stderr] " + red(r.stderr))
  console.log(`exit=${r.status} fim=${new Date().toISOString()}`)
  process.exit(r.status === 0 ? 0 : 1)
}
die("fase: url | pre | s01 | s02 | pos | pooler")
