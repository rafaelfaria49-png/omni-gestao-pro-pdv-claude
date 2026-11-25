import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PrismaClient } from "@/generated/prisma"

// Este ensaio é somente DDL: não importar a fixture de APIs/NextAuth.
const G003_URL = "postgresql://gastos_g003@127.0.0.1:55495/gastos_g003_test"
const suffix = process.env.GASTOS_G003_MIGRATION_SUFFIX ?? ""
if (!/^(?:_r[1-9][0-9]?)?$/.test(suffix)) throw new Error("Sufixo de ensaio descartável inválido")
const database = (kind: string) => `gastos_g003_migration_${kind}${suffix}`

const kinds = ["empty", "history"] as const
const clients = kinds.map(kind => new PrismaClient({ datasources: { db: {
  url: `postgresql://gastos_g003@127.0.0.1:55495/${database(kind)}`,
} }, log: [] }))
const migrationPath = resolve("prisma/migrations/20261126120000_gastos_readers_documentos/migration.sql")
const sql = readFileSync(migrationPath, "utf8")
const snapshots = new Map<string, unknown>()

async function dinheiro(db: PrismaClient) {
  return { contas: await db.carteiraFinanceira.findMany({ orderBy: { id: "asc" } }),
    pagar: await db.contaPagarTitulo.findMany({ orderBy: { id: "asc" } }),
    receber: await db.contaReceberTitulo.findMany({ orderBy: { id: "asc" } }),
    movimentos: await db.movimentacaoFinanceira.findMany({ orderBy: { id: "asc" } }) }
}

describe.skipIf(!process.env.GASTOS_G003_TEST_DATABASE_URL)("G003 migration PostgreSQL em baselines vazia/histórica", () => {
  beforeAll(async () => {
    if (process.env.GASTOS_G003_TEST_DATABASE_URL !== G003_URL) throw new Error("Migration exige opt-in G003 exato")
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|INSERT INTO|ALTER TABLE "(?!documentos_)/i)
    for (const [index, kind] of kinds.entries()) {
      const db = clients[index]
      const [identity] = await db.$queryRaw<Array<{ database: string; user: string; host: string; port: number; rolsuper: boolean; rolbypassrls: boolean }>>`
        SELECT current_database() AS database, current_user AS user, host(inet_server_addr()) AS host,
          inet_server_port() AS port, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`
      expect(identity).toMatchObject({ database: database(kind), user: "gastos_g003", host: "127.0.0.1", port: 55495, rolsuper: false, rolbypassrls: false })
      const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('documentos_gastos','documentos_vinculos')`
      if (tables.length) throw new Error("Ensaio exige baseline nova sem G003; provisionar outro descartável, sem apagar histórico para fabricar PASS")
      snapshots.set(kind, await dinheiro(db))
      const output = execFileSync("C:/Program Files/PostgreSQL/17/bin/psql.exe", ["-X", "-w", "-h", "127.0.0.1", "-p", "55495", "-U", "gastos_g003", "-d", identity.database, "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", migrationPath],
        { encoding: "utf8", windowsHide: true, env: { ...process.env, PGCLIENTENCODING: "UTF8" } })
      expect(output).toContain("CREATE TABLE")
      await db.$executeRawUnsafe("GRANT SELECT ON documentos_gastos, documentos_vinculos TO gastos_g003_reader")
      console.info("G003_MIGRATION_APPLIED", JSON.stringify({ ...identity, sha256: createHash("sha256").update(sql).digest("hex"), kind, singleTransaction: true }))
    }
  }, 60_000)
  afterAll(async () => { await Promise.all(clients.map(db => db.$disconnect())) })

  it.each(kinds)("%s: preserva todos os registros/IDs/valores e legado empresarial NULL", async kind => {
    const db = clients[kinds.indexOf(kind)]
    expect(await dinheiro(db)).toEqual(snapshots.get(kind))
    if (kind === "history") {
      expect(await db.contaPagarTitulo.findUnique({ where: { id: "g003-hist-pagar" } })).toMatchObject({ storeId: "g003-hist-loja", perfilId: null, valor: 365.01 })
      expect(await db.movimentacaoFinanceira.findUnique({ where: { id: "g003-hist-mov" } })).toMatchObject({ carteiraId: "g003-hist-conta", perfilId: null, valor: 200 })
    } else expect(await db.contaPagarTitulo.count()).toBe(0)
  })

  it.each(kinds)("%s: índices, dez FKs RESTRICT e três CHECKs novos sem recriar financeiro", async kind => {
    const db = clients[kinds.indexOf(kind)]
    const fks = await db.$queryRaw<Array<{ confdeltype: string }>>`SELECT confdeltype::text AS confdeltype FROM pg_constraint WHERE contype='f' AND conrelid IN ('documentos_gastos'::regclass,'documentos_vinculos'::regclass)`
    expect(fks).toHaveLength(10)
    expect(fks.every(row => row.confdeltype === "r")).toBe(true)
    const checks = await db.$queryRaw<Array<{ conname: string }>>`SELECT conname FROM pg_constraint WHERE contype='c' AND conrelid IN ('documentos_gastos'::regclass,'documentos_vinculos'::regclass)`
    expect(checks).toHaveLength(3)
    const indexes = await db.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE tablename='documentos_gastos'`
    expect(indexes.map(row => row.indexname)).toContain("documentos_gastos_perfilId_sha256_key")
  })

  it.each(kinds)("%s: papel efetivo não owner/NOBYPASSRLS não lê documento presente para owner", async kind => {
    const db = clients[kinds.indexOf(kind)], prefix = `g003-mig-${kind}`
    await db.store.create({ data: { id: prefix, name: "Synthetic migration" } })
    await db.adminUser.create({ data: { id: `${prefix}-user`, email: `${prefix}@example.invalid`, password: "synthetic", lojaId: prefix, role: "ADMIN" } })
    await db.financeiroPerfil.create({ data: { id: `${prefix}-perfil`, tipo: "PESSOAL", ownerAdminUserId: `${prefix}-user` } })
    await db.documentoGasto.create({ data: { id: `${prefix}-doc`, perfilId: `${prefix}-perfil`, ownerAdminUserId: `${prefix}-user`, criadoPorAdminUserId: `${prefix}-user`,
      nomeArquivo: "fixture.txt", mime: "text/plain", bytes: 9, sha256: createHash("sha256").update("synthetic").digest("hex"),
      storageRef: `gastos/v1/${prefix}-perfil/${prefix}-doc`, proveniencia: "FIXTURE", historico: [{ acao: "REGISTRADO" }] } })
    expect(await db.documentoGasto.count()).toBe(1)
    const reader = new PrismaClient({ datasources: { db: { url: `postgresql://gastos_g003_reader@127.0.0.1:55495/${database(kind)}` } }, log: [] })
    try {
      const [effective] = await reader.$queryRaw<Array<{ user: string; rolsuper: boolean; rolbypassrls: boolean; owner: string }>>`
        SELECT current_user AS user, r.rolsuper, r.rolbypassrls, t.tableowner AS owner
        FROM pg_roles r, pg_tables t WHERE r.rolname=current_user AND t.tablename='documentos_gastos' AND t.schemaname='public'`
      expect(effective).toEqual({ user: "gastos_g003_reader", rolsuper: false, rolbypassrls: false, owner: "gastos_g003" })
      expect(await reader.documentoGasto.findMany()).toEqual([])
      expect(await reader.documentoVinculo.findMany()).toEqual([])
      await expect(reader.$executeRawUnsafe("INSERT INTO documentos_vinculos(id,\"documentoId\",\"perfilId\") VALUES ('x','x','x')")).rejects.toThrow()
      console.info("G003_EFFECTIVE_NONOWNER_RLS", JSON.stringify({ ...effective, kind, zeroRows: true, certifiesProductionRls: false }))
    } finally { await reader.$disconnect() }
  })
})
