// CADASTROS-ACESSORIOS-COMPAT-MANUAL-FINALIZACAO-001 — Neon Candidate `pr-acc-compat` (projeto de PREVIEW sintético).
// Fases:
//   secrets  gera C:\Projetos\secrets\neon-preview-acc\.env (URLs derivadas do main do preview + segredos aleatórios)
//   identity SOMENTE LEITURA: trava de identidade + migrations, tabelas, papéis, dados sintéticos (Candidate e main)
//   migrate  trava → checksum → migrate status (só a 20261107120000 pendente) → deploy → status → drift 0 → grants
//   sql      executa um arquivo SQL (ACC_SQL_FILE) no Candidate, numa transação, com a trava no mesmo psql -1
// Nunca: Neon Production, `pr315-kg`, o main do preview para escrita. Segredos nunca vão para argv ou stdout.
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { spawnSync } = require("node:child_process")

const PROJECT = "nameless-frost-19035275", PROD_PROJECT = "dry-mouse-36002471", PROD_EP = "ep-summer-tooth-acltc6wi"
const DB = "omnigestao_preview", OWNER = "omnigestao_preview_owner", RUNTIME = "preview_runtime"
const MAIN = { branch: "br-lively-feather-b6esh64a", ep: "ep-purple-morning-b6ajdsfk" }
const KG = { branch: "br-wandering-band-b6ov7vmt", ep: "ep-red-wave-b6bbj667" }
const ACC = { name: "pr-acc-compat", branch: "br-ancient-field-b6092x8d", ep: "ep-orange-sound-b6kqp78k" }
const MIGRATION = "20261107120000_catalogo_aparelhos_loja"
const WT = path.resolve(__dirname, "../../../../..")
const SRC = "C:/Projetos/secrets/neon-preview/.env", GEN = "C:/Projetos/secrets/neon-preview/generated.env"
const OUT_DIR = "C:/Projetos/secrets/neon-preview-acc", OUT = OUT_DIR + "/.env"
const PSQL = "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
const PRISMA_JS = path.join(WT, "node_modules", "prisma", "build", "index.js")

const die = (m) => { console.error("ABORTADO: " + red(m)); process.exit(1) }
const SECRETS = []
function red(s) { let o = String(s ?? ""); for (const x of SECRETS) if (x && x.length > 3) o = o.split(x).join("<redacted>"); return o }
const say = (m) => console.log(red(m))
const readEnv = (f) => { const o = {}; for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^"|"$/g, "") } return o }
const swapEp = (raw, fromEp, toEp) => { const u = new URL(raw); const [label, ...rest] = u.hostname.split("."); if (label.replace(/-pooler$/, "") !== fromEp) die("endpoint de origem inesperado"); u.hostname = [label.replace(fromEp, toEp), ...rest].join("."); return u.toString() }

function target(raw, exp, user) {
  const u = new URL(raw); const label = u.hostname.split(".")[0]; const ep = label.replace(/-pooler$/, "")
  SECRETS.push(raw, decodeURIComponent(u.password), u.password)
  if (ep === PROD_EP) die("endpoint de produção")
  if (ep === KG.ep && exp.ep !== KG.ep) die("endpoint do pr315-kg")
  if (ep !== exp.ep) die(`endpoint inesperado (${label})`)
  if (decodeURIComponent(u.username) !== user || u.pathname !== `/${DB}`) die("usuário/database inesperado")
  return { raw, u, host: u.hostname, pw: decodeURIComponent(u.password), user, ...exp }
}
const guardSql = (t) => `DO $g$ BEGIN IF NOT (current_setting('neon.project_id') = '${PROJECT}' AND current_setting('neon.project_id') <> '${PROD_PROJECT}'`
  + ` AND current_setting('neon.branch_id') = '${t.branch}' AND current_setting('neon.endpoint_id') = '${t.ep}' AND current_database() = '${DB}') THEN`
  + ` RAISE EXCEPTION 'IDENTIDADE_DIVERGENTE'; END IF; END $g$;`
function psql(t, { sql, file, readOnly = false, single = false }) {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"]
  if (single) args.push("-1")
  args.push("-c", guardSql(t))
  if (sql) args.push("-c", sql)
  if (file) args.push("-f", file)
  const r = spawnSync(PSQL, args, { encoding: "utf8", timeout: 180000, env: { ...process.env, PGHOST: t.host, PGPORT: "5432", PGUSER: t.user, PGPASSWORD: t.pw,
    PGDATABASE: DB, PGSSLMODE: "require", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "30", PGAPPNAME: "acc-compat-finalizacao-001",
    PGOPTIONS: readOnly ? "-c default_transaction_read_only=on" : "" } })
  return { status: r.status, out: red(r.stdout).trim(), err: red(r.stderr).trim() }
}
const must = (r, what) => { if (r.status !== 0) die(`${what}: ${r.err}`); return r.out }
function prisma(t, args) {
  const u = new URL(t.raw); u.searchParams.delete("channel_binding"); u.searchParams.set("sslmode", "require")
  const url = u.toString(); SECRETS.push(url)
  const extra = args[1] === "diff" ? [] : ["--schema", path.join(WT, "prisma", "schema.prisma")]
  const r = spawnSync(process.execPath, [PRISMA_JS, ...args, ...extra], { encoding: "utf8", timeout: 300000, cwd: OUT_DIR,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" } })
  return { status: r.status, out: red(`${r.stdout}\n${r.stderr}`) }
}

const INFO = `select 'identidade=' || current_setting('neon.project_id') || '/' || current_setting('neon.branch_id') || '/' || current_setting('neon.endpoint_id') || '/' || current_database() || ' user=' || current_user;
select 'migrations=' || count(*) || ' catalogo_loja=' || count(*) filter (where migration_name = '${MIGRATION}') || ' checksum=' || coalesce(max(checksum) filter (where migration_name = '${MIGRATION}'), '-') from _prisma_migrations where finished_at is not null and rolled_back_at is null;
select 'tabelas_novas=' || count(*) from information_schema.tables where table_schema='public' and table_name in ('catalogo_aparelhos_loja_modelos','catalogo_aparelhos_loja_compat');
select 'lojas=' || count(*) || ' ids=' || string_agg(id, ',' order by id) from stores;
select 'admins=' || count(*) || ' invalid=' || count(*) filter (where email like '%@preview.invalid') from admin_users;
select 'runtime=' || rolname || ' super=' || rolsuper || ' createrole=' || rolcreaterole || ' createdb=' || rolcreatedb || ' bypassrls=' || rolbypassrls from pg_roles where rolname='${RUNTIME}';
select 'dados_md5=' || md5(coalesce((select string_agg(id || ':' || name, ',' order by id) from stores), '') || '|' || coalesce((select string_agg(id || ':' || email || ':' || role, ',' order by id) from admin_users), '') || '|' || (select count(*) from estoque_produtos)::text || '|' || (select count(*) from vendas)::text);`
const GRANTS = `select 'grants_runtime=' || coalesce(string_agg(table_name || ':' || privs, ' ' order by table_name), '-') from (
  select table_name, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants
  where grantee = '${RUNTIME}' and table_name in ('catalogo_aparelhos_loja_modelos','catalogo_aparelhos_loja_compat') group by table_name) x;
select 'checks=' || string_agg(conname, ',' order by conname) from pg_constraint where conrelid in ('catalogo_aparelhos_loja_modelos'::regclass, 'catalogo_aparelhos_loja_compat'::regclass) and contype in ('c','f','u');`

const phase = process.argv[2]
const S = readEnv(SRC)
if (phase === "secrets") {
  if (fs.existsSync(OUT)) die("arquivo de segredos já existe; não sobrescrevo")
  const G = readEnv(GEN)
  const rnd = (n) => crypto.randomBytes(n).toString("base64url")
  const owner = swapEp(S.PREVIEW_MAIN_OWNER_URL, MAIN.ep, ACC.ep)
  const rtPool = swapEp(G.PREVIEW_MAIN_RUNTIME_DATABASE_URL, MAIN.ep, ACC.ep)
  const rtDirect = swapEp(G.PREVIEW_MAIN_RUNTIME_DIRECT_URL, MAIN.ep, ACC.ep)
  target(owner, ACC, OWNER); target(rtPool, ACC, RUNTIME); target(rtDirect, ACC, RUNTIME)
  if (new URL(rtPool).searchParams.get("pgbouncer") !== "true" || !new URL(rtPool).hostname.split(".")[0].endsWith("-pooler")) die("pooled sem pooler/pgbouncer")
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const lines = [
    `# Candidate pr-acc-compat (${ACC.branch} / ${ACC.ep}) — projeto ${PROJECT}. Gerado ${new Date().toISOString()}. Não versionar.`,
    `ACC_OWNER_URL=${owner}`, `ACC_RUNTIME_DATABASE_URL=${rtPool}`, `ACC_RUNTIME_DIRECT_URL=${rtDirect}`,
    `ACC_AUTH_SECRET=${rnd(32)}`,
    `ACC_NEUTRAL_WHATSAPP_ACCESS_TOKEN=acc-preview-disabled-${rnd(12)}`, `ACC_NEUTRAL_WHATSAPP_APP_SECRET=acc-preview-disabled-${rnd(24)}`,
    `ACC_NEUTRAL_WHATSAPP_VERIFY_TOKEN=acc-preview-disabled-${rnd(12)}`, `ACC_NEUTRAL_WHATSAPP_PHONE_NUMBER_ID=000000000000000`,
    `ACC_NEUTRAL_WHATSAPP_BUSINESS_ACCOUNT_ID=000000000000000`, `ACC_NEUTRAL_WHATSAPP_WEBHOOK_STORE_ID=preview-loja-inexistente`,
    `ACC_NEUTRAL_CONTADOR_PIN=${crypto.randomInt(10 ** 7, 10 ** 8)}`, `ACC_NEUTRAL_CONTADOR_SESSION_SECRET=${rnd(48)}`,
    `ACC_NEUTRAL_ADMIN_DEFAULT_PASSWORD=${rnd(24)}`, ""]
  fs.writeFileSync(OUT, lines.join("\n"), { mode: 0o600 })
  say(`segredos gravados em ${OUT} (${lines.length - 2} chaves); nada impresso`)
  process.exit(0)
}
const A = readEnv(OUT)
const acc = target(A.ACC_OWNER_URL, ACC, OWNER)
const main = target(S.PREVIEW_MAIN_OWNER_URL, MAIN, OWNER)
if (acc.host === main.host) die("Candidate e main com o mesmo host")

if (phase === "identity") {
  for (const [nome, t] of [["candidate", acc], ["preview-main", main]]) {
    say(`== ${nome} (${t.branch}) — trava ok, somente leitura`)
    for (const l of must(psql(t, { readOnly: true, sql: INFO }), nome).split(/\r?\n/)) if (l) say("  " + l)
  }
} else if (phase === "migrate") {
  const file = path.join(WT, "prisma", "migrations", MIGRATION, "migration.sql")
  const sha = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  say(`checksum arquivo=${sha}`)
  say(must(psql(acc, { readOnly: true, sql: INFO }), "identidade antes"))
  const mainBefore = must(psql(main, { readOnly: true, sql: INFO }), "main antes")
  const st0 = prisma(acc, ["migrate", "status"])
  const pending = [...st0.out.matchAll(/^(\d{14}_\w+)$/gm)].map((x) => x[1])
  say("pendentes: " + (pending.join(",") || "-"))
  if (pending.length !== 1 || pending[0] !== MIGRATION) die("esperado só a migration do catálogo pendente:\n" + st0.out.slice(-1500))
  const dep = prisma(acc, ["migrate", "deploy"]); if (dep.status !== 0) die("migrate deploy: " + dep.out.slice(-2000))
  say("deploy: " + (dep.out.match(/All migrations have been successfully applied\.|No pending migrations to apply\./) || ["?"])[0])
  const st = prisma(acc, ["migrate", "status"]); say("status: " + (st.out.match(/Database schema is up to date!/) || ["DIVERGENTE"])[0])
  const schema = path.join(WT, "prisma", "schema.prisma")
  const dr = prisma(acc, ["migrate", "diff", "--from-schema-datasource", schema, "--to-schema-datamodel", schema, "--exit-code"])
  say(`drift (0=vazio): ${dr.status}`)
  if (dr.status !== 0) die("drift depois da migration:\n" + dr.out.slice(-2000))
  const after = must(psql(acc, { readOnly: true, sql: INFO + GRANTS }), "identidade depois")
  for (const l of after.split(/\r?\n/)) if (l) say("  " + l)
  if (!after.includes(`catalogo_loja=1 checksum=${sha}`)) die("histórico sem a migration com o checksum do arquivo")
  if (!/grants_runtime=catalogo_aparelhos_loja_compat:DELETE,INSERT,SELECT,UPDATE catalogo_aparelhos_loja_modelos:DELETE,INSERT,SELECT,UPDATE/.test(after)) die("runtime sem DML nas tabelas novas")
  const mainAfter = must(psql(main, { readOnly: true, sql: INFO }), "main depois")
  say(`preview_main_inalterado=${mainAfter === mainBefore}`)
  if (mainAfter !== mainBefore) die("main do preview mudou")
} else if (phase === "sql") {
  const f = process.env.ACC_SQL_FILE || die("defina ACC_SQL_FILE")
  const ro = process.env.ACC_SQL_READONLY === "1"
  const which = process.env.ACC_SQL_TARGET === "main" ? main : acc
  if (which === main && !ro) die("o main do preview só aceita leitura")
  for (const l of must(psql(which, { file: f, single: true, readOnly: ro }), "sql").split(/\r?\n/)) if (l) say("  " + l)
} else die("fase: secrets | identity | migrate | sql")
