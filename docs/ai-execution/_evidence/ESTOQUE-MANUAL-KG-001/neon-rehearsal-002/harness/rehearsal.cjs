// ESTOQUE-MANUAL-KG-NEON-REAL-REHEARSAL-002 — ensaio da estratégia B no CLONE Neon (nunca produção).
// Uso: node rehearsal.cjs <fase>   fases: a (pré-janela) · b (corte) · c (pós-restart) · d (99, recorte, migration) · e (07)
// Todo psql no clone passa pela trava neon.branch_id/endpoint_id/project_id na própria conexão;
// todo cliente Prisma que deve gravar passa por guardPrisma antes.
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const n = require("./neon.cjs")

const B = JSON.parse(fs.readFileSync(path.join(__dirname, "branch.json"), "utf8"))
const T = { kind: "clone", host: B.host, branchId: B.branchId, ep: B.ep }
const TP = { kind: "clone", host: B.poolerHost, branchId: B.branchId, ep: B.ep }
const R = "C:\\Projetos\\omni-gestao\\.worktrees\\estoque-manual-kg-001\\docs\\padaria\\pesagem\\rollout"
const APPLY = "C:\\Projetos\\omni-gestao\\.worktrees\\estoque-manual-kg-001\\docs\\padaria\\pesagem\\estoque-kg-migration-apply.sql"
const KG = "C:\\Users\\rafae\\AppData\\Local\\Temp\\claude\\C--Projetos-omni-gestao\\77a8b525-5552-4070-a3e7-20b7afd69972\\scratchpad\\kgproof"
const OLD = "neondb_owner", PROD = "omnigestao_prod", ADMIN_DB = "neondb"
const V = { old_role: OLD, prod_db: PROD }
const STORE = "kg-ensaio-002-loja", P13 = "kg-ensaio-002-un13", P7 = "kg-ensaio-002-un7", PAO = "kg-ensaio-002-pao"

for (const r of ["omni_migrator", "omni_runtime_v2"]) {
  const f = path.join(__dirname, `pw-${r}.txt`)
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(18).toString("hex"))
  n.setPw(r, fs.readFileSync(f, "utf8").trim())
}
const PW = { omni_migrator: fs.readFileSync(path.join(__dirname, "pw-omni_migrator.txt"), "utf8").trim(), omni_runtime_v2: fs.readFileSync(path.join(__dirname, "pw-omni_runtime_v2.txt"), "utf8").trim() }

const phase = process.argv[2]
const log = []
const out = (s) => { const t = n.red(s); console.log(t); log.push(t) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const one = (s) => String(s || "").replace(/\s+/g, " ").trim()
const errLine = (e) => {
  const m = one(e && e.message ? e.message : e)
  const code = e && e.code ? ` [${e.code}${e.meta && e.meta.code ? " pg:" + e.meta.code : ""}]` : ""
  return n.red((m.length > 220 ? m.slice(-220) : m) + code)
}

async function step(label, role, db, file, { single = true, extraEnv = {}, pooler = false } = {}) {
  const t0 = Date.now()
  const r = await n.run(pooler ? TP : T, { role, db, file: path.isAbsolute(file) ? file : path.join(R, file), vars: V, single, extraEnv })
  const notices = (r.err.match(/(NOTICE|ERRO[R]?|WARNING|AVISO|FATAL):[^\n]*/g) || []).map((s) => s.replace(/^.*?(KG_)/, "$1")).join(" | ")
  out(`  ${path.basename(file)} [${role}@${db}${pooler ? " pooler" : ""}] ${label}: exit=${r.status} ${Date.now() - t0}ms ${one(notices).slice(0, 300)}`)
  if (r.out) out(r.out.split("\n").map((l) => "    " + l).join("\n"))
  return r
}
async function sql(label, role, db, text, { single = false, pooler = false } = {}) {
  const r = await n.run(pooler ? TP : T, { role, db, sql: text, single })
  const msgs = (r.err.match(/(NOTICE|ERRO[R]?|WARNING|AVISO|FATAL):[^\n]*/g) || []).join(" | ")
  out(`  ${label}: exit=${r.status}${r.out ? " -> " + one(r.out).slice(0, 300) : ""}${msgs ? " | " + one(msgs).slice(0, 300) : ""}`)
  return r
}
function client(kind, role, { pooler = false, app }) {
  const { PrismaClient } = require(path.join(KG, kind, "client"))
  const extra = `&connection_limit=2&connect_timeout=20&application_name=${app}${pooler ? "&pgbouncer=true" : ""}`
  return new PrismaClient({ datasources: { db: { url: n.cloneUrl(pooler ? B.poolerHost : B.host, role, PROD, extra) } } })
}
async function tryOp(label, fn) {
  const t0 = Date.now()
  try { const v = await fn(); out(`  ${label}: SUCESSO (${Date.now() - t0}ms)${v !== undefined ? " -> " + JSON.stringify(v) : ""}`); return true }
  catch (e) { out(`  ${label}: FALHOU (${Date.now() - t0}ms) -> ${errLine(e)}`); return false }
}
const synth = async () => (await n.run(T, { role: "omni_migrator", db: PROD, sql: `SELECT string_agg(id || '=' || stock::text, ' ' ORDER BY id) FROM estoque_produtos WHERE "storeId" = '${STORE}'` })).out
const synthOwner = async () => (await n.run(T, { role: OLD, db: PROD, sql: `SELECT string_agg(id || '=' || stock::text, ' ' ORDER BY id) FROM estoque_produtos WHERE "storeId" = '${STORE}'` })).out
// Prisma CLI num projeto mínimo do scratch (só schema + migrations da PR; sem .env por perto), URL só do clone por env
function prismaCli(args, label) {
  const { spawnSync } = require("node:child_process")
  const proj = path.join(__dirname, "prismaproj")
  const url = n.cloneUrl(B.host, "omni_migrator", PROD, "&connect_timeout=20")
  const bin = "C:\\Projetos\\omni-gestao\\.worktrees\\estoque-manual-kg-001\\node_modules\\prisma\\build\\index.js"
  const r = spawnSync(process.execPath, [bin, ...args], { cwd: proj, encoding: "utf8", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1", DOTENV_CONFIG_PATH: "NUL" }, timeout: 180000 })
  const txt = n.red(((r.stdout || "") + (r.stderr || "")).trim()).split(url).join("<url>")
  return `  prisma ${label}: exit=${r.status}\n` + txt.split("\n").filter((l) => l.trim()).map((l) => "    " + l).join("\n")
}

async function a() {
  out(`# fase A — pré-janela no clone ${B.branchId} (${B.ep}) — ${new Date().toISOString()}`)
  const g = await n.run(T, { db: PROD, sql: "SELECT current_setting('neon.branch_id') || ' ' || current_setting('neon.endpoint_id') || ' ' || current_setting('neon.project_id') || ' ro=' || current_setting('transaction_read_only')" })
  out(`  trava/identidade: exit=${g.status} ${g.out} ${g.err}`)
  if (g.status !== 0) throw new Error("trava do clone falhou")
  const inv = await n.run(T, { db: PROD, file: path.join(__dirname, "snapshot.sql") })
  out("## inventário do database de produção CLONADO (antes de qualquer escrita)")
  out(inv.out.split("\n").map((l) => "    " + l).join("\n")); if (inv.status) out("    ERRO " + inv.err)
  await sql("default ACLs (detalhe)", OLD, PROD, "SELECT string_agg(pg_get_userbyid(defaclrole) || ' ns=' || coalesce(defaclnamespace::regnamespace::text,'*') || ' ' || defaclobjtype::text || ' ' || defaclacl::text, ' ; ') FROM pg_default_acl")
  await sql("funções em public (nomes)", OLD, PROD, "SELECT string_agg(p.oid::regprocedure::text || ':' || pg_get_userbyid(p.proowner), ' ; ') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace")
  await sql("dono de neondb", OLD, ADMIN_DB, "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()")

  out("\n## dados sintéticos (loja e 3 produtos do ensaio, via cliente Prisma antigo)")
  const c = client("old", OLD, { app: "kg-ensaio-seed" })
  await n.guardPrisma(c, T)
  await tryOp("cria loja sintética", () => c.store.create({ data: { id: STORE, name: "KG ENSAIO 002 (sintetico)" }, select: { id: true } }))
  for (const [id, s] of [[P13, 13], [P7, 7], [PAO, 5]]) await tryOp(`cria ${id} stock=${s}`, () => c.produto.create({ data: { id, storeId: STORE, name: `sintetico ${id}`, stock: s }, select: { id: true, stock: true } }))
  await c.$disconnect()

  out("\n## 01 / 02 / 06 (pré-janela)")
  await step("sem senha no ambiente (deve recusar)", OLD, ADMIN_DB, "01-papeis.sql")
  await step("papeis", OLD, ADMIN_DB, "01-papeis.sql", { extraEnv: { KG_MIGRATOR_PASSWORD: PW.omni_migrator, KG_RUNTIME_V2_PASSWORD: PW.omni_runtime_v2 } })
  await step("grants do runtime", OLD, PROD, "02-grants-runtime.sql")
  await step("verificacao", OLD, PROD, "06-verificacao.sql", { single: false })
  const acl = await n.run(T, { db: PROD, file: path.join(__dirname, "acl-dump.sql") })
  fs.writeFileSync(path.join(__dirname, "acl-pre-cut.txt"), acl.out + "\n")
  out("  acl-dump pre-corte gravado (" + acl.out.split("\n").length + " linhas)")
  const rt = client("old", "omni_runtime_v2", { app: "kg-ensaio-runtime-int-pre" })
  await n.guardPrisma(rt, T)
  await tryOp("runtime_v2 (Int, regime integer) grava un13 -> 12", () => rt.produto.update({ where: { id: P13 }, data: { stock: 12 } , select: { stock: true } }).then((p) => p.stock))
  await rt.$disconnect()
  out(`  sintéticos: ${await synthOwner()}`)
}

async function b() {
  out(`# fase B — corte (03 -> 04 -> 05) com escritores antigos direto e pooler — ${new Date().toISOString()}`)
  const oldD = client("old", OLD, { app: "old-deploy-direct" })
  const oldP = client("old", OLD, { pooler: true, app: "old-deploy-pooler" })
  const oldIdle = client("old", OLD, { app: "old-idle" })
  const oldIdleP = client("old", OLD, { pooler: true, app: "old-idle-pooler" })
  for (const [k, c, t] of [["direct", oldD, T], ["pooler", oldP, TP], ["idle", oldIdle, T], ["idle-pooler", oldIdleP, TP]]) {
    await n.guardPrisma(c, t); await tryOp(`antigo ${k} conectado e lendo`, () => c.produto.count({ where: { storeId: STORE } }))
  }
  out("\n## 03 com transações em voo (direto e pooler)")
  const voo = (c, label) => c.$transaction(async (tx) => {
    await tx.produto.update({ where: { id: PAO }, data: { stock: 4 } }); await sleep(4000)
    await tx.produto.update({ where: { id: P7 }, data: { stock: 6 } }); return "commit"
  }, { timeout: 30000, maxWait: 10000 }).then((v) => `${label}: ${v}`, (e) => `${label}: ABORTADA ${errLine(e)}`)
  const vD = voo(oldD, "voo direto"), vP = voo(oldP, "voo pooler")
  await sleep(800)
  await step("corte 1/3 posse (espera as transações em voo)", OLD, PROD, "03-corte-posse.sql")
  out("  " + (await vD)); out("  " + (await vP))
  await tryOp("antigo direto grava após 03 (esperado: AINDA grava — pg_write_all_data)", () => oldD.produto.update({ where: { id: P7 }, data: { stock: 5 }, select: { stock: true } }).then((p) => p.stock))
  await tryOp("antigo pooler grava após 03 (esperado: AINDA grava)", () => oldP.produto.update({ where: { id: P7 }, data: { stock: 5 }, select: { stock: true } }).then((p) => p.stock))
  await step("corte 2/3 CONNECT", "omni_migrator", PROD, "04-corte-conexao.sql")
  out("\n## entre 04 e 05 (meio corte)")
  for (const [k, pooler] of [["direto", false], ["pooler", true]]) {
    const cold = client("old", OLD, { pooler, app: `old-cold-${k}` })
    await tryOp(`antigo cold start ${k} (esperado: recusado)`, () => cold.produto.count())
    await cold.$disconnect().catch(() => {})
  }
  await tryOp("antigo idle direto, sessão aberta (esperado: ainda grava — meio corte)", () => oldIdle.produto.update({ where: { id: P7 }, data: { stock: 4 }, select: { stock: true } }).then((p) => p.stock))
  await tryOp("antigo idle pooler, conexão de servidor aberta", () => oldIdleP.produto.update({ where: { id: P7 }, data: { stock: 4 }, select: { stock: true } }).then((p) => p.stock))
  await sql("sessões do papel antigo no database de produção antes do 05", "omni_migrator", PROD, `SELECT count(*) || ' ' || coalesce(string_agg(DISTINCT application_name, ','), '') FROM pg_stat_activity WHERE datname = '${PROD}' AND usename = '${OLD}'`)
  await step("corte 3/3 sessoes", OLD, ADMIN_DB, "05-encerrar-sessoes.sql", { single: false })
  out("\n## depois do 05")
  for (const [k, c] of [["direto", oldD], ["pooler", oldP], ["idle", oldIdle], ["idle-pooler", oldIdleP]])
    for (let i = 1; i <= 2; i++) await tryOp(`antigo ${k} tentativa ${i} (esperado: recusado)`, () => c.produto.update({ where: { id: P7 }, data: { stock: 3 }, select: { stock: true } }).then((p) => p.stock))
  for (const [k, pooler] of [["direto", false], ["pooler", true]]) {
    const re = client("old", OLD, { pooler, app: `old-reconnect-${k}` })
    await tryOp(`antigo reconexão nova ${k} (esperado: recusado)`, () => re.produto.count())
    await re.$disconnect().catch(() => {})
  }
  await Promise.allSettled([oldD, oldP, oldIdle, oldIdleP].map((c) => c.$disconnect()))
  await sql("sessões do papel antigo depois do 05", "omni_migrator", PROD, `SELECT count(*) FROM pg_stat_activity WHERE datname = '${PROD}' AND usename = '${OLD}'`)

  out("\n## runtime_v2 DML e migrator DDL")
  for (const [k, pooler, t] of [["direto", false, T], ["pooler", true, TP]]) {
    const rt = client("old", "omni_runtime_v2", { pooler, app: `runtime-v2-${k}` })
    await n.guardPrisma(rt, t)
    await tryOp(`runtime_v2 ${k} UPDATE un13 -> 11`, () => rt.produto.update({ where: { id: P13 }, data: { stock: 11 }, select: { stock: true } }).then((p) => p.stock))
    await tryOp(`runtime_v2 ${k} INSERT+DELETE produto sintético`, async () => { await rt.produto.create({ data: { id: `kg-ensaio-002-tmp-${k}`, storeId: STORE, name: "tmp", stock: 1 }, select: { id: true } }); await rt.produto.delete({ where: { id: `kg-ensaio-002-tmp-${k}` }, select: { id: true } }); return "ok" })
    await rt.$disconnect()
  }
  await sql("runtime_v2 tenta DDL (esperado: recusado)", "omni_runtime_v2", PROD, "CREATE TABLE public.kg_ensaio_ddl_runtime (id int)")
  await sql("runtime_v2 tenta ALTER em tabela existente (esperado: recusado)", "omni_runtime_v2", PROD, "ALTER TABLE estoque_produtos ADD COLUMN kg_ensaio int")
  await sql("migrator DDL (SET ROLE omni_owner; CREATE/ALTER/DROP em transação)", "omni_migrator", PROD,
    "SET ROLE omni_owner; CREATE TABLE public.kg_ensaio_ddl (id int); ALTER TABLE public.kg_ensaio_ddl ADD COLUMN v float8; DROP TABLE public.kg_ensaio_ddl; SELECT 'ddl_ok'", { single: true })
  await sql("migrator DDL sem SET ROLE (herança)", "omni_migrator", PROD, "ALTER TABLE estoque_produtos ALTER COLUMN name SET DEFAULT 'x'; ALTER TABLE estoque_produtos ALTER COLUMN name DROP DEFAULT; SELECT 'ddl_heranca_ok'", { single: true })

  out("\n## caminhos de reabertura pelo papel antigo (de outro database; tudo em transação desfeita)")
  await sql("GRANT CONNECT a si mesmo", OLD, ADMIN_DB, `BEGIN; GRANT CONNECT ON DATABASE ${PROD} TO ${OLD}; SELECT 'connect_depois=' || has_database_privilege('${OLD}', '${PROD}', 'CONNECT'); ROLLBACK;`)
  await sql("ALTER DATABASE OWNER de volta", OLD, ADMIN_DB, `BEGIN; ALTER DATABASE ${PROD} OWNER TO ${OLD}; ROLLBACK;`)
  await sql("GRANT omni_owner a si mesmo (ADMIN OPTION herdada do CREATE ROLE)", OLD, ADMIN_DB, `BEGIN; GRANT omni_owner TO ${OLD}; SET ROLE omni_owner; GRANT CONNECT ON DATABASE ${PROD} TO ${OLD}; RESET ROLE; SELECT 'reabriu=' || has_database_privilege('${OLD}', '${PROD}', 'CONNECT'); ROLLBACK;`)
  await sql("ALTER ROLE omni_migrator PASSWORD (CREATEROLE + ADMIN)", OLD, ADMIN_DB, `BEGIN; ALTER ROLE omni_migrator PASSWORD 'x-ensaio-rollback'; SELECT 'trocou_senha'; ROLLBACK;`)
  await sql("admin option do papel antigo sobre os papéis novos", OLD, ADMIN_DB, "SELECT string_agg(pg_get_userbyid(roleid) || ' admin=' || admin_option || ' grantor=' || pg_get_userbyid(grantor), ' ; ') FROM pg_auth_members WHERE member = 'neondb_owner'::regrole AND pg_get_userbyid(roleid) LIKE 'omni%'")
  await sql("conferência: CONNECT do papel antigo continua revogado", "omni_migrator", PROD, `SELECT has_database_privilege('${OLD}', '${PROD}', 'CONNECT')`)
  await step("verificacao pos-corte", "omni_migrator", PROD, "06-verificacao.sql", { single: false })
  const acl = await n.run(T, { role: "omni_migrator", db: PROD, file: path.join(__dirname, "acl-dump.sql") })
  fs.writeFileSync(path.join(__dirname, "acl-post-cut.txt"), acl.out + "\n")
  out("  acl-dump pós-corte gravado:"); out(acl.out.split("\n").map((l) => "    " + l).join("\n"))
  out(`  sintéticos: ${await synth()}`)
}

async function c() {
  out(`# fase C — depois de suspender/retomar o compute — ${new Date().toISOString()}`)
  const g = await n.run(T, { role: "omni_migrator", db: PROD, sql: "SELECT 'backend_start_min=' || min(backend_start) || ' postmaster_start=' || pg_postmaster_start_time() FROM pg_stat_activity" })
  out(`  compute: ${g.out} ${g.err}`)
  const acl = await n.run(T, { role: "omni_migrator", db: PROD, file: path.join(__dirname, "acl-dump.sql") })
  const before = fs.readFileSync(path.join(__dirname, "acl-post-cut.txt"), "utf8").trim()
  fs.writeFileSync(path.join(__dirname, "acl-post-restart.txt"), acl.out + "\n")
  const a1 = before.split("\n"), a2 = acl.out.split("\n")
  const diff = [...a1.filter((l) => !a2.includes(l)).map((l) => "    - " + l), ...a2.filter((l) => !a1.includes(l)).map((l) => "    + " + l)]
  out(`  acl-dump pós-corte × pós-restart: ${diff.length ? "DIFERENTE" : "IDÊNTICO"} (${a2.length} linhas)`)
  if (diff.length) out(diff.join("\n"))
  await step("verificacao pos-restart", "omni_migrator", PROD, "06-verificacao.sql", { single: false })
  for (const [k, pooler] of [["direto", false], ["pooler", true]]) {
    const re = client("old", OLD, { pooler, app: `old-after-restart-${k}` })
    await tryOp(`antigo cold start ${k} após restart (esperado: recusado)`, () => re.produto.count())
    await re.$disconnect().catch(() => {})
    const rt = client("old", "omni_runtime_v2", { pooler, app: `runtime-after-restart-${k}` })
    await n.guardPrisma(rt, pooler ? TP : T)
    await tryOp(`runtime_v2 ${k} após restart grava un13 -> 10`, () => rt.produto.update({ where: { id: P13 }, data: { stock: 10 }, select: { stock: true } }).then((p) => p.stock))
    await rt.$disconnect()
  }
}

async function d() {
  out(`# fase D — 99 antes da migration, corte refeito, migration — ${new Date().toISOString()}`)
  await step("desfazer rodado do database ERRADO (deve recusar)", "omni_migrator", ADMIN_DB, "99-desfazer-corte.sql")
  await step("desfazer corte", "omni_migrator", PROD, "99-desfazer-corte.sql")
  for (const [k, pooler, t] of [["direto", false, T], ["pooler", true, TP]]) {
    const back = client("old", OLD, { pooler, app: `old-after-undo-${k}` })
    if (await tryOp(`antigo ${k} conecta após 99`, () => n.guardPrisma(back, t).then(() => "clone")))
      await tryOp(`antigo ${k} após 99 grava un7 -> 7`, () => back.produto.update({ where: { id: P7 }, data: { stock: 7 }, select: { stock: true } }).then((p) => p.stock))
    await back.$disconnect().catch(() => {})
  }
  const keep = client("old", OLD, { app: "old-persistente-recorte" })
  await n.guardPrisma(keep, T)
  await step("corte 2/3 refeito", "omni_migrator", PROD, "04-corte-conexao.sql")
  await step("corte 3/3 refeito", OLD, ADMIN_DB, "05-encerrar-sessoes.sql", { single: false })
  await tryOp("antigo persistente depois do corte refeito (esperado: recusado)", () => keep.produto.update({ where: { id: P7 }, data: { stock: 2 }, select: { stock: true } }).then((p) => p.stock))
  await keep.$disconnect().catch(() => {})
  for (const [k, pooler] of [["direto", false], ["pooler", true]]) {
    const re = client("old", OLD, { pooler, app: `old-recut-${k}` })
    await tryOp(`antigo cold start ${k} após corte refeito (esperado: recusado)`, () => re.produto.count())
    await re.$disconnect().catch(() => {})
  }

  out("\n## migration no clone (omni_migrator, conexão direta)")
  const t0 = Date.now()
  const ap = await n.run(T, { role: "omni_migrator", db: PROD, file: APPLY, single: true, timeoutMs: 300000 })
  out(`  estoque-kg-migration-apply.sql: exit=${ap.status} ${Date.now() - t0}ms ${one((ap.err.match(/(NOTICE|ERRO[R]?):[^\n]*/g) || []).join(" | "))}`)
  await sql("_prisma_migrations antes do resolve", "omni_migrator", PROD, "SELECT count(*) || ' kg=' || count(*) FILTER (WHERE migration_name = '20261025120000_estoque_quantidade_fracionada') FROM _prisma_migrations")
  out(prismaCli(["migrate", "resolve", "--applied", "20261025120000_estoque_quantidade_fracionada"], "migrate resolve --applied"))
  await sql("_prisma_migrations depois do resolve", "omni_migrator", PROD, "SELECT migration_name || ' checksum=' || checksum || ' finished=' || (finished_at IS NOT NULL) || ' rolled_back=' || (rolled_back_at IS NOT NULL) FROM _prisma_migrations WHERE migration_name = '20261025120000_estoque_quantidade_fracionada'")
  out(prismaCli(["migrate", "status"], "migrate status"))
  out(prismaCli(["migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"], "migrate diff banco × schema da PR"))
  await step("verificacao pos-migration", "omni_migrator", PROD, "06-verificacao.sql", { single: false })
  await step("desfazer DEPOIS da migration (deve recusar)", "omni_migrator", PROD, "99-desfazer-corte.sql")
  await sql("CONNECT do papel antigo após a recusa do 99", "omni_migrator", PROD, `SELECT has_database_privilege('${OLD}', '${PROD}', 'CONNECT')`)
}

async function e() {
  out(`# fase E — cliente Float (KG) e barreira 07 — ${new Date().toISOString()}`)
  for (const [k, pooler, t] of [["direto", false, T], ["pooler", true, TP]]) {
    const f = client("new", "omni_runtime_v2", { pooler, app: `runtime-v2-float-${k}` })
    await n.guardPrisma(f, t)
    await tryOp(`runtime_v2 Float ${k} grava pão 3,96 kg`, () => f.produto.update({ where: { id: PAO }, data: { stock: 3.96 }, select: { stock: true } }).then((p) => p.stock))
    await tryOp(`runtime_v2 Float ${k} increment 0,125 kg`, () => f.produto.update({ where: { id: PAO }, data: { stock: { increment: 0.125 } }, select: { stock: true } }).then((p) => p.stock))
    await f.$disconnect()
  }
  const old = client("old", OLD, { app: "old-int-pos-migration" })
  await tryOp("cliente Int antigo (papel antigo) após migration (esperado: recusado)", () => old.produto.update({ where: { id: P7 }, data: { stock: 13 }, select: { stock: true } }).then((p) => p.stock))
  await old.$disconnect().catch(() => {})
  out("\n## risco residual SEM 07: build Int com a credencial nova (só nos sintéticos)")
  const intNova = client("old", "omni_runtime_v2", { app: "int-com-credencial-nova" })
  await n.guardPrisma(intNova, T)
  await tryOp("Int + runtime_v2 grava un13 -> 13", () => intNova.produto.update({ where: { id: P13 }, data: { stock: 13 }, select: { id: true } }))
  out(`  valor gravado (lido em texto): ${await synth()}`)
  await sql("restaura un13 = 13 (correção pelo migrator, só sintético)", "omni_migrator", PROD, `UPDATE estoque_produtos SET stock = 13 WHERE id = '${P13}' AND "storeId" = '${STORE}' RETURNING stock`)
  out("\n## 07 opcional (VALIDATE sobre a cópia dos dados reais)")
  await step("guard CHECK", "omni_migrator", PROD, "07-guard-check-opcional.sql")
  await sql("constraints criadas e validadas", "omni_migrator", PROD, "SELECT string_agg(conname || ':validated=' || convalidated, ' ') FROM pg_constraint WHERE conname LIKE '%kg_milesimos'")
  await tryOp("COM 07: Int + runtime_v2 grava un13 -> 13 (esperado: recusado 23514)", () => intNova.produto.update({ where: { id: P13 }, data: { stock: 13 }, select: { id: true } }))
  await tryOp("COM 07: Int + runtime_v2 grava -1 (NaN) (esperado: recusado)", () => intNova.produto.update({ where: { id: P13 }, data: { stock: -1 }, select: { id: true } }))
  await tryOp("COM 07: Int increment (limite conhecido: no-op silencioso)", () => intNova.produto.update({ where: { id: P13 }, data: { stock: { increment: 1 } }, select: { id: true } }))
  await intNova.$disconnect()
  const f = client("new", "omni_runtime_v2", { app: "runtime-v2-float-07" })
  await n.guardPrisma(f, T)
  await tryOp("COM 07: Float grava 3,96", () => f.produto.update({ where: { id: PAO }, data: { stock: 3.96 }, select: { stock: true } }).then((p) => p.stock))
  await tryOp("COM 07: Float grava 1,2345 (4 casas, esperado: recusado)", () => f.produto.update({ where: { id: PAO }, data: { stock: 1.2345 }, select: { stock: true } }).then((p) => p.stock))
  await tryOp("COM 07: Float grava 999999999999999 (teto UN/G)", () => f.produto.update({ where: { id: P7 }, data: { stock: 999999999999999 }, select: { stock: true } }).then((p) => p.stock))
  await tryOp("COM 07: Float grava 1e15 (acima do teto, esperado: recusado)", () => f.produto.update({ where: { id: P7 }, data: { stock: 1e15 }, select: { stock: true } }).then((p) => p.stock))
  await f.$disconnect()
  out(`  sintéticos: ${await synth()}`)
  await sql("linhas fora do contrato (todas as tabelas KG)", "omni_migrator", PROD, `SELECT 'estoque=' || (SELECT count(*) FROM estoque_produtos WHERE stock = 'NaN' OR round(stock::numeric,3) <> stock::numeric) || ' depositos=' || (SELECT count(*) FROM produto_depositos WHERE quantidade = 'NaN' OR round(quantidade::numeric,3) <> quantidade::numeric) || ' livro=' || (SELECT count(*) FROM movimentacoes_estoque WHERE quantidade = 'NaN' OR round(quantidade::numeric,3) <> quantidade::numeric)`)
  await step("verificacao final", "omni_migrator", PROD, "06-verificacao.sql", { single: false })
}

const PH = { a, b, c, d, e }
PH[phase]().then(() => fs.writeFileSync(path.join(__dirname, `fase-${phase}.txt`), log.join("\n") + "\n"))
  .catch((err) => { out("FATAL " + errLine(err)); fs.writeFileSync(path.join(__dirname, `fase-${phase}.txt`), log.join("\n") + "\n"); process.exit(1) })
