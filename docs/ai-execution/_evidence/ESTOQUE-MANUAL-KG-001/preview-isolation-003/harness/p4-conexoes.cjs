// P4 do PR315-PREVIEW-ISOLATION-READINESS-003: quem está conectado em cada branch do Neon preview (SÓ LEITURA).
// Dono, default_transaction_read_only=on, trava de projeto/branch/endpoint/database antes de qualquer consulta.
// Lê as URLs de P2_SECRETS_FILE (fora do repo); nada de segredo vai para argv, stdout ou arquivo.
const fs = require("node:fs")
const { spawnSync } = require("node:child_process")

const PROJECT = "nameless-frost-19035275", PROD_PROJECT = "dry-mouse-36002471", PROD_EP = "ep-summer-tooth-acltc6wi"
const DB = "omnigestao_preview", OWNER = "omnigestao_preview_owner"
const ALVOS = [
  { nome: "main", key: "PREVIEW_MAIN_OWNER_URL", branch: "br-lively-feather-b6esh64a", ep: "ep-purple-morning-b6ajdsfk" },
  { nome: "pr315-kg", key: "PREVIEW_KG_OWNER_URL", branch: "br-wandering-band-b6ov7vmt", ep: "ep-red-wave-b6bbj667" },
]
const PSQL = process.env.P2_PSQL || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
const die = (m) => { console.error("ABORTADO: " + m); process.exit(1) }
const file = process.env.P2_SECRETS_FILE || die("defina P2_SECRETS_FILE")
const S = {}
for (const l of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) S[m[1]] = m[2].replace(/^"|"$/g, "") }
const SECRETS = []
const red = (s) => { let o = String(s || ""); for (const x of SECRETS) if (x) o = o.split(x).join("<redacted>"); return o }

const SQL = `
select 'sessoes_preview_runtime=' || count(*) from pg_stat_activity where usename = 'preview_runtime';
select 'por_app=' || coalesce(string_agg(app || ':' || n, ', ' order by app), '-') from (
  select coalesce(nullif(application_name, ''), '(vazio)') app, count(*) n from pg_stat_activity where usename = 'preview_runtime' group by 1) x;
select 'ultima_atividade_runtime=' || coalesce(to_char(max(backend_start) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '-') from pg_stat_activity where usename = 'preview_runtime';
select 'colunas_estoque=' || string_agg(table_name || '.' || column_name || ':' || data_type, ' ' order by table_name, column_name)
  from information_schema.columns where table_schema = 'public' and (
    (table_name = 'estoque_produtos' and column_name = 'stock') or (table_name = 'produto_depositos' and column_name = 'quantidade')
    or (table_name = 'movimentacoes_estoque' and column_name in ('quantidade', 'estoqueAntes', 'estoqueDepois')));
select 'migrations=' || count(*) || ' kg=' || count(*) filter (where migration_name = '20261025120000_estoque_quantidade_fracionada')
  from _prisma_migrations where finished_at is not null and rolled_back_at is null;`

for (const a of ALVOS) {
  let u
  try { u = new URL(S[a.key] || die(`${a.key} ausente`)) } catch { die(`${a.key} não é URL`) }
  const pw = decodeURIComponent(u.password); SECRETS.push(pw, S[a.key])
  const ep = u.hostname.split(".")[0]
  if (ep === PROD_EP || ep.replace(/-pooler$/, "") === PROD_EP) die(`${a.key}: endpoint de produção`)
  if (ep !== a.ep) die(`${a.key}: endpoint inesperado`)
  if (decodeURIComponent(u.username) !== OWNER || u.pathname !== `/${DB}`) die(`${a.key}: usuário/database inesperado`)
  const guard = `SELECT 'guard_ok' WHERE 1 / CASE WHEN current_setting('neon.project_id') = '${PROJECT}'`
    + ` AND current_setting('neon.project_id') <> '${PROD_PROJECT}' AND current_setting('neon.branch_id') = '${a.branch}'`
    + ` AND current_setting('neon.endpoint_id') = '${a.ep}' AND current_database() = '${DB}' THEN 1 ELSE 0 END = 1`
  const r = spawnSync(PSQL, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", "-c", guard, "-c", SQL], {
    encoding: "utf8", timeout: 120000,
    env: { ...process.env, PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: OWNER, PGPASSWORD: pw, PGDATABASE: DB,
      PGSSLMODE: "require", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "30", PGAPPNAME: "p4-conexoes-003",
      PGOPTIONS: "-c default_transaction_read_only=on" },
  })
  if (r.status !== 0) die(`${a.nome}: ${red(r.stderr).trim()}`)
  console.log(`== ${a.nome} (${a.branch}) — trava ok, somente leitura`)
  for (const l of red(r.stdout).split(/\r?\n/)) if (l && l !== "guard_ok") console.log("  " + l)
}
