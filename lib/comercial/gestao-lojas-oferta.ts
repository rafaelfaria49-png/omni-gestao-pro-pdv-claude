/**
 * Oferta comercial "OmniGestão Pro — Vendas e Estoque" (página pública `/gestao-lojas`).
 *
 * Fonte ÚNICA da oferta comercial e da leitura das chaves públicas de contato.
 * Não tem relação com os planos Bronze/Prata/Ouro/Diamante
 * (`lib/subscription-plans-catalog.ts`, `lib/stripe.ts`), que continuam intactos.
 * Não existe checkout automático, bloqueio automático de usuários nem expiração
 * automática de teste: cobrança e acompanhamento dos 7 dias são manuais pela equipe.
 */

export const OFERTA_NOME = "OmniGestão Pro — Vendas e Estoque"

export type OfertaComercialGestaoLojas = {
  readonly id: "vendas-e-estoque"
  readonly nome: string
  readonly subtitulo: string
  readonly precoMensalCentavos: number
  /** Limite contratual comercial; não há bloqueio automático por plano no servidor. */
  readonly usuariosInclusos: number
  /** Período comercial de teste gratuito acompanhado pela equipe (sem expiração automática). */
  readonly diasTesteGratuito: number
  readonly cobrancaManual: true
  readonly acompanhamentoManual: true
}

/** Oferta comercial única autorizada para a página `/gestao-lojas`. */
export const OFERTA_COMERCIAL_GESTAO_LOJAS: OfertaComercialGestaoLojas = {
  id: "vendas-e-estoque",
  nome: OFERTA_NOME,
  subtitulo: "Vendas e Estoque",
  precoMensalCentavos: 6990,
  usuariosInclusos: 2,
  diasTesteGratuito: 7,
  cobrancaManual: true,
  acompanhamentoManual: true,
}

export type PlanoGestaoLojasId = "essencial" | "comercio" | "comercio-plus" | "vendas-e-estoque"

export type PlanoGestaoLojas = {
  id: PlanoGestaoLojasId
  nome: string
  precoMensalCentavos: number
  operadoresPropostos: number
  resumo: string
}

/**
 * Compatibilidade retroativa para leitura e validação de registros comerciais
 * já gravados em `solicitacoes_teste_comercial.planoInteresse` (ex.: painel
 * `/dashboard/plataforma`). NÃO exibir as três propostas antigas na `/gestao-lojas`.
 */
export const PLANOS_GESTAO_LOJAS: readonly PlanoGestaoLojas[] = [
  { id: "vendas-e-estoque", nome: "Vendas e Estoque", precoMensalCentavos: 6990, operadoresPropostos: 2, resumo: "Plano único comercial para lojas (até 2 usuários)." },
  { id: "essencial", nome: "Essencial", precoMensalCentavos: 3990, operadoresPropostos: 1, resumo: "Registro histórico (proposta anterior)." },
  { id: "comercio", nome: "Comércio", precoMensalCentavos: 6990, operadoresPropostos: 2, resumo: "Registro histórico (proposta anterior)." },
  { id: "comercio-plus", nome: "Comércio Plus", precoMensalCentavos: 9990, operadoresPropostos: 3, resumo: "Registro histórico (proposta anterior)." },
]

export function formatarPrecoMensal(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function isPlanoGestaoLojas(id: unknown): id is PlanoGestaoLojasId {
  return typeof id === "string" && PLANOS_GESTAO_LOJAS.some((p) => p.id === id)
}

/** Formata número brasileiro em dígitos (ex.: 5514998610730 → (14) 99861-0730). */
export function formatarWhatsappComercial(digitos: string): string {
  const limpo = digitos.replace(/\D/g, "")
  const nacional = limpo.startsWith("55") && (limpo.length === 12 || limpo.length === 13) ? limpo.slice(2) : limpo
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`
  }
  return digitos
}

export function linkWhatsappComercial(digitos: string, mensagem?: string): string {
  const base = `https://wa.me/${digitos.replace(/\D/g, "")}`
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base
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
  contatoWhatsapp: string | null
  contatoEmail: string | null
}

/**
 * Lê as chaves de contato da página. Tudo falha fechado: valor ausente ou malformado =
 * contato oculto (nunca número ou email fixo no código).
 *
 * O canal de instalação no computador (Windows/PWA) é único em `/baixar` — esta função
 * não expõe URL direta de instalador `.exe` (conciliado com a frente Desktop/PR #385).
 */
export function resolverGestaoLojasConfig(env: Env = process.env): GestaoLojasConfig {
  const whatsapp = (env.GESTAO_LOJAS_CONTATO_WHATSAPP ?? "").replace(/\D/g, "")
  const email = env.GESTAO_LOJAS_CONTATO_EMAIL?.trim() ?? ""
  return {
    contatoWhatsapp: /^\d{12,13}$/.test(whatsapp) ? whatsapp : null,
    contatoEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  }
}
