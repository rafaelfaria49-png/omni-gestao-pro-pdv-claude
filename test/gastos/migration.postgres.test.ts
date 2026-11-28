import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { readFileSync } from "node:fs"
import { dadosFinanceirosEmpresa } from "@/lib/gastos/financeiro-scope"

const raw = process.env.GASTOS_G002_HISTORY_DATABASE_URL
const url = new URL(raw ?? "postgresql://gastos_g002@127.0.0.1:55494/gastos_g002_history")
if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55494"
  || url.pathname !== "/gastos_g002_history" || url.username !== "gastos_g002" || url.search !== "") {
  throw new Error("G002 recusa histórico fora do cluster sintético explicitamente identificado.")
}
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const tables = new Set(["stores", "fornecedores", "carteiras_financeiras", "contas_pagar_titulos", "contas_receber_titulos",
  "movimentacoes_financeiras", "estoque_produtos", "vendas", "venda_itens", "ordens_servico"])

describe.skipIf(!raw)("G002 migrations sobre histórico sintético", () => {
  beforeAll(async () => {
    const [identity] = await db.$queryRaw<Array<{ database: string; user: string; port: number; rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT current_database() AS database, current_user AS user, inet_server_port() AS port, rolsuper, rolbypassrls
      FROM pg_roles WHERE rolname = current_user`
    expect(identity).toMatchObject({ database: "gastos_g002_history", user: "gastos_g002", port: 55494, rolsuper: false, rolbypassrls: false })
    console.info("G002_HISTORY_IDENTITY", JSON.stringify(identity))
  })
  afterAll(() => db.$disconnect())

  it("G001+G002 preservam todos os campos históricos, IDs, relações, estoque e pagamentos", async () => {
    const snapshots = await db.$queryRaw<Array<{ table_name: string; record_id: string; before_json: Record<string, unknown> }>>`SELECT * FROM g002_migration_snapshot ORDER BY table_name, record_id`
    expect(snapshots.length).toBeGreaterThan(10)
    for (const snapshot of snapshots) {
      expect(tables.has(snapshot.table_name)).toBe(true)
      const [current] = await db.$queryRawUnsafe<Array<{ row: Record<string, unknown> }>>(
        `SELECT to_jsonb(t) AS row FROM "${snapshot.table_name}" t WHERE "id" = $1`, snapshot.record_id,
      )
      expect(current).toBeDefined()
      const oldColumns = Object.fromEntries(Object.keys(snapshot.before_json).map(key => [key, current.row[key]]))
      expect(oldColumns, `${snapshot.table_name}/${snapshot.record_id}`).toEqual(snapshot.before_json)
    }
    expect(await db.financeiroPerfil.count()).toBe(0)
    expect(await db.contaPagarTitulo.count({ where: { perfilId: { not: null } } })).toBe(0)
    expect(await db.contaPagarTitulo.findUnique({ where: { id: "g002-history-CP2" } })).toMatchObject({ valor: 0.005, perfilId: null, valorCentavos: null, precisaoStatus: null })
  })

  it("ensaia atribuição empresarial inequívoca e anomalia, somente na massa sintética com rollback", async () => {
    await expect(db.$transaction(async tx => {
      const row = await tx.contaPagarTitulo.findUniqueOrThrow({ where: { id: "g002-history-CP2" } })
      const data = await dadosFinanceirosEmpresa(tx, "g002-history-L2", row.valor)
      const result = await tx.contaPagarTitulo.update({ where: { id: row.id }, data })
      expect(result).toMatchObject({ valor: 0.005, valorCentavos: null, valorOriginalLegado: 0.005, precisaoStatus: "ANOMALIA_LEGADO" })
      expect(result.perfilId).toBe(data.perfilId)
      expect(await tx.perfilMembro.count()).toBe(0)
      throw new Error("G002_SYNTHETIC_ROLLBACK")
    })).rejects.toThrow("G002_SYNTHETIC_ROLLBACK")
    expect(await db.financeiroPerfil.count()).toBe(0)
    expect((await db.contaPagarTitulo.findUniqueOrThrow({ where: { id: "g002-history-CP2" } })).perfilId).toBeNull()
  })

  it("perfil empresarial inativo não é escolhido para saneamento automático", async () => {
    await expect(db.$transaction(async tx => {
      await tx.financeiroPerfil.create({ data: { tipo: "EMPRESA", storeId: "g002-history-L2", ativo: false } })
      await dadosFinanceirosEmpresa(tx, "g002-history-L2", 0.005)
    })).rejects.toThrow("Dados financeiros inválidos ou sem acesso.")
    expect(await db.financeiroPerfil.count()).toBe(0)
    expect(await db.contaPagarTitulo.count({ where: { perfilId: { not: null } } })).toBe(0)
  })
})

const auditRaw = process.env.GASTOS_G002_AUDIT_DATABASE_URL
const auditUrl = new URL(auditRaw ?? "postgresql://gastos_g002@127.0.0.1:55494/gastos_g002_audit_r2b")
if (auditUrl.protocol !== "postgresql:" || auditUrl.hostname !== "127.0.0.1" || auditUrl.port !== "55494"
  || auditUrl.pathname !== "/gastos_g002_audit_r2b" || auditUrl.username !== "gastos_g002" || auditUrl.search) {
  throw new Error("G002 recusa auditoria fora do banco sintético próprio R2b.")
}
const auditDb = new PrismaClient({ datasources: { db: { url: auditUrl.toString() } } })
describe.skipIf(!auditRaw)("G002 auditoria de legado inconsistente no banco descartável", () => {
  afterAll(() => auditDb.$disconnect())
  it("diagnóstico em transação READ ONLY encontra os vínculos cruzados e separa conta histórica inativa", async () => {
    const source = readFileSync(new URL("../../docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-002/AUDITORIA_PRE_MIGRATION.sql", import.meta.url), "utf8")
    const query = source.split("-- G002_AUDIT_QUERY_BEGIN")[1].split("-- G002_AUDIT_QUERY_END")[0].trim()
    await auditDb.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
      expect((await tx.$queryRawUnsafe<Array<{ transaction_read_only: string }>>("SHOW transaction_read_only"))[0].transaction_read_only).toBe("on")
      const [result] = await tx.$queryRawUnsafe<Array<{ auditoria: { database: string; usuario: string; porta: number;
        contagens: { bloqueios: number; revisar: number; informativos: number }; problemas: Array<{ codigo: string }> } }>>(query)
      expect(result.auditoria).toMatchObject({ database: "gastos_g002_audit_r2b", usuario: "gastos_g002", porta: 55494,
        contagens: { bloqueios: 3, revisar: 3, informativos: 1 } })
      expect(result.auditoria.problemas.map(p => p.codigo)).toEqual(expect.arrayContaining([
        "FORNECEDOR_OUTRA_LOJA", "VENDA_TITULO_OUTRA_LOJA", "MOVIMENTO_CONTA_OUTRA_LOJA", "HISTORICO_CONTA_INATIVA",
      ]))
      console.info("G002_AUDIT_READ_ONLY", JSON.stringify(result.auditoria.contagens))
    })
  })
  it("migration preserva os registros ambíguos e novas escritas cruzadas falham sem saneamento silencioso", async () => {
    const snapshots = await auditDb.$queryRaw<Array<{ table_name: string; record_id: string; before_json: Record<string, unknown> }>>`SELECT * FROM g002_migration_snapshot ORDER BY table_name, record_id`
    expect(snapshots).toHaveLength(14)
    for (const s of snapshots) {
      expect(tables.has(s.table_name)).toBe(true)
      const [current] = await auditDb.$queryRawUnsafe<Array<{ row: Record<string, unknown> }>>(`SELECT to_jsonb(t) AS row FROM "${s.table_name}" t WHERE id=$1`, s.record_id)
      expect(Object.fromEntries(Object.keys(s.before_json).map(key => [key, current.row[key]]))).toEqual(s.before_json)
    }
    await expect(auditDb.$executeRaw`UPDATE contas_pagar_titulos SET descricao = 'Recusado' WHERE id = 'g002-history-CP2'`).rejects.toMatchObject({ meta: { code: "23514" } })
    // FINAL-004: regravar o MESMO vínculo legado não congela a venda (não cria vínculo novo); trocar para
    // título de outra loja continua recusado (cobertura completa em test/gastos/venda-titulo-legado.pg.test.ts).
    await expect(auditDb.$transaction(async tx => {
      await tx.$executeRaw`UPDATE vendas SET "contaReceberTituloId" = "contaReceberTituloId" WHERE id = 'g002-history-V1'`
      throw new Error("G002_AUDIT_FIXTURE_ROLLBACK")
    })).rejects.toThrow("G002_AUDIT_FIXTURE_ROLLBACK")
    await expect(auditDb.$executeRaw`UPDATE movimentacoes_financeiras SET descricao = 'Recusado' WHERE id = 'g002-history-M1'`).rejects.toMatchObject({ meta: { code: "23514" } })
    await expect(auditDb.$transaction(async tx => {
      await tx.$executeRaw`UPDATE movimentacoes_financeiras SET descricao = 'Histórico da mesma loja permitido' WHERE id = 'g002-history-M2'`
      throw new Error("G002_AUDIT_FIXTURE_ROLLBACK")
    })).rejects.toThrow("G002_AUDIT_FIXTURE_ROLLBACK")
    expect(await auditDb.financeiroPerfil.count()).toBe(0)
    expect((await auditDb.movimentacaoFinanceira.findUniqueOrThrow({ where: { id: "g002-history-M1" } })).storeId).toBe("g002-history-L2")
  })

  it("N8 auditoria classifica NaN e infinitos como BLOQUEIO, sem persistir saneamento", async () => {
    const source = readFileSync(new URL("../../docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-002/AUDITORIA_PRE_MIGRATION.sql", import.meta.url), "utf8")
    const query = source.split("-- G002_AUDIT_QUERY_BEGIN")[1].split("-- G002_AUDIT_QUERY_END")[0].trim()
    await expect(auditDb.$transaction(async tx => {
      for (const value of ["NaN", "Infinity", "-Infinity"]) {
        await tx.$executeRaw`INSERT INTO contas_pagar_titulos (id,"storeId","localKey",valor,"updatedAt")
          VALUES (${`N8-${value}`},'g002-history-L1',${`N8-${value}`},${value}::float8,now())`
      }
      const [result] = await tx.$queryRawUnsafe<Array<{ auditoria: { problemas: Array<{ id: string; codigo: string; severidade: string }> } }>>(query)
      const nonfinite = result.auditoria.problemas.filter(p => p.id.startsWith("N8-"))
      expect(nonfinite).toHaveLength(3)
      expect(nonfinite.every(p => p.codigo === "VALOR_NAO_FINITO" && p.severidade === "BLOQUEIO")).toBe(true)
      throw new Error("N8_SYNTHETIC_ROLLBACK")
    })).rejects.toThrow("N8_SYNTHETIC_ROLLBACK")
    expect(await auditDb.contaPagarTitulo.count({ where: { id: { startsWith: "N8-" } } })).toBe(0)
  })
})
