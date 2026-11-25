import { randomUUID } from "node:crypto"
import { resolverConfiguracaoEmail, type ModoEmail } from "@/lib/saas/email/config"
import { processarOutbox, type OutboxDb, type ResumoOutbox } from "@/lib/saas/outbox"

/**
 * Tarefas do cron comercial (`/api/cron/saas`).
 *
 * SAAS-001A executa SÓ o processamento da outbox. Em modo registro (padrão) nada é enviado; e
 * nenhuma tarefa aqui altera acesso de cliente nem cobra nada. Tarefas futuras (materializar
 * `trialing → trial_expired`, limpar cadastros vencidos, conciliação) entram nesta lista nos
 * GOALs 001B/002/003 — o acesso NUNCA depende do cron (arquitetura §6.2).
 *
 * Concorrência entre execuções: duas invocações simultâneas são seguras porque a outbox
 * reivindica linhas com FOR UPDATE SKIP LOCKED + lease — elas dividem o trabalho, nunca o
 * duplicam. Não há trava de sessão (advisory lock de sessão não é confiável atrás de pooler).
 */

export const CRON_PRAZO_MS = 40_000
export const CRON_LIMITE_TOTAL = 50
export const CRON_LOTE = 10

export type ResumoCronSaas = { execucao: string; emailModo: ModoEmail; outbox: ResumoOutbox }

export async function executarCronSaas(db: OutboxDb, env: Record<string, string | undefined> = process.env): Promise<ResumoCronSaas> {
  const execucao = `cron-${randomUUID()}`
  const email = resolverConfiguracaoEmail(env)
  const outbox = await processarOutbox(db, email.adaptador, {
    workerId: execucao,
    lote: CRON_LOTE,
    limiteTotal: CRON_LIMITE_TOTAL,
    prazoMs: CRON_PRAZO_MS,
  })
  return { execucao, emailModo: email.modo, outbox }
}
