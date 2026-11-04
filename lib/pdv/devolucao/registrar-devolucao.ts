/**
 * PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — registro AUTORITATIVO de devolução.
 *
 * Único writer de `DevolucaoVenda` (rota `POST /api/ops/devolucao`). Reaproveita o
 * schema existente — nenhuma tabela/coluna nova (o schema de lastro R3 segue PENDING).
 *
 * Garantias (todas na MESMA transação, READ COMMITTED + releitura após o lock):
 *  1. Lock de linha na venda de origem (`SELECT … FOR UPDATE`): duas devoluções
 *     simultâneas da mesma venda são serializadas; a segunda relê o que já foi
 *     devolvido DEPOIS da espera e nunca ultrapassa a quantidade vendida.
 *  2. Teto por item = vendido − já devolvido (todas as devoluções da venda), com
 *     quantidades e valores derivados do banco — o client nunca é autoridade.
 *  3. Idempotência por (loja, localId) avaliada depois do lock: replay idêntico
 *     devolve o mesmo resultado; mesmo localId com conteúdo diferente é CONFLITO
 *     (antes era tratado como replay e a segunda devolução sumia em silêncio).
 *  4. Crédito (vale) criado uma única vez, do valor calculado no servidor, junto do
 *     documento. Sem titular (CPF/CNPJ) não há vale — recusa em vez de "emitir" nada.
 *  5. Nenhuma saída financeira: vale-troca não é dinheiro saindo do caixa.
 *  6. Reembolso em dinheiro (`tipo: "devolucao"`) BLOQUEADO até haver fluxo/política
 *     aprovados (G-H01..03 / CASH_HANDOVER_RECOVERY = RELEASE_BLOCKER).
 */
import type { Prisma } from "@/generated/prisma"
import { StockIdempotency } from "@/lib/estoque/stock-ledger-contract"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import { canonicalProductKeyResolver } from "@/lib/pdv/devolucao/product-keys"

export type DevolucaoTipo = "vale_credito" | "somente_estoque" | "troca" | "devolucao"

export type RegistrarDevolucaoInput = {
  storeId: string
  localId: string
  vendaLocalId: string
  sessaoId?: string | null
  tipo: DevolucaoTipo
  clienteNome: string
  clienteDoc: string
  operador: string
  /** Rótulo server-derived (sessão NextAuth) — único aceito no ledger de estoque. */
  ledgerOperator: string | null
  motivo: string
  observacao: string
  itens: Array<{ inventoryId?: string; nome?: string; quantidade: number }>
  payload?: Record<string, unknown>
}

export type RegistrarDevolucaoOk = {
  ok: true
  idempotente: boolean
  devolucaoId: string
  localId: string
  vendaLocalId: string
  tipo: string
  valorTotal: number
  creditoEmitido: number
  /** Saldo ativo total do titular nesta loja, lido dentro da transação. */
  saldoCreditoCliente: number
  /** Operador gravado no documento (auditoria do comprovante). */
  operador: string
  itens: Array<{ inventoryId: string; nome: string; quantidade: number; valorUnitario: number; valorTotal: number }>
}

export type DevolucaoErrorCode =
  | "REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA"
  | "VENDA_ORIGEM_OBRIGATORIA"
  | "VENDA_ORIGEM_NAO_ENCONTRADA"
  | "VENDA_CANCELADA"
  | "ITEM_NAO_CONSTA_NA_VENDA"
  | "QUANTIDADE_EXCEDE_DEVOLVIVEL"
  | "CLIENTE_DOC_OBRIGATORIO"
  | "LOCAL_ID_CONFLITO"
  | "ITENS_DUPLICADOS"

export class DevolucaoBusinessError extends Error {
  constructor(
    readonly code: DevolucaoErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "DevolucaoBusinessError"
  }
}

export const REEMBOLSO_BLOQUEADO_MENSAGEM =
  "Reembolso em dinheiro bloqueado: ainda não há fluxo financeiro aprovado para tirar dinheiro do caixa em devoluções. Use Vale-Troca ou Troca Imediata."

function arredonda2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

function normInv(id: string | null | undefined): string {
  return (id ?? "").trim()
}

/** Identidade de conteúdo de uma devolução — base da comparação de replay. */
export function devolucaoFingerprint(input: {
  vendaLocalId: string
  tipo: string
  clienteDoc: string
  itens: Array<{ inventoryId?: string | null; quantidade: number }>
}): string {
  const itens = input.itens
    .map((i) => `${normInv(i.inventoryId)}:${Math.round(i.quantidade)}`)
    .sort()
    .join("|")
  return [input.vendaLocalId.trim(), input.tipo, input.clienteDoc.replace(/\D/g, ""), itens].join("#")
}

/** Validação de política ANTES de qualquer IO (nada é gravado). */
export function assertDevolucaoPermitidaPorPolitica(tipo: DevolucaoTipo): void {
  if (tipo === "devolucao") {
    throw new DevolucaoBusinessError("REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA", REEMBOLSO_BLOQUEADO_MENSAGEM)
  }
}

async function saldoAtivoCliente(tx: Prisma.TransactionClient, storeId: string, doc: string): Promise<number> {
  if (!doc) return 0
  const agg = await tx.clienteCredito.aggregate({
    where: { storeId, clienteDoc: doc, status: "ativo" },
    _sum: { saldoAtual: true },
  })
  return arredonda2(agg._sum.saldoAtual ?? 0)
}

type ExistingDev = {
  id: string
  localId: string
  vendaLocalId: string
  tipo: string
  clienteDoc: string
  valorTotal: number
  creditoEmitido: number
  operador: string
  itens: Array<{ inventoryId: string | null; nome: string; quantidade: number; valorUnitario: number; valorTotal: number }>
}

const EXISTING_SELECT = {
  id: true,
  localId: true,
  vendaLocalId: true,
  tipo: true,
  clienteDoc: true,
  valorTotal: true,
  creditoEmitido: true,
  operador: true,
  itens: { select: { inventoryId: true, nome: true, quantidade: true, valorUnitario: true, valorTotal: true } },
} as const

async function classifyReplay(
  tx: Prisma.TransactionClient,
  input: RegistrarDevolucaoInput,
  existing: ExistingDev,
): Promise<RegistrarDevolucaoOk> {
  const docNorm = input.clienteDoc.replace(/\D/g, "")
  const canon = await canonicalProductKeyResolver(tx, input.storeId, [
    ...input.itens.map((i) => i.inventoryId),
    ...existing.itens.map((i) => i.inventoryId),
  ])
  const fpPedido = devolucaoFingerprint({
    ...input,
    clienteDoc: docNorm,
    itens: input.itens.map((i) => ({ inventoryId: canon(i.inventoryId), quantidade: i.quantidade })),
  })
  const fpExistente = devolucaoFingerprint({
    vendaLocalId: existing.vendaLocalId,
    tipo: existing.tipo,
    clienteDoc: existing.clienteDoc,
    itens: existing.itens.map((i) => ({ inventoryId: canon(i.inventoryId), quantidade: i.quantidade })),
  })
  // Devolve a chave que o client conhece (SKU/código) — a do banco é o Produto.id.
  const chaveDoClient = (dbKey: string | null) =>
    input.itens.find((r) => canon(r.inventoryId) === canon(dbKey))?.inventoryId?.trim() || normInv(dbKey)
  if (fpPedido !== fpExistente) {
    throw new DevolucaoBusinessError(
      "LOCAL_ID_CONFLITO",
      `O identificador ${input.localId} já pertence a outra devolução desta loja. Nada foi gravado — gere a devolução novamente.`,
      { localId: input.localId },
    )
  }
  return {
    ok: true,
    idempotente: true,
    devolucaoId: existing.id,
    localId: existing.localId,
    vendaLocalId: existing.vendaLocalId,
    tipo: existing.tipo,
    valorTotal: arredonda2(existing.valorTotal),
    creditoEmitido: arredonda2(existing.creditoEmitido),
    saldoCreditoCliente: await saldoAtivoCliente(tx, input.storeId, existing.clienteDoc),
    operador: existing.operador,
    itens: existing.itens.map((i) => ({
      inventoryId: chaveDoClient(i.inventoryId),
      nome: i.nome,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
      valorTotal: i.valorTotal,
    })),
  }
}

/**
 * Executa a devolução dentro de `tx`. O caller abre a transação (default READ
 * COMMITTED do Postgres) e trata `DevolucaoBusinessError` como 409/422.
 */
export async function registrarDevolucaoInTransaction(
  tx: Prisma.TransactionClient,
  input: RegistrarDevolucaoInput,
): Promise<RegistrarDevolucaoOk> {
  assertDevolucaoPermitidaPorPolitica(input.tipo)
  const storeId = input.storeId
  const vendaLocalId = input.vendaLocalId.trim()
  if (!vendaLocalId) {
    throw new DevolucaoBusinessError(
      "VENDA_ORIGEM_OBRIGATORIA",
      "Informe a venda de origem: devolução sem venda comprovada no servidor não é registrada.",
    )
  }

  // ── 1. Lock da venda de origem (serializa devoluções concorrentes) ─────────
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "vendas" WHERE "pedidoId" = ${vendaLocalId} AND "storeId" = ${storeId} FOR UPDATE`

  // ── 2. Idempotência APÓS o lock (o vencedor concorrente já está visível) ───
  const existing = await tx.devolucaoVenda.findUnique({
    where: { storeId_localId: { storeId, localId: input.localId } },
    select: EXISTING_SELECT,
  })
  if (existing) return classifyReplay(tx, input, existing)

  if (locked.length === 0) {
    throw new DevolucaoBusinessError(
      "VENDA_ORIGEM_NAO_ENCONTRADA",
      `A venda ${vendaLocalId} ainda não está no servidor desta loja. Sincronize a venda e tente novamente — nada foi gravado.`,
      { vendaLocalId },
    )
  }

  const venda = await tx.venda.findFirst({
    where: { id: locked[0]!.id, storeId },
    select: { id: true, status: true, itens: { select: { inventoryId: true, nome: true, quantidade: true, lineTotal: true } } },
  })
  if (!venda) {
    throw new DevolucaoBusinessError("VENDA_ORIGEM_NAO_ENCONTRADA", `Venda ${vendaLocalId} não encontrada.`, { vendaLocalId })
  }
  if (venda.status === "cancelada") {
    throw new DevolucaoBusinessError("VENDA_CANCELADA", `A venda ${vendaLocalId} está cancelada: não há o que devolver.`)
  }

  // ── 3. Teto por item: vendido − já devolvido (releitura pós-lock) ──────────
  const anteriores = await tx.itemDevolucaoVenda.findMany({
    where: { devolucao: { storeId, vendaLocalId } },
    select: { inventoryId: true, quantidade: true },
  })
  const canon = await canonicalProductKeyResolver(tx, storeId, [
    ...venda.itens.map((i) => i.inventoryId),
    ...anteriores.map((i) => i.inventoryId),
    ...input.itens.map((i) => i.inventoryId),
  ])
  const vendido = new Map<string, { quantidade: number; lineTotal: number; nome: string }>()
  for (const it of venda.itens) {
    const k = canon(it.inventoryId)
    if (!k) continue
    const cur = vendido.get(k) ?? { quantidade: 0, lineTotal: 0, nome: it.nome }
    cur.quantidade += it.quantidade || 0
    cur.lineTotal += it.lineTotal || 0
    vendido.set(k, cur)
  }
  const jaDevolvido = new Map<string, number>()
  for (const it of anteriores) {
    const k = canon(it.inventoryId)
    jaDevolvido.set(k, (jaDevolvido.get(k) ?? 0) + (it.quantidade || 0))
  }

  const vistos = new Set<string>()
  /** `inventoryId` = Produto.id canônico (o que vai ao banco). */
  const itensCalc: RegistrarDevolucaoOk["itens"] = []
  /** Mesma linha com a chave que o client mandou (espelho local por SKU). */
  const chavesClient: string[] = []
  for (const req of input.itens) {
    const k = canon(req.inventoryId)
    if (vistos.has(k)) {
      throw new DevolucaoBusinessError("ITENS_DUPLICADOS", "Item repetido na mesma devolução.", { inventoryId: k })
    }
    vistos.add(k)
    const orig = k ? vendido.get(k) : undefined
    if (!orig || orig.quantidade <= 0) {
      throw new DevolucaoBusinessError(
        "ITEM_NAO_CONSTA_NA_VENDA",
        `O item ${req.nome || k || "(sem código)"} não consta na venda ${vendaLocalId}.`,
        { inventoryId: k },
      )
    }
    const qty = Math.round(req.quantidade)
    const disponivel = orig.quantidade - (jaDevolvido.get(k) ?? 0)
    if (qty < 1 || qty > disponivel) {
      throw new DevolucaoBusinessError(
        "QUANTIDADE_EXCEDE_DEVOLVIVEL",
        `${orig.nome}: ainda devolvível ${Math.max(0, disponivel)}, solicitado ${qty}.`,
        { inventoryId: k, disponivel: Math.max(0, disponivel), solicitado: qty },
      )
    }
    const unit = orig.lineTotal / orig.quantidade
    chavesClient.push(normInv(req.inventoryId))
    itensCalc.push({
      inventoryId: k,
      nome: orig.nome,
      quantidade: qty,
      valorUnitario: arredonda2(unit),
      valorTotal: arredonda2(unit * qty),
    })
  }

  const valorTotal = arredonda2(itensCalc.reduce((s, i) => s + i.valorTotal, 0))
  const geraCredito = input.tipo === "vale_credito" || input.tipo === "troca"
  const docNorm = input.clienteDoc.replace(/\D/g, "")
  const creditoEmitido = geraCredito ? valorTotal : 0
  if (creditoEmitido > 0 && !docNorm) {
    throw new DevolucaoBusinessError(
      "CLIENTE_DOC_OBRIGATORIO",
      "Informe o CPF/CNPJ do cliente: o vale fica vinculado ao titular.",
    )
  }

  // ── 4. Documento ───────────────────────────────────────────────────────────
  const dev = await tx.devolucaoVenda.create({
    data: {
      storeId,
      localId: input.localId,
      vendaLocalId,
      sessaoId: input.sessaoId ?? null,
      tipo: input.tipo,
      valorTotal,
      creditoEmitido,
      clienteNome: input.clienteNome,
      clienteDoc: docNorm,
      operador: input.operador,
      motivo: input.motivo,
      observacao: input.observacao,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      itens: { create: itensCalc.map((i) => ({ ...i })) },
    },
    select: { id: true },
  })

  // ── 5. Estoque — ENTRADA compensatória pelo boundary canônico ──────────────
  for (const it of itensCalc) {
    if (isVirtualSaleLine(it.inventoryId)) continue
    const produto = await tx.produto.findFirst({
      where: { storeId, OR: [{ id: it.inventoryId }, { sku: it.inventoryId }, { barcode: it.inventoryId }] },
      select: { id: true },
    })
    if (!produto) continue
    const mov = await applyStockMutationTx(
      tx as unknown as StockLedgerTx,
      { storeId, principal: null, source: "ops-devolucao", operatorLabel: input.ledgerOperator },
      {
        kind: "entrada",
        produtoId: produto.id,
        quantidade: it.quantidade,
        origem: "devolucao",
        documento: input.localId,
        motivo: input.motivo?.trim() || `Devolução ${input.localId}`,
        idempotencyKey: StockIdempotency.devolucao(input.localId, produto.id),
      },
    )
    if (!mov.ok) {
      if (mov.code === "NOT_FOUND") continue
      throw new Error(`[devolucao] devolução ao estoque falhou: ${mov.code} ${mov.message}`)
    }
  }

  // ── 6. Status da venda (agregado pós-lock) ────────────────────────────────
  const totalVendido = [...vendido.values()].reduce((s, v) => s + v.quantidade, 0)
  const totalDevolvido =
    [...jaDevolvido.values()].reduce((s, q) => s + q, 0) + itensCalc.reduce((s, i) => s + i.quantidade, 0)
  const novoStatus =
    totalVendido > 0 && totalDevolvido >= totalVendido ? "devolvida" : totalDevolvido > 0 ? "parcialmente_devolvida" : venda.status
  if (novoStatus !== venda.status) {
    await tx.venda.update({ where: { id: venda.id }, data: { status: novoStatus } })
  }

  // ── 7. Crédito persistente (uma vez, mesmo commit do documento) ───────────
  if (creditoEmitido > 0) {
    await tx.clienteCredito.create({
      data: {
        storeId,
        clienteDoc: docNorm,
        clienteNome: input.clienteNome,
        devolucaoId: dev.id,
        vendaOrigemId: vendaLocalId,
        valorOriginal: creditoEmitido,
        saldoAtual: creditoEmitido,
        status: "ativo",
      },
    })
  }

  return {
    ok: true,
    idempotente: false,
    devolucaoId: dev.id,
    localId: input.localId,
    vendaLocalId,
    tipo: input.tipo,
    valorTotal,
    creditoEmitido,
    saldoCreditoCliente: await saldoAtivoCliente(tx, storeId, docNorm),
    operador: input.operador,
    itens: itensCalc.map((i, idx) => ({ ...i, inventoryId: chavesClient[idx] || i.inventoryId })),
  }
}

/** Releitura FORA da transação perdedora (unique de localId) — classifica o vencedor. */
export async function classifyDevolucaoAfterUniqueConflict(
  client: Prisma.TransactionClient,
  input: RegistrarDevolucaoInput,
): Promise<RegistrarDevolucaoOk | null> {
  const existing = await client.devolucaoVenda.findUnique({
    where: { storeId_localId: { storeId: input.storeId, localId: input.localId } },
    select: EXISTING_SELECT,
  })
  if (!existing) return null
  return classifyReplay(client, input, existing)
}
