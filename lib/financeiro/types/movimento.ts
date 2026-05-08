/**
 * Movimento financeiro — evento de caixa/banco (futura persistência).
 */

import type { FinanceiroOrigem } from "@/lib/financeiro/contracts/origem"
import type { MovimentoStatusCanon } from "@/lib/financeiro/contracts/status"

export type MovimentoTipo = "entrada" | "saida"

export type Movimento = {
  id: string
  storeId: string
  tipo: MovimentoTipo
  status: MovimentoStatusCanon | string
  origem: FinanceiroOrigem | string
  valor: number
  descricao: string
  referencia: string
  /** Idempotência / correlação com título, venda, OS, etc. */
  localKey: string
  carteiraId: string
  createdAt: string
}

/** Entrada parcial para construção de movimento (antes de persistir). */
export type MovimentoBuildInput = Partial<Omit<Movimento, "id" | "createdAt">> &
  Pick<Movimento, "storeId" | "tipo" | "valor" | "carteiraId">
