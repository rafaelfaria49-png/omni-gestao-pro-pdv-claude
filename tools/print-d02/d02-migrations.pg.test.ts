/**
 * OMNI-PRINT D02-A — migrations recortadas + ferramenta do operador, em PostgreSQL 17 DESCARTÁVEL.
 *
 * Cada teste parte de um clone (CREATE DATABASE … TEMPLATE) de um banco que espelha a produção: o schema da main
 * (baseline) com TODAS as migrations da main registradas em _prisma_migrations, como o banco real. Nada aqui toca outro
 * banco: os URLs passam por assertDisposable (127.0.0.1 + print_lab_*).
 *
 * Run: PRINT_LAB_LAYOUT=baseline node tools/print-004c-e2e/run-pg.mjs print_lab_d02m tools/print-d02/d02-migrations.pg.test.ts
 */
import { spawn, spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as direct from "@/lib/printing/direct/http"
import { isPrintForeignKeyViolation, storeHasPrintRecords } from "@/lib/printing/direct/store-print-links"
import { assertDisposable, browserRequest, confirmedSale, depsFor, IDS, labPrisma, labRuntime, prismaDatabase, seed, sessionOf } from "../print-004c-e2e/lab-env"

const URL_ = process.env.PRINT_PG_URL
const BIN = process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin"
const PSQL = path.join(BIN, process.platform === "win32" ? "psql.exe" : "psql")
const ROOT = path.resolve(__dirname, "../..")
const D02 = path.join(ROOT, "tools/print-d02/d02.mjs")
const PRISMA = path.join(ROOT, "node_modules/prisma/build/index.js")
const STAGED = path.join(ROOT, "tools/print-d02/migrations")
const ROLLBACK = path.join(ROOT, "tools/print-004c-e2e/d02/rollback_print_candidate.sql")
const N = {
  idxVendas: "20261105120000_omni_print_d02_idx_vendas",
  idxTerminais: "20261105120100_omni_print_d02_idx_terminais",
  core: "20261105120200_omni_print_d02_core",
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const small = (u: string) => { const x = new URL(u); x.searchParams.set("connection_limit", "2"); return x.toString() }

type Run = { code: number | null; out: string; ms: number }
const collect = (exe: string, argv: string[], env: NodeJS.ProcessEnv): Promise<Run> => {
  const started = Date.now()
  return new Promise(resolve => {
    const p = spawn(exe, argv, { cwd: ROOT, env, windowsHide: true })
    let out = ""
    p.stdout.on("data", d => { out += d })
    p.stderr.on("data", d => { out += d })
    p.on("close", code => resolve({ code, out, ms: Date.now() - started }))
  })
}

describe.skipIf(!URL_)("D02-A — migrations seguras do Omni Print (PostgreSQL descartável)", { timeout: 240_000 }, () => {
  // Computed lazily: the describe body runs at collection even when skipped (no PRINT_PG_URL in a plain `npm test`).
  const template = URL_ ? new URL(assertDisposable(URL_)).pathname.slice(1) : ""
  const port = new URL(URL_ ?? "postgresql://x@127.0.0.1:1/x").port
  const urlOf = (db: string) => assertDisposable(`postgresql://omni_print_lab_owner:lab@127.0.0.1:${port}/${db}`)
  let tmp = ""
  let schema = ""
  const open: Array<{ $disconnect(): Promise<void> }> = []
  const client = (db: string) => { const c = labPrisma(small(urlOf(db))); open.push(c); return c }

  const admin = (sql: string) => {
    const r = spawnSync(PSQL, ["-h", "127.0.0.1", "-p", port, "-U", "pgadmin", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", windowsHide: true })
    if (r.status !== 0) throw new Error(r.stderr)
  }
  let cloneSeq = 0
  /** Fresh copy of the production mirror. */
  const clone = () => {
    const db = `print_lab_d02_c${++cloneSeq}`
    admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`)
    admin(`CREATE DATABASE ${db} TEMPLATE ${template} OWNER omni_print_lab_owner`)
    return db
  }
  const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PG_BIN: BIN, ...extra }) as unknown as NodeJS.ProcessEnv
  /** The operator tool, exactly as the runbook calls it. */
  const d02 = (db: string, ...argv: string[]) => collect(process.execPath, [D02, ...argv, "--url", urlOf(db), "--expect-db", db, "--expect-host", "127.0.0.1"], env())
  const prismaCli = (db: string, schemaFile: string, ...argv: string[]) =>
    collect(process.execPath, [PRISMA, ...argv, "--schema", schemaFile], env({ DATABASE_URL: urlOf(db), DIRECT_URL: urlOf(db) }))
  const psqlRaw = (db: string, file: string, lockTimeout?: string) => collect(PSQL, ["-h", "127.0.0.1", "-p", port, "-U", "omni_print_lab_owner", "-d", db,
    "-v", "ON_ERROR_STOP=1", "-X", "-q", ...(lockTimeout ? ["-c", `SET lock_timeout = '${lockTimeout}'`] : []), "-f", file], env({ PGPASSWORD: "lab", PGAPPNAME: "omni-print-d02" }))
  const status = async (db: string) => {
    const r = await d02(db, "status")
    expect(r.code, r.out).toBe(0)
    return JSON.parse(r.out.trim().split(/\r?\n/).pop()!) as { state: string; indexes: Record<string, string>; objects: { tables: number; functions: number }; prisma: Record<string, unknown> }
  }
  /** A temporary prisma/ folder: the branch schema + the main migrations (+ promoted D02 folders when asked). */
  const prismaDir = (name: string) => {
    const dir = path.join(tmp, name)
    cpSync(path.join(ROOT, "prisma/migrations"), path.join(dir, "migrations"), { recursive: true })
    cpSync(path.join(ROOT, "prisma/schema.prisma"), path.join(dir, "schema.prisma"))
    return path.join(dir, "schema.prisma")
  }
  const promoteInto = (schemaFile: string, names = Object.values(N)) => {
    for (const n of names) cpSync(path.join(STAGED, n), path.join(path.dirname(schemaFile), "migrations", n), { recursive: true })
  }

  /** Sales/heartbeat probes on one clone (same shape as the D02 rehearsal). */
  const probes = (db: string) => {
    const holder = client(db), writer = client(db), reader = client(db)
    let n = 0
    const insertSale = (lockTimeout = "8s") => {
      const started = Date.now()
      return writer.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${lockTimeout}'`)
        await tx.$executeRawUnsafe(`INSERT INTO public.vendas(id,"storeId","pedidoId",total) VALUES ($1,'d02-lab',$2,1)`, `d02m-v-${db}-${++n}`, `D02M-${n}`)
      }).then(() => Date.now() - started)
    }
    const heartbeat = () => {
      const started = Date.now()
      return reader.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '1500ms'`)
        await tx.$executeRawUnsafe(`UPDATE public.pdv_terminais SET "heartbeatAt"=now() WHERE id='d02-term'`)
      }).then(() => Date.now() - started)
    }
    const openSale = () => {
      let release!: () => void
      const gate = new Promise<void>(r => { release = r })
      const done = holder.$transaction(async tx => {
        await tx.$executeRawUnsafe(`INSERT INTO public.vendas(id,"storeId","pedidoId",total) VALUES ($1,'d02-lab',$2,1)`, `d02m-h-${db}-${++n}`, `D02M-H-${n}`)
        await gate
      }, { maxWait: 5000, timeout: 90_000 })
      return { release, done }
    }
    const waitBlocked = async (app = "omni-print-d02") => {
      for (let i = 0; i < 200; i++) {
        const [r] = await reader.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'`, app)
        if (r.n > 0) return
        await sleep(100)
      }
      throw new Error("migration never blocked on a lock")
    }
    const sales = async () => (await reader.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int n FROM public.vendas WHERE "storeId"='d02-lab'`))[0].n
    return { insertSale, heartbeat, openSale, waitBlocked, sales, reader, writer }
  }
  const labStore = async (db: string) => {
    const c = client(db)
    await c.$executeRawUnsafe(`INSERT INTO public.stores(id,name,"updatedAt") VALUES ('d02-lab','Lab D02',now())`)
    await c.$executeRawUnsafe(`INSERT INTO public.pdv_terminais(id,"storeId",code,name,"updatedAt") VALUES ('d02-term','d02-lab','PDV1','PDV 1',now())`)
  }
  /** Digest of every table except print_* and the Prisma registry: proves the migration never rewrites business data. */
  const dataDigest = async (c: ReturnType<typeof client>) => {
    const tables = await c.$queryRawUnsafe<Array<{ t: string }>>(`SELECT tablename t FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'print\\_%' AND tablename <> '_prisma_migrations' ORDER BY 1`)
    const parts: string[] = []
    for (const { t } of tables) {
      const [r] = await c.$queryRawUnsafe<Array<{ h: string; n: bigint }>>(`SELECT md5(COALESCE(string_agg(md5(x::text),'' ORDER BY md5(x::text)),'')) h, count(*) n FROM public."${t}" x`)
      parts.push(`${t}:${r.n}:${r.h}`)
    }
    return parts.join("|")
  }
  const fullApply = async (db: string, schemaFile?: string) => {
    for (const cmd of ["apply-indexes", "apply-core", "verify"]) { const r = await d02(db, cmd); expect(r.code, r.out).toBe(0) }
    if (schemaFile) {
      expect((await d02(db, "promote", "--migrations-dir", path.join(path.dirname(schemaFile), "migrations"))).code).toBe(0)
      const r = await d02(db, "resolve", "--schema", schemaFile)
      expect(r.code, r.out).toBe(0)
      expect(r.out).toContain("VERIFY PASS")
    }
  }

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "p004-d02m-"))
    schema = prismaDir("mirror")
    // Production mirror: every main migration recorded as applied, as in the real database.
    const names = spawnSync("git", ["ls-tree", "--name-only", "HEAD", "prisma/migrations/"], { cwd: ROOT, encoding: "utf8" })
      .stdout.split("\n").map(s => s.trim().replace("prisma/migrations/", "")).filter(s => s && !s.endsWith(".toml"))
    expect(names.length).toBeGreaterThan(20)
    for (const n of names) {
      const r = await prismaCli(template, schema, "migrate", "resolve", "--applied", n)
      expect(r.code, r.out).toBe(0)
    }
  }, 300_000)
  afterAll(async () => {
    await Promise.all(open.map(c => c.$disconnect().catch(() => undefined)))
    for (let i = 1; i <= cloneSeq; i++) { try { admin(`DROP DATABASE IF EXISTS print_lab_d02_c${i} WITH (FORCE)`) } catch { /* best effort */ } }
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  }, 120_000)

  it("1 banco vazio: índices → núcleo → verify → promote → resolve; migrate deploy sem pendências e schema idêntico ao prisma/schema.prisma", async () => {
    const db = clone()
    expect((await status(db)).state).toBe("BASELINE")
    expect(await storeHasPrintRecords(client(db), "qualquer-loja")).toBe(false) // without the tables: no error, no block
    const s = prismaDir("c1")
    const before = await prismaCli(db, s, "migrate", "status")
    expect(before.out).toMatch(/Database schema is up to date/) // D02 folders still staged: nothing pending for the build
    await fullApply(db, s)
    const st = await status(db)
    expect(st.state).toBe("CORE_APPLIED")
    expect(st.objects).toEqual({ tables: 11, functions: 7 })
    // Window between resolve and merge: main (no D02 folders) deploys against a database that already has the 3 rows.
    const mainOnly = await prismaCli(db, schema, "migrate", "deploy")
    expect(mainOnly.code, mainOnly.out).toBe(0)
    expect(mainOnly.out).toMatch(/No pending migrations to apply/)
    const after = await prismaCli(db, s, "migrate", "status")
    expect(after.out, after.out).toMatch(/Database schema is up to date/)
    const deploy = await prismaCli(db, s, "migrate", "deploy")
    expect(deploy.code, deploy.out).toBe(0)
    expect(deploy.out).toMatch(/No pending migrations to apply/)
    const diff = await collect(process.execPath, [PRISMA, "migrate", "diff", "--from-url", urlOf(db), "--to-schema-datamodel", s, "--exit-code"], env())
    expect(diff.code, diff.out).toBe(0) // Prisma parity: database == prisma/schema.prisma
  })

  it("2 banco com dados (vendas, estoque, caixa, autenticação, cadastros): nada muda fora de print_*; PDV segue gravando; loja com registro de impressão não é excluída", async () => {
    const db = clone()
    const c = client(db)
    await seed(c as never)
    for (let i = 0; i < 5; i++) await confirmedSale(c as never, IDS.storeA, { terminalId: IDS.t1A })
    const x = (q: string, ...v: unknown[]) => c.$executeRawUnsafe(q, ...v)
    await x(`INSERT INTO public.estoque_produtos(id,name,"storeId","updatedAt") VALUES ('d02-prod-1','Pão de queijo',$1,now())`, IDS.storeA)
    await x(`INSERT INTO public.movimentacoes_estoque(id,"storeId","produtoNome",tipo,quantidade,"estoqueAntes","estoqueDepois") VALUES ('d02-mov-1',$1,'Pão de queijo','saida',2,10,8)`, IDS.storeA)
    await x(`INSERT INTO public.sessoes_caixa(id,"storeId") VALUES ('d02-caixa-1',$1)`, IDS.storeA)
    await x(`INSERT INTO public.caixa_operacoes(id,"sessaoId","storeId",tipo) VALUES ('d02-op-1','d02-caixa-1',$1,'suprimento')`, IDS.storeA)
    await x(`INSERT INTO public.clientes_importados(id,name,"storeId","updatedAt") VALUES ('d02-cli-1','Cliente Sintético',$1,now())`, IDS.storeA)
    const digest = await dataDigest(c)
    await fullApply(db, prismaDir("c2"))
    expect(await dataDigest(c)).toBe(digest)
    // The PDV keeps writing after the migration, and the print flow works on top of the existing sales.
    const sale = await confirmedSale(c as never, IDS.storeA, { terminalId: IDS.t1A })
    const deps = depsFor(prismaDatabase(c as never), labRuntime(), sessionOf(IDS.caixaA))
    const fb = await direct.browserFallback(browserRequest("/api/print/direct/browser-fallback", IDS.storeA, { saleId: sale.id, origin: "PDV" }), deps)
    expect(fb.status).toBe(200)
    // Store deletion (finding 7): store B only has an agent pairing — no sales — so the print FK is what blocks it.
    expect(await storeHasPrintRecords(c, IDS.storeB)).toBe(false)
    const created = await direct.adminAction(browserRequest("/api/print/direct/admin", IDS.storeB, { action: "createInstallation", label: "Caixa B" }),
      depsFor(prismaDatabase(c as never), labRuntime(), sessionOf(IDS.platform)))
    expect(created.status).toBe(200)
    expect(await storeHasPrintRecords(c, IDS.storeB)).toBe(true)
    expect(await storeHasPrintRecords(c, IDS.storeA)).toBe(true)
    const err = await c.store.delete({ where: { id: IDS.storeB } }).then(() => null, (e: unknown) => e)
    expect(isPrintForeignKeyViolation(err)).toBe(true) // the real Prisma error carries the p004 constraint name
    expect(await c.store.count({ where: { id: IDS.storeB } })).toBe(1)
  })

  it("3 venda simultânea: índices CONCURRENTLY não travam vendas; núcleo desiste inteiro em ~2 s sem travar heartbeat; tentativas espaçadas aplicam", async () => {
    const db = clone()
    await labStore(db)
    const p = probes(db)
    let sale = p.openSale()
    await sleep(300)
    const idx = d02(db, "apply-indexes")
    await p.waitBlocked()
    expect(await p.insertSale("1500ms")).toBeLessThan(1500) // sales never wait for the concurrent build
    await sleep(500)
    sale.release(); await sale.done
    const ri = await idx
    expect(ri.code, ri.out).toBe(0)
    expect((await status(db)).state).toBe("INDEXES_READY")

    sale = p.openSale()
    await sleep(300)
    const core = d02(db, "apply-core")
    await p.waitBlocked()
    expect(await p.heartbeat()).toBeLessThan(500) // while it waits on vendas it holds nothing else
    const queued = await p.insertSale("8s")
    const rc = await core
    expect(rc.code, rc.out).toBe(4)
    expect(rc.out).toMatch(/desistiu em \d+ ms por lock_timeout.*nada ficou aplicado/)
    expect(queued).toBeGreaterThanOrEqual(300)
    expect(queued).toBeLessThan(4000)
    expect((await status(db)).state).toBe("INDEXES_READY") // atomic: nothing from (ii)

    // Spaced attempts: the sale closes between attempt 1 and 2 → attempt 2 applies.
    const retry = d02(db, "apply-core", "--attempts", "2", "--spacing-s", "3")
    await p.waitBlocked()
    await sleep(3000)
    sale.release(); await sale.done
    const rr = await retry
    expect(rr.code, rr.out).toBe(0)
    expect(rr.out).toMatch(/tentativa 1: desistiu/)
    expect(rr.out).toMatch(/aplicado em \d+ ms \(tentativa 2\)/)
    expect((await d02(db, "verify")).code).toBe(0)
    expect(await p.insertSale()).toBeLessThan(1000)
  })

  it("4 índice inválido: venda aberta além de 5 s deixa o índice INVÁLIDO; sem --repair-invalid para e pede decisão; núcleo recusa; reparo recria VÁLIDO", async () => {
    const db = clone()
    await labStore(db)
    const p = probes(db)
    const salesBefore = await p.sales()
    const sale = p.openSale()
    await sleep(300)
    const idx = d02(db, "apply-indexes")
    await p.waitBlocked()
    expect(await p.insertSale("1500ms")).toBeLessThan(1500)
    const r = await idx // gives up after lock_timeout 5s while the sale is still open
    sale.release(); await sale.done
    expect(r.code, r.out).toBe(4)
    expect(r.out).toMatch(/Ficou: invalid\. Vendas não foram afetadas/)
    expect((await status(db)).indexes).toEqual({ p004_vendas_id_store_uq: "invalid", p004_term_id_store_uq: "absent" })
    const again = await d02(db, "apply-indexes")
    expect(again.code).toBe(3)
    expect(again.out).toMatch(/--repair-invalid/)
    expect((await d02(db, "apply-core")).code).toBe(2)
    const naive = await psqlRaw(db, path.join(STAGED, N.idxVendas, "migration.sql"), "5s") // as a hand re-run would do
    expect(naive.code).not.toBe(0)
    expect(naive.out).toMatch(/already exists/)
    const repaired = await d02(db, "apply-indexes", "--repair-invalid")
    expect(repaired.code, repaired.out).toBe(0)
    expect(repaired.out).toMatch(/índice inválido removido/)
    expect((await status(db)).state).toBe("INDEXES_READY")
    expect(await p.sales()).toBe(salesBefore + 2) // both sales committed
  })

  it("5 reexecução e idempotência: a ferramenta reconhece o já aplicado; reexecução crua dos arquivos falha sem alterar nada; resolve não duplica", async () => {
    const db = clone()
    const s = prismaDir("c5")
    await fullApply(db, s)
    const c = client(db)
    const snapshot = () => c.$queryRawUnsafe<Array<{ n: number }>>(`SELECT (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)::int
      + (SELECT count(*) FROM pg_constraint)::int + (SELECT count(*) FROM pg_class)::int AS n`)
    const before = await snapshot()
    expect((await d02(db, "apply-indexes")).out).toMatch(/passo \(ii\) já aplicado/)
    expect((await d02(db, "apply-core")).out).toMatch(/passo \(ii\) já aplicado; nada a fazer/)
    const core = await psqlRaw(db, path.join(STAGED, N.core, "migration.sql"))
    expect(core.code).not.toBe(0)
    expect(core.out).toMatch(/already exists/)
    const idx = await psqlRaw(db, path.join(STAGED, N.idxTerminais, "migration.sql"))
    expect(idx.code).not.toBe(0)
    expect(await snapshot()).toEqual(before)
    const r = await d02(db, "resolve", "--schema", s)
    expect(r.code, r.out).toBe(0)
    expect(r.out.match(/já registrada/g)).toHaveLength(3)
    const [rows] = await c.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int n FROM public._prisma_migrations WHERE migration_name LIKE '%omni_print_d02%'`)
    expect(rows.n).toBe(3)
  })

  it("6 falhas entre etapas: parada após um índice, núcleo fora de ordem, registro Prisma ausente, promoção com CRLF e alvo errado", async () => {
    const db = clone()
    // (a) the operator stopped after the first index.
    expect((await psqlRaw(db, path.join(STAGED, N.idxVendas, "migration.sql"), "5s")).code).toBe(0)
    expect((await status(db)).state).toBe("INDEXES_PARTIAL")
    expect((await d02(db, "apply-core")).code).toBe(2)
    // (b) the core file run by hand before the indexes: its own check aborts and nothing is created.
    const early = await psqlRaw(db, path.join(STAGED, N.core, "migration.sql"))
    expect(early.code).not.toBe(0)
    expect(early.out).toMatch(/p004 parent indexes must exist and be VALID/)
    expect((await status(db)).objects).toEqual({ tables: 0, functions: 0 })
    const resume = await d02(db, "apply-indexes")
    expect(resume.out).toMatch(/p004_vendas_id_store_uq: já existe VÁLIDO, mantido/)
    expect(resume.out).toMatch(/p004_term_id_store_uq: criado VÁLIDO/)
    expect((await d02(db, "apply-core")).code).toBe(0)
    // (c) applied but not registered: verify --prisma fails; resolve needs the promoted folders first.
    const v = await d02(db, "verify", "--prisma")
    expect(v.code).toBe(5)
    expect(v.out).toMatch(/ausente em _prisma_migrations/)
    const s = prismaDir("c6")
    expect((await d02(db, "resolve", "--schema", s)).code).toBe(2)
    // (d) a CRLF copy (Windows checkout without .gitattributes) would register another checksum: promote refuses it.
    const crlf = path.join(path.dirname(s), "migrations", N.core)
    cpSync(path.join(STAGED, N.core), crlf, { recursive: true })
    writeFileSync(path.join(crlf, "migration.sql"), readFileSync(path.join(STAGED, N.core, "migration.sql"), "utf8").replace(/\n/g, "\r\n"))
    expect((await d02(db, "promote", "--migrations-dir", path.join(path.dirname(s), "migrations"))).code).toBe(3)
    expect((await d02(db, "resolve", "--schema", s)).code).toBe(2)
    rmSync(crlf, { recursive: true, force: true })
    expect((await d02(db, "promote", "--migrations-dir", path.join(path.dirname(s), "migrations"))).code).toBe(0)
    expect((await d02(db, "resolve", "--schema", s)).code).toBe(0)
    expect((await d02(db, "verify", "--prisma")).code).toBe(0)
    // (e) wrong target: refused before any statement.
    const refuse = (...argv: string[]) => collect(process.execPath, [D02, "status", ...argv], env())
    const u = urlOf(db)
    expect((await refuse("--url", u, "--expect-db", "outro", "--expect-host", "127.0.0.1")).code).toBe(2)
    expect((await refuse("--url", u, "--expect-db", db, "--expect-host", "10.0.0.1")).code).toBe(2)
    expect((await refuse("--url", u.replace("127.0.0.1", "ep-x-pooler.sa-east-1.aws.neon.tech"), "--expect-db", db, "--expect-host", "ep-x-pooler.sa-east-1.aws.neon.tech")).out).toMatch(/pooler recusado/)
    expect((await refuse("--url", u.replace(`:${port}/`, ":6543/"), "--expect-db", db, "--expect-host", "127.0.0.1")).out).toMatch(/pooler recusado/)
    const notOwner = await refuse("--url", `postgresql://pgadmin@127.0.0.1:${port}/${db}`, "--expect-db", db, "--expect-host", "127.0.0.1")
    expect(notOwner.code).toBe(2)
    expect(notOwner.out).toMatch(/não é o dono de public\.vendas/)
  })

  it("7 prisma migrate deploy: aplica as três pastas; falha por lock no núcleo vira falha sem nada parcial; P3009 até resolve --rolled-back; depois aplica", async () => {
    const db = clone()
    await labStore(db)
    const s = prismaDir("c7")
    promoteInto(s, [N.idxVendas, N.idxTerminais])
    const first = await prismaCli(db, s, "migrate", "deploy")
    expect(first.code, first.out).toBe(0)
    expect((await status(db)).state).toBe("INDEXES_READY")
    promoteInto(s, [N.core])
    const p = probes(db)
    const sale = p.openSale()
    await sleep(300)
    const failing = await prismaCli(db, s, "migrate", "deploy")
    expect(failing.code).not.toBe(0)
    // Measured (Prisma 6.19.3): the lock timeout aborts the explicit transaction and Prisma then fails to write its own
    // log in that aborted session, so the message is "current transaction is aborted" and the row stays unfinished.
    expect(failing.out).toMatch(/current transaction is aborted|lock timeout/i)
    const st = await status(db)
    expect(st.state).toBe("INDEXES_READY") // the transaction left nothing behind
    expect(st.prisma[N.core]).toEqual({ checksum: expect.any(String), finished: false, rolledBack: false })
    sale.release(); await sale.done
    const blocked = await prismaCli(db, s, "migrate", "deploy")
    expect(blocked.code).not.toBe(0)
    expect(blocked.out).toMatch(/P3009/) // a failed migration blocks every later deploy until resolved
    expect((await prismaCli(db, s, "migrate", "resolve", "--rolled-back", N.core)).code).toBe(0)
    const ok = await prismaCli(db, s, "migrate", "deploy")
    expect(ok.code, ok.out).toBe(0)
    const v = await d02(db, "verify", "--prisma")
    expect(v.code, v.out).toBe(0) // checksums equal the LF files; the core now has a rolled-back row AND an applied row
    const again = await d02(db, "resolve", "--schema", s)
    expect(again.code, again.out).toBe(0)
    expect(again.out.match(/já registrada/g)).toHaveLength(3) // the applied row wins over the rolled-back one
  })

  it("8 rollback por remoção: dados intactos; registro Prisma precisa ser apagado à mão; com as pastas na main, o próximo deploy reaplicaria", async () => {
    const db = clone()
    const c = client(db)
    await seed(c as never)
    await confirmedSale(c as never, IDS.storeA)
    const digest = await dataDigest(c)
    const s = prismaDir("c8")
    await fullApply(db, s)
    const rb = await psqlRaw(db, ROLLBACK)
    expect(rb.code, rb.out).toBe(0)
    expect(await dataDigest(c)).toBe(digest)
    const st = await status(db)
    expect(st.state).toBe("BASELINE")
    expect(st.prisma[N.core]).toMatchObject({ finished: true }) // stale registry: Prisma still believes it is applied
    const rolled = await prismaCli(db, s, "migrate", "resolve", "--rolled-back", N.core)
    expect(rolled.code).not.toBe(0) // --rolled-back only applies to FAILED migrations
    await c.$executeRawUnsafe(`DELETE FROM public._prisma_migrations WHERE migration_name IN ($1,$2,$3)`, N.idxVendas, N.idxTerminais, N.core)
    expect(Object.values((await status(db)).prisma)).toEqual([null, null, null])
    const redeploy = await prismaCli(db, s, "migrate", "deploy") // what a production build would do if the folders are on main
    expect(redeploy.code, redeploy.out).toBe(0)
    expect(redeploy.out).toMatch(/omni_print_d02_core/)
    expect((await status(db)).state).toBe("CORE_APPLIED")
    expect(await dataDigest(c)).toBe(digest)
  })
})
