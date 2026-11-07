// Ensaio ESTOQUE-MANUAL-KG-NEON-REAL-REHEARSAL-002 — conexões Neon com trava de destino.
// Produção: SOMENTE leitura, sessão read-only imposta pelo servidor (default_transaction_read_only=on).
// Clone: só aceita host de endpoint explícito diferente do endpoint de produção; senha herdada da origem
// (branch Neon copia papéis/senhas), nunca escrita em arquivo nem em argv.
const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")

const PSQL = "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
const PROJECT = "dry-mouse-36002471"
const PROD_BRANCH = "br-muddy-meadow-ac7ah2wl"
const DIR = __dirname

const envText = fs.readFileSync("C:\\Projetos\\secrets\\neon-production.env", "utf8")
const prodUrl = new URL(envText.match(/^NEON_PROD_DIRECT_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, ""))
const PROD_HOST = prodUrl.hostname
const PROD_EP = PROD_HOST.split(".")[0] // ep-summer-tooth-acltc6wi
const OWNER_PW = decodeURIComponent(prodUrl.password)
const SECRETS = [OWNER_PW, PROD_HOST]

const extraPw = {} // papéis criados no clone (omni_migrator / omni_runtime_v2): gerados e mantidos em memória/arquivo de scratch
function setPw(role, pw) { extraPw[role] = pw; SECRETS.push(pw) }

function red(s) {
  let o = String(s || "")
  for (const x of SECRETS) if (x) o = o.split(x).join("<redacted>")
  return o
}

function cloneHostOk(host) {
  if (!/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(host)) throw new Error(`host de clone inválido: ${host}`)
  const ep = host.split(".")[0].replace(/-pooler$/, "")
  if (ep === PROD_EP) throw new Error("RECUSADO: host do clone é o endpoint de produção")
  if (host.slice(host.indexOf(".")) !== PROD_HOST.slice(PROD_HOST.indexOf("."))) throw new Error("RECUSADO: região/domínio diferente do esperado")
  return ep
}

// target: { kind: "prod" } | { kind: "clone", host }
function run(target, { role = "neondb_owner", db = "omnigestao_prod", sql, file, vars = {}, single = false, extraEnv = {}, timeoutMs = 120000 } = {}) {
  let host, env
  if (target.kind === "prod") {
    if (role !== "neondb_owner") throw new Error("prod: só neondb_owner read-only")
    host = PROD_HOST
    env = { PGOPTIONS: "-c default_transaction_read_only=on" }
  } else if (target.kind === "clone") {
    const ep = cloneHostOk(target.host)
    if (!/^br-[a-z0-9-]+$/.test(target.branchId) || target.branchId === PROD_BRANCH || ep !== target.ep) throw new Error("RECUSADO: branch/endpoint do clone não comprovados")
    host = target.host
    env = {}
  } else throw new Error("alvo desconhecido")
  const pw = role === "neondb_owner" ? OWNER_PW : extraPw[role]
  if (!pw) throw new Error(`sem senha para ${role}`)
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", ...(single ? ["-1"] : [])]
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`)
  // trava de destino NA PRÓPRIA CONEXÃO, antes de qualquer comando: aborta (divisão por zero) se não for o clone
  if (target.kind === "clone") args.push("-c", guardSql(target))
  if (sql) args.push("-c", sql)
  if (file) args.push("-f", file)
  return new Promise((resolve) => {
    const ch = spawn(PSQL, args, {
      env: {
        ...process.env, PGHOST: host, PGPORT: "5432", PGUSER: role, PGPASSWORD: pw, PGDATABASE: db,
        PGSSLMODE: "require", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "30", PGAPPNAME: "kg-rehearsal-002", ...env, ...extraEnv,
      },
    })
    let o = "", e = ""
    const t = setTimeout(() => ch.kill(), timeoutMs)
    ch.stdout.on("data", (d) => { o += d }); ch.stderr.on("data", (d) => { e += d })
    ch.on("close", (status) => {
      clearTimeout(t)
      let out = red(o).trim()
      if (target.kind === "clone") out = out.replace(/^kg_guard_ok\n?/, "")
      resolve({ status, out, err: red(e).trim() })
    })
  })
}

function guardSql(t) {
  return `SELECT 'kg_guard_ok' WHERE 1 / CASE WHEN current_setting('neon.branch_id') = '${t.branchId}' AND current_setting('neon.endpoint_id') = '${t.ep}'`
    + ` AND current_setting('neon.project_id') = '${PROJECT}' AND current_setting('neon.branch_id') <> '${PROD_BRANCH}' THEN 1 ELSE 0 END = 1`
}

// mesma trava para clientes Prisma, antes de qualquer escrita que deva dar certo
async function guardPrisma(prisma, t) {
  const r = await prisma.$queryRawUnsafe(`SELECT current_setting('neon.branch_id') AS b, current_setting('neon.endpoint_id') AS e, current_setting('neon.project_id') AS p`)
  const { b, e, p } = r[0]
  if (b !== t.branchId || e !== t.ep || p !== PROJECT || b === PROD_BRANCH) throw new Error(`RECUSADO: conexão Prisma fora do clone (${b}/${e})`)
}

// URL para Prisma (só clone). Nunca logar.
function cloneUrl(host, role, db = "omnigestao_prod", extra = "") {
  cloneHostOk(host)
  const pw = role === "neondb_owner" ? OWNER_PW : extraPw[role]
  return `postgresql://${encodeURIComponent(role)}:${encodeURIComponent(pw)}@${host}/${db}?sslmode=require${extra}`
}

module.exports = { run, red, setPw, cloneUrl, cloneHostOk, guardPrisma, guardSql, PROD_EP, PROJECT, PROD_BRANCH, DIR, OWNER_PW }
