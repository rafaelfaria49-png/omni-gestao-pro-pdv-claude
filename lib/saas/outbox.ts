import { randomUUID } from "node:crypto"
import { Prisma, type PrismaClient } from "@/generated/prisma"
import { renderizarModelo } from "@/lib/saas/email/modelos"
import type { AdaptadorEmail, ResultadoEnvio } from "@/lib/saas/email/tipos"

/**
 * NotificationOutbox — fila persistente no Postgres (SAAS-ADR-06 · arquitetura §8).
 *
 * Garantias (provadas em PG real: lib/saas/saas.pg.test.ts):
 *  · deduplicação: `dedupeKey` UNIQUE — enfileirar duas vezes cria UMA linha;
 *  · exclusão mútua: reivindicação por `FOR UPDATE SKIP LOCKED` + lease (`lockedBy`/`lockedUntil`).
 *    Dois workers simultâneos nunca recebem a mesma linha;
 *  · fencing: o desfecho só é gravado se a linha ainda pertence ao worker (`lockedBy`). Worker que
 *    perdeu o lease não sobrescreve quem reivindicou depois;
 *  · retentativa com espera crescente (1, 2, 4, 8 min… teto 1 h) até `maxTentativas` (5);
 *  · falha permanente → `falhou` na hora;
 *  · recuperação: linha presa em `enviando` com lease vencido (worker morreu) volta a ser
 *    reivindicada.
 *
 * NÃO há exactly-once de entrega externa. Política para resultado DESCONHECIDO (o worker pode ter
 * morrido entre o aceite do provedor e o commit): a repetição usa SEMPRE a mesma chave de
 * idempotência (`outbox:<id>`), que o Resend respeita por 24 h. Passadas 23 h da primeira
 * tentativa, a linha NÃO é reenviada às cegas: vira `falhou` com `resultado_desconhecido`, para
 * conferência manual. Isso vale nos DOIS caminhos do desconhecido: lease vencido em `enviando` e
 * retentativa reagendada (`pendente` com `ultimoErroTipo = desconhecido`) — com o cron diário a
 * retentativa cairia ~24 h depois, fora da janela do provedor (revisão independente, P1).
 * Item reivindicado e não tentado (prazo do ciclo esgotado) devolve a tentativa e volta a
 * `pendente` na hora, quando nunca foi enviado antes.
 *
 * `dedupeKey` é UNIQUE GLOBAL: toda chave deve conter o id da entidade dona (organização,
 * cadastro…), ex.: `trial-d5:<organizationId>`. Chave genérica suprimiria a notificação de outra
 * organização.
 */

export const CANAIS_OUTBOX = ["email", "interno", "whatsapp"] as const
export type CanalOutbox = (typeof CANAIS_OUTBOX)[number]

export const LEASE_PADRAO_MS = 120_000
export const JANELA_IDEMPOTENCIA_HORAS = 23
const BACKOFF_BASE_MS = 60_000
const BACKOFF_TETO_MS = 60 * 60_000

export type OutboxDb = Pick<PrismaClient, "$queryRaw" | "$executeRaw" | "notificationOutbox">

export type NovaNotificacao = {
  dedupeKey: string
  canal: CanalOutbox
  modelo: string
  destino: string
  dados?: Record<string, unknown>
  organizationId?: string | null
  agendadoPara?: Date
  maxTentativas?: number
}

const CHAVE_SENSIVEL = /senha|password|token|secret|segredo|apikey|api_key|cartao|card/i

function contemChaveSensivel(valor: unknown, profundidade = 0): boolean {
  if (profundidade > 5 || !valor || typeof valor !== "object") return false
  if (Array.isArray(valor)) return valor.some((v) => contemChaveSensivel(v, profundidade + 1))
  return Object.entries(valor).some(([k, v]) => CHAVE_SENSIVEL.test(k) || contemChaveSensivel(v, profundidade + 1))
}

export function validarNovaNotificacao(n: NovaNotificacao): string | null {
  if (!n.dedupeKey || n.dedupeKey.trim() !== n.dedupeKey || n.dedupeKey.length > 200) return "dedupe_key_invalida"
  if (!CANAIS_OUTBOX.includes(n.canal)) return "canal_invalido"
  if (!n.modelo.trim() || n.modelo.length > 100) return "modelo_invalido"
  if (!n.destino.trim() || n.destino.length > 320) return "destino_invalido"
  if (contemChaveSensivel(n.dados)) return "dados_sensiveis"
  if (n.maxTentativas !== undefined && (!Number.isInteger(n.maxTentativas) || n.maxTentativas < 1 || n.maxTentativas > 10)) return "max_tentativas_invalido"
  return null
}

/** Idempotente: repetir com a mesma `dedupeKey` não cria linha nova nem altera a existente. */
export async function enfileirarNotificacao(db: OutboxDb, n: NovaNotificacao): Promise<{ id: string; criada: boolean }> {
  const erro = validarNovaNotificacao(n)
  if (erro) throw new Error(`OUTBOX_${erro.toUpperCase()}`)
  const { count } = await db.notificationOutbox.createMany({
    data: [{
      dedupeKey: n.dedupeKey,
      canal: n.canal,
      modelo: n.modelo,
      destino: n.destino,
      dados: (n.dados ?? {}) as Prisma.InputJsonValue,
      organizationId: n.organizationId ?? null,
      ...(n.agendadoPara ? { agendadoPara: n.agendadoPara, proximaTentativaEm: n.agendadoPara } : {}),
      ...(n.maxTentativas ? { maxTentativas: n.maxTentativas } : {}),
    }],
    skipDuplicates: true,
  })
  const linha = await db.notificationOutbox.findUniqueOrThrow({ where: { dedupeKey: n.dedupeKey }, select: { id: true } })
  return { id: linha.id, criada: count === 1 }
}

export function calcularBackoffMs(tentativas: number): number {
  const n = Math.max(1, Math.floor(tentativas))
  return Math.min(BACKOFF_BASE_MS * 2 ** (n - 1), BACKOFF_TETO_MS)
}

export type ItemReivindicado = {
  id: string
  canal: string
  modelo: string
  destino: string
  dados: unknown
  dedupeKey: string
  tentativas: number
  maxTentativas: number
  organizationId: string | null
}

/**
 * Reivindica até `limite` linhas prontas. Uma linha volta a ser elegível se o lease venceu e a
 * janela de idempotência ainda vale. Cada reivindicação conta uma tentativa.
 */
export async function reivindicarLote(db: OutboxDb, opts: { workerId: string; limite: number; leaseMs?: number }): Promise<ItemReivindicado[]> {
  const limite = Math.max(1, Math.min(100, Math.floor(opts.limite)))
  const leaseSeg = (opts.leaseMs ?? LEASE_PADRAO_MS) / 1000
  return db.$queryRaw<ItemReivindicado[]>(Prisma.sql`
    WITH alvo AS (
      SELECT id FROM notification_outbox
      WHERE tentativas < "maxTentativas" AND (
        (status = 'pendente' AND "proximaTentativaEm" <= now()
            -- NULL-safe: linha nova (sem erro, sem 1ª tentativa) sempre elegível.
            AND ("ultimoErroTipo" IS DISTINCT FROM 'desconhecido' OR "primeiraTentativaEm" IS NULL
                 OR "primeiraTentativaEm" > now() - make_interval(hours => ${JANELA_IDEMPOTENCIA_HORAS}::int)))
        OR (status = 'enviando' AND "lockedUntil" < now()
            AND "primeiraTentativaEm" > now() - make_interval(hours => ${JANELA_IDEMPOTENCIA_HORAS}::int))
      )
      ORDER BY "proximaTentativaEm", id
      LIMIT ${limite}::int
      FOR UPDATE SKIP LOCKED
    )
    UPDATE notification_outbox n SET
      historico = CASE WHEN n.status = 'enviando'
        THEN n.historico || jsonb_build_array(jsonb_build_object('em', now(), 'evento', 'lease_expirado', 'worker', n."lockedBy", 'tentativa', n.tentativas))
        ELSE n.historico END,
      status = 'enviando',
      "lockedBy" = ${opts.workerId},
      "lockedUntil" = now() + make_interval(secs => ${leaseSeg}::double precision),
      tentativas = n.tentativas + 1,
      "primeiraTentativaEm" = COALESCE(n."primeiraTentativaEm", now()),
      "ultimaTentativaEm" = now(),
      "updatedAt" = now()
    FROM alvo WHERE n.id = alvo.id
    RETURNING n.id, n.canal, n.modelo, n.destino, n.dados, n."dedupeKey", n.tentativas, n."maxTentativas", n."organizationId"
  `)
}

/**
 * Linhas presas em `enviando` com lease vencido que NÃO podem ser repetidas com segurança
 * (tentativas esgotadas ou fora da janela de idempotência) → `falhou` / resultado desconhecido.
 */
export async function encerrarResultadosDesconhecidos(db: OutboxDb): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE notification_outbox SET
      status = 'falhou', "ultimoErroTipo" = 'desconhecido', "ultimoErro" = 'resultado_desconhecido',
      historico = historico || jsonb_build_array(jsonb_build_object('em', now(), 'evento', 'resultado_desconhecido', 'worker', "lockedBy", 'tentativa', tentativas)),
      "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = now()
    WHERE (status = 'enviando' AND "lockedUntil" < now()
           AND (tentativas >= "maxTentativas" OR "primeiraTentativaEm" <= now() - make_interval(hours => ${JANELA_IDEMPOTENCIA_HORAS}::int)))
       OR (status = 'pendente' AND "ultimoErroTipo" = 'desconhecido'
           AND "primeiraTentativaEm" <= now() - make_interval(hours => ${JANELA_IDEMPOTENCIA_HORAS}::int))
  `)
}

/**
 * Devolve itens reivindicados e NÃO tentados neste ciclo (prazo esgotado). Só os que estão na 1ª
 * tentativa — nunca enviados — voltam a `pendente` sem gastar tentativa; os demais seguem o
 * caminho do lease (o resultado da tentativa anterior é desconhecido). Fencing por `lockedBy`.
 */
export async function liberarNaoTentados(db: OutboxDb, ids: string[], workerId: string): Promise<number> {
  if (ids.length === 0) return 0
  return db.$executeRaw(Prisma.sql`
    UPDATE notification_outbox SET status = 'pendente', tentativas = 0, "primeiraTentativaEm" = NULL, "ultimaTentativaEm" = NULL,
      "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = now()
    WHERE id IN (${Prisma.join(ids)}) AND status = 'enviando' AND "lockedBy" = ${workerId} AND tentativas = 1`)
}

export type DesfechoGravado = "enviado" | "registrado" | "reagendado" | "falhou" | "lease_perdido"

/** Grava o desfecho com fencing pelo `workerId`. */
export async function concluirTentativa(db: OutboxDb, item: ItemReivindicado, workerId: string, r: ResultadoEnvio): Promise<DesfechoGravado> {
  const evento = (extra: Record<string, unknown>) => JSON.stringify([{ em: new Date().toISOString(), worker: workerId, tentativa: item.tentativas, ...extra }])
  let desfecho: Exclude<DesfechoGravado, "lease_perdido">
  let afetadas: number
  if (r.ok) {
    desfecho = r.enviadoDeVerdade ? "enviado" : "registrado"
    afetadas = await db.$executeRaw(Prisma.sql`
      UPDATE notification_outbox SET status = ${desfecho}, provedor = ${r.provedor}, "provedorMensagemId" = ${r.mensagemId},
        "enviadoEm" = ${r.enviadoDeVerdade ? Prisma.sql`now()` : Prisma.sql`NULL`},
        "ultimoErro" = NULL, "ultimoErroTipo" = NULL, "lockedBy" = NULL, "lockedUntil" = NULL,
        historico = historico || ${evento({ evento: desfecho, provedor: r.provedor })}::jsonb, "updatedAt" = now()
      WHERE id = ${item.id} AND status = 'enviando' AND "lockedBy" = ${workerId}`)
  } else if (r.tipo === "permanente" || item.tentativas >= item.maxTentativas) {
    desfecho = "falhou"
    afetadas = await db.$executeRaw(Prisma.sql`
      UPDATE notification_outbox SET status = 'falhou', "ultimoErro" = ${r.codigo}, "ultimoErroTipo" = ${r.tipo},
        "lockedBy" = NULL, "lockedUntil" = NULL,
        historico = historico || ${evento({ evento: "falhou", tipo: r.tipo, codigo: r.codigo })}::jsonb, "updatedAt" = now()
      WHERE id = ${item.id} AND status = 'enviando' AND "lockedBy" = ${workerId}`)
  } else {
    desfecho = "reagendado"
    const esperaSeg = calcularBackoffMs(item.tentativas) / 1000
    afetadas = await db.$executeRaw(Prisma.sql`
      UPDATE notification_outbox SET status = 'pendente', "ultimoErro" = ${r.codigo}, "ultimoErroTipo" = ${r.tipo},
        "proximaTentativaEm" = now() + make_interval(secs => ${esperaSeg}::double precision),
        "lockedBy" = NULL, "lockedUntil" = NULL,
        historico = historico || ${evento({ evento: "reagendado", tipo: r.tipo, codigo: r.codigo })}::jsonb, "updatedAt" = now()
      WHERE id = ${item.id} AND status = 'enviando' AND "lockedBy" = ${workerId}`)
  }
  return afetadas === 1 ? desfecho : "lease_perdido"
}

export type ResumoOutbox = {
  reivindicadas: number
  enviadas: number
  registradas: number
  reagendadas: number
  falhas: number
  leasesPerdidos: number
  resultadosDesconhecidosEncerrados: number
  devolvidosSemTentativa: number
  interrompidoPorPrazo: boolean
}

async function entregar(item: ItemReivindicado, email: AdaptadorEmail): Promise<ResultadoEnvio> {
  if (item.canal !== "email") return { ok: false, tipo: "permanente", codigo: "canal_nao_suportado" }
  const conteudo = renderizarModelo(item.modelo, item.dados)
  if (!conteudo) return { ok: false, tipo: "permanente", codigo: "modelo_desconhecido" }
  try {
    return await email.enviar({ para: item.destino, assunto: conteudo.assunto, texto: conteudo.texto, idempotencyKey: `outbox:${item.id}` })
  } catch {
    return { ok: false, tipo: "desconhecido", codigo: "adaptador_lancou" }
  }
}

/** Um ciclo do worker: limitado por quantidade total e por prazo. */
export async function processarOutbox(
  db: OutboxDb,
  email: AdaptadorEmail,
  opts: { workerId?: string; lote?: number; limiteTotal?: number; prazoMs?: number; leaseMs?: number; relogioMs?: () => number } = {},
): Promise<ResumoOutbox> {
  const workerId = opts.workerId ?? `w-${randomUUID()}`
  const lote = opts.lote ?? 10
  const limiteTotal = opts.limiteTotal ?? 50
  const relogio = opts.relogioMs ?? Date.now
  const prazo = relogio() + (opts.prazoMs ?? 40_000)
  const resumo: ResumoOutbox = { reivindicadas: 0, enviadas: 0, registradas: 0, reagendadas: 0, falhas: 0, leasesPerdidos: 0, resultadosDesconhecidosEncerrados: 0, devolvidosSemTentativa: 0, interrompidoPorPrazo: false }

  resumo.resultadosDesconhecidosEncerrados = await encerrarResultadosDesconhecidos(db)
  while (resumo.reivindicadas < limiteTotal) {
    if (relogio() >= prazo) { resumo.interrompidoPorPrazo = true; break }
    const itens = await reivindicarLote(db, { workerId, limite: Math.min(lote, limiteTotal - resumo.reivindicadas), leaseMs: opts.leaseMs })
    if (itens.length === 0) break
    resumo.reivindicadas += itens.length
    for (const [i, item] of itens.entries()) {
      if (relogio() >= prazo) {
        resumo.interrompidoPorPrazo = true
        resumo.devolvidosSemTentativa += await liberarNaoTentados(db, itens.slice(i).map((x) => x.id), workerId)
        break
      }
      const d = await concluirTentativa(db, item, workerId, await entregar(item, email))
      if (d === "enviado") resumo.enviadas++
      else if (d === "registrado") resumo.registradas++
      else if (d === "reagendado") resumo.reagendadas++
      else if (d === "falhou") resumo.falhas++
      else resumo.leasesPerdidos++
    }
    if (resumo.interrompidoPorPrazo) break
  }
  return resumo
}
