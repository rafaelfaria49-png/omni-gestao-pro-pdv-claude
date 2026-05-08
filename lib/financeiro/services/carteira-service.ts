import type { Carteira } from "@/lib/financeiro/types/carteira"
import { safeMoney } from "@/lib/financeiro/contracts/valores"

export function normalizeCarteiraDraft(partial: Partial<Carteira> & Pick<Carteira, "id" | "storeId" | "nome">): Carteira {
  const now = new Date().toISOString()
  const saldoInicial = safeMoney(partial.saldoInicial ?? 0)
  const saldoAtual = partial.saldoAtual !== undefined ? safeMoney(partial.saldoAtual) : saldoInicial
  return {
    id: partial.id,
    storeId: partial.storeId,
    nome: partial.nome.trim(),
    tipo: partial.tipo ?? "outros",
    saldoInicial,
    saldoAtual,
    ativo: partial.ativo !== false,
    createdAt: partial.createdAt ?? now,
  }
}

export function validateCarteiraBelongsToStore(carteira: Carteira, storeId: string): boolean {
  return Boolean(carteira.storeId && storeId && carteira.storeId === storeId)
}

/** Atualiza apenas o campo `saldoAtual` com valor já derivado por `saldo-service`. */
export function applySaldoDerivadoCarteira(carteira: Carteira, saldoAtual: number): Carteira {
  return { ...carteira, saldoAtual: safeMoney(saldoAtual) }
}

export function isCarteiraOperacional(carteira: Carteira): boolean {
  return carteira.ativo === true
}
