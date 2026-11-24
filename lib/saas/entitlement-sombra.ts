import { lerSaasFlags } from "@/lib/saas/flags"
import {
  paraClaim,
  resolverEntitlement,
  type AssinaturaEntitlementInput,
  type ModoAcesso,
  type MotivoEntitlement,
  type StoreEntitlementClaim,
} from "@/lib/saas/entitlement"

/**
 * Entitlement em MODO SOMBRA no callback `jwt` (OMNI-SAAS-001A).
 *
 * Calcula `token.storeEntitlements` e REGISTRA as decisões que teriam limitado ou bloqueado o
 * acesso — sem aplicar nenhuma. Garantias:
 *   · nunca lança: qualquer falha (inclusive coluna ausente num banco sem a migration) devolve
 *     `undefined` e o login segue exatamente como antes;
 *   · lojas legadas (`organizationId = NULL`) resolvem `pleno/legado` e NÃO entram no claim:
 *     mapa presente + loja ausente = legado (custo zero no cookie para os clientes atuais);
 *     mapa ausente = não calculado;
 *   · tempo limite de `TEMPO_LIMITE_SOMBRA_MS`: banco lento nunca segura o login por mais que isso;
 *   · custo: 1 consulta indexada (`stores.id IN … AND organizationId IS NOT NULL`); quando há
 *     loja com organização, o Prisma acrescenta 2 consultas em lote (organizations, subscriptions)
 *     — constante, sem N+1;
 *   · `SAAS_ENTITLEMENT_ENFORCE=on` é IGNORADO no SAAS-001A (só gera um aviso).
 */

export const SELECT_ASSINATURA_ENTITLEMENT = {
  organizationId: true,
  planoId: true,
  status: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  graceEndsAt: true,
  suspendedMode: true,
  limitedSince: true,
  limiteUsuariosPorLoja: true,
  cortesiaAte: true,
} as const

type LojaComAssinatura = {
  id: string
  organizationId: string | null
  organization: { subscription: AssinaturaEntitlementInput | null } | null
}

/** Porta mínima do banco (facilita teste e evita acoplar ao PrismaClient inteiro). */
export type EntitlementDb = {
  store: {
    findMany(args: {
      where: { id: { in: string[] }; organizationId: { not: null } }
      select: {
        id: true
        organizationId: true
        organization: { select: { subscription: { select: typeof SELECT_ASSINATURA_ENTITLEMENT } } }
      }
    }): Promise<LojaComAssinatura[]>
  }
}

type Log = (linha: string) => void

export const TEMPO_LIMITE_SOMBRA_MS = 1500

export async function calcularEntitlementsSombra(
  db: EntitlementDb,
  storeIds: readonly string[],
  opcoes: { agora?: Date; env?: Record<string, string | undefined>; log?: Log; logErro?: Log; tempoLimiteMs?: number } = {},
): Promise<Record<string, StoreEntitlementClaim> | undefined> {
  const log = opcoes.log ?? ((l) => console.info(l))
  const logErro = opcoes.logErro ?? ((l) => console.error(l))
  try {
    const agora = opcoes.agora ?? new Date()
    const flags = lerSaasFlags(opcoes.env)
    if (flags.entitlementEnforceSolicitado) avisarEnforceIgnorado(log)

    const ids = [...new Set(storeIds)]
    const claims: Record<string, StoreEntitlementClaim> = {}
    if (ids.length === 0) return claims

    const consulta = db.store.findMany({
      where: { id: { in: ids }, organizationId: { not: null } },
      select: {
        id: true,
        organizationId: true,
        organization: { select: { subscription: { select: SELECT_ASSINATURA_ENTITLEMENT } } },
      },
    })
    let relogioLimite: ReturnType<typeof setTimeout> | undefined
    const limite = new Promise<never>((_, rejeitar) => { relogioLimite = setTimeout(() => rejeitar(new Error("tempo_limite")), opcoes.tempoLimiteMs ?? TEMPO_LIMITE_SOMBRA_MS) })
    consulta.catch(() => {})
    const comOrganizacao = await Promise.race([consulta, limite]).finally(() => clearTimeout(relogioLimite))
    const porLoja = new Map(comOrganizacao.map((l) => [l.id, l]))

    for (const id of ids) {
      const loja = porLoja.get(id)
      if (!loja) continue // legado: ausência no mapa calculado = pleno/legado
      const entitlement = resolverEntitlement({ organizationId: loja.organizationId }, loja.organization?.subscription ?? null, agora)
      claims[id] = paraClaim(entitlement)
      if (entitlement.modo !== "pleno") observarDecisaoSombra(id, entitlement.modo, entitlement.motivo, agora.getTime(), log)
    }
    return claims
  } catch {
    // Sem detalhes: a mensagem do Prisma pode carregar dados da linha.
    registrarFalhaSombra(Date.now(), logErro)
    return undefined
  }
}

// ─── Observabilidade (sem PII: id interno da loja, modo e motivo) ─────────────────────────────
//
// Serverless: cada instância tem memória própria e efêmera (cold start zera tudo). Por isso a
// fonte de verdade para decidir a ativação do enforcement são as LINHAS DE LOG estruturadas
// (JSON, `event` estável, `v` versionado), agregadas no log drain/Vercel — não os contadores em
// memória. Cada linha carrega `suppressed`: quantas decisões iguais a instância calou desde a
// linha anterior daquela chave; somar `1 + suppressed` por linha aproxima o total de resoluções.
// Contrato dos eventos: docs/comercial/SAAS_001A_FUNDACAO_COMERCIAL.md §5.

export const EVENTO_SOMBRA = "saas_entitlement_shadow"
export const EVENTO_SOMBRA_FALHOU = "saas_entitlement_shadow_failed"
export const EVENTO_ENFORCE_IGNORADO = "saas_entitlement_enforce_ignored"

const JANELA_LOG_MS = 15 * 60 * 1000
const JANELA_FALHA_MS = 60 * 1000
const MAX_CHAVES = 2000
const ultimoLog = new Map<string, number>()
const calados = new Map<string, number>()
const contadores = new Map<string, number>()
let enforceAvisado = false
let ultimaFalha: number | undefined
let falhasCaladas = 0

function observarDecisaoSombra(storeId: string, modo: ModoAcesso, motivo: MotivoEntitlement, agoraMs: number, log: Log) {
  const chaveContador = `${modo}:${motivo}`
  contadores.set(chaveContador, (contadores.get(chaveContador) ?? 0) + 1)
  const chave = `${storeId}|${chaveContador}`
  const anterior = ultimoLog.get(chave)
  if (anterior !== undefined && agoraMs - anterior < JANELA_LOG_MS) {
    calados.set(chave, (calados.get(chave) ?? 0) + 1)
    return
  }
  if (ultimoLog.size >= MAX_CHAVES) { ultimoLog.clear(); calados.clear() }
  const suppressed = calados.get(chave) ?? 0
  calados.delete(chave)
  ultimoLog.set(chave, agoraMs)
  log(JSON.stringify({ event: EVENTO_SOMBRA, v: 1, storeId, modo, motivo, applied: false, suppressed }))
}

function registrarFalhaSombra(agoraMs: number, logErro: Log) {
  contadores.set("falha", (contadores.get("falha") ?? 0) + 1)
  if (ultimaFalha !== undefined && agoraMs - ultimaFalha < JANELA_FALHA_MS) { falhasCaladas++; return }
  ultimaFalha = agoraMs
  logErro(JSON.stringify({ event: EVENTO_SOMBRA_FALHOU, v: 1, suppressed: falhasCaladas }))
  falhasCaladas = 0
}

function avisarEnforceIgnorado(log: Log) {
  if (enforceAvisado) return
  enforceAvisado = true
  log(JSON.stringify({ event: EVENTO_ENFORCE_IGNORADO, v: 1, motivo: "enforcement inexistente no SAAS-001A" }))
}

/**
 * Contagem desta INSTÂNCIA (`modo:motivo` e `falha`) desde o último cold start. Útil para teste e
 * depuração; NÃO serve como métrica de ativação (ver comentário acima).
 */
export function contadoresEntitlementSombra(): Record<string, number> {
  return Object.fromEntries(contadores)
}

/** Só para testes. */
export function reiniciarObservabilidadeSombra() {
  ultimoLog.clear()
  calados.clear()
  contadores.clear()
  enforceAvisado = false
  ultimaFalha = undefined
  falhasCaladas = 0
}
