// A2 do runbook KG: gera OFFLINE as credenciais de omni_runtime_v2 e omni_migrator e monta as URLs futuras.
// Nunca conecta. Nunca imprime segredo. Recusa sobrescrever. Fases: gerar | validar
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")

const SRC = "C:/Projetos/secrets/neon-production.env"
const DIR = "C:/Projetos/secrets/neon-production-kg"
const OUT = path.join(DIR, ".env")
const EP = "ep-summer-tooth-acltc6wi"
const DB = "omnigestao_prod"
const die = (m) => { console.error("ABORTADO: " + m); process.exit(1) }

function readEnv(file) {
  const o = {}
  for (const l of fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim().replace(/^"|"$/g, "")
  }
  return o
}

const phase = process.argv[2]
if (phase === "gerar") {
  if (fs.existsSync(OUT)) die("já existe " + OUT + " — não sobrescrevo (evita rotação acidental)")
  const src = readEnv(SRC)
  const pool = new URL(src.NEON_PROD_DATABASE_URL), direct = new URL(src.NEON_PROD_DIRECT_URL)
  if (pool.hostname.split(".")[0] !== EP + "-pooler") die("host pooler inesperado")
  if (direct.hostname.split(".")[0] !== EP) die("host direto inesperado")
  if (pool.pathname.slice(1) !== DB || direct.pathname.slice(1) !== DB) die("database inesperado")
  const gen = () => crypto.randomBytes(32).toString("base64url") // 256 bits, só [A-Za-z0-9_-]: sem escape na URL
  const mig = gen(), rt = gen()
  if (mig === rt) die("senhas iguais")
  const url = (user, pw, host, q) => `postgresql://${user}:${pw}@${host}/${DB}?${q}`
  const lines = [
    "# A2 do runbook KG (ESTOQUE_MANUAL_KG_RUNBOOK.md §4) — gerado offline em " + new Date().toISOString(),
    "# NÃO aplicado no Neon. Papéis criados só no A3 (rollout/01-papeis.sql lê as senhas por \\getenv).",
    "# Runtime vai para a Vercel SÓ no J3 (Production). Migrator NUNCA vai para a Vercel.",
    "KG_MIGRATOR_PASSWORD=" + mig,
    "KG_RUNTIME_V2_PASSWORD=" + rt,
    "KG_PROD_RUNTIME_V2_DATABASE_URL=" + url("omni_runtime_v2", rt, pool.hostname, "sslmode=require&pgbouncer=true&connect_timeout=15"),
    "KG_PROD_RUNTIME_V2_DIRECT_URL=" + url("omni_runtime_v2", rt, direct.hostname, "sslmode=require"),
    "KG_MIGRATOR_DIRECT_URL=" + url("omni_migrator", mig, direct.hostname, "sslmode=require"),
    "",
  ]
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(OUT, lines.join("\n"), { flag: "wx", mode: 0o600 })
  console.log("gerado: " + OUT + " (5 chaves; valores não exibidos)")
  process.exit(0)
}

if (phase === "validar") {
  const e = readEnv(OUT)
  const src = readEnv(SRC)
  const legacyPw = [src.NEON_PROD_DATABASE_URL, src.NEON_PROD_DIRECT_URL, src.NEON_PREVIEW_DATABASE_URL, src.NEON_PREVIEW_DIRECT_URL]
    .filter(Boolean).map((u) => decodeURIComponent(new URL(u).password))
  const checks = []
  const ok = (nome, cond) => checks.push([nome, !!cond])
  const pw = { mig: e.KG_MIGRATOR_PASSWORD || "", rt: e.KG_RUNTIME_V2_PASSWORD || "" }
  for (const [k, v] of Object.entries(pw)) {
    ok(`${k}: 43 chars base64url (256 bits)`, /^[A-Za-z0-9_-]{43}$/.test(v))
    ok(`${k}: difere das senhas legadas`, !legacyPw.includes(v))
  }
  ok("senhas distintas", pw.mig && pw.mig !== pw.rt)
  const spec = [
    ["KG_PROD_RUNTIME_V2_DATABASE_URL", "omni_runtime_v2", pw.rt, EP + "-pooler", { sslmode: "require", pgbouncer: "true" }],
    ["KG_PROD_RUNTIME_V2_DIRECT_URL", "omni_runtime_v2", pw.rt, EP, { sslmode: "require" }],
    ["KG_MIGRATOR_DIRECT_URL", "omni_migrator", pw.mig, EP, { sslmode: "require" }],
  ]
  for (const [k, user, p, label, q] of spec) {
    let u; try { u = new URL(e[k]) } catch { ok(`${k}: URL válida`, false); continue }
    ok(`${k}: protocolo postgresql`, u.protocol === "postgresql:")
    ok(`${k}: usuário ${user}`, decodeURIComponent(u.username) === user)
    ok(`${k}: senha do papel`, decodeURIComponent(u.password) === p)
    ok(`${k}: endpoint ${label}`, u.hostname.split(".")[0] === label)
    ok(`${k}: host neon.tech sa-east-1`, /\.sa-east-1\.aws\.neon\.tech$/.test(u.hostname))
    ok(`${k}: database ${DB}`, u.pathname.slice(1) === DB)
    for (const [qk, qv] of Object.entries(q)) ok(`${k}: ${qk}=${qv}`, u.searchParams.get(qk) === qv)
    if (!q.pgbouncer) ok(`${k}: sem pgbouncer`, !u.searchParams.has("pgbouncer"))
  }
  // Fora do repositório
  const repo = path.resolve("C:/Projetos/omni-gestao").toLowerCase()
  ok("arquivo fora do repositório", !path.resolve(OUT).toLowerCase().startsWith(repo))
  for (const [n, c] of checks) console.log(`${c ? "OK  " : "FAIL"} ${n}`)
  const fails = checks.filter((c) => !c[1]).length
  console.log(`A2_VALIDACAO ${fails === 0 ? "PASS" : "FAIL"} (${checks.length - fails}/${checks.length})`)
  process.exit(fails ? 1 : 0)
}
die("fase: gerar | validar")
