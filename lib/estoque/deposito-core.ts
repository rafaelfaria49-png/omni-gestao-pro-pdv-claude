/**
 * BL-07 Fase 1 — Fundação multi-depósito (ADR-0007 · SPRINT_BL07_FASE1).
 *
 * Núcleo PURO e testável da camada de depósitos. Toda a lógica recebe o cliente Prisma
 * por INJEÇÃO (`client`), e o tipo de Prisma é importado apenas como `import type` (apagado
 * no runtime). Isso permite testar com um `TransactionClient` fake em memória — o mesmo
 * padrão de `lib/ops-upsert-venda.ts` — sem importar `@/lib/prisma`/`@/generated/prisma`
 * (proibidos no ambiente Vitest `node`).
 *
 * Princípios (ETAPA 6): `storeId` obrigatório, sem fallback silencioso `loja-1` (ADR-0003),
 * isolamento multi-loja em toda query (`where.storeId`), sem vazamento cross-tenant.
 *
 * Fase 1 = SOMENTE saldo físico. Sem reserva, sem comprometido, sem trânsito (Fase 3).
 * Esta camada é DORMENTE: nenhum consumidor de produção (PDV/OS) a chama ainda — é a
 * fundação preparada para a Fase 2 (seleção de depósito) cabear os pontos de escrita.
 */
import type { Prisma } from "@/generated/prisma"

/** Cliente aceito: o PrismaClient global ou um TransactionClient (composição em transação). */
export type EstoqueClient = Prisma.TransactionClient

/** Rótulo e código canônicos do depósito principal de toda loja. */
export const DEPOSITO_PRINCIPAL_NOME = "Depósito Principal"
export const DEPOSITO_PRINCIPAL_CODIGO = "PRINCIPAL"

export type DepositoMin = {
  id: string
  storeId: string
  codigo: string
  principal: boolean
}

/**
 * Saneia o `storeId`. Sem fallback silencioso (ADR-0003): vazio → erro explícito.
 * Espelha o padrão `(storeId ?? "").trim()` adotado no projeto.
 */
export function assertStoreId(storeId: string | null | undefined): string {
  const sid = (storeId ?? "").trim()
  if (!sid) throw new Error("storeId obrigatório (sem fallback de loja)")
  return sid
}

function assertProdutoId(produtoId: string | null | undefined): string {
  const pid = (produtoId ?? "").trim()
  if (!pid) throw new Error("produtoId obrigatório")
  return pid
}

/** Soma os saldos físicos (agregação por loja). Trunca/ignora valores não-finitos. */
export function agregarQuantidade(rows: ReadonlyArray<{ quantidade: number }>): number {
  let total = 0
  for (const r of rows) {
    const q = Math.trunc(Number(r?.quantidade))
    if (Number.isFinite(q)) total += q
  }
  return total
}

/** Resolve o depósito principal de uma lista (preferindo ativo). */
export function resolveDepositoPrincipal<T extends { principal: boolean; ativo: boolean }>(
  depositos: ReadonlyArray<T>,
): T | null {
  return depositos.find((d) => d.principal && d.ativo) ?? depositos.find((d) => d.principal) ?? null
}

/**
 * Garante (idempotente) o Depósito Principal da loja. Find-or-create — é o guard primário
 * da invariante "exatamente 1 principal por loja" (o índice parcial da migração é reforço).
 */
export async function ensureDepositoPrincipal(
  client: EstoqueClient,
  storeId: string,
): Promise<DepositoMin> {
  const sid = assertStoreId(storeId)
  const existente = await client.deposito.findFirst({
    where: { storeId: sid, OR: [{ codigo: DEPOSITO_PRINCIPAL_CODIGO }, { principal: true }] },
    select: { id: true, storeId: true, codigo: true, principal: true },
  })
  if (existente) return existente

  return client.deposito.create({
    data: {
      storeId: sid,
      nome: DEPOSITO_PRINCIPAL_NOME,
      codigo: DEPOSITO_PRINCIPAL_CODIGO,
      ativo: true,
      principal: true,
    },
    select: { id: true, storeId: true, codigo: true, principal: true },
  })
}

/**
 * Estoque agregado de um produto na loja (Σ saldo físico em todos os depósitos).
 * Na Fase 1 (depósito único) este valor espelha `Produto.stock`.
 */
export async function getEstoqueAgregado(
  client: EstoqueClient,
  storeId: string,
  produtoId: string,
): Promise<number> {
  const sid = assertStoreId(storeId)
  const pid = assertProdutoId(produtoId)
  const rows = await client.produtoDeposito.findMany({
    where: { storeId: sid, produtoId: pid },
    select: { quantidade: true },
  })
  return agregarQuantidade(rows)
}

/** Estoque por depósito de um produto na loja (lista ordenada por depósito). */
export async function getEstoquePorDeposito(
  client: EstoqueClient,
  storeId: string,
  produtoId: string,
): Promise<Array<{ depositoId: string; quantidade: number }>> {
  const sid = assertStoreId(storeId)
  const pid = assertProdutoId(produtoId)
  return client.produtoDeposito.findMany({
    where: { storeId: sid, produtoId: pid },
    select: { depositoId: true, quantidade: true },
    orderBy: { depositoId: "asc" },
  })
}

/**
 * Define o saldo físico de um produto em um depósito (upsert). DORMENTE na Fase 1 —
 * nenhum consumidor de produção a chama; preparada para a Fase 2.
 * ETAPA 6: valida que depósito e produto pertencem à MESMA loja do `storeId` (anti-vazamento).
 */
export async function setEstoqueDeposito(
  client: EstoqueClient,
  params: { storeId: string; produtoId: string; depositoId: string; quantidade: number },
): Promise<{ produtoId: string; depositoId: string; quantidade: number }> {
  const sid = assertStoreId(params.storeId)
  const pid = assertProdutoId(params.produtoId)
  const did = (params.depositoId ?? "").trim()
  if (!did) throw new Error("depositoId obrigatório")
  const qtd = Math.trunc(Number(params.quantidade))
  if (!Number.isFinite(qtd) || qtd < 0) throw new Error("quantidade deve ser inteiro >= 0")

  const [dep, prod] = await Promise.all([
    client.deposito.findFirst({ where: { id: did, storeId: sid }, select: { id: true } }),
    client.produto.findFirst({ where: { id: pid, storeId: sid }, select: { id: true } }),
  ])
  if (!dep) throw new Error("Depósito não encontrado nesta loja")
  if (!prod) throw new Error("Produto não encontrado nesta loja")

  return client.produtoDeposito.upsert({
    where: { produtoId_depositoId: { produtoId: pid, depositoId: did } },
    create: { storeId: sid, produtoId: pid, depositoId: did, quantidade: qtd },
    update: { quantidade: qtd },
    select: { produtoId: true, depositoId: true, quantidade: true },
  })
}

/**
 * Backfill da loja: garante o Depósito Principal e materializa `ProdutoDeposito` a partir
 * de `Produto.stock` (saldo atual) no depósito principal. Idempotente / re-runnable
 * (re-sincroniza o principal ao `Produto.stock`).
 *
 * NÃO altera `Produto.stock` (o cache permanece a verdade operacional até a Fase 2).
 * Pressuposto Fase 1: depósito único → `principal.quantidade == Produto.stock`.
 */
export async function backfillLojaDepositoPrincipal(
  client: EstoqueClient,
  storeId: string,
): Promise<{ depositoId: string; produtosProcessados: number }> {
  const sid = assertStoreId(storeId)
  const principal = await ensureDepositoPrincipal(client, sid)

  const produtos = await client.produto.findMany({
    where: { storeId: sid },
    select: { id: true, stock: true },
  })

  let processados = 0
  for (const p of produtos) {
    const qtd = Math.trunc(Number(p.stock)) || 0
    await client.produtoDeposito.upsert({
      where: { produtoId_depositoId: { produtoId: p.id, depositoId: principal.id } },
      create: { storeId: sid, produtoId: p.id, depositoId: principal.id, quantidade: qtd },
      update: { quantidade: qtd },
    })
    processados++
  }
  return { depositoId: principal.id, produtosProcessados: processados }
}
