import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { setImmediate as proximo } from "node:timers/promises"
import { PrismaClient } from "@/generated/prisma"
import { configurarCanal, persistirIngresso, registrarCanal, resolverCanalExato } from "@/lib/gastos/channels"
import { registrarOrigemCanal } from "@/lib/gastos/outbox"
import { bancoG006, conexao, encerrarG006, estacionarFilaDeTeste, fixtureG006, habilitadoG006, ingress, operator, owner, worker, provaG006 } from "./g006-fixtures"

describe.runIf(habilitadoG006)("G006 canais e inbox PostgreSQL", () => {
  beforeAll(bancoG006)
  beforeEach(estacionarFilaDeTeste)
  afterAll(encerrarG006)

  it("GESTAO global e ATENDIMENTO da loja iniciam sem ativação implícita", async () => {
    const f = await fixtureG006(), a = await fixtureG006("ATENDIMENTO")
    expect(f.canal.storeId).toBeNull(); expect(a.canal.storeId).toBe(a.L1)
    const n = await registrarCanal(operator, { phoneNumberId: String(Date.now()), wabaId: "990006", appId: "990007",
      telefoneE164: "+1" + randomUUID().replace(/\D/g, "").padEnd(14, "0").slice(0, 14), papel: "GESTAO", storeId: null, credencialRef: "WHATSAPP_CANAL_TOKEN_G006_EMPTY" })
    expect(n).toMatchObject({ ativo: false, versao: 1 })
    await expect(registrarCanal(operator, { ...n, papel: "ATENDIMENTO" })).rejects.toThrow()
    await expect(configurarCanal(operator, f.canal.canalId, 1, true)).rejects.toThrow("CANAL_ALTERADO")
  })

  it("não permite o mesmo número nos dois papéis nem a mudança de identidade por SQL", async () => {
    const f = await fixtureG006()
    await expect(owner.whatsAppPhoneNumber.create({ data: { storeId: f.L1, phoneNumberId: f.canal.phoneNumberId, wabaId: f.canal.wabaId } })).rejects.toThrow()
    await expect(owner.whatsAppCanal.update({ where: { canalId: f.canal.canalId }, data: { papel: "ATENDIMENTO", storeId: f.L1, versao: 3 } })).rejects.toThrow()
    await expect(registrarCanal(worker, { ...f.canal })).rejects.toThrow("OPERADOR_NEGADO")
  })

  it("reconcilia cadastro legado apenas como atendimento da MESMA loja/WABA", async () => {
    const f = await fixtureG006("ATENDIMENTO")
    await owner.whatsAppPhoneNumber.create({ data: { storeId: f.L1, phoneNumberId: f.canal.phoneNumberId, wabaId: f.canal.wabaId } })
    await expect(owner.whatsAppPhoneNumber.update({ where: { phoneNumberId: f.canal.phoneNumberId }, data: { storeId: f.L2 } })).rejects.toThrow()
    await expect(persistirIngresso(ingress, f.envelope())).rejects.toThrow("CANAL_INVALIDO")
    expect(await owner.whatsAppGestaoInbox.count({ where: { canalId: f.canal.canalId } })).toBe(0)
  })

  it("E.164 também impede colisão com legado quando phoneNumberId é diferente", async () => {
    const f = await fixtureG006()
    await expect(owner.whatsAppPhoneNumber.create({ data: { storeId: f.L1, phoneNumberId: "8" + f.canal.phoneNumberId,
      displayPhone: f.canal.telefoneE164, wabaId: f.canal.wabaId } })).rejects.toThrow()
    const telefone = "+1" + randomUUID().replace(/\D/g, "").padEnd(14, "0").slice(0, 14), pnid = "7" + f.canal.phoneNumberId
    await owner.whatsAppPhoneNumber.create({ data: { storeId: f.L1, phoneNumberId: pnid, displayPhone: telefone, wabaId: f.canal.wabaId } })
    await expect(registrarCanal(operator, { phoneNumberId: "6" + f.canal.phoneNumberId, wabaId: f.canal.wabaId, appId: f.canal.appId,
      telefoneE164: telefone, papel: "GESTAO", storeId: null, credencialRef: "WHATSAPP_CANAL_TOKEN_G006_SYNTHETIC" })).rejects.toThrow()
  })

  it("WABA/app desconhecidos não ingressam, sem fallback de loja ou credencial", async () => {
    const f = await fixtureG006()
    for (const patch of [{ wabaId: "123" }, { appId: "124" }, { phoneNumberId: "125" }, { canalId: randomUUID() }]) {
      await expect(persistirIngresso(ingress, f.envelope(patch))).rejects.toThrow("CANAL_INVALIDO")
    }
    await configurarCanal(operator, f.canal.canalId, f.canal.versao, false)
    await expect(resolverCanalExato(worker, f.canal)).rejects.toThrow("CANAL_INVALIDO")
  })

  it("A/J: ingresso concorrente e replay após ACK durável criam um inbox/job", async () => {
    const f = await fixtureG006(), envelope = f.envelope(), outra = conexao("omni_gastos_ingress")
    try {
      const [a, b] = await Promise.all([persistirIngresso(ingress, envelope), persistirIngresso(outra, envelope)])
      expect(a.ackDuravel && b.ackDuravel).toBe(true)
      expect(a.inboxId).toBe(b.inboxId); expect(a.jobId).toBe(b.jobId)
      expect([a.replay, b.replay].sort()).toEqual([false, true])
      const replay = await persistirIngresso(ingress, { ...envelope, correlacaoId: randomUUID() })
      expect(replay).toMatchObject({ replay: true, jobId: a.jobId })
      expect(await owner.gastoJob.count({ where: { inboxId: a.inboxId } })).toBe(1)
      const inbox = await owner.whatsAppGestaoInbox.findUniqueOrThrow({ where: { id: a.inboxId } })
      expect(inbox).toMatchObject({ canalId: f.canal.canalId, phoneNumberId: f.canal.phoneNumberId, externalMessageId: envelope.externalMessageId })
      expect(inbox).not.toHaveProperty("storeId"); expect(inbox).not.toHaveProperty("adminUserId")
      provaG006("ingresso-ack-dedup", { a, b, replay, persistedAfterReturn: !!inbox, dbReal: true })
    } finally { await outra.$disconnect() }
  })

  it("B: externalMessageId igual em outro canal preserva duas identidades", async () => {
    const f = await fixtureG006(), g = await fixtureG006(), externalMessageId = `wamid.${randomUUID()}`
    const a = await persistirIngresso(ingress, f.envelope({ externalMessageId })), b = await persistirIngresso(ingress, g.envelope({ externalMessageId }))
    expect(a.inboxId).not.toBe(b.inboxId); expect(a.jobId).not.toBe(b.jobId)
  })

  it("replay com conteúdo ou remetente divergente é conflito e preserva original", async () => {
    const f = await fixtureG006(), envelope = f.envelope(), a = await persistirIngresso(ingress, envelope)
    await expect(persistirIngresso(ingress, { ...envelope, conteudo: { tipo: "texto", texto: "ALTERADO" } })).rejects.toThrow("REPLAY_DIVERGENTE")
    await expect(persistirIngresso(ingress, { ...envelope, remetenteE164: "+15550060002" })).rejects.toThrow("REPLAY_DIVERGENTE")
    expect(await owner.gastoJob.count({ where: { inboxId: a.inboxId } })).toBe(1)
  })

  it("I: falha diferida no COMMIT impede ACK e reverte inbox/job", async () => {
    const f = await fixtureG006(), envelope = f.envelope()
    await owner.$executeRawUnsafe("CREATE FUNCTION g006_qa_ack_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_ACK_FAIL'; END $$")
    await owner.$executeRawUnsafe("CREATE CONSTRAINT TRIGGER g006_qa_ack AFTER INSERT ON gastos_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION g006_qa_ack_fail()")
    try { await expect(persistirIngresso(ingress, envelope)).rejects.toThrow("DB_INDISPONIVEL") }
    finally {
      await owner.$executeRawUnsafe("DROP TRIGGER g006_qa_ack ON gastos_jobs")
      await owner.$executeRawUnsafe("DROP FUNCTION g006_qa_ack_fail()")
    }
    expect(await owner.whatsAppGestaoInbox.count({ where: { externalMessageId: envelope.externalMessageId } })).toBe(0)
    expect((await persistirIngresso(ingress, envelope)).replay).toBe(false)
  })

  it("staging sem binding não fabrica AdminUser/loja nem origem financeira", async () => {
    const f = await fixtureG006(), entrada = await persistirIngresso(ingress, f.envelope({ mediaId: "media.fixture", respondidoA: "wamid.reply" }))
    const users = await owner.adminUser.count()
    await expect(registrarOrigemCanal(worker, { inboxId: entrada.inboxId, perfilId: f.E1, storeId: f.L1, grupoChave: "sem-vinculo" })).rejects.toThrow("VINCULO_AUSENTE")
    expect(await owner.gastoOrigemCanal.count({ where: { inboxId: entrada.inboxId } })).toBe(0)
    expect(await owner.adminUser.count()).toBe(users)
    expect(await owner.whatsAppMessage.count({ where: { externalMessageId: { in: ["media.fixture", "wamid.reply"] } } })).toBe(0)
  })

  it("payload denso respeita o limite jsonb e excesso é erro permanente antes do ACK", async () => {
    const f = await fixtureG006()
    expect((await persistirIngresso(ingress, f.envelope({ conteudo: { tipo: "texto", itens: Array(10000).fill(1) } }))).ackDuravel).toBe(true)
    const grande = f.envelope({ conteudo: { tipo: "texto", itens: Array(30000).fill(1) } })
    await expect(persistirIngresso(ingress, grande)).rejects.toThrow("INGRESSO_INVALIDO")
    expect(await owner.whatsAppGestaoInbox.count({ where: { externalMessageId: grande.externalMessageId } })).toBe(0)
  })

  it("CHECK de ingresso não é classificado como indisponibilidade temporária", async () => {
    const f = await fixtureG006()
    await owner.$executeRawUnsafe("ALTER TABLE whatsapp_gestao_inbox ADD CONSTRAINT g006_qa_payload CHECK(false) NOT VALID")
    try { await expect(persistirIngresso(ingress, f.envelope())).rejects.toThrow("INGRESSO_INVALIDO") }
    finally { await owner.$executeRawUnsafe("ALTER TABLE whatsapp_gestao_inbox DROP CONSTRAINT g006_qa_payload") }
  })

  it("rotação entre resolver canal e INSERT pede nova resolução, sem perder a mensagem válida", async () => {
    const f = await fixtureG006(), envelope = f.envelope(), locker = conexao("gastos_g006_owner")
    await owner.$executeRawUnsafe("CREATE FUNCTION g006_qa_ingresso_barreira() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(6000641); RETURN NEW; END $$")
    await owner.$executeRawUnsafe("CREATE TRIGGER g000_qa_ingresso BEFORE INSERT ON whatsapp_gestao_inbox FOR EACH ROW EXECUTE FUNCTION g006_qa_ingresso_barreira()")
    let pronta!: () => void, soltar!: () => void
    const barreira = new Promise<void>(r => { pronta = r }), liberar = new Promise<void>(r => { soltar = r })
    const trava = locker.$transaction(async tx => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(6000641)::text`; pronta(); await liberar })
    await barreira
    const tarefa = persistirIngresso(ingress, envelope).then(() => "ACK_INESPERADO", e => (e as Error).message)
    try {
      let esperando = false
      const limite = Date.now() + 4000
      while (Date.now() < limite) {
        const [r] = await owner.$queryRaw<Array<{ espera: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=6000641 AND NOT granted) espera`
        if (r.espera) { esperando = true; break }
        await proximo()
      }
      expect(esperando).toBe(true)
      await configurarCanal(operator, f.canal.canalId, f.canal.versao, true)
      soltar(); await trava
      expect(await tarefa).toBe("CANAL_ALTERADO")
    } finally { soltar(); await trava; await tarefa; await locker.$disconnect()
      await owner.$executeRawUnsafe("DROP TRIGGER g000_qa_ingresso ON whatsapp_gestao_inbox")
      await owner.$executeRawUnsafe("DROP FUNCTION g006_qa_ingresso_barreira()") }
    expect((await persistirIngresso(ingress, envelope)).ackDuravel).toBe(true)
  })

  it("defaults de inbox/job são executados pelo banco, sem timestamp vinculado pelo cliente", async () => {
    const f = await fixtureG006(), queries: string[] = []
    const db = new PrismaClient({ datasources: { db: { url: "postgresql://omni_gastos_ingress@127.0.0.1:55516/gastos_g006_test" } }, log: [{ level: "query", emit: "event" }] })
    db.$on("query", e => { if (/^INSERT INTO/.test(e.query)) queries.push(e.query.split(" VALUES")[0]) })
    try {
      const [antes] = await owner.$queryRaw<Array<{ instante: Date }>>`SELECT clock_timestamp() instante`
      const r = await persistirIngresso(db, f.envelope())
      const [depois] = await owner.$queryRaw<Array<{ instante: Date }>>`SELECT clock_timestamp() instante`
      const job = await owner.gastoJob.findUniqueOrThrow({ where: { id: r.jobId } })
      for (const campo of [job.createdAt, job.updatedAt, job.runAfter]) {
        expect(campo.getTime()).toBeGreaterThanOrEqual(antes.instante.getTime() - 1)
        expect(campo.getTime()).toBeLessThanOrEqual(depois.instante.getTime() + 1)
      }
      expect(queries).toHaveLength(2)
      for (const query of queries) expect(query).not.toMatch(/"(?:runAfter|createdAt|updatedAt|recebidoEm)"/)
      provaG006("relogio-db-ingresso", { columnsOnly: queries, timestampsGeneratedByDatabase: true, dbReal: true })
    } finally { await db.$disconnect() }
  })
})
