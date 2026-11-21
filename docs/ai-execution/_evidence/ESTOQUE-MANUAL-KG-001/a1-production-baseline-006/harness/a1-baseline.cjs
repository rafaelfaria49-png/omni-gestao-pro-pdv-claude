// A1 do runbook KG: baseline SÓ LEITURA de produção (Neon dry-mouse-36002471 / br-muddy-meadow-ac7ah2wl / omnigestao_prod).
// Fases: url (valida sem conectar) | sql (psql, a1-baseline.sql) | diff (prisma migrate diff, catálogo).
// Toda sessão: PGOPTIONS default_transaction_read_only=on + statement_timeout/lock_timeout curtos; o SQL abre
// BEGIN ... READ ONLY e confere a identidade no servidor antes de qualquer diagnóstico; termina em ROLLBACK.
// Segredos: lidos de C:\Projetos\secrets\neon-production.env (NEON_PROD_DIRECT_URL); nunca vão para argv nem stdout.
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const SECRETS_FILE = "C:/Projetos/secrets/neon-production.env"
const KEY = "NEON_PROD_DIRECT_URL"
const EXPECT = { ep: "ep-summer-tooth-acltc6wi", db: "omnigestao_prod", project: "dry-mouse-36002471", branch: "br-muddy-meadow-ac7ah2wl" }
const PSQL = "C:/Program Files/PostgreSQL/17/bin/psql.exe"
const PRISMA_JS = "C:/Projetos/omni-gestao/node_modules/prisma/build/index.js"
const HERE = __dirname
const APP = "kg-a1-readonly"
const PGOPTS = "-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=60000"

const SECRETS = []
const red = (s) => { let o = String(s || ""); for (const x of SECRETS) if (x) o = o.split(x).join("<redacted>"); return o }
const die = (m) => { console.error("ABORTADO: " + red(m)); process.exit(1) }

function target() {
  const txt = fs.readFileSync(SECRETS_FILE, "utf8").replace(/^\uFEFF/, "")
  const line = txt.split(/\r?\n/).find((l) => l.startsWith(KEY + "="))
  if (!line) die(KEY + " ausente")
  const raw = line.slice(KEY.length + 1).trim().replace(/^"|"$/g, "")
  SECRETS.push(raw)
  const u = new URL(raw)
  const pw = decodeURIComponent(u.password)
  SECRETS.push(pw, u.password, encodeURIComponent(pw))
  const label = u.hostname.split(".")[0]
  const t = { u, host: u.hostname, port: u.port || "5432", user: decodeURIComponent(u.username), pw, db: u.pathname.slice(1), label }
  if (label !== EXPECT.ep) die(`endpoint ${label} ≠ ${EXPECT.ep} (pooler não aceito: precisa da conexão direta)`)
  if (t.db !== EXPECT.db) die(`database ${t.db} ≠ ${EXPECT.db}`)
  if (!pw) die("senha ausente")
  return t
}

const phase = process.argv[2]
const t = target()
const cb = t.u.searchParams.get("channel_binding")
console.log(`url: OK sem conectar · endpoint=${t.label} pooler=off usuário=${t.user} db=${t.db} sslmode=${t.u.searchParams.get("sslmode") || "-"} channel_binding=${cb || "-"} senha_presente=true`)

if (phase === "url") process.exit(0)

if (phase === "sql") {
  const r = spawnSync(PSQL, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-P", "pager=off", "-f", path.join(HERE, "a1-baseline.sql").replace(/\\/g, "/")], {
    encoding: "utf8", timeout: 120000,
    env: { ...process.env, PGHOST: t.host, PGPORT: t.port, PGUSER: t.user, PGPASSWORD: t.pw, PGDATABASE: t.db,
      PGSSLMODE: "require", ...(cb ? { PGCHANNELBINDING: cb } : {}), PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "15",
      PGAPPNAME: APP, PGOPTIONS: PGOPTS },
  })
  process.stdout.write(red(r.stdout))
  if (r.stderr) process.stdout.write("[stderr] " + red(r.stderr))
  console.log(`exit=${r.status}`)
  process.exit(r.status === 0 ? 0 : 1)
}

if (phase === "diff") {
  // Prisma: conexão direta, mesmas opções read-only (provado localmente que o schema engine as honra e só faz SELECT/WITH).
  const u = new URL(t.u.toString())
  u.searchParams.delete("channel_binding")
  u.searchParams.set("sslmode", "require")
  u.searchParams.set("application_name", APP + "-diff")
  u.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=1000")
  const url = u.toString(); SECRETS.push(url)
  for (const [nome, schema] of [["schema da #315", process.argv[3]], ["schema da main", process.argv[4]]]) {
    if (!schema || !fs.existsSync(schema)) die("schema ausente: " + nome)
    const r = spawnSync(process.execPath, [PRISMA_JS, "migrate", "diff", "--from-url", url, "--to-schema-datamodel", schema], {
      encoding: "utf8", timeout: 120000, cwd: HERE, env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" } })
    console.log(`--- migrate diff produção × ${nome} (exit=${r.status})`)
    process.stdout.write(red(r.stdout))
    if (r.stderr) process.stdout.write("[stderr] " + red(r.stderr))
  }
  process.exit(0)
}
die("fase: url | sql | diff")
