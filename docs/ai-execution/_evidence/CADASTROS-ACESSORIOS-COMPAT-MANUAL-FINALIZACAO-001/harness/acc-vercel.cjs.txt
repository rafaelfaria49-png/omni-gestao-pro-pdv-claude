// G4/G7 — overrides de Preview do omni-gestao-pro SÓ para a branch claude/cadastros-acessorios-compat-manual-001.
// Fases: snapshot (GET, grava metadados sem valores) · apply (POST overrides) · nextauth (POST/PATCH NEXTAUTH_URL = alias da branch)
//        verify (compara com o snapshot: nada fora da branch mudou) · remove (DELETE só os overrides da branch) · deploys (GET)
// Valores vêm de C:\Projetos\secrets\neon-preview-acc\.env e vão só no corpo HTTPS; nunca argv/stdout.
const fs = require("node:fs")
const path = require("node:path")
const PROJECT_ID = "prj_wjkHKw2jFQfY8regMYtkYXwgavuz", SECOND_ID = "prj_IbJi32rh4TsQwWFYYVVjs133fw3H"
const BR = "claude/cadastros-acessorios-compat-manual-001"
const ACC_EP = "ep-orange-sound-b6kqp78k", PROD_EP = "ep-summer-tooth-acltc6wi", KG_EP = "ep-red-wave-b6bbj667", MAIN_EP = "ep-purple-morning-b6ajdsfk"
const SNAP = path.join(__dirname, "..", "g4-env-snapshot-antes.json")
const tok = JSON.parse(fs.readFileSync(process.env.APPDATA + "/xdg.data/com.vercel.cli/auth.json", "utf8")).token
const team = JSON.parse(fs.readFileSync("C:/Projetos/omni-gestao/.vercel/project.json", "utf8")).orgId
const A = {}; for (const l of fs.readFileSync("C:/Projetos/secrets/neon-preview-acc/.env", "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) A[m[1]] = m[2] }
const SECRETS = [tok, ...Object.values(A)]
const red = (s) => { let o = String(s ?? ""); for (const x of SECRETS) if (x && x.length > 3) o = o.split(x).join("<redacted>"); return o }
const die = (m) => { console.error("ABORTADO: " + red(m)); process.exit(1) }
const say = (m) => console.log(red(m))
async function api(method, p, body) {
  const r = await fetch(`https://api.vercel.com${p}${p.includes("?") ? "&" : "?"}teamId=${team}`, { method,
    headers: { Authorization: `Bearer ${tok}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); if (!r.ok) die(`${method} ${p.split("?")[0]} → HTTP ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : {}
}
const meta = (e) => ({ id: e.id, key: e.key, target: (e.target || []).slice().sort(), gitBranch: e.gitBranch || null, type: e.type, updatedAt: e.updatedAt, custom: e.customEnvironmentIds || [] })
const envs = async (id) => (await api("GET", `/v10/projects/${id}/env?decrypt=false`)).envs.map(meta)

function dbValue(k, pooled) {
  const u = new URL(A[k]); const label = u.hostname.split(".")[0]; const ep = label.replace(/-pooler$/, "")
  if ([PROD_EP, KG_EP, MAIN_EP].includes(ep) || ep !== ACC_EP) die(`${k}: endpoint não é o Candidate`)
  if (pooled !== label.endsWith("-pooler")) die(`${k}: pooler inesperado`)
  if (decodeURIComponent(u.username) !== "preview_runtime" || u.pathname !== "/omnigestao_preview") die(`${k}: usuário/db inesperado`)
  if (pooled && u.searchParams.get("pgbouncer") !== "true") die(`${k}: sem pgbouncer`)
  if (u.searchParams.get("sslmode") !== "require") die(`${k}: sem sslmode=require`)
  return A[k]
}
const OVERRIDES = () => [
  ["DATABASE_URL", dbValue("ACC_RUNTIME_DATABASE_URL", true)], ["DIRECT_URL", dbValue("ACC_RUNTIME_DIRECT_URL", false)],
  ["AUTH_SECRET", A.ACC_AUTH_SECRET],
  ...["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "WHATSAPP_WEBHOOK_STORE_ID", "CONTADOR_PIN", "CONTADOR_SESSION_SECRET", "ADMIN_DEFAULT_PASSWORD"].map((k) => [k, A["ACC_NEUTRAL_" + k]]),
]

;(async () => {
  const phase = process.argv[2]
  const p = await api("GET", `/v9/projects/${PROJECT_ID}`); if (p.name !== "omni-gestao-pro") die("projeto inesperado")
  if (phase === "snapshot") {
    if (fs.existsSync(SNAP)) die("snapshot já existe")
    const snap = { at: new Date().toISOString(), pro: await envs(PROJECT_ID), second: await envs(SECOND_ID), ssoProtection: p.ssoProtection ?? null }
    fs.writeFileSync(SNAP, JSON.stringify(snap, null, 1))
    say(`snapshot pro=${snap.pro.length} second=${snap.second.length} overrides_da_branch=${snap.pro.filter((e) => e.gitBranch === BR).length}`)
  } else if (phase === "apply") {
    const cur = await envs(PROJECT_ID)
    if (cur.some((e) => e.gitBranch === BR)) die("já existem overrides da branch")
    for (const [key, value] of OVERRIDES()) {
      if (!value) die(`${key}: valor ausente`)
      const r = await api("POST", `/v10/projects/${PROJECT_ID}/env`, { key, value, type: "sensitive", target: ["preview"], gitBranch: BR })
      const c = r.created || r; say(`POST ${key} → id=${c.id} target=${(c.target || []).join("+")} branch=${c.gitBranch} type=${c.type}`)
    }
  } else if (phase === "nextauth") {
    const url = process.argv[3] || die("informe a URL do alias da branch")
    const h = new URL(url); if (!/^omni-gestao-pro-git-.*\.vercel\.app$/.test(h.hostname) || h.protocol !== "https:") die("alias inesperado")
    const cur = (await envs(PROJECT_ID)).filter((e) => e.gitBranch === BR && e.key === "NEXTAUTH_URL")
    if (cur.length) die("NEXTAUTH_URL da branch já existe")
    const r = await api("POST", `/v10/projects/${PROJECT_ID}/env`, { key: "NEXTAUTH_URL", value: h.origin, type: "encrypted", target: ["preview"], gitBranch: BR })
    const c = r.created || r; say(`POST NEXTAUTH_URL → id=${c.id} branch=${c.gitBranch} valor=${h.origin}`)
  } else if (phase === "verify") {
    const snap = JSON.parse(fs.readFileSync(SNAP, "utf8"))
    for (const [nome, id, before] of [["omni-gestao-pro", PROJECT_ID, snap.pro], ["omni-gestao", SECOND_ID, snap.second]]) {
      const now = await envs(id); const B = new Map(before.map((e) => [e.id, JSON.stringify(e)])); const N = new Map(now.map((e) => [e.id, JSON.stringify(e)]))
      const changed = [...B.keys()].filter((k) => N.get(k) !== B.get(k)), added = now.filter((e) => !B.has(e.id))
      const foreign = added.filter((e) => e.gitBranch !== BR || e.target.join("+") !== "preview")
      say(`${nome}: antes=${before.length} agora=${now.length} alteradas_ou_removidas=${changed.length} novas=${added.length} novas_fora_da_branch=${foreign.length}`)
      for (const e of added) say(`  nova ${e.key} target=${e.target.join("+")} branch=${e.gitBranch} type=${e.type}`)
      for (const k of changed) say(`  ALTERADA ${B.get(k)}`)
    }
    const p2 = await api("GET", `/v9/projects/${SECOND_ID}`)
    say(`ssoProtection pro=${JSON.stringify(p.ssoProtection ?? null)} (snapshot ${JSON.stringify(snap.ssoProtection)}) second=${JSON.stringify(p2.ssoProtection)} ignoreCmd_second=${p2.commandForIgnoringBuildStep ? "presente" : "-"}`)
  } else if (phase === "second-apply") {
    // Projeto omni-gestao: sem banco e sem AUTH_SECRET no Preview, mas herda Stripe/WhatsApp. Neutraliza só nesta branch.
    const p2 = await api("GET", `/v9/projects/${SECOND_ID}`); if (p2.name !== "omni-gestao") die("segundo projeto inesperado")
    const cur = await envs(SECOND_ID)
    if (cur.some((e) => e.gitBranch === BR)) die("já existem overrides da branch no segundo projeto")
    const keys = cur.filter((e) => e.target.includes("preview") && !e.gitBranch).map((e) => e.key)
    for (const key of keys) {
      if (!/^(STRIPE_|NEXT_PUBLIC_STRIPE_|WHATSAPP_)/.test(key)) die(`chave herdada não prevista: ${key}`)
      const value = key.includes("PUBLISHABLE") ? "pk_test_acc_preview_disabled" : key.startsWith("STRIPE_") ? "acc_preview_disabled_" + require("node:crypto").randomBytes(12).toString("hex") : A["ACC_NEUTRAL_" + key] || "acc-preview-disabled"
      const r = await api("POST", `/v10/projects/${SECOND_ID}/env`, { key, value, type: "sensitive", target: ["preview"], gitBranch: BR })
      const c = r.created || r; say(`POST(omni-gestao) ${key} → id=${c.id} target=${(c.target || []).join("+")} branch=${c.gitBranch}`)
    }
  } else if (phase === "remove") {
    let total = 0
    for (const id of [PROJECT_ID, SECOND_ID]) {
      const mine = (await envs(id)).filter((e) => e.gitBranch === BR)
      for (const e of mine) {
        if (e.target.join("+") !== "preview") die(`entrada fora do escopo: ${e.key}`)
        await api("DELETE", `/v9/projects/${id}/env/${e.id}`); say(`DELETE ${id === PROJECT_ID ? "omni-gestao-pro" : "omni-gestao"} ${e.key} id=${e.id}`); total++
      }
    }
    say(`removidas=${total}`)
  } else if (phase === "deploys") {
    for (const [nome, id] of [["omni-gestao-pro", PROJECT_ID], ["omni-gestao", SECOND_ID]]) {
      const ds = (await api("GET", `/v6/deployments?projectId=${id}&limit=20&meta-githubCommitRef=${encodeURIComponent(BR)}`)).deployments
      for (const d of ds) say(`${nome} ${d.uid} target=${d.target || "preview"} state=${d.state} sha=${(d.meta?.githubCommitSha || "").slice(0, 7)} url=${d.url} criado=${new Date(d.created).toISOString()}`)
      if (!ds.length) say(`${nome}: 0 deployments da branch`)
    }
  } else die("fase: snapshot | apply | nextauth | verify | remove | deploys")
})().catch((e) => die(e.message))
