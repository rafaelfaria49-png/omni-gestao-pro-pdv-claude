import { BASIC_MODULE_ACCESS, type AccessModule } from "@/lib/auth/access-policy"
import { OFERTA_COMERCIAL_GESTAO_LOJAS } from "@/lib/comercial/gestao-lojas-oferta"

/**
 * Catálogo central de planos SaaS (OMNI-SAAS-001A · regras comerciais §8).
 *
 * - "Vendas e Estoque" é lido de `OFERTA_COMERCIAL_GESTAO_LOJAS` (fonte da landing): os valores
 *   da página pública NÃO mudam por aqui.
 * - Os módulos do plano só SEMEIAM `Store.moduleAccess` no provisionamento (SAAS-ADR-03); o
 *   plano não concede módulos fora de `BASIC_MODULE_ACCESS`.
 * - A assinatura guarda cópia do preço e do limite (`precoContratadoCentavos`,
 *   `limiteUsuariosPorLoja`): mudar este catálogo não altera contrato em andamento.
 * - Cobrança por loja é PROPOSTA (D-03). Nenhuma cobrança nem limite de usuários é aplicado
 *   no SAAS-001A.
 * - Planos legados (Bronze/Prata/Ouro/Diamante, Essencial/Comércio/Comércio Plus) NÃO entram
 *   aqui e continuam intocados nos arquivos de origem.
 */

export type PlanoSaasId = "vendas-e-estoque"

export type PlanoSaas = {
  readonly id: PlanoSaasId
  /** Versão do plano; a assinatura guarda `planoVersao`. Incrementar ao mudar condições. */
  readonly versao: number
  readonly nome: string
  readonly precoMensalCentavos: number
  readonly limiteUsuariosPorLoja: number
  readonly diasTeste: number
  readonly modulos: readonly AccessModule[]
  readonly cobranca: "por_loja"
  /** Disponível para nova contratação. Não liga cadastro nem cobrança por si só. */
  readonly ativoParaVenda: boolean
}

export const PLANO_VENDAS_E_ESTOQUE: PlanoSaas = Object.freeze({
  id: OFERTA_COMERCIAL_GESTAO_LOJAS.id,
  versao: 1,
  nome: OFERTA_COMERCIAL_GESTAO_LOJAS.nome,
  precoMensalCentavos: OFERTA_COMERCIAL_GESTAO_LOJAS.precoMensalCentavos,
  limiteUsuariosPorLoja: OFERTA_COMERCIAL_GESTAO_LOJAS.usuariosInclusos,
  diasTeste: OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito,
  modulos: Object.freeze([...BASIC_MODULE_ACCESS.modules]),
  cobranca: "por_loja",
  ativoParaVenda: true,
})

/** Catálogo completo (inclui versões antigas quando existirem, para ler contratos). */
export const CATALOGO_PLANOS_SAAS: readonly PlanoSaas[] = Object.freeze([PLANO_VENDAS_E_ESTOQUE])

export function obterPlanoSaas(id: string, versao?: number): PlanoSaas | null {
  const candidatos = CATALOGO_PLANOS_SAAS.filter((p) => p.id === id)
  if (versao === undefined) return candidatos.reduce<PlanoSaas | null>((a, p) => (!a || p.versao > a.versao ? p : a), null)
  return candidatos.find((p) => p.versao === versao) ?? null
}

export function planosAtivosParaVenda(): PlanoSaas[] {
  return CATALOGO_PLANOS_SAAS.filter((p) => p.ativoParaVenda)
}

/** Valor do contrato copiado para a assinatura no momento da contratação/teste. */
export function condicoesContratadas(plano: PlanoSaas) {
  return {
    planoId: plano.id,
    planoVersao: plano.versao,
    precoContratadoCentavos: plano.precoMensalCentavos,
    limiteUsuariosPorLoja: plano.limiteUsuariosPorLoja,
  }
}
