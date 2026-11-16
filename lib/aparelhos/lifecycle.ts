/**
 * Máquina de estados do aparelho físico (OMNI-APARELHOS-ENDTOEND-001).
 * Estado é persistido; a UI nunca substitui a transação. Transições fora deste
 * mapa são recusadas pelo serviço (`TRANSICAO_INVALIDA`).
 */

export const APARELHO_STATUS = [
  "aguardando_conferencia",
  "em_avaliacao",
  "disponivel",
  "reservado",
  "em_revisao",
  "vendido",
  "devolvido",
  "bloqueado",
  "baixado",
] as const
export type AparelhoStatus = (typeof APARELHO_STATUS)[number]

export const APARELHO_STATUS_LABEL: Record<AparelhoStatus, string> = {
  aguardando_conferencia: "Aguardando conferência",
  em_avaliacao: "Em avaliação",
  disponivel: "Disponível",
  reservado: "Reservado",
  em_revisao: "Em revisão interna",
  vendido: "Vendido",
  devolvido: "Devolvido",
  bloqueado: "Bloqueado",
  baixado: "Baixado",
}

export const APARELHO_CONDICOES = ["novo_lacrado", "novo_aberto", "seminovo", "usado", "recondicionado"] as const
export type AparelhoCondicao = (typeof APARELHO_CONDICOES)[number]
export const APARELHO_CONDICAO_LABEL: Record<AparelhoCondicao, string> = {
  novo_lacrado: "Novo lacrado",
  novo_aberto: "Novo aberto",
  seminovo: "Seminovo",
  usado: "Usado",
  recondicionado: "Recondicionado",
}
export function isNovo(c: string): boolean {
  return c === "novo_lacrado" || c === "novo_aberto"
}

export const APARELHO_ORIGENS = ["cadastro_manual", "fornecedor", "lote", "compra_cliente", "negociacao"] as const
export type AparelhoOrigem = (typeof APARELHO_ORIGENS)[number]
export const APARELHO_ORIGEM_LABEL: Record<AparelhoOrigem, string> = {
  cadastro_manual: "Cadastro manual",
  fornecedor: "Fornecedor",
  lote: "Lote (entrada)",
  compra_cliente: "Compra de cliente",
  negociacao: "Negociação",
}

export const APARELHO_PROPRIEDADE_LABEL: Record<string, string> = {
  loja: "Próprio da loja",
  negociacao: "Recebido em negociação",
  aguardando_aquisicao: "Aguardando aquisição",
}

/** Transições permitidas (de → para). `vendido`/`disponivel` via venda/devolução têm caminho próprio. */
const TRANSICOES: Record<AparelhoStatus, readonly AparelhoStatus[]> = {
  aguardando_conferencia: ["em_avaliacao", "disponivel", "bloqueado", "baixado"],
  em_avaliacao: ["disponivel", "em_revisao", "bloqueado", "baixado"],
  disponivel: ["reservado", "vendido", "em_revisao", "bloqueado", "baixado"],
  reservado: ["disponivel", "vendido", "bloqueado"],
  em_revisao: ["disponivel", "em_avaliacao", "bloqueado", "baixado"],
  vendido: ["devolvido"],
  devolvido: ["em_avaliacao", "em_revisao", "disponivel", "bloqueado", "baixado"],
  bloqueado: ["em_avaliacao", "em_revisao", "baixado"],
  baixado: [],
}

export function isAparelhoStatus(s: unknown): s is AparelhoStatus {
  return typeof s === "string" && (APARELHO_STATUS as readonly string[]).includes(s)
}

export function canTransition(from: string, to: string): boolean {
  return isAparelhoStatus(from) && isAparelhoStatus(to) && TRANSICOES[from].includes(to)
}

/** Estados em que a unidade conta no saldo comercial do Produto. */
export function contaNoEstoque(status: string): boolean {
  return status === "disponivel" || status === "reservado"
}

/** Transições manuais permitidas pela UI (venda e devolução não passam por aqui). */
export function transicoesManuais(from: string): AparelhoStatus[] {
  if (!isAparelhoStatus(from)) return []
  return TRANSICOES[from].filter((to) => to !== "vendido" && to !== "devolvido" && to !== "reservado")
}
