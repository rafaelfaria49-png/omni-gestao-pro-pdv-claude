import type { Prisma, PrismaClient } from "@/generated/prisma"

/**
 * Trilha das ações comerciais da plataforma (`PlatformAuditLog` · arquitetura §9).
 *
 * Fundação do SAAS-001A: contrato e gravação. As ações (estender teste, cortesia, suspender…)
 * e a UI são do SAAS-004 — cada uma deve chamar esta função DENTRO da mesma transação da
 * mudança. A tabela só aceita INSERT (gatilho na migration recusa UPDATE/DELETE/TRUNCATE).
 * NÃO substitui nem altera os logs operacionais de PDV, Caixa ou Financeiro.
 */

export const ACOES_PLATAFORMA = [
  "assinatura.criar",
  "assinatura.alterar_status",
  "assinatura.alterar_preco",
  "assinatura.suspender",
  "assinatura.reativar",
  "teste.estender",
  "cortesia.conceder",
  "cortesia.revogar",
  "organizacao.criar",
  "organizacao.vincular_loja",
  "organizacao.alterar_membro",
] as const
export type AcaoPlataforma = (typeof ACOES_PLATAFORMA)[number]

export type RegistroAuditoriaPlataforma = {
  /** `AdminUser.id` do operador da plataforma (nunca vindo do corpo da requisição). */
  atorId: string
  acao: AcaoPlataforma
  motivo: string
  organizationId?: string | null
  storeId?: string | null
  antes?: Record<string, unknown> | null
  depois?: Record<string, unknown> | null
  /** HMAC do IP — o IP cru nunca é gravado. */
  ipHash?: string | null
}

const CHAVE_SENSIVEL = /senha|password|hash|token|secret|segredo|apikey|api_key|cartao|card/i

/** Remove campos sensíveis (recursivo) antes de gravar antes/depois. */
export function sanitizarParaAuditoria(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return "[profundo]"
  if (valor instanceof Date) return valor.toISOString()
  if (Array.isArray(valor)) return valor.map((v) => sanitizarParaAuditoria(v, profundidade + 1))
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([k]) => !CHAVE_SENSIVEL.test(k))
        .map(([k, v]) => [k, sanitizarParaAuditoria(v, profundidade + 1)]),
    )
  }
  return valor
}

export function validarRegistroAuditoria(r: RegistroAuditoriaPlataforma): string | null {
  if (!r.atorId?.trim()) return "ator_obrigatorio"
  if (!ACOES_PLATAFORMA.includes(r.acao)) return "acao_invalida"
  const motivo = r.motivo?.trim() ?? ""
  if (motivo.length < 5 || motivo.length > 1000) return "motivo_obrigatorio"
  return null
}

type AuditDb = Pick<PrismaClient, "platformAuditLog"> | Pick<Prisma.TransactionClient, "platformAuditLog">

export async function registrarAuditoriaPlataforma(db: AuditDb, r: RegistroAuditoriaPlataforma): Promise<{ id: string }> {
  const erro = validarRegistroAuditoria(r)
  if (erro) throw new Error(`PLATFORM_AUDIT_${erro.toUpperCase()}`)
  const json = (v: Record<string, unknown> | null | undefined) =>
    v == null ? undefined : (sanitizarParaAuditoria(v) as Prisma.InputJsonValue)
  return db.platformAuditLog.create({
    data: {
      atorId: r.atorId.trim(),
      acao: r.acao,
      motivo: r.motivo.trim(),
      organizationId: r.organizationId ?? null,
      storeId: r.storeId ?? null,
      antes: json(r.antes),
      depois: json(r.depois),
      ipHash: r.ipHash ?? null,
    },
    select: { id: true },
  })
}
