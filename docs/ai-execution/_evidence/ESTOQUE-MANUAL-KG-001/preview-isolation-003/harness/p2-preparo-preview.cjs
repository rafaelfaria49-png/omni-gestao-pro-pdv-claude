// P2 do PR315-PREVIEW-ISOLATION-READINESS-003: prepara o projeto Neon `omnigestao-preview` (nameless-frost-19035275).
// Fases: check (só leitura) → main (papel runtime, schema da main, resolve, grants, seed) → kg (migration KG no branch filho).
// Segredos: lidos de um arquivo FORA do repo (P2_SECRETS_FILE); senhas geradas vão para P2_GENERATED_FILE (fora do repo).
// Nenhum segredo vai para argv, stdout ou arquivo versionado. Toda sessão psql começa pela trava de projeto/branch/endpoint.
// Uso: node p2-preparo-preview.cjs <url|check|main|kg>   (url = só valida o arquivo, sem conectar)
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { spawnSync } = require("node:child_process")

const PROJECT = "nameless-frost-19035275"
const MAIN_BRANCH = "br-lively-feather-b6esh64a"
// Confirmados na P2.0 (06-p2-0-check.md)
const MAIN_EP = "ep-purple-morning-b6ajdsfk"
const OWNER = "omnigestao_preview_owner"
const PROD_PROJECT = "dry-mouse-36002471"
const PROD_EP = "ep-summer-tooth-acltc6wi"
const DB = "omnigestao_preview"
const RUNTIME = "preview_runtime"
const KG_MIGRATION = "20261025120000_estoque_quantidade_fracionada"
const KG_SHA = "f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e" // ESTOQUE_MANUAL_KG_RUNBOOK.md
const KG_COLS = [["estoque_produtos", "stock"], ["produto_depositos", "quantidade"], ["movimentacoes_estoque", "quantidade"],
  ["movimentacoes_estoque", "estoqueAntes"], ["movimentacoes_estoque", "estoqueDepois"]]
const ROOT = "C:\\Projetos\\omni-gestao"
const PR_WORKTREE = path.join(ROOT, ".worktrees", "estoque-manual-kg-001")
const PSQL = process.env.P2_PSQL || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
const PRISMA_JS = path.join(ROOT, "node_modules", "prisma", "build", "index.js")
const bcrypt = require(path.join(ROOT, "node_modules", "bcryptjs"))
// Prova local: só aceita loopback e só com a flag; nunca vale para host Neon.
const LOCAL_TEST = process.env.P2_LOCAL_TEST === "1"

const SECRETS = []
const red = (s) => { let o = String(s || ""); for (const x of SECRETS) if (x) o = o.split(x).join("<redacted>"); return o }
const die = (m) => { console.error("ABORTADO: " + red(m)); process.exit(1) }
const say = (m) => console.log(red(m))

// O git desta máquina descarta "\" em argumentos: caminhos para ele vão sempre com "/".
const git = (args, opts = {}) => spawnSync("git", args.map((a) => /^[A-Za-z]:\\/.test(a) ? a.replace(/\\/g, "/") : a), { encoding: "utf8", ...opts })

function outsideRepo(file) {
  const dir = path.dirname(path.resolve(file))
  if (!fs.existsSync(dir)) die(`pasta inexistente: ${dir}`)
  const r = git(["-C", dir, "rev-parse", "--is-inside-work-tree"])
  if (r.status === 0 && r.stdout.trim() === "true") die(`arquivo de segredo dentro de um repositório git: ${dir}`)
  // fail-closed: fora de repo só quando o git diz explicitamente que não é repositório
  if (r.status === 0 || !/not a git repository/i.test(r.stderr)) die(`não foi possível provar que ${dir} está fora de um repositório git`)
}

function readEnvFile(file) {
  outsideRepo(file)
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "")
  }
  return out
}

// Valida a URL sem imprimir: endpoint Neon direto (sem -pooler), ≠ produção, database certo.
function parseTarget(raw, label) {
  if (!raw) die(`${label} ausente no arquivo de segredos`)
  let u
  try { u = new URL(raw) } catch { die(`${label} não é URL`) }
  const pw = decodeURIComponent(u.password); SECRETS.push(pw, raw)
  const host = u.hostname
  if (LOCAL_TEST) { if (host !== "127.0.0.1") die(`${label}: modo de prova local só aceita 127.0.0.1`) }
  else {
    // O console Neon atual mostra o host com segmento de célula (ep-….c-2.sa-east-1.aws.neon.tech); o antigo não tem.
    // A identidade continua no 1º rótulo (endpoint), conferido abaixo contra MAIN_EP/PROD_EP.
    if (!/^ep-[a-z0-9-]+(\.c-[0-9]+)?\.sa-east-1\.aws\.neon\.tech$/.test(host)) die(`${label}: host não é endpoint Neon sa-east-1`)
    if (host.split(".")[0].endsWith("-pooler")) die(`${label}: use a URL direta (sem -pooler) para DDL/migrations`)
  }
  const ep = LOCAL_TEST ? `ep-local-${u.port}` : host.split(".")[0]
  if (ep === PROD_EP) die(`${label}: RECUSADO, endpoint de produção`)
  if (!LOCAL_TEST && label.includes("_MAIN_") && ep !== MAIN_EP) die(`${label}: endpoint ≠ ${MAIN_EP} (main confirmado na P2.0)`)
  if (!LOCAL_TEST && label.includes("_KG_") && ep === MAIN_EP) die(`${label}: endpoint do filho igual ao do main`)
  if (u.pathname.replace(/^\//, "") !== DB) die(`${label}: database ≠ ${DB}`)
  const user = decodeURIComponent(u.username)
  if (user !== OWNER) die(`${label}: usuário ≠ ${OWNER}`)
  return { raw, host, port: u.port || "5432", user, pw, ep }
}

function psql(t, { sql, stdin, user, pw, branch, readOnly = false, single = false }) {
  const guard = `SELECT 'guard_ok' WHERE 1 / CASE WHEN current_setting('neon.project_id') = '${PROJECT}'`
    + ` AND current_setting('neon.project_id') <> '${PROD_PROJECT}' AND current_setting('neon.branch_id') = '${branch}'`
    + ` AND current_setting('neon.endpoint_id') = '${t.ep}' AND current_database() = '${DB}' THEN 1 ELSE 0 END = 1`
  // VERBOSITY=sqlstate: erros saem pelo código (42501, 22012), independente do idioma do servidor
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", ...(single ? ["-1"] : []), "-c", guard]
  if (sql) args.push("-c", sql)
  if (stdin) args.push("-f", "-")
  const r = spawnSync(PSQL, args, {
    input: stdin || "", encoding: "utf8", timeout: 180000,
    env: { ...process.env, PGHOST: t.host, PGPORT: t.port, PGUSER: user || t.user, PGPASSWORD: pw || t.pw, PGDATABASE: DB,
      PGSSLMODE: LOCAL_TEST ? "disable" : "require", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "30", PGAPPNAME: "p2-preview-003",
      PGOPTIONS: readOnly ? "-c default_transaction_read_only=on" : "" },
  })
  const out = red(r.stdout).replace(/^guard_ok\n?/, "").trim()
  return { ok: r.status === 0, out, err: red(r.stderr).trim() }
}
function must(r, what) { if (!r.ok) die(`${what}: ${r.err || r.out}`); return r.out }

// A URL do console Neon traz `channel_binding=require`, que o engine do Prisma não garante aceitar.
// Para o Prisma: tira channel_binding e mantém sslmode=require (fora da prova local).
function prismaUrl(t) {
  const u = new URL(t.raw)
  u.searchParams.delete("channel_binding")
  if (!LOCAL_TEST) u.searchParams.set("sslmode", "require")
  return u.toString()
}

function prisma(t, schema, args) {
  // `migrate diff` recusa --schema (o schema já vai em --from/--to-schema-*)
  const extra = args[1] === "diff" ? [] : ["--schema", schema]
  const r = spawnSync(process.execPath, [PRISMA_JS, ...args, ...extra], {
    encoding: "utf8", timeout: 300000, cwd: work, env: { ...process.env, DATABASE_URL: prismaUrl(t), DIRECT_URL: prismaUrl(t) },
  })
  return { status: r.status, out: red(`${r.stdout}\n${r.stderr}`) }
}

function mainPrismaDir(work) {
  const dir = path.join(work, "main-prisma")
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
  const sha = git(["-C", ROOT, "rev-parse", "origin/main"]).stdout.trim()
  if (!/^[0-9a-f]{40}$/.test(sha)) die("origin/main não resolvido")
  const tar = git(["-C", ROOT, "archive", "--format=tar", sha, "prisma"], { encoding: "buffer", maxBuffer: 1 << 28 })
  if (tar.status !== 0) die("git archive da main falhou: " + tar.stderr)
  // bsdtar do Windows: o tar do Git lê "C:" como host remoto
  const x = spawnSync("C:\\Windows\\System32\\tar.exe", ["-x", "-f", "-", "-C", dir], { input: tar.stdout })
  if (x.status !== 0) die("extração do prisma da main falhou")
  return { sha, schema: path.join(dir, "prisma", "schema.prisma"), migDir: path.join(dir, "prisma", "migrations") }
}

const colsSql = `select string_agg(table_name||'.'||column_name||':'||data_type, ' ' order by 1) from information_schema.columns
  where table_schema='public' and (table_name,column_name) in (${KG_COLS.map(([a, b]) => `('${a}','${b}')`).join(",")})`
const privSql = `select 'tabelas='||count(*)||' sem_dml_runtime='||count(*) filter (where not (has_table_privilege('${RUNTIME}',c.oid,'SELECT')
  and has_table_privilege('${RUNTIME}',c.oid,'INSERT') and has_table_privilege('${RUNTIME}',c.oid,'UPDATE') and has_table_privilege('${RUNTIME}',c.oid,'DELETE')))
  ||' rls='||count(*) filter (where c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')`
const roleSql = `select 'runtime create_public='||has_schema_privilege('${RUNTIME}','public','CREATE')||' create_db='||has_database_privilege('${RUNTIME}','${DB}','CREATE')
  ||' super='||rolsuper||' bypassrls='||rolbypassrls||' createrole='||rolcreaterole||' membros='||coalesce((select string_agg(b.rolname,',') from pg_auth_members m join pg_roles b on b.oid=m.roleid where m.member=r.oid),'-')
  from pg_roles r where rolname='${RUNTIME}'`

function runtimeProbe(t, branch, pw) {
  const who = must(psql(t, { user: RUNTIME, pw, branch, sql: "select 'runtime_login='||current_user" }), "login do runtime")
  const ddl = psql(t, { user: RUNTIME, pw, branch, sql: "create table p2_probe(i int)" })
  if (ddl.ok) { psql(t, { branch, sql: "drop table if exists p2_probe" }); die("runtime conseguiu CREATE TABLE") }
  if (!/42501/.test(ddl.err)) die(`CREATE do runtime falhou por outro motivo: ${ddl.err}`)
  say(`${who} · ddl_recusado=42501`)
}

const phase = process.argv[2]
const secretsFile = process.env.P2_SECRETS_FILE || die("defina P2_SECRETS_FILE (fora do repo)")
const genFile = process.env.P2_GENERATED_FILE || die("defina P2_GENERATED_FILE (fora do repo)")
const work = process.env.P2_WORKDIR || die("defina P2_WORKDIR (pasta de trabalho fora do repo)")
outsideRepo(genFile); outsideRepo(path.join(work, "x"))
if (!fs.existsSync(secretsFile)) die(`arquivo de segredos não encontrado: ${secretsFile}`)
const S = readEnvFile(secretsFile)
const G = readEnvFile(genFile)
if (G.PREVIEW_RUNTIME_PASSWORD) SECRETS.push(G.PREVIEW_RUNTIME_PASSWORD)
if (G.PREVIEW_ADMIN_PASSWORD) SECRETS.push(G.PREVIEW_ADMIN_PASSWORD)

if (phase === "url") {
  // Só valida o arquivo local (formato, endpoint, usuário, database). Não abre conexão.
  const t = parseTarget(S.PREVIEW_MAIN_OWNER_URL, "PREVIEW_MAIN_OWNER_URL")
  const q = new URL(t.raw).searchParams
  say(`url: OK sem conectar · endpoint=${t.ep} host_celula=${/\.c-[0-9]+\./.test(t.host) ? t.host.split(".")[1] : "-"} pooler=off usuário=${t.user} db=${DB} sslmode=${q.get("sslmode") || "-"} senha_presente=${t.pw.length > 0}`)
  // Depois da P2.2: mesmas travas da fase kg, ainda sem conectar
  if (S.PREVIEW_KG_OWNER_URL || S.PREVIEW_KG_BRANCH_ID) {
    const k = parseTarget(S.PREVIEW_KG_OWNER_URL, "PREVIEW_KG_OWNER_URL")
    const B = S.PREVIEW_KG_BRANCH_ID || die("PREVIEW_KG_BRANCH_ID ausente")
    if (!/^br-[a-z0-9-]+$/.test(B) || B === MAIN_BRANCH) die("PREVIEW_KG_BRANCH_ID inválido ou igual ao main")
    if (k.ep === t.ep) die("endpoint do branch filho igual ao do main")
    if (k.pw !== t.pw) die("senha do dono no filho ≠ main (o branch copia papéis e senhas): conferir se a URL é deste projeto")
    const kq = new URL(k.raw).searchParams
    say(`url kg: OK sem conectar · branch=${B} endpoint=${k.ep} host_celula=${/\.c-[0-9]+\./.test(k.host) ? k.host.split(".")[1] : "-"} pooler=off usuário=${k.user} db=${DB} sslmode=${kq.get("sslmode") || "-"} senha_igual_main=true`)
  }
} else if (phase === "check") {
  const t = parseTarget(S.PREVIEW_MAIN_OWNER_URL, "PREVIEW_MAIN_OWNER_URL")
  say(`alvo: endpoint=${t.ep} usuário_dono=${t.user}`)
  say(must(psql(t, { branch: MAIN_BRANCH, readOnly: true, sql:
    "select 'neon project='||current_setting('neon.project_id')||' branch='||current_setting('neon.branch_id')||' endpoint='||current_setting('neon.endpoint_id')" }), "trava"))
  say(must(psql(t, { branch: MAIN_BRANCH, readOnly: true, sql:
    "select 'pg='||current_setting('server_version')||' db='||current_database()||' current_user='||current_user||' dono_do_banco='||(select pg_get_userbyid(datdba) from pg_database where datname=current_database())||' ro='||current_setting('transaction_read_only')" }), "versão"))
  say(must(psql(t, { branch: MAIN_BRANCH, readOnly: true, sql:
    "select 'dono createrole='||rolcreaterole||' super='||rolsuper||' membro_neon_superuser='||pg_has_role(current_user,'neon_superuser','member') from pg_roles where rolname=current_user" }), "dono"))
  say(must(psql(t, { branch: MAIN_BRANCH, readOnly: true, sql:
    "select 'papeis_nao_sistema='||coalesce(string_agg(rolname,',' order by rolname),'-') from pg_roles where rolname !~ '^pg_' and rolname not in ('cloud_admin','neon_superuser','neon_service','authenticator','anonymous','authenticated','zenith_admin')" }), "papéis"))
  say(must(psql(t, { branch: MAIN_BRANCH, readOnly: true, sql:
    "select 'tabelas_public='||count(*) from pg_tables where schemaname='public'" }), "tabelas"))
  say("check: OK (nenhuma escrita)")
} else if (phase === "main") {
  const t = parseTarget(S.PREVIEW_MAIN_OWNER_URL, "PREVIEW_MAIN_OWNER_URL")
  const B = MAIN_BRANCH
  if (must(psql(t, { branch: B, sql: "select count(*) from pg_tables where schemaname='public'" }), "pré") !== "0") die("public não está vazio; a fase main só roda em banco vazio")
  if (must(psql(t, { branch: B, sql: `select count(*) from pg_roles where rolname='${RUNTIME}'` }), "pré") !== "0") die(`${RUNTIME} já existe; decidir à mão`)
  if (G.PREVIEW_RUNTIME_PASSWORD) die("P2_GENERATED_FILE já tem senha de runtime; use um arquivo novo")

  const m = mainPrismaDir(work)
  const migs = fs.readdirSync(m.migDir).filter((d) => d !== "migration_lock.toml").sort()
  say(`main=${m.sha.slice(0, 7)} migrations=${migs.length}`)

  // 1) papel runtime: senha gerada aqui, enviada só por stdin, gravada só no arquivo gerado
  const runtimePw = crypto.randomBytes(24).toString("base64url"); SECRETS.push(runtimePw)
  const adminPw = crypto.randomBytes(15).toString("base64url"); SECRETS.push(adminPw)
  fs.writeFileSync(genFile, `PREVIEW_RUNTIME_PASSWORD=${runtimePw}\nPREVIEW_ADMIN_EMAIL=admin@preview.invalid\nPREVIEW_ADMIN_PASSWORD=${adminPw}\n`, { mode: 0o600 })
  must(psql(t, { branch: B, stdin: `CREATE ROLE ${RUNTIME} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${runtimePw}';\n` }), "create role")
  say(`${RUNTIME} criado`)

  // 2) schema da main por diff-from-empty (a cadeia 0001–0014 não roda do zero) + resolve de todas
  const base = path.join(work, "base.sql")
  const d = spawnSync(process.execPath, [PRISMA_JS, "migrate", "diff", "--from-empty", "--to-schema-datamodel", m.schema, "--script"], { cwd: work, encoding: "utf8", maxBuffer: 1 << 26 })
  if (d.status !== 0) die("migrate diff: " + d.stderr)
  fs.writeFileSync(base, d.stdout)
  must(psql(t, { branch: B, single: true, stdin: fs.readFileSync(base, "utf8") }), "aplicar base")
  say(`base aplicada (${d.stdout.split("\n").length} linhas)`)
  for (const mig of migs) { const r = prisma(t, m.schema, ["migrate", "resolve", "--applied", mig]); if (r.status !== 0) die(`resolve ${mig}: ${r.out}`) }
  say(`resolvidas=${migs.length}`)
  const st = prisma(t, m.schema, ["migrate", "status"]); say("status: " + (st.out.match(/Database schema is up to date!|not yet been applied[^\n]*|failed[^\n]*/) || ["?"])[0])
  const dr = prisma(t, m.schema, ["migrate", "diff", "--from-schema-datasource", m.schema, "--to-schema-datamodel", m.schema, "--exit-code"]); say(`drift main (0=vazio): ${dr.status}`)
  if (dr.status !== 0) die("drift ≠ 0 depois do preparo: " + dr.out.slice(-1500))

  // 3) grants do runtime: só DML; nada de CREATE no schema nem no banco
  must(psql(t, { branch: B, single: true, sql: [
    `GRANT CONNECT ON DATABASE ${DB} TO ${RUNTIME}`, `GRANT USAGE ON SCHEMA public TO ${RUNTIME}`,
    `REVOKE CREATE ON SCHEMA public FROM PUBLIC`,
    `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${RUNTIME}`, `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${RUNTIME}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${t.user} IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${RUNTIME}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${t.user} IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${RUNTIME}`].join("; ") }), "grants")
  say(must(psql(t, { branch: B, sql: privSql }), "privilégios"))
  say(must(psql(t, { branch: B, sql: roleSql }), "papel runtime"))
  say("colunas KG (esperado integer): " + must(psql(t, { branch: B, sql: colsSql }), "colunas"))

  // 4) seed sintético mínimo: 1 loja SUPERMERCADO, 1 admin de loja (id aleatório, e-mail .invalid), vínculo
  const adminId = "c" + crypto.randomBytes(12).toString("hex").slice(0, 24)
  const hash = bcrypt.hashSync(adminPw, 12)
  must(psql(t, { branch: B, single: true, stdin: [
    `INSERT INTO stores (id, name, profile, "updatedAt") VALUES ('preview-loja-1', 'Loja Preview Sintética', 'SUPERMERCADO', now());`,
    `INSERT INTO admin_users (id, name, email, password, role, "lojaId", active, "accessScope", "mustChangePassword", "sessionVersion", "updatedAt")`,
    `  VALUES ('${adminId}', 'Admin Preview', 'admin@preview.invalid', '${hash}', 'ADMIN', 'preview-loja-1', true, 'STORE', false, 0, now());`,
    `INSERT INTO admin_user_stores (id, "adminUserId", "storeId") VALUES ('c${crypto.randomBytes(12).toString("hex").slice(0, 24)}', '${adminId}', 'preview-loja-1');`, ""].join("\n") }), "seed")
  const stored = must(psql(t, { branch: B, sql: "select password from admin_users where email='admin@preview.invalid'" }), "releitura")
  say(`seed: lojas=${must(psql(t, { branch: B, sql: "select count(*) from stores" }), "c")} admins=${must(psql(t, { branch: B, sql: "select count(*) from admin_users" }), "c")} bcrypt_confere=${bcrypt.compareSync(adminPw, stored)}`)
  runtimeProbe(t, B, runtimePw)

  // 5) URLs do runtime para a P3 (Vercel): só no arquivo gerado
  const pool = t.host.replace(/^(ep-[a-z0-9-]+?)(\.)/, "$1-pooler$2")
  const enc = encodeURIComponent(runtimePw)
  fs.appendFileSync(genFile, `PREVIEW_MAIN_RUNTIME_DATABASE_URL=postgresql://${RUNTIME}:${enc}@${LOCAL_TEST ? t.host + ":" + t.port : pool}/${DB}?sslmode=require&pgbouncer=true&connect_timeout=15\n`
    + `PREVIEW_MAIN_RUNTIME_DIRECT_URL=postgresql://${RUNTIME}:${enc}@${t.host}${LOCAL_TEST ? ":" + t.port : ""}/${DB}?sslmode=require\n`)
  say(`main: OK · senhas e URLs do runtime gravadas só em P2_GENERATED_FILE`)
} else if (phase === "kg") {
  const t = parseTarget(S.PREVIEW_KG_OWNER_URL, "PREVIEW_KG_OWNER_URL")
  const B = S.PREVIEW_KG_BRANCH_ID || die("PREVIEW_KG_BRANCH_ID ausente")
  if (!/^br-[a-z0-9-]+$/.test(B) || B === MAIN_BRANCH) die("PREVIEW_KG_BRANCH_ID inválido ou igual ao main")
  if (!G.PREVIEW_RUNTIME_PASSWORD) die("rode a fase main antes")
  const main = S.PREVIEW_MAIN_OWNER_URL ? parseTarget(S.PREVIEW_MAIN_OWNER_URL, "PREVIEW_MAIN_OWNER_URL") : null
  if (main && main.ep === t.ep) die("endpoint do branch filho igual ao do main")
  const schema = path.join(PR_WORKTREE, "prisma", "schema.prisma")
  const head = git(["-C", PR_WORKTREE, "rev-parse", "--short", "HEAD"]).stdout.trim()
  say(`branch=${B} endpoint=${t.ep} prisma da PR @ ${head}`)
  // 0) identidade no servidor ANTES de qualquer chamada do Prisma (o Prisma não passa pela trava do psql)
  say(must(psql(t, { branch: B, readOnly: true, sql:
    "select 'servidor: project='||current_setting('neon.project_id')||' branch='||current_setting('neon.branch_id')||' endpoint='||current_setting('neon.endpoint_id')||' db='||current_database()||' user='||current_user" }), "identidade"))
  // 1) checksum do arquivo da PR = o revisado (runbook)
  const migFile = path.join(PR_WORKTREE, "prisma", "migrations", KG_MIGRATION, "migration.sql")
  const sha = crypto.createHash("sha256").update(fs.readFileSync(migFile)).digest("hex")
  say(`checksum arquivo=${sha.slice(0, 8)}…${sha.slice(-7)} esperado=${KG_SHA.slice(0, 8)}…${KG_SHA.slice(-7)}`)
  if (sha !== KG_SHA) die("checksum da migration KG diverge do revisado")
  const histSql = `select 'historico total='||count(*)||' finalizadas='||count(*) filter (where finished_at is not null and rolled_back_at is null)
    ||' kg='||count(*) filter (where migration_name='${KG_MIGRATION}')||' kg_checksum='||coalesce(max(checksum) filter (where migration_name='${KG_MIGRATION}'),'-') from _prisma_migrations`
  const hist0 = must(psql(t, { branch: B, readOnly: true, sql: histSql }), "histórico antes"); say("antes: " + hist0)
  // 2) integridade dos saldos: contagem + md5 do texto das 5 colunas por linha (float8::text = int::text no PG ≥ 12)
  const saldoSql = `select 'saldos produtos='||(select count(*) from estoque_produtos)||' depositos='||(select count(*) from produto_depositos)
    ||' movs='||(select count(*) from movimentacoes_estoque)||' md5='||md5(
      coalesce((select string_agg(id||':'||stock::text, ',' order by id) from estoque_produtos),'')||'|'||
      coalesce((select string_agg(id||':'||quantidade::text, ',' order by id) from produto_depositos),'')||'|'||
      coalesce((select string_agg(id||':'||quantidade::text||':'||coalesce("estoqueAntes"::text,'-')||':'||coalesce("estoqueDepois"::text,'-'), ',' order by id) from movimentacoes_estoque),''))`
  const saldo0 = must(psql(t, { branch: B, readOnly: true, sql: saldoSql }), "saldos antes"); say("antes: " + saldo0)
  const pend = prisma(t, schema, ["migrate", "status"]).out
  const pending = [...pend.matchAll(/^(\d{14}_\w+)$/gm)].map((x) => x[1])
  say("pendentes: " + (pending.join(",") || "-"))
  if (pending.length !== 1 || pending[0] !== KG_MIGRATION) die("esperado só a migration KG pendente")
  const dep = prisma(t, schema, ["migrate", "deploy"]); if (dep.status !== 0) die("migrate deploy: " + dep.out)
  say("deploy: " + (dep.out.match(/All migrations have been successfully applied\.|No pending migrations to apply\./) || ["?"])[0])
  const st = prisma(t, schema, ["migrate", "status"]); say("status: " + (st.out.match(/Database schema is up to date!|not yet been applied[^\n]*|failed[^\n]*/) || ["?"])[0])
  const dr = prisma(t, schema, ["migrate", "diff", "--from-schema-datasource", schema, "--to-schema-datamodel", schema, "--exit-code"]); say(`drift kg (0=vazio): ${dr.status}`)
  if (dr.status !== 0) die("drift ≠ 0 depois da migration: " + dr.out.slice(-1500))
  const hist1 = must(psql(t, { branch: B, readOnly: true, sql: histSql }), "histórico depois"); say("depois: " + hist1)
  if (!hist1.includes(`kg=1 kg_checksum=${KG_SHA}`)) die("histórico do Prisma sem a KG com o checksum revisado")
  const saldo1 = must(psql(t, { branch: B, readOnly: true, sql: saldoSql }), "saldos depois"); say("depois: " + saldo1)
  if (saldo1 !== saldo0) die("saldos mudaram com a migration")
  say("colunas KG (esperado double precision): " + must(psql(t, { branch: B, sql: colsSql }), "colunas"))
  say(must(psql(t, { branch: B, sql: privSql }), "privilégios"))
  runtimeProbe(t, B, G.PREVIEW_RUNTIME_PASSWORD)
  // 3) prova KG com o boundary real da PR, como runtime, em transação desfeita
  const rtUrl = `postgresql://${RUNTIME}:${encodeURIComponent(G.PREVIEW_RUNTIME_PASSWORD)}@${t.host}${LOCAL_TEST ? ":" + t.port : ""}/${DB}?sslmode=${LOCAL_TEST ? "disable" : "require"}`
  SECRETS.push(rtUrl)
  const tsx = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(__dirname, "p2-kg-prova.ts")], {
    cwd: PR_WORKTREE, encoding: "utf8", timeout: 180000,
    env: { ...process.env, P2_KG_RUNTIME_URL: rtUrl, DATABASE_URL: rtUrl, DIRECT_URL: rtUrl, STOCK_WRITES_FROZEN: "" } })
  if (tsx.status !== 0) die("prova KG: " + (tsx.stderr || tsx.stdout))
  say("prova KG (rollback): " + red(tsx.stdout.trim()))
  if (main) {
    say("main segue integer: " + must(psql(main, { branch: MAIN_BRANCH, readOnly: true, sql: colsSql }), "colunas main"))
    say("main " + must(psql(main, { branch: MAIN_BRANCH, readOnly: true, sql: histSql }), "histórico main"))
  }
  const pool = t.host.replace(/^(ep-[a-z0-9-]+?)(\.)/, "$1-pooler$2")
  const enc = encodeURIComponent(G.PREVIEW_RUNTIME_PASSWORD)
  fs.appendFileSync(genFile, `PREVIEW_KG_RUNTIME_DATABASE_URL=postgresql://${RUNTIME}:${enc}@${LOCAL_TEST ? t.host + ":" + t.port : pool}/${DB}?sslmode=require&pgbouncer=true&connect_timeout=15\n`
    + `PREVIEW_KG_RUNTIME_DIRECT_URL=postgresql://${RUNTIME}:${enc}@${t.host}${LOCAL_TEST ? ":" + t.port : ""}/${DB}?sslmode=require\n`)
  say("kg: OK")
} else die("fase: url | check | main | kg")
