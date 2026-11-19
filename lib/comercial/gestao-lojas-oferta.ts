/**
 * Oferta "OmniGestão Pro — Vendas e Estoque" (página pública `/gestao-lojas`).
 *
 * Fonte ÚNICA dos valores e textos comerciais desta oferta. Não tem relação com os
 * planos Bronze/Prata/Ouro/Diamante (`lib/subscription-plans-catalog.ts`, `lib/stripe.ts`),
 * que continuam intactos, e NÃO existe cobrança ligada a estes planos.
 *
 * Os preços abaixo são PROPOSTAS de QA, ainda não aprovadas pelo proprietário.
 * A página só os mostra quando `GESTAO_LOJAS_EXIBIR_PRECOS_PROPOSTOS=1` — o padrão
 * (variável ausente, inclusive em Production) é não exibir valor nenhum.
 */

export const OFERTA_NOME = "OmniGestão Pro — Vendas e Estoque"

export type PlanoGestaoLojasId = "essencial" | "comercio" | "comercio-plus"

export type PlanoGestaoLojas = {
  id: PlanoGestaoLojasId
  nome: string
  precoMensalCentavos: number
  /** Proposta comercial. O sistema ainda NÃO limita usuários por plano. */
  operadoresPropostos: number
  resumo: string
}

export const PLANOS_GESTAO_LOJAS: readonly PlanoGestaoLojas[] = [
  { id: "essencial", nome: "Essencial", precoMensalCentavos: 3990, operadoresPropostos: 1, resumo: "Para quem atende o balcão sozinho." },
  { id: "comercio", nome: "Comércio", precoMensalCentavos: 6990, operadoresPropostos: 2, resumo: "Para a loja com mais uma pessoa no caixa." },
  { id: "comercio-plus", nome: "Comércio Plus", precoMensalCentavos: 9990, operadoresPropostos: 3, resumo: "Para a loja com equipe pequena revezando o caixa." },
]

export const PRECOS_STATUS = "PROPOSTA_QA_NAO_APROVADA" as const

export function formatarPrecoMensal(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function isPlanoGestaoLojas(id: unknown): id is PlanoGestaoLojasId {
  return typeof id === "string" && PLANOS_GESTAO_LOJAS.some((p) => p.id === id)
}

/** Ramos aceitos no formulário → ramo do provisionamento existente (`provisionClientSchema`). */
export const RAMOS_SOLICITACAO = {
  variedades: "Loja de variedades",
  acessorios: "Loja de acessórios",
  comercio: "Pequeno comércio",
  moda: "Loja de roupas",
  padaria: "Padaria",
} as const
export type RamoSolicitacao = keyof typeof RAMOS_SOLICITACAO

type Env = Record<string, string | undefined>

export type GestaoLojasConfig = {
  exibirPrecosPropostos: boolean
  downloadWindowsUrl: string | null
  contatoWhatsapp: string | null
  contatoEmail: string | null
}

/**
 * Lê as chaves da página. Tudo falha fechado: valor ausente ou malformado = recurso
 * oculto. O download só aparece com URL https explícita (instalador homologado na
 * frente OMNI-DESKTOP-DISTRIBUICAO-PUBLICA-SAAS-001); nunca há link "provisório".
 */
export function resolverGestaoLojasConfig(env: Env = process.env): GestaoLojasConfig {
  const url = env.GESTAO_LOJAS_WINDOWS_DOWNLOAD_URL?.trim() ?? ""
  let downloadWindowsUrl: string | null = null
  try { if (url && new URL(url).protocol === "https:") downloadWindowsUrl = url } catch { downloadWindowsUrl = null }
  const whatsapp = (env.GESTAO_LOJAS_CONTATO_WHATSAPP ?? "").replace(/\D/g, "")
  const email = env.GESTAO_LOJAS_CONTATO_EMAIL?.trim() ?? ""
  return {
    exibirPrecosPropostos: env.GESTAO_LOJAS_EXIBIR_PRECOS_PROPOSTOS === "1",
    downloadWindowsUrl,
    contatoWhatsapp: /^\d{12,13}$/.test(whatsapp) ? whatsapp : null,
    contatoEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  }
}
