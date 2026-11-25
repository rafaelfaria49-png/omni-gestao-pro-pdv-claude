import { randomUUID } from "node:crypto"
import type { GastoJob } from "@/generated/prisma"
import { exigirPapelSql } from "./channels"
import { exigirId, MensageriaError, type MensageriaClient, type MensageriaDb } from "./messaging-types"
import type { DecisaoFalha } from "./retry"

export type Claim = GastoJob & { leaseOwner: string; leaseToken: string; leaseUntil: Date }

/** Não assume posse pelo owner: cada claim recebe token novo, inclusive após reinício. */
export async function claimJob(db: MensageriaClient, owner: string, leaseMs = 30_000, permitirEnvio = false): Promise<Claim | null> {
  exigirId(owner)
  if (owner.length > 191 || !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 300_000) throw new MensageriaError("CONFIG_INVALIDA")
  return db.$transaction(async tx => {
    // A queda após persistir INICIADO pode ter ocorrido depois do aceite externo.
    await tx.$executeRaw`UPDATE gastos_jobs SET estado='ENVIO_INCERTO',"envioEstado"='ENVIO_INCERTO',"falhaCodigo"='ENVIO_INCERTO',
      "leaseOwner"=NULL,"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=clock_timestamp()
      WHERE estado='PROCESSANDO' AND "leaseUntil"<=clock_timestamp() AND "envioEstado"='INICIADO'`
    await tx.$executeRaw`UPDATE gastos_jobs SET estado='ESTACIONADO',"falhaCodigo"=CASE WHEN "prazoEm"<=clock_timestamp()
      THEN 'PRAZO_ESGOTADO' ELSE 'LIMITE_TENTATIVAS' END,"leaseOwner"=NULL,"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=clock_timestamp()
      WHERE estado IN ('PRONTO','RETENTAVEL','PROCESSANDO') AND (estado<>'PROCESSANDO' OR "leaseUntil"<=clock_timestamp())
      AND ("tentativasCiclo">="limiteTentativas" OR "prazoEm"<=clock_timestamp()) AND "envioEstado"<>'INICIADO'`
    const token = randomUUID()
    const rows = await tx.$queryRaw<Claim[]>`WITH escolhido AS (
      SELECT id FROM gastos_jobs WHERE (estado IN ('PRONTO','RETENTAVEL') OR (estado='PROCESSANDO' AND "leaseUntil"<=clock_timestamp()))
        AND "runAfter"<=clock_timestamp() AND "prazoEm">clock_timestamp() AND "tentativasCiclo"<"limiteTentativas"
        AND "envioEstado" IN ('NAO_INICIADO','REJEITADO') AND (tipo='STAGING' OR ${permitirEnvio})
      ORDER BY "runAfter","createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE gastos_jobs j SET estado='PROCESSANDO',tentativas=j.tentativas+1,"tentativasCiclo"=j."tentativasCiclo"+1,
      "leaseOwner"=${owner},"leaseToken"=${token},"leaseUntil"=LEAST(j."prazoEm",clock_timestamp()+${leaseMs}*interval '1 millisecond'),
      "falhaCodigo"=CASE WHEN j.estado='PROCESSANDO' THEN 'LEASE_RECUPERADA' ELSE NULL END,"updatedAt"=clock_timestamp()
      FROM escolhido e WHERE j.id=e.id RETURNING j.*`
    return rows[0] ?? null
  })
}

export async function renovarLease(db: MensageriaDb, claim: Claim, leaseMs: number) {
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 300_000) throw new MensageriaError("CONFIG_INVALIDA")
  const n = await db.$executeRaw`UPDATE gastos_jobs SET "leaseUntil"=LEAST("prazoEm",clock_timestamp()+${leaseMs}*interval '1 millisecond'),"updatedAt"=clock_timestamp()
    WHERE id=${claim.id} AND estado='PROCESSANDO' AND "leaseOwner"=${claim.leaseOwner} AND "leaseToken"=${claim.leaseToken} AND "leaseUntil">clock_timestamp()`
  if (n !== 1) throw new MensageriaError("LEASE_PERDIDA")
}

export async function exigirLease(tx: MensageriaDb, claim: Claim) {
  const rows = await tx.$queryRaw<GastoJob[]>`SELECT * FROM gastos_jobs WHERE id=${claim.id} AND estado='PROCESSANDO'
    AND "leaseOwner"=${claim.leaseOwner} AND "leaseToken"=${claim.leaseToken} AND "leaseUntil">clock_timestamp() FOR UPDATE`
  if (!rows[0]) throw new MensageriaError("LEASE_PERDIDA")
  return rows[0]
}

export async function concluirStaging(db: MensageriaClient, claim: Claim) {
  return db.$transaction(async tx => {
    const row = await exigirLease(tx, claim)
    if (row.tipo !== "STAGING" || !row.inboxId) throw new MensageriaError("POISON_JOB")
    const inbox = await tx.whatsAppGestaoInbox.findUniqueOrThrow({ where: { id: row.inboxId }, select: { conteudo: true } })
    const conteudo = inbox.conteudo
    if (!conteudo || typeof conteudo !== "object" || Array.isArray(conteudo)
      || !["texto", "audio", "foto", "tecnico"].includes(String(conteudo.tipo))) throw new MensageriaError("POISON_JOB")
    await tx.whatsAppGestaoInbox.update({ where: { id: row.inboxId }, data: { estado: "AGUARDANDO_VINCULO" } })
    const n = await tx.$executeRaw`UPDATE gastos_jobs SET estado='CONCLUIDO',resultado='{"codigo":"STAGING_PRIVADO"}'::jsonb,
      "falhaCodigo"=NULL,"leaseOwner"=NULL,"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=clock_timestamp()
      WHERE id=${claim.id} AND "leaseToken"=${claim.leaseToken} AND "leaseUntil">clock_timestamp()`
    if (n !== 1) throw new MensageriaError("LEASE_PERDIDA")
    return { codigo: "STAGING_PRIVADO" as const }
  })
}

export async function falharJob(db: MensageriaClient, claim: Claim, decisao: DecisaoFalha, houveTentativaExterna = false) {
  return db.$transaction(async tx => {
    const row = await exigirLease(tx, claim)
    // Resposta perdida no COMMIT de INICIADO também é uma tentativa incerta.
    const incerto = decisao.acao === "INCERTO" || (row.envioEstado === "INICIADO" && !houveTentativaExterna)
    const retry = decisao.acao === "RETRY" && !incerto
    const n = await tx.$executeRaw`UPDATE gastos_jobs SET estado=CASE WHEN ${incerto} THEN 'ENVIO_INCERTO'
      WHEN NOT ${retry} THEN 'ESTACIONADO' WHEN "tentativasCiclo">="limiteTentativas" OR "prazoEm"<=clock_timestamp()+${decisao.esperaMs}*interval '1 millisecond'
      THEN 'ESTACIONADO' ELSE 'RETENTAVEL' END,
      "envioEstado"=CASE WHEN ${incerto} THEN 'ENVIO_INCERTO' WHEN ${houveTentativaExterna} THEN 'REJEITADO' ELSE "envioEstado" END,
      "falhaCodigo"=CASE WHEN ${incerto} AND ${decisao.acao} <> 'INCERTO' THEN 'ENVIO_INCERTO'
        WHEN ${retry} AND "tentativasCiclo">="limiteTentativas" THEN 'LIMITE_TENTATIVAS'
        WHEN ${retry} AND "prazoEm"<=clock_timestamp()+${decisao.esperaMs}*interval '1 millisecond' THEN 'PRAZO_ESGOTADO' ELSE ${decisao.codigo} END,
      "runAfter"=clock_timestamp()+${decisao.esperaMs}*interval '1 millisecond',
      "leaseOwner"=NULL,"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=clock_timestamp()
      WHERE id=${claim.id} AND "leaseToken"=${claim.leaseToken} AND "leaseUntil">clock_timestamp()`
    if (n !== 1) throw new MensageriaError("LEASE_PERDIDA")
  })
}

export async function reprocessarJob(db: MensageriaClient, jobId: string, motivo: "CONFIG_CORRIGIDA" | "PROVEDOR_RESTAURADO" | "REVISAO_TECNICA") {
  if (!["CONFIG_CORRIGIDA", "PROVEDOR_RESTAURADO", "REVISAO_TECNICA"].includes(motivo)) throw new MensageriaError("OPERADOR_NEGADO")
  return db.$transaction(async tx => {
    await exigirPapelSql(tx, "omni_gastos_operator")
    const rows = await tx.$queryRaw<Array<{ id: string; tentativas: number }>>`UPDATE gastos_jobs SET estado='PRONTO',"tentativasCiclo"=0,
      "runAfter"=clock_timestamp(),"prazoEm"=clock_timestamp()+interval '24 hours',"falhaCodigo"='REPROCESSAMENTO_AUTORIZADO',"updatedAt"=clock_timestamp()
      WHERE id=${jobId} AND estado='ESTACIONADO' AND "envioEstado" IN ('NAO_INICIADO','REJEITADO') RETURNING id,tentativas`
    if (!rows[0]) throw new MensageriaError("OPERADOR_NEGADO")
    await tx.gastoJobEvento.create({ data: { jobId, tipo: "PRONTO", codigo: motivo, tentativa: rows[0].tentativas } })
    return { jobId, tentativas: rows[0].tentativas }
  })
}
