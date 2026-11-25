import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { persistirIngresso } from "@/lib/gastos/channels"
import { claimJob, concluirStaging, falharJob, renovarLease, reprocessarJob } from "@/lib/gastos/queue"
import { decidirFalha } from "@/lib/gastos/retry"
import { processarClaim, carregarConfigWorker } from "@/lib/gastos/worker"
import { bancoG006, conexao, encerrarG006, estacionarFilaDeTeste, fixtureG006, habilitadoG006, ingress, operator, owner, worker, provaG006 } from "./g006-fixtures"

describe.runIf(habilitadoG006)("G006 fila PostgreSQL e fencing", () => {
  beforeAll(bancoG006); beforeEach(estacionarFilaDeTeste); afterAll(encerrarG006)
  const novo = async () => { const f = await fixtureG006(); return { f, entrada: await persistirIngresso(ingress, f.envelope()) } }

  it("D: dois workers em conexões reais disputam um job, um claim válido", async () => {
    const { entrada } = await novo(), outro = conexao("omni_gastos_worker")
    try {
      const [p1] = await worker.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`
      const [p2] = await outro.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`
      expect(p1.pid).not.toBe(p2.pid)
      let liberar!: () => void, pronta!: () => void
      const barreira = new Promise<void>(r => { pronta = r }), soltar = new Promise<void>(r => { liberar = r })
      const trava = owner.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM gastos_jobs WHERE id=${entrada.jobId} FOR UPDATE`; pronta(); await soltar })
      await barreira
      try { expect(await claimJob(worker, "worker-skip")).toBeNull() } finally { liberar(); await trava }
      const claims = await Promise.all([claimJob(worker, "worker-um"), claimJob(outro, "worker-dois")])
      expect(claims.filter(Boolean)).toHaveLength(1)
      const claim = claims.find(Boolean)!
      expect(claim.id).toBe(entrada.jobId); expect(claim.tentativas).toBe(1)
      await concluirStaging(worker, claim)
      provaG006("concorrencia-claims", { pids: [p1.pid, p2.pid], jobId: claim.id, claimsValidos: 1, skipLockedSobBarreira: true, mocks: false })
    } finally { await outro.$disconnect() }
  })

  it("E/F: lease vencida recupera identidade e impede worker antigo, mesmo owner reutilizado", async () => {
    const { entrada } = await novo(), a = (await claimJob(worker, "mesmo-owner"))!
    await owner.$executeRaw`UPDATE gastos_jobs SET "leaseUntil"=clock_timestamp()-interval '1 second' WHERE id=${a.id}`
    const b = (await claimJob(worker, "mesmo-owner"))!
    expect(b.id).toBe(entrada.jobId); expect(b.leaseToken).not.toBe(a.leaseToken); expect(b.tentativas).toBe(2)
    await expect(concluirStaging(worker, a)).rejects.toThrow("LEASE_PERDIDA")
    await expect(renovarLease(worker, a, 30_000)).rejects.toThrow("LEASE_PERDIDA")
    await concluirStaging(worker, b)
    expect((await owner.gastoJob.findUniqueOrThrow({ where: { id: a.id } })).estado).toBe("CONCLUIDO")
  })

  it("lease vencida sem sucessor também não pode concluir ou renovar", async () => {
    await novo(); const a = (await claimJob(worker, "worker-vencido"))!
    await owner.$executeRaw`UPDATE gastos_jobs SET "leaseUntil"=clock_timestamp()-interval '1 second' WHERE id=${a.id}`
    await expect(concluirStaging(worker, a)).rejects.toThrow("LEASE_PERDIDA")
    await expect(renovarLease(worker, a, 30_000)).rejects.toThrow("LEASE_PERDIDA")
  })

  it("heartbeat renova pelo relógio do banco e mantém token do claim", async () => {
    await novo(); const a = (await claimJob(worker, "worker-pulso", 1000))!
    await renovarLease(worker, a, 30_000)
    const b = await owner.gastoJob.findUniqueOrThrow({ where: { id: a.id } })
    expect(b.leaseUntil!.getTime()).toBeGreaterThan(a.leaseUntil.getTime()); expect(b.leaseToken).toBe(a.leaseToken)
  })

  it("retry respeita runAfter DB, limite e DLQ sem apagar tentativas", async () => {
    const { entrada } = await novo()
    await owner.$executeRaw`UPDATE gastos_jobs SET tentativas=4,"tentativasCiclo"=4 WHERE id=${entrada.jobId}`
    const a = (await claimJob(worker, "worker-limite"))!
    await falharJob(worker, a, decidirFalha({ tipo: "TEMPORARIA_LOCAL" }, 5, false, 0))
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ estado: "ESTACIONADO", falhaCodigo: "LIMITE_TENTATIVAS", tentativas: 5 })
    await expect(reprocessarJob(worker, a.id, "PROVEDOR_RESTAURADO")).rejects.toThrow("OPERADOR_NEGADO")
    await reprocessarJob(operator, a.id, "PROVEDOR_RESTAURADO")
    const b = (await claimJob(worker, "worker-reprocessado"))!
    expect(b.id).toBe(a.id); expect(b.tentativas).toBe(6); expect(b.tentativasCiclo).toBe(1)
    await falharJob(worker, b, decidirFalha({ tipo: "TEMPORARIA_LOCAL" }, 1, false, 1))
    expect(await claimJob(worker, "worker-cedo")).toBeNull()
    const historico = await operator.gastoJobEvento.findMany({ where: { jobId: a.id } })
    expect(historico.some(e => e.codigo === "PROVEDOR_RESTAURADO" && e.atorSql === "omni_gastos_operator")).toBe(true)
    await expect(operator.gastoJobEvento.deleteMany({ where: { jobId: a.id } })).rejects.toThrow()
  })

  it("indisponibilidade prolongada terminaliza por prazo sem nova tentativa", async () => {
    const { entrada } = await novo()
    await owner.$executeRaw`UPDATE gastos_jobs SET "prazoEm"=clock_timestamp()-interval '1 day' WHERE id=${entrada.jobId}`
    expect(await claimJob(worker, "worker-prazo")).toBeNull()
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: entrada.jobId } })).toMatchObject({ estado: "ESTACIONADO", falhaCodigo: "PRAZO_ESGOTADO", tentativas: 0 })
  })

  it("L/M: poison job estaciona e reprocessamento falho preserva todo o histórico", async () => {
    const f = await fixtureG006(), entrada = await persistirIngresso(ingress, f.envelope({ conteudo: { tipo: "desconhecido", texto: "privado" } }))
    const config = carregarConfigWorker({ GASTOS_WORKER_ENV: "teste", GASTOS_WORKER_DATABASE_URL: G006_URL_WORKER }, "24.22.1")
    await processarClaim(worker, (await claimJob(worker, "poison1"))!, config)
    const antes = await owner.gastoJobEvento.count({ where: { jobId: entrada.jobId } })
    await reprocessarJob(operator, entrada.jobId, "REVISAO_TECNICA")
    await processarClaim(worker, (await claimJob(worker, "poison2"))!, config)
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: entrada.jobId } })).toMatchObject({ estado: "ESTACIONADO", falhaCodigo: "POISON_JOB", tentativas: 2 })
    expect(await owner.gastoJobEvento.count({ where: { jobId: entrada.jobId } })).toBeGreaterThan(antes)
  })

  it("claim e renovação preservam instantes absolutos com sessão em outro fuso", async () => {
    const { entrada } = await novo(), outro = conexao("omni_gastos_worker")
    try {
      await outro.$executeRawUnsafe("SET TIME ZONE 'Pacific/Honolulu'")
      const [zona] = await outro.$queryRaw<Array<{ timezone: string }>>`SELECT current_setting('TimeZone') timezone`
      expect(zona.timezone).toBe("Pacific/Honolulu")
      const a = (await claimJob(outro, "worker-outro-fuso", 3000))!
      expect(a.id).toBe(entrada.jobId)
      expect(a.leaseUntil.getTime() - Date.now()).toBeGreaterThan(2000)
      expect(a.leaseUntil.getTime() - Date.now()).toBeLessThanOrEqual(3100)
      await renovarLease(outro, a, 30_000)
      const b = await owner.gastoJob.findUniqueOrThrow({ where: { id: a.id } })
      expect(b.leaseUntil!.getTime() - Date.now()).toBeGreaterThan(29_000)
      await concluirStaging(outro, a)
      provaG006("timezone-absoluto", { timezone: zona.timezone, leaseMs: 3000, renewalMs: 30000, timestampType: "timestamptz", dbReal: true })
    } finally { await outro.$disconnect() }
  })

  it("operador não altera lease/orçamento fora da recuperação e toda agenda alterada fica auditada", async () => {
    const { entrada } = await novo(), a = (await claimJob(worker, "worker-auditoria"))!
    await expect(operator.$executeRaw`UPDATE gastos_jobs SET "leaseUntil"=clock_timestamp()+interval '1 hour' WHERE id=${a.id}`).rejects.toThrow()
    await expect(operator.$executeRaw`UPDATE gastos_jobs SET "tentativasCiclo"=0 WHERE id=${a.id}`).rejects.toThrow()
    await expect(operator.$executeRaw`UPDATE gastos_jobs SET "prazoEm"="prazoEm"+interval '1 hour' WHERE id=${a.id}`).rejects.toThrow()
    await falharJob(worker, a, { acao: "DLQ", codigo: "CONFIG_INVALIDA", esperaMs: 0 })
    const antes = await operator.gastoJobEvento.count({ where: { jobId: entrada.jobId } })
    await operator.$executeRaw`UPDATE gastos_jobs SET "runAfter"=clock_timestamp()+interval '1 second' WHERE id=${a.id}`
    expect(await operator.gastoJobEvento.count({ where: { jobId: a.id } })).toBe(antes + 1)
    const eventos = await operator.gastoJobEvento.findMany({ where: { jobId: a.id }, orderBy: { createdAt: "desc" } })
    expect(eventos[0].atorSql).toBe("omni_gastos_operator")
    await reprocessarJob(operator, a.id, "CONFIG_CORRIGIDA")
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ estado: "PRONTO", tentativasCiclo: 0, tentativas: 1 })
  })
})
const G006_URL_WORKER = "postgresql://omni_gastos_worker@127.0.0.1:55516/gastos_g006_test"
