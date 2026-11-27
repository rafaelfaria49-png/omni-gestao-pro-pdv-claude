// P3 do PR315-PREVIEW-ISOLATION-READINESS-003: envs de Preview do omni-gestao-pro → Neon preview.
// Fases: plan (SÓ LEITURA: localiza as entradas por id, classifica os valores novos em memória, imprime as operações)
//        apply (exige P3_AUTORIZADO=1; altera só entradas target=[preview], nunca production/development).
// Valores vêm de P2_GENERATED_FILE (fora do repo) e vão só no corpo HTTPS da API; nunca argv, stdout ou arquivo.
// Opcional (P3_LIMPAR_OPS_V4=1): remove DATABASE_URL/DIRECT_URL dos 4 overrides ops-v4 (caem no genérico).
const fs = require("node:fs")

const PROJECT = "omni-gestao-pro"
const PROJECT_ID = "prj_wjkHKw2jFQfY8regMYtkYXwgavuz"
const PR_BRANCH = "claude/estoque-manual-kg-001"
const OPS_V4 = ["codex/ops-v4-goal003-family-regularization", "codex/release-ops-v4-datas",
  "goal/ops-v4-financeiro-retirada-garantia-002", "codex/release-ops-v4-vercel"]
const PROD_EP = "ep-summer-tooth-acltc6wi"
const EXPECT = { // chave do arquivo gerado → endpoint, pooler
  PREVIEW_MAIN_RUNTIME_DATABASE_URL: ["ep-purple-morning-b6ajdsfk", true], PREVIEW_MAIN_RUNTIME_DIRECT_URL: ["ep-purple-morning-b6ajdsfk", false],
  PREVIEW_KG_RUNTIME_DATABASE_URL: ["ep-red-wave-b6bbj667", true], PREVIEW_KG_RUNTIME_DIRECT_URL: ["ep-red-wave-b6bbj667", false],
}
const die = (m) => { console.error("ABORTADO: " + m); process.exit(1) }

const phase = process.argv[2]
if (!["plan", "apply"].includes(phase)) die("fase: plan | apply")
if (phase === "apply" && process.env.P3_AUTORIZADO !== "1") die("apply exige P3_AUTORIZADO=1 (autorização humana específica da P3)")
const genFile = process.env.P2_GENERATED_FILE || die("defina P2_GENERATED_FILE")
const tok = JSON.parse(fs.readFileSync(process.env.APPDATA + "/xdg.data/com.vercel.cli/auth.json", "utf8")).token
const team = JSON.parse(fs.readFileSync("C:/Projetos/omni-gestao/.vercel/project.json", "utf8")).orgId
const G = {}
for (const l of fs.readFileSync(genFile, "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) G[m[1]] = m[2] }
const SECRETS = [tok, ...Object.values(G)]
const red = (s) => { let o = String(s); for (const x of SECRETS) if (x) o = o.split(x).join("<redacted>"); return o }

async function api(method, p, body) {
  const r = await fetch(`https://api.vercel.com${p}${p.includes("?") ? "&" : "?"}teamId=${team}`, {
    method, headers: { Authorization: `Bearer ${tok}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  if (!r.ok) die(`${method} ${p.split("?")[0]} → HTTP ${r.status} ${red(t).slice(0, 300)}`)
  return t ? JSON.parse(t) : {}
}

function checkValue(k) {
  const v = G[k] || die(`${k} ausente em P2_GENERATED_FILE`)
  const u = new URL(v); const label = u.hostname.split(".")[0]; const [ep, pooler] = EXPECT[k]
  if (label.replace(/-pooler$/, "") === PROD_EP) die(`${k}: endpoint de produção`)
  if (label !== (pooler ? `${ep}-pooler` : ep)) die(`${k}: endpoint/pooler inesperado`)
  if (decodeURIComponent(u.username) !== "preview_runtime" || u.pathname !== "/omnigestao_preview") die(`${k}: usuário/database inesperado`)
  if (pooler && u.searchParams.get("pgbouncer") !== "true") die(`${k}: pooled sem pgbouncer=true`)
  if (u.searchParams.get("sslmode") !== "require") die(`${k}: sem sslmode=require`)
  return { v, desc: `${label} preview_runtime/omnigestao_preview` }
}

;(async () => {
  const p = await api("GET", `/v9/projects/${PROJECT}`)
  if (p.id !== PROJECT_ID) die("projeto Vercel inesperado")
  const envs = (await api("GET", `/v10/projects/${PROJECT_ID}/env?decrypt=false`)).envs
  const tgt = (e) => (e.target || []).slice().sort().join("+")
  const one = (key, branch) => {
    const xs = envs.filter((e) => e.key === key && (e.gitBranch || null) === branch && tgt(e) === "preview" && !(e.customEnvironmentIds || []).length)
    if (xs.length > 1) die(`${key}@${branch || "genérico"}: ${xs.length} entradas`)
    return xs[0] || null
  }
  const ops = []
  for (const [key, src] of [["DATABASE_URL", "PREVIEW_MAIN_RUNTIME_DATABASE_URL"], ["DIRECT_URL", "PREVIEW_MAIN_RUNTIME_DIRECT_URL"]]) {
    const e = one(key, null) || die(`${key} genérico de preview não encontrado (ou compartilhado com outro alvo)`)
    ops.push({ op: "PATCH", key, branch: "(genérico)", id: e.id, src, ...checkValue(src) })
  }
  for (const [key, src] of [["DATABASE_URL", "PREVIEW_KG_RUNTIME_DATABASE_URL"], ["DIRECT_URL", "PREVIEW_KG_RUNTIME_DIRECT_URL"]]) {
    const e = one(key, PR_BRANCH)
    ops.push({ op: e ? "PATCH" : "POST", key, branch: PR_BRANCH, id: e ? e.id : "-", src, ...checkValue(src) })
  }
  if (process.env.P3_LIMPAR_OPS_V4 === "1") for (const b of OPS_V4) for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const e = one(key, b); if (e) ops.push({ op: "DELETE", key, branch: b, id: e.id, src: "-", desc: "cai no genérico" })
  }
  // nunca tocar production/development
  for (const o of ops) { const e = envs.find((x) => x.id === o.id); if (e && tgt(e) !== "preview") die(`entrada ${o.id} não é só preview`) }
  for (const o of ops) console.log(`${phase === "plan" ? "PLANO" : "APLICAR"} ${o.op.padEnd(6)} ${o.key.padEnd(12)} ${o.branch.padEnd(46)} id=${o.id} ← ${o.src} (${o.desc})`)
  if (phase === "plan") { console.log(`plan: ${ops.length} operações; nada alterado`); return }

  for (const o of ops) {
    if (o.op === "PATCH") await api("PATCH", `/v9/projects/${PROJECT_ID}/env/${o.id}`, { value: o.v, type: "sensitive", target: ["preview"], ...(o.branch === PR_BRANCH ? { gitBranch: PR_BRANCH } : {}) })
    else if (o.op === "POST") await api("POST", `/v10/projects/${PROJECT_ID}/env`, { key: o.key, value: o.v, type: "sensitive", target: ["preview"], gitBranch: PR_BRANCH })
    else await api("DELETE", `/v9/projects/${PROJECT_ID}/env/${o.id}`)
    console.log(`ok ${o.op} ${o.key} ${o.branch}`)
  }
  // releitura: só metadados
  const after = (await api("GET", `/v10/projects/${PROJECT_ID}/env?decrypt=false`)).envs
  for (const e of after.filter((x) => ["DATABASE_URL", "DIRECT_URL"].includes(x.key)).sort((a, b) => (a.key + tgt(a) + (a.gitBranch || "")).localeCompare(b.key + tgt(b) + (b.gitBranch || ""))))
    console.log(`depois: ${e.key.padEnd(12)} ${tgt(e).padEnd(11)} ${(e.gitBranch || "-").padEnd(46)} ${e.type} ${new Date(e.updatedAt).toISOString()}`)
  console.log("apply: OK · Production/Development não tocados")
})().catch((e) => die(red(e && e.message)))
