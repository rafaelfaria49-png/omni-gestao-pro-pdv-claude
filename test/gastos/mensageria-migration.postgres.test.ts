import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { validarPapelWorker } from "@/lib/gastos/worker"
import { bancoG006, conexao, encerrarG006, fixtureG006, habilitadoG006, ingress, operator, owner, provaG006, worker } from "./g006-fixtures"

const suffix = process.env.G006_MIGRATION_SUFFIX ?? ""
if (suffix && !/^_r[0-9]+$/.test(suffix)) throw Error("Sufixo de baseline G006 invalido")

describe.runIf(habilitadoG006)("G006 migration/RLS e privilégio efetivo", () => {
  beforeAll(bancoG006); afterAll(encerrarG006)

  it("baseline vazio recebe cadeia G001-G006 (G005 sem DDL), seis tabelas novas vazias", async () => {
    const db = conexao("gastos_g006_owner", "gastos_g006_empty" + suffix)
    try {
      const [r] = await db.$queryRaw<Array<{ canais: number; inbox: number; jobs: number; origens: number; eventos: number; pulsos: number }>>`SELECT
        (SELECT count(*)::int FROM whatsapp_canais) canais,(SELECT count(*)::int FROM whatsapp_gestao_inbox) inbox,
        (SELECT count(*)::int FROM gastos_jobs) jobs,(SELECT count(*)::int FROM gastos_origens_canal) origens,
        (SELECT count(*)::int FROM gastos_job_eventos) eventos,(SELECT count(*)::int FROM gastos_worker_pulsos) pulsos`
      expect(Object.values(r)).toEqual([0, 0, 0, 0, 0, 0])
      provaG006("migration-vazio", { db: "gastos_g006_empty" + suffix, counts: r, chain: "G001-G006; G005 sem SQL", dbReal: true })
    } finally { await db.$disconnect() }
  })

  it("histórico financeiro sintético anterior ao G001 conserva IDs, valores e JSON", async () => {
    const db = conexao("gastos_g006_owner", "gastos_g006_history_finance" + suffix)
    try {
      const [r] = await db.$queryRaw<Array<{ id: string; valor: number; payload: { sentinela: string; historico: unknown[] }; movimento: number; saldo: number }>>`SELECT t.id,t.valor,t.payload,
        (SELECT valor FROM movimentacoes_financeiras WHERE id='g004-history-M') movimento,
        (SELECT "saldoAtual" FROM carteiras_financeiras WHERE id='g004-history-C') saldo
        FROM contas_pagar_titulos t WHERE t.id='g004-history-T'`
      expect(r).toMatchObject({ id: "g004-history-T", valor: 365.01, movimento: 200, saldo: 800, payload: { sentinela: "preservar" } })
      expect(r.payload.historico).toEqual([{ tipo: "pagamento", valor: 200 }])
      expect(await db.gastoJob.count()).toBe(0)
      provaG006("migration-historico-financeiro", { db: "gastos_g006_history_finance" + suffix, preserved: r, dbReal: true })
    } finally { await db.$disconnect() }
  })

  it("catálogo confirma constraints, índices, FKs e RLS habilitada nas seis tabelas", async () => {
    const rows = await owner.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; fks: number; checks: number; indices: number }>>`SELECT c.relname,c.relrowsecurity,
      (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='f') fks,
      (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='c') checks,
      (SELECT count(*)::int FROM pg_index i WHERE i.indrelid=c.oid) indices
      FROM pg_class c WHERE c.oid IN ('whatsapp_canais'::regclass,'whatsapp_gestao_inbox'::regclass,'gastos_origens_canal'::regclass,
        'gastos_jobs'::regclass,'gastos_job_eventos'::regclass,'gastos_worker_pulsos'::regclass) ORDER BY c.relname`
    expect(rows).toHaveLength(6); expect(rows.every(r => r.relrowsecurity && r.checks >= 1 && r.indices >= 1)).toBe(true)
    expect(rows.reduce((n, r) => n + r.fks, 0)).toBe(10)
    provaG006("catalogo-constraints-rls", rows)
  })

  it("worker efetivo é login não owner/NOBYPASSRLS, sem DML financeiro/auth ou criação de roles", async () => {
    await validarPapelWorker(worker)
    const [r] = await worker.$queryRaw<Array<{ papel: string; rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>>`
      SELECT current_user papel,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`
    expect(r).toEqual({ papel: "omni_gastos_worker", rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false })
    await expect(worker.$executeRaw`UPDATE movimentacoes_financeiras SET descricao='PROIBIDO' WHERE false`).rejects.toThrow()
    await expect(worker.$executeRaw`UPDATE admin_users SET active=false WHERE false`).rejects.toThrow()
    await expect(worker.$executeRaw`INSERT INTO gastos_outbox SELECT * FROM gastos_outbox WHERE false`).rejects.toThrow()
    provaG006("papel-sql-efetivo", { ...r, financialDml: "DENIED", authDml: "DENIED", owner: false, rls: true })
  })

  it("RLS nega outsider mesmo com SELECT; operador só lê metadados privados concedidos", async () => {
    await fixtureG006()
    const outsider = conexao("gastos_g006_outsider")
    await owner.$executeRawUnsafe("GRANT SELECT ON whatsapp_canais,whatsapp_gestao_inbox,gastos_origens_canal,gastos_jobs,gastos_job_eventos,gastos_worker_pulsos TO gastos_g006_outsider")
    try {
      expect(await outsider.whatsAppCanal.count()).toBe(0)
      expect(await outsider.whatsAppGestaoInbox.count()).toBe(0)
      expect(await outsider.gastoJob.count()).toBe(0)
      await expect(outsider.$queryRaw`SELECT * FROM g006_autorizar_escopo('x','y',NULL)`).rejects.toThrow()
      await expect(operator.$queryRaw`SELECT conteudo,"remetenteE164" FROM whatsapp_gestao_inbox`).rejects.toThrow()
      await expect(ingress.$queryRaw`SELECT resultado FROM financeiro_operacoes`).rejects.toThrow()
    } finally { await outsider.$disconnect() }
  })

  it("banco recusa escopo/canal/FK inválidos, outbox G004 permanece imutável", async () => {
    const f = await fixtureG006()
    await expect(owner.whatsAppCanal.create({ data: { phoneNumberId: "9000000", wabaId: "1", appId: "2", telefoneE164: "+15550060008",
      papel: "GESTAO", storeId: f.L1, credencialRef: "WHATSAPP_CANAL_TOKEN_G006_SYNTHETIC" } })).rejects.toThrow()
    await expect(owner.whatsAppGestaoInbox.create({ data: { id: "g006-bad-fk", provedor: "META", canalId: "sem-canal", canalVersao: 1,
      phoneNumberId: "1", externalMessageId: "bad", remetenteE164: "+15550060001", correlacaoId: "bad", ocorridoEm: new Date(),
      proveniencia: "INGRESSO_TECNICO_G006", conteudo: {}, conteudoHash: "0".repeat(64) } })).rejects.toThrow()
    const [r] = await owner.$queryRaw<Array<{ outboxImutavel: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='gastos_outbox'::regclass AND tgname='g004_imutavel' AND tgenabled='O') AS "outboxImutavel"`
    expect(r.outboxImutavel).toBe(true)
    await expect(owner.gastoOrigemCanal.create({ data: { inboxId: "missing", perfilId: f.P1, storeId: f.L1, autorAdminUserId: f.U2, grupoChave: "bad", bindingRef: "fixture", bindingVersao: 1 } })).rejects.toThrow()
  })

  it("health recusa DELETE financeiro, SELECT desnecessário e membership adicionados depois", async () => {
    for (const grant of ["DELETE ON contas_pagar_titulos", "SELECT ON financeiro_perfil_membros"]) {
      await owner.$executeRawUnsafe(`GRANT ${grant} TO omni_gastos_worker`)
      try { await expect(validarPapelWorker(worker)).rejects.toThrow("CONFIG_INVALIDA") }
      finally { await owner.$executeRawUnsafe(`REVOKE ${grant} FROM omni_gastos_worker`) }
    }
    await owner.$executeRawUnsafe("GRANT gastos_g006_privilege_probe TO omni_gastos_worker")
    try { await expect(validarPapelWorker(worker)).rejects.toThrow("CONFIG_INVALIDA") }
    finally { await owner.$executeRawUnsafe("REVOKE gastos_g006_privilege_probe FROM omni_gastos_worker") }
    await validarPapelWorker(worker)
    await expect(worker.$queryRaw`SELECT * FROM financeiro_perfis`).rejects.toThrow()
    await expect(worker.$queryRaw`SELECT * FROM financeiro_perfil_membros`).rejects.toThrow()
  })

  it("health recusa CREATE no schema/banco e EXECUTE inesperado, sem revogar contratos G004", async () => {
    for (const objeto of ["SCHEMA public", "DATABASE gastos_g006_test"]) {
      await owner.$executeRawUnsafe(`GRANT CREATE ON ${objeto} TO omni_gastos_worker`)
      try { await expect(validarPapelWorker(worker)).rejects.toThrow("CONFIG_INVALIDA") }
      finally { await owner.$executeRawUnsafe(`REVOKE CREATE ON ${objeto} FROM omni_gastos_worker`) }
    }
    await owner.$executeRawUnsafe("CREATE FUNCTION g006_qa_executavel() RETURNS integer LANGUAGE sql AS 'SELECT 1'")
    await owner.$executeRawUnsafe("REVOKE ALL ON FUNCTION g006_qa_executavel() FROM PUBLIC")
    try {
      await validarPapelWorker(worker)
      await owner.$executeRawUnsafe("GRANT EXECUTE ON FUNCTION g006_qa_executavel() TO omni_gastos_worker")
      await expect(validarPapelWorker(worker)).rejects.toThrow("CONFIG_INVALIDA")
    } finally { await owner.$executeRawUnsafe("DROP FUNCTION g006_qa_executavel()") }
    await validarPapelWorker(worker)
  })
})
