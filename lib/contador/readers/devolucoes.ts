/**
 * Contador HUB · reader de devoluções (read-only). GOAL 006.
 *
 * Fonte canônica: `DevolucaoVenda.valorTotal` / `DevolucaoVenda.at`.
 * Regra: a devolução reduz a competência em que OCORREU (nunca retroage à venda).
 * `Venda.total` não é reduzido pelo reader — a subtração acontece uma única vez no
 * líquido da competência (ver `index.ts`), impedindo dupla subtração.
 */
import { numericoReal, monetarioReal, type DevolucoesContador } from "./tipos"

const FONTE = "DevolucaoVenda"

export type DevolucaoRow = {
  valorTotal: number
}

function numeroFinito(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

export function agregarDevolucoes(rows: readonly DevolucaoRow[]): DevolucoesContador {
  const total = rows.reduce((s, r) => s + numeroFinito(r.valorTotal), 0)
  return Object.freeze({
    quantidade: numericoReal(rows.length, FONTE),
    total: monetarioReal(total, FONTE, "Redutor da competência em que a devolução ocorreu."),
  })
}
