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
 *   · lojas legadas (`organizationId = NULL`) resolvem `pleno/legado` sem consultar assinatura;
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

export async function calcularEntitlementsSombra(
  db: EntitlementDb,
  storeIds: readonly string[],
  opcoes: { agora?: Date; env?: Record<string, string | undefined>; log?: Log; logErro?: Log } = {},
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

    const comOrganizacao = await db.store.findMany({
      where: { id: { in: ids }, organizationId: { not: null } },
      select: {
        id: true,
        organizationId: true,
        organization: { select: { subscription: { select: SELECT_ASSINATURA_ENTITLEMENT } } },
      },
    })
    const porLoja = new Map(comOrganizacao.map((l) => [l.id, l]))

    for (const id of ids) {
      const loja = porLoja.get(id)
      const entitlement = loja
        ? resolverEntitlement({ organizationId: loja.organizationId }, loja.organization?.subscription ?? null, agora)
        : resolverEntitlement({ organizationId: null }, null, agora)
      claims[id] = paraClaim(entitlement)
      if (entitlement.modo !== "pleno") observarDecisaoSombra(id, entitlement.modo, entitlement.motivo, agora.getTime(), log)
    }
    return claims
  } catch {
    // Sem detalhes: a mensagem do Prisma pode carregar dados da linha.
    logErro("[saas] entitlement_sombra_falhou")
    return undefined
  }
}

// ─── Observabilidade (sem PII: id interno da loja, modo e motivo) ─────────────────────────────

const JANELA_LOG_MS = 15 * 60 * 1000
const MAX_CHAVES = 2000
const ultimoLog = new Map<string, number>()
const contadores = new Map<string, number>()
let enforceAvisado = false

function observarDecisaoSombra(storeId: string, modo: ModoAcesso, motivo: MotivoEntitlement, agoraMs: number, log: Log) {
  const chaveContador = `${modo}:${motivo}`
  contadores.set(chaveContador, (contadores.get(chaveContador) ?? 0) + 1)
  const chave = `${storeId}|${chaveContador}`
  const anterior = ultimoLog.get(chave)
  if (anterior !== undefined && agoraMs - anterior < JANELA_LOG_MS) return
  if (ultimoLog.size >= MAX_CHAVES) ultimoLog.clear()
  ultimoLog.set(chave, agoraMs)
  log(`[saas] entitlement_sombra loja=${storeId} modo=${modo} motivo=${motivo} aplicado=nao`)
}

function avisarEnforceIgnorado(log: Log) {
  if (enforceAvisado) return
  enforceAvisado = true
  log("[saas] SAAS_ENTITLEMENT_ENFORCE=on ignorado: enforcement não existe no SAAS-001A (modo sombra)")
}

/** Contagem, por processo, das decisões que TERIAM restringido o acesso (`modo:motivo`). */
export function contadoresEntitlementSombra(): Record<string, number> {
  return Object.fromEntries(contadores)
}

/** Só para testes. */
export function reiniciarObservabilidadeSombra() {
  ultimoLog.clear()
  contadores.clear()
  enforceAvisado = false
}
