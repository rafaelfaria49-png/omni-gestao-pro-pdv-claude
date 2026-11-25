import { randomUUID } from "node:crypto"
import type { Prisma } from "@/generated/prisma"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { credenciaisDoCanal, exigirPapelSql } from "./channels"
import { exigirId, MensageriaError, type MensageriaClient, type MensageriaDb, type VerificadorVinculo } from "./messaging-types"
import { exigirLease, falharJob, type Claim } from "./queue"
import { decidirFalha, type FalhaTransporte } from "./retry"

async function autorizarEscopo(tx: MensageriaDb, userId: string, perfilId: string, storeId: string | null) {
  // FOR SHARE exige privilégio UPDATE em PostgreSQL. O helper SQL estreito toma
  // esses locks sem conceder escrita financeira/auth ao login do worker.
  const [r] = await tx.$queryRaw<Array<{ autorizado: boolean; papel: string | null }>>`
    SELECT * FROM g006_autorizar_escopo(${userId},${perfilId},${storeId})`
  if (!r?.autorizado || !r.papel || !getEnterprisePermissions(r.papel).financeiro.edit) throw new MensageriaError("ACESSO_REVOGADO")
}

async function mensagemComVinculo(tx: MensageriaDb, inboxId: string, verificar: VerificadorVinculo | undefined) {
  if (!verificar) throw new MensageriaError("VINCULO_AUSENTE")
  const [c] = await tx.$queryRaw<Array<{ valido: boolean }>>`SELECT g006_canal_vigente(${inboxId}) AS valido`
  if (!c?.valido) throw new MensageriaError("CANAL_ALTERADO")
  const inbox = await tx.whatsAppGestaoInbox.findUnique({ where: { id: inboxId }, include: { canal: true } })
  if (!inbox || inbox.canal.papel !== "GESTAO" || !inbox.canal.ativo || inbox.canal.versao !== inbox.canalVersao
    || inbox.canal.phoneNumberId !== inbox.phoneNumberId) throw new MensageriaError("CANAL_ALTERADO")
  const vinculo = await verificar({ canalId: inbox.canalId, phoneNumberId: inbox.phoneNumberId, remetenteE164: inbox.remetenteE164 }, tx)
  if (!vinculo || !Number.isSafeInteger(vinculo.versao) || vinculo.versao < 1) throw new MensageriaError("VINCULO_AUSENTE")
  exigirId(vinculo.userId); exigirId(vinculo.bindingRef)
  return { inbox, vinculo }
}

/** Registrar antes da aplicação G004: mesmo grupo é sempre ligado à mesma origem.
 * O port G007 deve validar/lockar binding dentro de tx; fixtures o simulam explicitamente.
 */
export async function registrarOrigemCanal(db: MensageriaClient, input: { inboxId: string; perfilId: string; storeId: string | null; grupoChave: string }, verificar?: VerificadorVinculo) {
  exigirId(input.inboxId); exigirId(input.perfilId); exigirId(input.grupoChave)
  return db.$transaction(async tx => {
    const { inbox, vinculo } = await mensagemComVinculo(tx, input.inboxId, verificar)
    await autorizarEscopo(tx, vinculo.userId, input.perfilId, input.storeId)
    const data = { id: randomUUID(), inboxId: inbox.id, perfilId: input.perfilId, storeId: input.storeId,
      autorAdminUserId: vinculo.userId, grupoChave: input.grupoChave, bindingRef: vinculo.bindingRef, bindingVersao: vinculo.versao }
    await tx.gastoOrigemCanal.createMany({ data: [data], skipDuplicates: true })
    const row = await tx.gastoOrigemCanal.findUniqueOrThrow({ where: { perfilId_grupoChave: { perfilId: input.perfilId, grupoChave: input.grupoChave } } })
    if (row.inboxId !== data.inboxId || row.autorAdminUserId !== data.autorAdminUserId || row.bindingRef !== data.bindingRef
      || row.bindingVersao !== data.bindingVersao || row.storeId !== data.storeId) throw new MensageriaError("ORIGEM_INVALIDA")
    return row
  })
}

/** Só SELECT de fatos financeiros. Um job único por outbox, após visibilidade do COMMIT. */
export async function prepararOutbox(db: MensageriaClient, limite = 25) {
  if (!Number.isSafeInteger(limite) || limite < 1 || limite > 100) throw new MensageriaError("CONFIG_INVALIDA")
  return db.$transaction(async tx => {
    const candidatos = await tx.$queryRaw<Array<{ outboxId: string; origemId: string }>>`SELECT o.id AS "outboxId",r.id AS "origemId"
      FROM gastos_outbox o JOIN financeiro_operacoes op ON op.id=o."operacaoId" AND op.estado='APLICADA'
      JOIN gastos_origens_canal r ON r."perfilId"=op."perfilId" AND r."grupoChave"=op."grupoChave"
        AND r."autorAdminUserId"=op."autorAdminUserId" AND r."storeId" IS NOT DISTINCT FROM op."storeId"
        AND r."createdAt"<=op."createdAt" AT TIME ZONE 'UTC'
      WHERE op.resultado=o.payload AND op."concluidaEm" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gastos_jobs j WHERE j."outboxId"=o.id)
      ORDER BY o."createdAt",o.id LIMIT ${limite}`
    const result = await tx.gastoJob.createMany({ data: candidatos.map(c => ({ id: randomUUID(), chave: `outbox:${c.outboxId}`,
      tipo: "ENVIAR_RESULTADO", outboxId: c.outboxId, origemId: c.origemId })), skipDuplicates: true })
    return result.count
  })
}

export type MensagemResultado = Readonly<{
  canalId: string; phoneNumberId: string; wabaId: string; appId: string; destinatarioE164: string;
  credenciais: { phoneNumberId: string; accessToken: string };
  payload: { versao: "g006-1"; tipo: "RESULTADO_PERSISTIDO"; operacaoId: string; resultado: Prisma.JsonObject };
}>
/** G007: CONFIG/PAYLOAD/POISON só comprovam rejeição antes de qualquer byte
 * enviado. Após essa fronteira, qualquer dúvida deve ser TIMEOUT/DESCONHECIDA.
 * O G006 só aceita o port SIMULADO; não há implementação Meta aqui.
 */
export type TransporteSimulado = { modo: "SIMULADO"; enviar: (mensagem: MensagemResultado, signal?: AbortSignal) => Promise<
  { tipo: "ACEITO"; externalMessageId: string } | { tipo: "FALHA"; falha: FalhaTransporte }> }
export type DependenciasEnvio = { verificarVinculo?: VerificadorVinculo; transporte?: TransporteSimulado; env: Record<string, string | undefined>; timeoutMs?: number }

async function iniciarEnvio(db: MensageriaClient, claim: Claim, deps: DependenciasEnvio) {
  if (deps.transporte?.modo !== "SIMULADO") throw new MensageriaError("CONFIG_INVALIDA")
  return db.$transaction(async tx => {
    const job = await exigirLease(tx, claim)
    if (job.tipo !== "ENVIAR_RESULTADO" || !job.origemId || !job.outboxId || !["NAO_INICIADO", "REJEITADO"].includes(job.envioEstado)) throw new MensageriaError("POISON_JOB")
    const origem = await tx.gastoOrigemCanal.findUniqueOrThrow({ where: { id: job.origemId } })
    const { inbox, vinculo } = await mensagemComVinculo(tx, origem.inboxId, deps.verificarVinculo)
    if (vinculo.userId !== origem.autorAdminUserId || vinculo.bindingRef !== origem.bindingRef || vinculo.versao !== origem.bindingVersao) throw new MensageriaError("ACESSO_REVOGADO")
    await autorizarEscopo(tx, vinculo.userId, origem.perfilId, origem.storeId)
    const outbox = await tx.gastoOutbox.findUniqueOrThrow({ where: { id: job.outboxId }, include: { operacao: true } })
    const op = outbox.operacao, resultado = outbox.payload as Prisma.JsonObject
    if (op.estado !== "APLICADA" || !op.concluidaEm || op.perfilId !== origem.perfilId || op.storeId !== origem.storeId
      || origem.createdAt.getTime() > op.createdAt.getTime()
      || op.autorAdminUserId !== origem.autorAdminUserId || op.grupoChave !== origem.grupoChave
      || resultado?.estado !== "APLICADA" || resultado.operacaoId !== op.id) throw new MensageriaError("RESULTADO_INVALIDO")
    const credenciais = credenciaisDoCanal(inbox.canal, deps.env)
    const mensagem: MensagemResultado = { canalId: inbox.canalId, phoneNumberId: inbox.phoneNumberId, wabaId: inbox.canal.wabaId,
      appId: inbox.canal.appId, destinatarioE164: inbox.remetenteE164, credenciais,
      payload: { versao: "g006-1", tipo: "RESULTADO_PERSISTIDO", operacaoId: op.id, resultado } }
    const n = await tx.$executeRaw`UPDATE gastos_jobs SET "envioEstado"='INICIADO',"updatedAt"=clock_timestamp()
      WHERE id=${claim.id} AND "leaseToken"=${claim.leaseToken} AND "leaseUntil">clock_timestamp()`
    if (n !== 1) throw new MensageriaError("LEASE_PERDIDA")
    return mensagem
  })
}

/** Não importa sendTextMessage/fetch: somente transporte de teste explicitamente injetado. */
export async function executarEnvio(db: MensageriaClient, claim: Claim, deps: DependenciasEnvio, signal?: AbortSignal) {
  let iniciou = false
  try {
    const mensagem = await iniciarEnvio(db, claim, deps)
    iniciou = true
    // Revalida a posse após COMMIT de INICIADO, imediatamente antes do port externo.
    await db.$transaction(tx => exigirLease(tx, claim))
    if (signal?.aborted) throw new MensageriaError("TIMEOUT")
    const timeoutMs = deps.timeoutMs ?? 10_000
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new MensageriaError("CONFIG_INVALIDA")
    const cancelar = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let abortar: (() => void) | undefined
    const limite = new Promise<never>((_, reject) => {
      abortar = () => { cancelar.abort(); reject(new MensageriaError("TIMEOUT")) }
      signal?.addEventListener("abort", abortar, { once: true })
      timer = setTimeout(abortar, timeoutMs)
    })
    const resposta = await Promise.race([Promise.resolve().then(() => deps.transporte!.enviar(mensagem, cancelar.signal)), limite]).finally(() => {
      clearTimeout(timer); if (abortar) signal?.removeEventListener("abort", abortar)
    })
    if (resposta.tipo === "FALHA") {
      await falharJob(db, claim, decidirFalha(resposta.falha, claim.tentativasCiclo, true), true)
      return
    }
    exigirId(resposta.externalMessageId)
    await db.$transaction(async tx => {
      await exigirLease(tx, claim)
      const resultado = JSON.stringify({ codigo: "ENVIO_ACEITO", operacaoId: mensagem.payload.operacaoId, outboxId: claim.outboxId, prova: "SIMULADA" })
      const n = await tx.$executeRaw`UPDATE gastos_jobs SET estado='CONCLUIDO',"envioEstado"='ACEITO',"externalMessageId"=${resposta.externalMessageId},
        resultado=${resultado}::jsonb,"falhaCodigo"=NULL,"leaseOwner"=NULL,"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=clock_timestamp()
        WHERE id=${claim.id} AND "leaseToken"=${claim.leaseToken} AND "leaseUntil">clock_timestamp()`
      if (n !== 1) throw new MensageriaError("LEASE_PERDIDA")
    })
  } catch (error) {
    if (error instanceof MensageriaError && error.codigo === "LEASE_PERDIDA") throw error
    const codigo = error instanceof MensageriaError ? error.codigo : "TEMPORARIO"
    if (iniciou) await falharJob(db, claim, decidirFalha({ tipo: "DESCONHECIDA" }, claim.tentativasCiclo, true), true)
    else await falharJob(db, claim, codigo === "TEMPORARIO" ? decidirFalha({ tipo: "TEMPORARIA_LOCAL" }, claim.tentativasCiclo, false)
      : { acao: "DLQ", codigo, esperaMs: 0 })
  }
}

export type ProvaSimulada = { modo: "SIMULADO"; jobId: string; canalId: string; evidenciaRef: string;
  estado: "NAO_ENVIADO" | "ACEITO" | "ENTREGUE"; externalMessageId?: string }

/** Port de reconciliação sem rota pública; G007 precisa fornecer prova real do provider.
 * Sem prova explícita NÃO libera retry de envio incerto.
 */
export async function reconciliarEnvio(db: MensageriaClient, jobId: string, buscarProva: () => Promise<ProvaSimulada>) {
  await exigirPapelSql(db, "omni_gastos_operator")
  const prova = await buscarProva()
  if (prova.modo !== "SIMULADO" || prova.jobId !== jobId) throw new MensageriaError("OPERADOR_NEGADO")
  exigirId(prova.evidenciaRef)
  if (prova.estado !== "NAO_ENVIADO" && !prova.externalMessageId) throw new MensageriaError("RESULTADO_INVALIDO")
  return db.$transaction(async tx => {
    // Operador não lê conteúdo privado: somente a identidade técnica do canal.
    const rows = await tx.$queryRaw<Array<{ canalId: string; externalMessageId: string | null; envioEstado: string; estado: string }>>`SELECT i."canalId",j."externalMessageId",j."envioEstado",j.estado
      FROM gastos_jobs j JOIN gastos_origens_canal r ON r.id=j."origemId" JOIN whatsapp_gestao_inbox i ON i.id=r."inboxId"
      WHERE j.id=${jobId} AND j.estado IN ('ENVIO_INCERTO','CONCLUIDO') FOR UPDATE OF j`
    const row = rows[0]
    if (!row || row.canalId !== prova.canalId || (row.externalMessageId && row.externalMessageId !== prova.externalMessageId)) throw new MensageriaError("RESULTADO_INVALIDO")
    if (!["NAO_ENVIADO", "ACEITO", "ENTREGUE"].includes(prova.estado)
      || (prova.estado === "NAO_ENVIADO" && (row.estado !== "ENVIO_INCERTO" || prova.externalMessageId))
      || (row.envioEstado === "ENTREGUE" && prova.estado !== "ENTREGUE")) throw new MensageriaError("RESULTADO_INVALIDO")
    if (prova.externalMessageId) exigirId(prova.externalMessageId)
    const nao = prova.estado === "NAO_ENVIADO", entregue = prova.estado === "ENTREGUE"
    await tx.$executeRaw`UPDATE gastos_jobs SET estado=CASE WHEN ${nao} THEN 'ESTACIONADO' ELSE 'CONCLUIDO' END,
      "envioEstado"=CASE WHEN ${nao} THEN 'REJEITADO' WHEN ${entregue} THEN 'ENTREGUE' ELSE 'ACEITO' END,
      "externalMessageId"=${prova.externalMessageId ?? null},"reconciliacaoRef"=${prova.evidenciaRef},
      "falhaCodigo"=CASE WHEN ${nao} THEN 'NAO_ENVIADO_COMPROVADO' ELSE NULL END,"updatedAt"=clock_timestamp()
      WHERE id=${jobId}`
    await tx.gastoJobEvento.create({ data: { jobId, tipo: nao ? "ESTACIONADO" : "CONCLUIDO", codigo: nao ? "NAO_ENVIADO_COMPROVADO" : entregue ? "ENTREGA_CONFIRMADA" : "ENVIO_ACEITO",
      tentativa: (await tx.gastoJob.findUniqueOrThrow({ where: { id: jobId }, select: { tentativas: true } })).tentativas, evidenciaRef: prova.evidenciaRef } })
  })
}
