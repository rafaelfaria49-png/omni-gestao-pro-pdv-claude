/**
 * Carteira financeira — representação de domínio (futura persistência Prisma).
 * Não confundir com `Carteira` em `lib/financeiro-types.ts` (legado localStorage).
 */

export type CarteiraTipoDominio = "caixa" | "banco" | "cartao" | "investimento" | "outros"

export type Carteira = {
  id: string
  storeId: string
  nome: string
  /** Classificação operacional da carteira. */
  tipo: CarteiraTipoDominio | string
  saldoInicial: number
  /** Saldo derivado (projeção); pode ser materializado em cache ou coluna futura. */
  saldoAtual: number
  ativo: boolean
  createdAt: string
}
