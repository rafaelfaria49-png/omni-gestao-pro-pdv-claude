import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const suffix = process.env.GASTOS_G004_MIGRATION_SUFFIX ?? ""
if (suffix && !/^_r[0-9]+$/.test(suffix)) throw new Error("Sufixo de fixture inválido")
const tables = ["gastos_revisoes", "financeiro_operacoes", "gastos", "pagamentos_financeiros", "alocacoes_pagamento", "cartoes_instrumentos", "cartoes_ciclos", "financeiro_operacao_eventos", "gastos_outbox"]
describe.each(["empty", "history"])("G004 migration no baseline %s", kind => {
  const database = `gastos_g004_migration_${kind}${suffix}`, url = `postgresql://gastos_g004@127.0.0.1:55496/${database}`
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] })
  let before: unknown, identity: unknown
  const historico = () => db.$queryRaw`SELECT t.id,t.valor,t.status,t.payload,t."localKey",c.id AS conta,c."saldoAtual",m.id AS movimento,m.valor AS valor_movimento,m."origem",m."referenciaId"
    FROM contas_pagar_titulos t JOIN carteiras_financeiras c ON c.id='g004-history-C' JOIN movimentacoes_financeiras m ON m.id='g004-history-M' WHERE t.id='g004-history-T'`
  beforeAll(async () => {
    const [actual] = await db.$queryRaw<Array<{ database: string; user: string; host: string; port: number; data: string; rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT current_database() AS database,current_user AS user,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') data,
        rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`
    expect(actual).toMatchObject({ database, user: "gastos_g004", host: "127.0.0.1", port: 55496, rolsuper: false, rolbypassrls: false })
    expect(actual.data.replaceAll("\\", "/")).toContain("G004-execution/pgdata")
    identity = actual
    expect(await db.$queryRaw`SELECT to_regclass('gastos_revisoes') IS NULL AS ausente`).toEqual([{ ausente: true }])
    before = await historico()
    const file = resolve("prisma/migrations/20261126130000_gastos_operacoes_atomicas/migration.sql")
    const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex")
    const output = execFileSync("C:/Program Files/PostgreSQL/17/bin/psql.exe", ["-X", "-w", "-h", "127.0.0.1", "-p", "55496", "-U", "gastos_g004", "-d", database, "-v", "ON_ERROR_STOP=1", "-f", file],
      { encoding: "utf8", windowsHide: true })
    expect(output.trim().endsWith("COMMIT")).toBe(true)
    console.info("G004_MIGRATION", JSON.stringify({ identity, sha256, kind, exitCode: 0 }))
    await db.$executeRawUnsafe(`GRANT SELECT ON ${tables.join(",")} TO gastos_g004_reader`)
  })
  afterAll(async () => { await db.$disconnect() })
  it("preserva IDs, valores, payload, origem, localKey e saldos históricos sintéticos", async () => {
    expect(await historico()).toEqual(before)
    expect((before as unknown[]).length).toBe(kind === "history" ? 1 : 0)
    if (kind === "history") expect(before).toEqual([expect.objectContaining({ id: "g004-history-T", valor: 365.01,
      status: "pendente", payload: { historico: [{ tipo: "pagamento", valor: 200 }], sentinela: "preservar" }, saldoAtual: 800, movimento: "g004-history-M", valor_movimento: 200 })])
  })
  it("pg_catalog confirma nove tabelas fechadas, FKs e verificação diferida no COMMIT", async () => {
    const rows = await db.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; owner: string; policies: bigint }>>`
      SELECT c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) owner,(SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) policies
      FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(${tables}) ORDER BY c.relname`
    expect(rows).toHaveLength(9)
    for (const r of rows) expect(r).toMatchObject({ relrowsecurity: true, owner: "gastos_g004", policies: BigInt(0) })
    const [fk] = await db.$queryRaw<Array<{ condeferrable: boolean; condeferred: boolean }>>`SELECT condeferrable,condeferred FROM pg_constraint WHERE conname='pagamentos_financeiros_movimentoId_perfilId_fkey'`
    expect(fk).toEqual({ condeferrable: true, condeferred: true })
    const constraints = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM pg_constraint WHERE conname LIKE 'g004_%' AND contype='c'`
    expect(Number(constraints[0].n)).toBeGreaterThanOrEqual(11)
  })
  it("papel não-owner/NOBYPASSRLS efetivo vê zero mesmo com cartão privado existente", async () => {
    const store = `g004-rls-${kind}`, user = `${store}-U`, perfilId = `${store}-P`
    await db.store.create({ data: { id: store, name: "RLS fixture" } })
    await db.adminUser.create({ data: { id: user, email: `${user}@example.invalid`, password: "synthetic", lojaId: store } })
    await db.financeiroPerfil.create({ data: { id: perfilId, tipo: "PESSOAL", ownerAdminUserId: user } })
    await db.cartaoInstrumento.create({ data: { perfilId, nome: "Cartão privado" } })
    expect(await db.cartaoInstrumento.count()).toBe(1)
    const evidence = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE gastos_g004_reader")
      const [role] = await tx.$queryRaw<Array<{ actor: string; rolsuper: boolean; rolbypassrls: boolean }>>`SELECT current_user actor,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`
      const cards = await tx.cartaoInstrumento.count()
      const counts = await Promise.all(tables.map(t => tx.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) n FROM ${t}`)))
      return { role, cards, counts: counts.map(x => Number(x[0].n)) }
    })
    expect(evidence.role).toEqual({ actor: "gastos_g004_reader", rolsuper: false, rolbypassrls: false })
    expect(evidence.cards).toBe(0)
    expect(evidence.counts).toEqual(tables.map(() => 0))
    console.info("G004_RLS_NONOWNER", JSON.stringify({ identity, ...evidence, production: false }))
  })
})
