/**
 * BL-07 Fase 1 — Service layer multi-depósito (ADR-0007 · SPRINT_BL07_FASE1).
 *
 * Camada fina que liga o núcleo PURO (`deposito-core.ts`) ao PrismaClient global. Toda a
 * lógica/validação vive no core (testável com client fake); aqui só injetamos o `prisma`
 * (ou um `tx` para composição em transação).
 *
 * ETAPA 5 — preparada para:
 *   - obter estoque agregado           → getEstoqueAgregado
 *   - obter estoque por depósito        → getEstoquePorDeposito
 *   - atualizar estoque do depósito     → setEstoqueDeposito (dormente na Fase 1)
 *   - bootstrap do Depósito Principal    → ensureDepositoPrincipal
 *   - backfill de loja                   → backfillLojaDepositoPrincipal
 *
 * IMPORTANTE (ETAPA 5 — "sem alterar consumidores atuais"): NENHUM consumidor de produção
 * (PDV/OS/relatórios) chama estas funções na Fase 1. `Produto.stock` continua sendo a fonte
 * operacional. O cabeamento dos pontos de escrita é a Fase 2 — zero mudança de comportamento aqui.
 */
import { prisma } from "@/lib/prisma"
import * as core from "./deposito-core"

export type { EstoqueClient, DepositoMin } from "./deposito-core"
export { DEPOSITO_PRINCIPAL_NOME, DEPOSITO_PRINCIPAL_CODIGO } from "./deposito-core"

/** Garante (idempotente) o Depósito Principal da loja. */
export function ensureDepositoPrincipal(storeId: string, client: core.EstoqueClient = prisma) {
  return core.ensureDepositoPrincipal(client, storeId)
}

/** Σ saldo físico do produto na loja (espelha Produto.stock na Fase 1). */
export function getEstoqueAgregado(storeId: string, produtoId: string, client: core.EstoqueClient = prisma) {
  return core.getEstoqueAgregado(client, storeId, produtoId)
}

/** Saldo do produto por depósito na loja. */
export function getEstoquePorDeposito(storeId: string, produtoId: string, client: core.EstoqueClient = prisma) {
  return core.getEstoquePorDeposito(client, storeId, produtoId)
}

/** Define o saldo físico de um produto num depósito (upsert, validado por loja). Dormente. */
export function setEstoqueDeposito(
  params: { storeId: string; produtoId: string; depositoId: string; quantidade: number },
  client: core.EstoqueClient = prisma,
) {
  return core.setEstoqueDeposito(client, params)
}

/** Backfill: principal + ProdutoDeposito a partir de Produto.stock (idempotente). */
export function backfillLojaDepositoPrincipal(storeId: string, client: core.EstoqueClient = prisma) {
  return core.backfillLojaDepositoPrincipal(client, storeId)
}
