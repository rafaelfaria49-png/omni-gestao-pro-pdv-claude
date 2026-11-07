// G5/G6 — prova do deployment Preview da branch contra o Neon Candidate `pr-acc-compat`.
// Fases:
//   vercel  [sha]  GET: deployment da branch (target, estado, sha), overrides anteriores ao build, log MIGRATION_*, alias
//   redeploy       POST: redeploy (Preview) do último deployment, para valer o NEXTAUTH_URL da branch
//   seed           Candidate (trava na mesma transação): marcador em estoque_produtos (loja 1), loja sintética 2 + 1 modelo nela
//   app            login sintético no host do deployment + roteiro de testes HTTP (ver `checks`)
//   db             SOMENTE LEITURA: linhas do nonce no Candidate; main do preview sem tabelas novas; sessões do runtime
//   clean          Candidate (trava): remove tudo que tiver o nonce + loja 2; confere 0 linhas
// Estado (ids, nonce, host) em ../g6-state.json — sem segredos.
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { spawnSync } = require("node:child_process")

const PROJECT_ID = "prj_wjkHKw2jFQfY8regMYtkYXwgavuz", BR = "claude/cadastros-acessorios-compat-manual-001"
const STATE = path.join(__dirname, "..", "g6-state.json")
const H = path.join(__dirname, "acc-candidate.cjs")
const LOJA1 = "preview-loja-1", LOJA2 = "preview-loja-2-acc"
const OVERRIDE_KEYS = ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET"]
const tok = JSON.parse(fs.readFileSync(process.env.APPDATA + "/xdg.data/com.vercel.cli/auth.json", "utf8")).token
const team = JSON.parse(fs.readFileSync("C:/Projetos/omni-gestao/.vercel/project.json", "utf8")).orgId
const SECRETS = [tok]
const red = (s) => { let o = String(s ?? ""); for (const x of SECRETS) if (x && x.length > 3) o = o.split(x).join("<redacted>"); return o }
const die = (m) => { console.error("ABORTADO: " + red(m)); process.exit(1) }
const say = (m) => console.log(red(m))
const readEnv = (f) => { const o = {}; for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2] } return o }
const load = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {})
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 1))
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
async function api(method, p, body) {
  const r = await fetch(`https://api.vercel.com${p}${p.includes("?") ? "&" : "?"}teamId=${team}`, { method,
    headers: { Authorization: `Bearer ${tok}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); if (!r.ok) die(`${method} ${p.split("?")[0]} → HTTP ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : {}
}
function sql(text, { readOnly = false, target = "candidate" } = {}) {
  const f = path.join(require("node:os").tmpdir(), `acc-g6-${crypto.randomBytes(4).toString("hex")}.sql`)
  fs.writeFileSync(f, text)
  const r = spawnSync(process.execPath, [H, "sql"], { encoding: "utf8", timeout: 180000,
    env: { ...process.env, ACC_SQL_FILE: f, ACC_SQL_READONLY: readOnly ? "1" : "", ACC_SQL_TARGET: target } })
  fs.rmSync(f, { force: true })
  if (r.status !== 0) die(`sql(${target}): ${r.stderr || r.stdout}`)
  return r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

async function vercel(sha) {
  const st = load()
  const ds = (await api("GET", `/v6/deployments?projectId=${PROJECT_ID}&limit=20&meta-githubCommitRef=${encodeURIComponent(BR)}`)).deployments
  const cand = ds.filter((d) => !sha || String(d.meta?.githubCommitSha || "").startsWith(sha)).sort((a, b) => b.created - a.created)
  if (!cand.length) die("nenhum deployment da branch")
  const d = await api("GET", `/v13/deployments/${cand[0].uid}`)
  const m = d.meta || {}
  const checks = { projeto: d.projectId === PROJECT_ID, target_preview: !d.target || d.target === "preview", ready: d.readyState === "READY",
    branch: m.githubCommitRef === BR, sha: !sha || String(m.githubCommitSha || "").startsWith(sha) }
  say(`deployment=${d.id} url=${d.url} criado=${new Date(d.createdAt).toISOString()} state=${d.readyState} target=${d.target || "preview"} sha=${m.githubCommitSha}`)
  say(`checks ${Object.entries(checks).map(([k, v]) => `${k}=${v}`).join(" ")}`)
  if (!checks.projeto || !checks.target_preview || !checks.branch || !checks.sha) die("deployment não é o Preview esperado")
  const envs = (await api("GET", `/v10/projects/${PROJECT_ID}/env?decrypt=false`)).envs.filter((e) => e.gitBranch === BR)
  for (const k of [...OVERRIDE_KEYS, "NEXTAUTH_URL"]) {
    const e = envs.find((x) => x.key === k)
    say(`override ${k}: ${e ? `id=${e.id} target=${e.target.join("+")} antes_do_build=${e.updatedAt < d.createdAt}` : "AUSENTE"}`)
    if (OVERRIDE_KEYS.includes(k) && (!e || !(e.updatedAt < d.createdAt) || e.target.join("+") !== "preview")) die(`override ${k} inválido para este build`)
  }
  const ev = await api("GET", `/v3/deployments/${d.id}/events?builds=1&limit=-1`)
  const text = (Array.isArray(ev) ? ev : []).map((e) => e.payload?.text || e.text || "").join("\n")
  const mig = [...new Set(text.match(/MIGRATION_[A-Z_]+/g) || [])]
  say(`build_log migration_events=${mig.join(",") || "-"} compiled=${/Compiled successfully|Compiled with warnings/.test(text)}`)
  if (d.readyState === "READY" && !(mig.length === 1 && mig[0] === "MIGRATION_SKIPPED")) die("log do build sem MIGRATION_SKIPPED exclusivo")
  const aliases = (d.alias || []).filter((a) => a.includes("-git-"))
  say(`alias_branch=${aliases.join(",") || "-"}`)
  save({ ...st, deployment: d.id, host: d.url, alias: aliases[0] || st.alias, sha: m.githubCommitSha, createdAt: d.createdAt })
}

async function redeploy() {
  const st = load(); if (!st.deployment) die("rode vercel antes")
  const r = await api("POST", `/v13/deployments?forceNew=1`, { name: "omni-gestao-pro", deploymentId: st.deployment, project: PROJECT_ID })
  say(`redeploy=${r.id} target=${r.target || "preview"} state=${r.readyState} url=${r.url}`)
  if (r.target === "production") die("redeploy com target production")
}

function seed() {
  const st = load(); if (st.nonce) die("seed já feito (rode clean)")
  const nonce = crypto.randomBytes(6).toString("hex")
  const marker = { id: `g6marker${nonce}`, sku: `G6ACC-${nonce}`, name: `G6 MARCADOR ACC ${nonce}` }
  const m2 = { id: `g6m2${nonce}`, modelKey: `manual_${crypto.randomBytes(16).toString("hex")}`, brand: "MARCA SINTETICA LOJA2", name: `L2 ${nonce}` }
  const out = sql(`
DO $c$ BEGIN
  IF (select count(*) from stores where id = ${q(LOJA1)}) <> 1 THEN RAISE EXCEPTION 'G6_LOJA1_AUSENTE'; END IF;
  IF (select count(*) from stores where id = ${q(LOJA2)}) <> 0 THEN RAISE EXCEPTION 'G6_LOJA2_JA_EXISTE'; END IF;
END $c$;
select 'loja1_moduleAccess=' || coalesce("moduleAccess"::text, 'NULL') from stores where id = ${q(LOJA1)};
INSERT INTO estoque_produtos (id, "storeId", sku, barcode, name, stock, price, metadata, "updatedAt")
  VALUES (${q(marker.id)}, ${q(LOJA1)}, ${q(marker.sku)}, ${q(marker.sku)}, ${q(marker.name)}, 0, 0, jsonb_build_object('g6Marker', ${q(nonce)}), now());
INSERT INTO stores (id, name, profile, "updatedAt") VALUES (${q(LOJA2)}, ${q("Loja Sintética 2 G6 " + nonce)}, 'SUPERMERCADO', now());
INSERT INTO catalogo_aparelhos_loja_modelos (id, "storeId", "modelKey", brand, name, "brandKey", "nameKey", aliases, notes, active, version, "createdBy", "updatedBy", "updatedAt")
  VALUES (${q(m2.id)}, ${q(LOJA2)}, ${q(m2.modelKey)}, ${q(m2.brand)}, ${q(m2.name)}, ${q(m2.brand)}, ${q(m2.name.toUpperCase())}, '[]'::jsonb, ${q("g6 " + nonce)}, true, 1, 'g6-seed', 'g6-seed', now());
select 'seed marcador=' || (select count(*) from estoque_produtos where id = ${q(marker.id)}) || ' loja2=' || (select count(*) from stores where id = ${q(LOJA2)})
  || ' modelo_loja2=' || (select count(*) from catalogo_aparelhos_loja_modelos where id = ${q(m2.id)});`)
  out.forEach((l) => say("[candidate] " + l))
  save({ ...st, nonce, marker, m2 })
}

async function app() {
  const st = load(); if (!st.nonce) die("rode seed antes")
  const G = readEnv("C:/Projetos/secrets/neon-preview/generated.env"); Object.values(G).forEach((v) => SECRETS.push(v))
  const email = G.PREVIEW_ADMIN_EMAIL, password = G.PREVIEW_ADMIN_PASSWORD
  if (email !== "admin@preview.invalid" || !password) die("credencial sintética inesperada")
  const host = process.env.G6_HOST || st.host
  // Só o host do deployment verificado na fase `vercel` (projeto, target preview, branch e sha conferidos) ou o alias dele.
  if (!host || (host !== st.host && host !== st.alias)) die("host não é o deployment verificado")
  const base = `https://${host}`
  const jar = new Map()
  const keep = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)) } }
  const go = async (p, init = {}, withCookie = true) => {
    const r = await fetch(base + p, { redirect: "manual", cache: "no-store", ...init, headers: { "Cache-Control": "no-cache",
      ...(withCookie && jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...(init.headers || {}) } })
    if (withCookie) keep(r)
    let body = null; const t = await r.text(); try { body = JSON.parse(t) } catch { body = t.slice(0, 200) }
    return { status: r.status, body, headers: r.headers }
  }
  const json = (loja, method, data) => ({ method, headers: { "Content-Type": "application/json", "x-assistec-loja-id": loja }, body: JSON.stringify(data) })
  const results = []
  const check = (name, ok, detail = "") => { results.push({ name, ok }); say(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`) }

  // 0. sem sessão
  const anon = await go(`/api/catalogo/aparelhos/search?q=Galaxy`, { headers: { "x-assistec-loja-id": LOJA1 } }, false)
  check("anon_search_401", anon.status === 401, `status=${anon.status}`)
  const anonPost = await go(`/api/catalogo/aparelhos/modelos`, json(LOJA1, "POST", { brand: "X", name: "Y" }), false)
  check("anon_post_401", anonPost.status === 401, `status=${anonPost.status}`)
  // 1. login sintético
  const csrf = (await go("/api/auth/csrf")).body
  const login = await go("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: `${base}/dashboard` }).toString() })
  const loc = String(typeof login.body === "object" ? login.body?.url : login.headers.get("location") || "")
  const sessCookie = [...jar.keys()].some((k) => /authjs\.session-token/.test(k))
  check("login_sintetico", sessCookie && !/error=/.test(loc), `status=${login.status} redirect_host=${loc ? new URL(loc).host : "-"}`)
  if (!sessCookie) die("login falhou")
  check("login_redirect_no_proprio_preview", !loc || new URL(loc).host.endsWith("-rafaelfaria49-4373s-projects.vercel.app"), `host=${loc ? new URL(loc).host : "-"}`)
  const sess = (await go("/api/auth/session")).body
  check("sessao_admin_sintetico", sess?.user?.email === email && sess?.user?.lojaId === LOJA1, `role=${sess?.user?.role} lojaId=${sess?.user?.lojaId}`)
  // 2. marcador de identidade pelo app (lê do banco)
  const lk = await go(`/api/ops/inventory/lookup?code=${encodeURIComponent(st.marker.sku)}&_g6=${crypto.randomBytes(4).toString("hex")}`, { headers: { "x-assistec-loja-id": LOJA1 } })
  const items = Array.isArray(lk.body?.items) ? lk.body.items : []
  check("marcador_candidate_visivel_no_app", lk.status === 200 && items.length === 1 && items[0].dbId === st.marker.id && items[0].stock === 0,
    `status=${lk.status} itens=${items.length} cache=${lk.headers.get("x-vercel-cache")}`)
  // 3. busca global (sem depender das tabelas novas para os resultados globais)
  const glob = await go(`/api/catalogo/aparelhos/search?q=${encodeURIComponent("Galaxy A05")}`, { headers: { "x-assistec-loja-id": LOJA1 } })
  const gres = glob.body?.results || []
  check("busca_global", glob.status === 200 && gres.length > 0 && gres.every((r) => r.source !== "loja"), `status=${glob.status} resultados=${gres.length}`)
  const globalKey = gres[0]?.modelKey
  // 4. cadastro do modelo manual
  const nome = `G47 ${st.nonce}`, marca = "MARCA SINTETICA PREVIEW"
  const cr = await go(`/api/catalogo/aparelhos/modelos`, json(LOJA1, "POST", { brand: marca, name: nome, aliases: [`G47-${st.nonce}`], notes: "G6 sintético" }))
  const modelo = cr.body?.modelo
  check("cadastro_modelo_201", cr.status === 201 && /^manual_/.test(modelo?.modelKey || ""), `status=${cr.status} modelKey=${modelo?.modelKey}`)
  const dup = await go(`/api/catalogo/aparelhos/modelos`, json(LOJA1, "POST", { brand: marca.toLowerCase(), name: ` ${nome.toLowerCase()} ` }))
  check("duplicidade_409", dup.status === 409, `status=${dup.status}`)
  const busca = await go(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(nome)}`, { headers: { "x-assistec-loja-id": LOJA1 } })
  check("busca_mostra_modelo_da_loja", (busca.body?.results || []).some((r) => r.modelKey === modelo?.modelKey && r.source === "loja"), `status=${busca.status}`)
  const alias = await go(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(`G47-${st.nonce}`)}`, { headers: { "x-assistec-loja-id": LOJA1 } })
  check("busca_por_alias", (alias.body?.results || []).some((r) => r.modelKey === modelo?.modelKey), `status=${alias.status}`)
  // 5. isolamento entre lojas e acesso cruzado
  const l2 = await go(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(st.m2.name)}`, { headers: { "x-assistec-loja-id": LOJA1 } })
  check("modelo_da_loja2_invisivel_na_loja1", l2.status === 200 && !(l2.body?.results || []).some((r) => r.modelKey === st.m2.modelKey), `status=${l2.status}`)
  const lista = await go(`/api/catalogo/aparelhos/modelos?inativos=1`, { headers: { "x-assistec-loja-id": LOJA1 } })
  check("lista_da_loja1_sem_loja2", lista.status === 200 && (lista.body?.modelos || []).every((m) => m.storeId === undefined || m.storeId === LOJA1) && !(lista.body?.modelos || []).some((m) => m.modelKey === st.m2.modelKey), `status=${lista.status} n=${(lista.body?.modelos || []).length}`)
  const x1 = await go(`/api/catalogo/aparelhos/search?q=L2`, { headers: { "x-assistec-loja-id": LOJA2 } })
  check("busca_com_header_loja2_403", x1.status === 403, `status=${x1.status}`)
  const x2 = await go(`/api/catalogo/aparelhos/modelos`, json(LOJA2, "POST", { brand: "X", name: `Invasao ${st.nonce}` }))
  check("cadastro_na_loja2_403", x2.status === 403, `status=${x2.status}`)
  const x3 = await go(`/api/catalogo/aparelhos/modelos/${st.m2.id}`, json(LOJA1, "PATCH", { version: 1, name: "Hack" }))
  check("patch_modelo_loja2_pela_loja1_404", x3.status === 404, `status=${x3.status}`)
  const x4 = await go(`/api/catalogo/aparelhos/modelos?storeId=${LOJA2}`, { headers: { "x-assistec-loja-id": LOJA1 } })
  check("query_storeId_loja2_403", x4.status === 403, `status=${x4.status}`)
  // 6. película: relação manual e restauração
  let compatOk = false, compatRestOk = false
  if (globalKey && modelo?.modelKey) {
    const ad = await go(`/api/catalogo/peliculas/compat`, json(LOJA1, "POST", { modelKey: modelo.modelKey, otherModelKey: globalKey, decisao: "adicionar" }))
    const ps = await go(`/api/catalogo/peliculas/search?modelKey=${encodeURIComponent(modelo.modelKey)}`, { headers: { "x-assistec-loja-id": LOJA1 } })
    const txt = JSON.stringify(ps.body)
    compatOk = ad.status === 200 && ps.status === 200 && txt.includes(globalKey) && !/"confirmado"/.test(txt)
    check("pelicula_relacao_manual", compatOk, `post=${ad.status} search=${ps.status}`)
    const rs = await go(`/api/catalogo/peliculas/compat`, json(LOJA1, "POST", { modelKey: modelo.modelKey, otherModelKey: globalKey, decisao: "restaurar" }))
    const ps2 = await go(`/api/catalogo/peliculas/search?modelKey=${encodeURIComponent(modelo.modelKey)}`, { headers: { "x-assistec-loja-id": LOJA1 } })
    compatRestOk = rs.status === 200 && ps2.status === 200 && !JSON.stringify(ps2.body).includes(globalKey)
    check("pelicula_restaurar", compatRestOk, `post=${rs.status} search=${ps2.status}`)
  } else check("pelicula_relacao_manual", false, "sem chave global ou modelo")
  // 7. editar e desativar
  if (modelo?.id) {
    const ed = await go(`/api/catalogo/aparelhos/modelos/${modelo.id}`, json(LOJA1, "PATCH", { version: modelo.version, notes: "G6 editado" }))
    check("editar_200", ed.status === 200 && ed.body?.modelo?.version === modelo.version + 1, `status=${ed.status}`)
    const stale = await go(`/api/catalogo/aparelhos/modelos/${modelo.id}`, json(LOJA1, "PATCH", { version: modelo.version, notes: "stale" }))
    check("versao_desatualizada_409", stale.status === 409, `status=${stale.status}`)
    const off = await go(`/api/catalogo/aparelhos/modelos/${modelo.id}`, json(LOJA1, "PATCH", { version: modelo.version + 1, active: false }))
    const after = await go(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(nome)}`, { headers: { "x-assistec-loja-id": LOJA1 } })
    check("desativar_some_da_busca", off.status === 200 && !(after.body?.results || []).some((r) => r.modelKey === modelo.modelKey), `patch=${off.status}`)
  }
  // 8. regressão básica de rotas existentes
  for (const p of ["/api/auth/session", "/api/ops/inventory/lookup?code=inexistente-g6"]) {
    const r = await go(p, { headers: { "x-assistec-loja-id": LOJA1 } }); check(`regressao ${p.split("?")[0]}`, r.status === 200, `status=${r.status}`)
  }
  const dash = await go(`/dashboard`); check("regressao /dashboard (sessão)", dash.status === 200, `status=${dash.status}`)
  save({ ...st, modelo: modelo ? { id: modelo.id, modelKey: modelo.modelKey } : null, globalKey, results })
  const fails = results.filter((r) => !r.ok)
  say(`G6_APP=${fails.length ? "FAIL" : "PASS"} (${results.length - fails.length}/${results.length})`)
  if (fails.length) process.exitCode = 2
}

function db() {
  const st = load(); if (!st.nonce) die("sem estado")
  const n = st.nonce
  sql(`select 'candidate modelos_nonce=' || count(*) || ' lojas=' || string_agg(distinct "storeId", ',') from catalogo_aparelhos_loja_modelos where name like ${q("%" + n + "%")} or notes like ${q("%" + n + "%")};
select 'candidate compat_rows=' || count(*) from catalogo_aparelhos_loja_compat where "storeId" in (${q(LOJA1)}, ${q(LOJA2)});
select 'candidate marcador=' || count(*) from estoque_produtos where id = ${q(st.marker.id)};
select 'candidate sessoes_runtime=' || count(*) from pg_stat_activity where usename = 'preview_runtime';`, { readOnly: true }).forEach((l) => say(l))
  sql(`select 'preview_main tabelas_novas=' || count(*) from information_schema.tables where table_schema='public' and table_name like 'catalogo_aparelhos_loja%';
select 'preview_main marcador=' || count(*) from estoque_produtos where id = ${q(st.marker.id)} or sku = ${q(st.marker.sku)};
select 'preview_main lojas=' || count(*) from stores;
select 'preview_main sessoes_runtime=' || count(*) from pg_stat_activity where usename = 'preview_runtime';`, { readOnly: true, target: "main" }).forEach((l) => say(l))
}

function clean() {
  const st = load(); if (!st.nonce) die("sem estado")
  const n = st.nonce
  const out = sql(`
DELETE FROM catalogo_aparelhos_loja_compat WHERE "storeId" in (${q(LOJA1)}, ${q(LOJA2)});
DELETE FROM catalogo_aparelhos_loja_modelos WHERE ("storeId" = ${q(LOJA1)} AND name like ${q("%" + n + "%")}) OR ("storeId" = ${q(LOJA2)});
DELETE FROM estoque_produtos WHERE id = ${q(st.marker.id)} AND "storeId" = ${q(LOJA1)} AND stock = 0 AND metadata->>'g6Marker' = ${q(n)};
DELETE FROM stores WHERE id = ${q(LOJA2)};
select 'pos_limpeza modelos=' || (select count(*) from catalogo_aparelhos_loja_modelos) || ' compat=' || (select count(*) from catalogo_aparelhos_loja_compat)
  || ' marcador=' || (select count(*) from estoque_produtos where id = ${q(st.marker.id)}) || ' lojas=' || (select count(*) from stores);`)
  out.forEach((l) => say("[candidate] " + l))
  fs.renameSync(STATE, STATE.replace(/\.json$/, ".limpo.json"))
}

;(async () => {
  const phase = process.argv[2]
  if (phase === "vercel") await vercel(process.argv[3])
  else if (phase === "redeploy") await redeploy()
  else if (phase === "seed") seed()
  else if (phase === "app") await app()
  else if (phase === "db") db()
  else if (phase === "clean") clean()
  else die("fase: vercel | redeploy | seed | app | db | clean")
})().catch((e) => die(e && e.stack ? e.stack : e))
