// P5 do PR315-PREVIEW-ISOLATION-READINESS-003: prova de que o deployment Preview da #315 lê o Neon `pr315-kg`.
// Fases:
//   vercel  (SÓ LEITURA) deployment exato da #315 + metadados das envs de banco que ele herdou.
//   marcar  1 produto-marcador (saldo 0) SÓ no pr315-kg; trava de identidade na MESMA transação, antes do INSERT.
//           Depois confere, em leitura, que o marcador não existe no main do preview.
//   app     login do admin sintético no deployment + lookup autenticado do marcador (rede, sem cache).
//   limpar  apaga SÓ o marcador (id+sku+loja+nonce), mesma trava na mesma transação; confere 0 nos dois branches.
// Segredos: URLs de P2_SECRETS_FILE, admin de P2_GENERATED_FILE, token Vercel do CLI. Nunca em argv, stdout ou arquivo.
// Estado não secreto (nonce, id do marcador) em P5_STATE_FILE.
const fs = require("node:fs")
const crypto = require("node:crypto")
const { spawnSync } = require("node:child_process")

const PROJECT = "nameless-frost-19035275", PROD_PROJECT = "dry-mouse-36002471", PROD_EP = "ep-summer-tooth-acltc6wi"
const DB = "omnigestao_preview", OWNER = "omnigestao_preview_owner", LOJA = "preview-loja-1"
const MAIN = { nome: "main", key: "PREVIEW_MAIN_OWNER_URL", branch: "br-lively-feather-b6esh64a", ep: "ep-purple-morning-b6ajdsfk" }
const KG = { nome: "pr315-kg", key: "PREVIEW_KG_OWNER_URL", branch: "br-wandering-band-b6ov7vmt", ep: "ep-red-wave-b6bbj667" }
const VERCEL_PROJECT_ID = "prj_wjkHKw2jFQfY8regMYtkYXwgavuz", DEPLOYMENT = "dpl_4NqDo13fVkBdPDd7Z3XxrN6utSLC"
const PR_BRANCH = "claude/estoque-manual-kg-001", PR_SHA = "2731097", PR_NUMBER = "315"
const PSQL = process.env.P2_PSQL || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"

const die = (m) => { console.error("ABORTADO: " + m); process.exit(1) }
const phase = process.argv[2]
if (!["vercel", "marcar", "app", "limpar"].includes(phase)) die("fase: vercel | marcar | app | limpar")
const readEnv = (f) => { const o = {}; for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^"|"$/g, "") } return o }
const STATE = process.env.P5_STATE_FILE || die("defina P5_STATE_FILE")
const SECRETS = []
const red = (s) => { let o = String(s || ""); for (const x of SECRETS) if (x && x.length >= 4) o = o.split(x).join("<redacted>"); return o }
const say = (s) => console.log(red(s))

function conn(alvo) {
  const S = readEnv(process.env.P2_SECRETS_FILE || die("defina P2_SECRETS_FILE"))
  let u
  try { u = new URL(S[alvo.key] || die(`${alvo.key} ausente`)) } catch { die(`${alvo.key} não é URL`) }
  const pw = decodeURIComponent(u.password); SECRETS.push(pw, S[alvo.key])
  const ep = u.hostname.split(".")[0]
  if (ep === PROD_EP || ep.replace(/-pooler$/, "") === PROD_EP) die(`${alvo.key}: endpoint de produção`)
  if (ep !== alvo.ep) die(`${alvo.key}: endpoint inesperado`)
  if (decodeURIComponent(u.username) !== OWNER || u.pathname !== `/${DB}`) die(`${alvo.key}: usuário/database inesperado`)
  return { host: u.hostname, port: u.port || "5432", pw }
}

// Trava de identidade: aborta a transação se o servidor não for exatamente o alvo.
// Em leitura usa txid_current_if_assigned() (não aloca xid); na escrita, txid_current() prova a mesma transação.
const guard = (a, readOnly) => `DO $g$ BEGIN
  IF current_setting('neon.project_id') IS DISTINCT FROM '${PROJECT}' OR current_setting('neon.project_id') = '${PROD_PROJECT}'
     OR current_setting('neon.branch_id') IS DISTINCT FROM '${a.branch}' OR current_setting('neon.endpoint_id') IS DISTINCT FROM '${a.ep}'
     OR current_database() IS DISTINCT FROM '${DB}' THEN RAISE EXCEPTION 'P5_GUARD_FAIL'; END IF; END $g$;
select 'identidade=' || current_setting('neon.project_id') || '/' || current_setting('neon.branch_id') || '/' || current_setting('neon.endpoint_id') || '/' || current_database() || ${readOnly ? "' somente_leitura'" : "' txid=' || txid_current()"};`

function psql(alvo, sql, { readOnly }) {
  const c = conn(alvo)
  const r = spawnSync(PSQL, ["-X", "-q", "-A", "-t", "-1", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", "-f", "-"], {
    encoding: "utf8", timeout: 120000, input: guard(alvo, readOnly) + "\n" + sql,
    env: { ...process.env, PGHOST: c.host, PGPORT: c.port, PGUSER: OWNER, PGPASSWORD: c.pw, PGDATABASE: DB,
      PGSSLMODE: "require", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "30", PGAPPNAME: `p5-${phase}-003`,
      ...(readOnly ? { PGOPTIONS: "-c default_transaction_read_only=on" } : {}) },
  })
  if (r.status !== 0) die(`${alvo.nome}: ${red(r.stderr).trim() || "psql exit " + r.status}`)
  return red(r.stdout).split(/\r?\n/).filter(Boolean)
}

const loadState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : die("estado ausente: rode a fase marcar"))
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const contagem = (st) => `select 'marcador_linhas=' || count(*) from estoque_produtos
  where id = ${q(st.id)} or sku = ${q(st.sku)} or barcode = ${q(st.sku)} or name like ${q("%" + st.nonce + "%")} or metadata->>'p5Marker' = ${q(st.nonce)};`

async function vercel() {
  const tok = JSON.parse(fs.readFileSync(process.env.APPDATA + "/xdg.data/com.vercel.cli/auth.json", "utf8")).token
  const team = JSON.parse(fs.readFileSync("C:/Projetos/omni-gestao/.vercel/project.json", "utf8")).orgId
  SECRETS.push(tok)
  const api = async (p) => {
    const r = await fetch(`https://api.vercel.com${p}${p.includes("?") ? "&" : "?"}teamId=${team}`, { headers: { Authorization: `Bearer ${tok}` } })
    const t = await r.text(); if (!r.ok) die(`GET ${p.split("?")[0]} → HTTP ${r.status} ${red(t).slice(0, 200)}`)
    return JSON.parse(t)
  }
  const d = await api(`/v13/deployments/${DEPLOYMENT}`)
  const m = d.meta || {}
  const checks = {
    projeto: d.projectId === VERCEL_PROJECT_ID, target_preview: (d.target || "preview") === "preview" && d.target !== "production",
    ready: d.readyState === "READY", branch: m.githubCommitRef === PR_BRANCH,
    sha: String(m.githubCommitSha || "").startsWith(PR_SHA), pr: String(m.githubPrId || "") === PR_NUMBER,
  }
  say(`deployment=${d.id} url=${d.url} criado=${new Date(d.createdAt).toISOString()} state=${d.readyState} target=${d.target || "preview"}`)
  say(`git ref=${m.githubCommitRef} sha=${m.githubCommitSha} pr=${m.githubPrId}`)
  say(`checks ${Object.entries(checks).map(([k, v]) => `${k}=${v}`).join(" ")}`)
  if (Object.values(checks).some((v) => !v)) die("deployment não é o da #315 em READY")
  const envs = (await api(`/v10/projects/${VERCEL_PROJECT_ID}/env?decrypt=false`)).envs
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const xs = envs.filter((e) => e.key === key && (e.target || []).includes("preview"))
    const branchOv = xs.filter((e) => e.gitBranch === PR_BRANCH)
    const generic = xs.filter((e) => !e.gitBranch && !(e.customEnvironmentIds || []).length)
    for (const e of [...branchOv, ...generic]) {
      say(`env ${key} id=${e.id} escopo=${e.gitBranch || "genérico"} target=${(e.target || []).join("+")} type=${e.type} atualizado=${new Date(e.updatedAt).toISOString()} antes_do_build=${e.updatedAt < d.createdAt}`)
    }
    if (branchOv.length !== 1) die(`${key}: ${branchOv.length} overrides da branch da PR (esperado 1)`)
    if (!(branchOv[0].updatedAt < d.createdAt)) die(`${key}: override alterado depois do build`)
    if ((branchOv[0].target || []).join("+") !== "preview") die(`${key}: override com target além de preview`)
  }
  // Valor do override = URL do runtime KG gravada na P3 (o arquivo gerado é a fonte; o valor sensitive não é legível).
  const G = readEnv(process.env.P2_GENERATED_FILE || die("defina P2_GENERATED_FILE")); Object.values(G).forEach((v) => SECRETS.push(v))
  for (const [k, ep, pooler] of [["PREVIEW_KG_RUNTIME_DATABASE_URL", KG.ep, true], ["PREVIEW_KG_RUNTIME_DIRECT_URL", KG.ep, false]]) {
    const u = new URL(G[k] || die(`${k} ausente`)); const label = u.hostname.split(".")[0]
    const ok = label === (pooler ? `${ep}-pooler` : ep) && decodeURIComponent(u.username) === "preview_runtime" && u.pathname === `/${DB}`
    say(`fonte ${k}: endpoint=${label} usuario=${decodeURIComponent(u.username)} db=${u.pathname.slice(1)} ok=${ok}`)
    if (!ok) die(`${k}: destino inesperado`)
  }
  say("vercel: OK (somente leitura)")
}

function marcar() {
  if (fs.existsSync(STATE)) die("já existe estado de marcador: rode limpar antes")
  const nonce = crypto.randomBytes(8).toString("hex")
  const st = { nonce, id: `p5marker${nonce}`, sku: `P5KG-${nonce}`, name: `P5 MARCADOR KG ${nonce}` }
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2))
  const out = psql(KG, `
select 'loja_sintetica=' || count(*) from stores where id = ${q(LOJA)};
select 'triggers_usuario_estoque_produtos=' || count(*) from pg_trigger where tgrelid = 'public.estoque_produtos'::regclass and not tgisinternal;
DO $c$ BEGIN
  IF (select count(*) from stores where id = ${q(LOJA)}) <> 1 THEN RAISE EXCEPTION 'P5_LOJA_AUSENTE'; END IF;
  IF (select count(*) from estoque_produtos where id = ${q(st.id)} or sku = ${q(st.sku)}) <> 0 THEN RAISE EXCEPTION 'P5_MARCADOR_JA_EXISTE'; END IF;
END $c$;
INSERT INTO estoque_produtos (id, "storeId", sku, barcode, name, stock, price, metadata, "updatedAt")
  VALUES (${q(st.id)}, ${q(LOJA)}, ${q(st.sku)}, ${q(st.sku)}, ${q(st.name)}, 0, 0, jsonb_build_object('p5Marker', ${q(nonce)}), now());
select 'inserido_txid=' || txid_current();
select 'movimentacoes_do_marcador=' || count(*) from movimentacoes_estoque where "produtoId" = ${q(st.id)};
${contagem(st)}`, { readOnly: false })
  out.forEach((l) => say(`[kg] ${l}`))
  const ids = out.filter((l) => /txid=/.test(l)).map((l) => l.split("txid=")[1])
  if (ids.length !== 2 || ids[0] !== ids[1]) die("trava e INSERT não ficaram na mesma transação")
  say(`mesma_transacao=YES (txid ${ids[0]})`)
  psql(MAIN, contagem(st), { readOnly: true }).forEach((l) => say(`[main] ${l}`))
  say(`marcador: id=${st.id} sku=${st.sku} nonce=${nonce}`)
}

async function app() {
  const st = loadState()
  const G = readEnv(process.env.P2_GENERATED_FILE || die("defina P2_GENERATED_FILE")); Object.values(G).forEach((v) => SECRETS.push(v))
  const email = G.PREVIEW_ADMIN_EMAIL, password = G.PREVIEW_ADMIN_PASSWORD
  if (email !== "admin@preview.invalid" || !password) die("credencial sintética ausente ou inesperada")
  const base = `https://${process.env.P5_DEPLOYMENT_HOST || die("defina P5_DEPLOYMENT_HOST")}`
  if (!/^https:\/\/omni-gestao-[a-z0-9]+-rafaelfaria49-4373s-projects\.vercel\.app$/.test(base)) die("host fora do padrão de deployment do projeto")
  const jar = new Map()
  const keep = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)) } }
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
  const go = async (path, init = {}) => {
    const r = await fetch(base + path, { redirect: "manual", cache: "no-store", ...init,
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache", ...(jar.size ? { Cookie: cookie() } : {}), ...(init.headers || {}) } })
    keep(r); return r
  }
  const csrf = await (await go("/api/auth/csrf")).json()
  const login = await go("/api/auth/callback/credentials", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: `${base}/dashboard` }).toString() })
  const loginBody = await login.text()
  const sessCookie = [...jar.keys()].some((k) => /authjs\.session-token/.test(k))
  const loginErr = /error=/.test(loginBody) || /error=/.test(login.headers.get("location") || "")
  say(`login status=${login.status} cookie_sessao=${sessCookie} erro=${loginErr}`)
  if (!sessCookie || loginErr) die("SYNTHETIC_LOGIN=FAIL")
  const sess = await (await go("/api/auth/session")).json()
  say(`sessao email=${sess?.user?.email} role=${sess?.user?.role} lojaId=${sess?.user?.lojaId}`)
  if (sess?.user?.email !== email) die("SYNTHETIC_LOGIN=FAIL (sessão sem o admin sintético)")
  const bust = crypto.randomBytes(6).toString("hex")
  const r = await go(`/api/ops/inventory/lookup?code=${encodeURIComponent(st.sku)}&_p5=${bust}`, { headers: { "x-assistec-loja-id": LOJA } })
  const body = await r.text()
  const h = (k) => r.headers.get(k) || "-"
  say(`lookup status=${r.status} x-vercel-cache=${h("x-vercel-cache")} age=${h("age")} cache-control=${h("cache-control")} x-vercel-id=${h("x-vercel-id")}`)
  let j; try { j = JSON.parse(body) } catch { die(`lookup não-JSON: ${red(body).slice(0, 200)}`) }
  const items = Array.isArray(j.items) ? j.items : []
  say(`lookup _lojaId=${j._lojaId} itens=${items.length} ${items.map((i) => `[dbId=${i.dbId} sku=${i.sku} name=${i.name} stock=${i.stock}]`).join(" ")}${j.error ? " error=" + j.error : ""}`)
  const hit = items.length === 1 && items[0].dbId === st.id && items[0].sku === st.sku && items[0].name === st.name && items[0].stock === 0
  say(`KG_MARKER_VISIBLE_IN_APP=${hit ? "YES" : "NO"}`)
  if (!hit) process.exitCode = 2
}

function limpar() {
  const st = loadState()
  const out = psql(KG, `
DO $d$ DECLARE n int; BEGIN
  IF (select count(*) from movimentacoes_estoque where "produtoId" = ${q(st.id)}) <> 0 THEN RAISE EXCEPTION 'P5_MARCADOR_COM_MOVIMENTO'; END IF;
  DELETE FROM estoque_produtos WHERE id = ${q(st.id)} AND sku = ${q(st.sku)} AND "storeId" = ${q(LOJA)} AND name = ${q(st.name)}
    AND stock = 0 AND metadata->>'p5Marker' = ${q(st.nonce)};
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'P5_DELETE_ESPERAVA_1_LINHA'; END IF;
END $d$;
select 'removido_txid=' || txid_current();
${contagem(st)}`, { readOnly: false })
  out.forEach((l) => say(`[kg] ${l}`))
  const ids = out.filter((l) => /txid=/.test(l)).map((l) => l.split("txid=")[1])
  if (ids.length !== 2 || ids[0] !== ids[1]) die("trava e DELETE não ficaram na mesma transação")
  psql(KG, contagem(st), { readOnly: true }).forEach((l) => say(`[kg pós] ${l}`))
  psql(MAIN, contagem(st), { readOnly: true }).forEach((l) => say(`[main pós] ${l}`))
  fs.renameSync(STATE, STATE + ".limpo")
}

;(async () => {
  if (phase === "vercel") await vercel()
  else if (phase === "marcar") marcar()
  else if (phase === "app") await app()
  else limpar()
})().catch((e) => die(red(e && e.stack ? e.stack : e)))
