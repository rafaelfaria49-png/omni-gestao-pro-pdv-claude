/**
 * OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001
 *
 * Operação AUTORITATIVA de troca/devolução — uma única transação PostgreSQL:
 *
 *   lock da venda original → disponibilidade servidor → documento de devolução →
 *   retorno físico ao estoque (boundary canônico) → crédito/reembolso →
 *   [troca imediata] nova venda pelo MOTOR CANÔNICO (`upsertVendaInTransaction`,
 *   numeração V2, caixa aberto, estoque, financeiro e débito do crédito da própria troca)
 *   → vínculo persistido origem ↔ nova venda → status da venda original.
 *
 * Qualquer falha reverte TUDO: não sobra devolução sem a nova venda, crédito órfão,
 * estoque inventado ou financeiro duplicado. Idempotência pela chave da operação
 * (`operationId` → `DevolucaoVenda.localId`, único por loja; a nova venda usa a mesma
 * chave como `clientSaleId`): reenvio, clique duplo, segunda aba ou resposta perdida
 * devolvem o MESMO resultado. Concorrência na mesma venda é serializada por
 * `pg_advisory_xact_lock` — dois operadores nunca devolvem a mesma unidade.
 *
 * Nada aqui confia em valor enviado pelo cliente: valor devolvido vem da venda original
 * (rateio do desconto global, centavo a centavo) e o preço da nova compra vem do
 * cadastro (`Produto.price`). Sem migration: o vínculo e as linhas exatas (`lineIndex`)
 * vivem em `DevolucaoVenda.payload` (schema `pdv-troca-v1`).
 */
import "server-only"

import { createHash } from "node:crypto"
import type { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { normalizeDocDigits } from "@/lib/cpf"
import { isSerializedDeviceProduct } from "@/lib/aparelhos/serialized-product"
import { APARELHO_REVERSAO_NAO_INTEGRADA, operacaoTocaAparelho } from "@/lib/aparelhos/sale-reversal"
import { StockIdempotency } from "@/lib/estoque/stock-ledger-contract"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"
import { upsertVendaInTransaction, isPrismaUniqueConstraintError, type SalePayload, type UpsertVendaResult } from "@/lib/ops-upsert-venda"
import { allocateSaleNumberForWriter } from "@/lib/vendas/sale-writer-v2"
import { isRetryableSaleNumberingTransactionError } from "@/lib/vendas/server-sale-numbering"
import { parseClientSaleId } from "@/lib/vendas/sale-identity-contracts"
import {
  TROCA_PAYLOAD_SCHEMA,
  arredonda2,
  liquidosPorLinha,
  linhasComDisponibilidade,
  linhasDaVenda,
  paymentBreakdownDaTroca,
  planoTroca,
  statusVendaAposDevolucoes,
  validarLinhasDevolucao,
  type DestinoFisico,
  type DevolucaoPersistida,
  type FormaDiferenca,
  type PedidoLinhaDevolucao,
} from "@/lib/pdv/trocas/troca-disponibilidade"

export type ModoTroca = "troca" | "vale_credito" | "reembolso" | "somente_estoque"
export type FormaReembolso = "dinheiro" | "pix" | "estorno_cartao"

/** `tipo` persistido em `DevolucaoVenda` (contrato legado preservado). */
const TIPO_PERSISTIDO: Record<ModoTroca, string> = {
  troca: "troca",
  vale_credito: "vale_credito",
  reembolso: "devolucao",
  somente_estoque: "somente_estoque",
}

export class TrocaError extends Error {
  readonly code: string
  readonly status: number
  readonly detail?: Record<string, unknown>
  constructor(code: string, message: string, status = 409, detail?: Record<string, unknown>) {
    super(message)
    this.name = "TrocaError"
    this.code = code
    this.status = status
    this.detail = detail
  }
}

export type RegistrarTrocaInput = {
  storeId: string
  operationId: string
  pedidoIdOrigem: string
  modo: ModoTroca
  linhas: PedidoLinhaDevolucao[]
  novosItens?: Array<{ produtoId: string; quantidade: number }>
  formaDiferenca?: FormaDiferenca
  destinoExcedente?: "vale" | "dinheiro"
  formaReembolso?: FormaReembolso
  clienteDoc?: string
  clienteNome?: string
  motivo?: string
  sessaoId?: string | null
  terminalId?: string | null
  /** Rótulo do operador derivado da SESSÃO (nunca do corpo da requisição). */
  operadorLabel: string
  /** Writer V2 (numeração servidor) ativo — exigido pela troca imediata. */
  numeracaoServidor: boolean
}

export type ItemDevolvidoResultado = {
  lineIndex: number
  nome: string
  quantidade: number
  valor: number
  destino: DestinoFisico
  produtoId: string | null
}

export type ResultadoTroca = {
  schema: typeof TROCA_PAYLOAD_SCHEMA
  operationId: string
  modo: ModoTroca
  devolucaoId: string
  vendaOrigem: string
  novaVenda: { pedidoId: string; total: number } | null
  valorDevolvido: number
  totalNovaCompra: number
  creditoAplicado: number
  diferenca: { valor: number; forma: FormaDiferenca | null }
  excedente: { valor: number; destino: "vale" | "dinheiro" | null }
  /** Saldo de vale que fica com o cliente (vale-troca ou excedente em vale). */
  valeEmitido: number
  reembolso: { valor: number; forma: FormaReembolso; execucaoExterna: "pendente_manual" | null } | null
  itensDevolvidos: ItemDevolvidoResultado[]
  itensNovos: Array<{ produtoId: string; nome: string; quantidade: number; valorUnitario: number; valorTotal: number }>
  clienteNome: string
  clienteDoc: string
  operador: string
  motivo: string
  at: string
}

export type RegistrarTrocaSaida = {
  replayed: boolean
  resultado: ResultadoTroca
  /** Nova venda criada nesta chamada (para automação pós-commit). Ausente em replay. */
  vendaCriada?: { venda: UpsertVendaResult["venda"]; sale: SalePayload }
}

const OPERATION_ID_RE = /^trc_[A-Za-z0-9_-]{8,100}$/

function hashPedido(input: RegistrarTrocaInput): string {
  const canon = {
    pedido: input.pedidoIdOrigem.trim(),
    modo: input.modo,
    linhas: [...input.linhas].sort((a, b) => a.lineIndex - b.lineIndex).map((l) => [l.lineIndex, l.quantidade]),
    novos: [...(input.novosItens ?? [])].sort((a, b) => a.produtoId.localeCompare(b.produtoId)).map((n) => [n.produtoId, n.quantidade]),
    fd: input.formaDiferenca ?? null,
    ex: input.destinoExcedente ?? null,
    fr: input.formaReembolso ?? null,
    doc: normalizeDocDigits(input.clienteDoc ?? ""),
  }
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex")
}

function resultadoDoPayload(payload: unknown): ResultadoTroca | null {
  if (!payload || typeof payload !== "object") return null
  const r = (payload as { resultado?: unknown }).resultado
  return r && typeof r === "object" ? (r as ResultadoTroca) : null
}

async function replayExistente(
  tx: Prisma.TransactionClient,
  input: RegistrarTrocaInput,
  requestHash: string,
): Promise<ResultadoTroca | null> {
  const existente = await tx.devolucaoVenda.findUnique({
    where: { storeId_localId: { storeId: input.storeId, localId: input.operationId } },
    select: { payload: true, vendaLocalId: true },
  })
  if (!existente) return null
  const p = (existente.payload ?? {}) as { requestHash?: unknown }
  const resultado = resultadoDoPayload(existente.payload)
  if (existente.vendaLocalId !== input.pedidoIdOrigem.trim() || p.requestHash !== requestHash || !resultado) {
    throw new TrocaError(
      "OPERACAO_REUTILIZADA",
      "Esta operação já foi registrada com outros dados. Recarregue a venda e inicie uma nova troca.",
    )
  }
  return resultado
}

type ProdutoResolvido = { id: string; metadata: unknown }

async function resolverProdutoDaLinha(
  tx: Prisma.TransactionClient,
  storeId: string,
  produtoId: string,
  inventoryId: string,
): Promise<ProdutoResolvido | null> {
  const chaves = Array.from(new Set([produtoId, inventoryId].map((s) => s.trim()).filter(Boolean)))
  if (chaves.length === 0) return null
  // Identidade imutável primeiro (`Produto.id`), depois SKU / EAN gravados na linha.
  const porId = await tx.produto.findFirst({ where: { storeId, id: { in: chaves } }, select: { id: true, metadata: true } })
  if (porId) return porId
  return tx.produto.findFirst({
    where: { storeId, OR: [{ sku: { in: chaves } }, { barcode: { in: chaves } }] },
    select: { id: true, metadata: true },
  })
}

async function registrarNaTransacao(
  tx: Prisma.TransactionClient,
  input: RegistrarTrocaInput,
  requestHash: string,
): Promise<RegistrarTrocaSaida> {
  const storeId = input.storeId
  const pedidoId = input.pedidoIdOrigem.trim()

  const replay0 = await replayExistente(tx, input, requestHash)
  if (replay0) return { replayed: true, resultado: replay0 }

  // Serializa TODA devolução da mesma venda (troca, vale, reembolso, legado).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pdv-devolucao:${storeId}:${pedidoId}`}))`

  const replay1 = await replayExistente(tx, input, requestHash)
  if (replay1) return { replayed: true, resultado: replay1 }

  const venda = await tx.venda.findFirst({
    where: { storeId, pedidoId },
    select: {
      id: true,
      pedidoId: true,
      status: true,
      total: true,
      payload: true,
      clienteNome: true,
      itens: { select: { inventoryId: true, nome: true, quantidade: true, precoUnitario: true, lineTotal: true }, orderBy: { id: "asc" } },
    },
  })
  if (!venda) throw new TrocaError("VENDA_NAO_ENCONTRADA", "Venda não encontrada nesta loja.", 404)
  if (venda.status === "cancelada") throw new TrocaError("VENDA_CANCELADA", "Venda cancelada não admite troca ou devolução.")

  const devolucoesExistentes: DevolucaoPersistida[] = await tx.devolucaoVenda.findMany({
    where: { storeId, vendaLocalId: pedidoId },
    select: { id: true, localId: true, tipo: true, at: true, payload: true, itens: { select: { inventoryId: true, nome: true, quantidade: true } } },
  })
  const linhasOriginais = linhasDaVenda(venda.payload, venda.itens)
  const { linhas: disponiveis } = linhasComDisponibilidade(linhasOriginais, devolucoesExistentes)
  const liquidos = liquidosPorLinha(venda.total, linhasOriginais)
  const validacao = validarLinhasDevolucao(disponiveis, input.linhas, liquidos)
  if (!validacao.ok) throw new TrocaError(validacao.code, validacao.message)

  const selecionadas = validacao.linhas
  if (
    operacaoTocaAparelho(
      venda.payload,
      selecionadas.flatMap((s) => [s.linha.inventoryId, s.linha.produtoId]).filter(Boolean),
    )
  ) {
    throw new TrocaError(APARELHO_REVERSAO_NAO_INTEGRADA.code, APARELHO_REVERSAO_NAO_INTEGRADA.message)
  }

  const doc = normalizeDocDigits(input.clienteDoc ?? "")
  if (doc && doc.length !== 11 && doc.length !== 14) {
    throw new TrocaError("DOCUMENTO_INVALIDO", "CPF/CNPJ inválido: informe 11 ou 14 dígitos (ou deixe em branco).", 422)
  }
  const nome = (input.clienteNome ?? "").trim() || (venda.clienteNome ?? "").trim()
  const motivo = (input.motivo ?? "").trim().slice(0, 500)
  const valorDevolvido = validacao.valorTotal

  // Sessão de caixa: obrigatória e ABERTA quando há dinheiro/nova venda; senão opcional.
  const sessaoId = input.sessaoId?.trim() || null
  const exigeCaixa =
    input.modo === "troca" || (input.modo === "reembolso" && input.formaReembolso === "dinheiro")
  if (sessaoId) {
    const sessao = await tx.sessaoCaixa.findFirst({ where: { id: sessaoId, storeId }, select: { status: true } })
    if (!sessao) throw new TrocaError("CAIXA_SESSAO_INVALIDA", "Sessão de caixa não encontrada nesta loja.", 404)
    if (exigeCaixa && sessao.status !== "ABERTA") {
      throw new TrocaError("CAIXA_FECHADO", "O caixa está fechado. Abra o caixa para concluir a operação.")
    }
  } else if (exigeCaixa) {
    throw new TrocaError("CAIXA_FECHADO", "Abra o caixa para concluir a operação.")
  }

  // Validações específicas do modo ANTES de qualquer escrita.
  if (input.modo === "vale_credito" && (!doc || !nome)) {
    throw new TrocaError("TITULAR_OBRIGATORIO", "Vale-troca exige CPF/CNPJ e nome do titular do crédito.", 422)
  }
  if (input.modo === "reembolso" && !input.formaReembolso) {
    throw new TrocaError("FORMA_REEMBOLSO_OBRIGATORIA", "Informe a forma do reembolso.", 422)
  }
  if (input.modo === "somente_estoque" && !selecionadas.some((s) => s.linha.destino === "retorna_estoque")) {
    throw new TrocaError(
      "SEM_VINCULO_ESTOQUE",
      "Os itens selecionados não têm vínculo com o estoque (serviço ou item avulso). Use reembolso ou vale.",
    )
  }
  if (input.modo !== "somente_estoque" && !(valorDevolvido > 0) && input.modo !== "troca") {
    throw new TrocaError("VALOR_ZERO", "Os itens selecionados não têm valor a devolver.")
  }

  // ── Nova compra (troca imediata): preço do cadastro, nunca do cliente ──────────────
  type NovoItem = { produtoId: string; nome: string; quantidade: number; valorUnitario: number; valorTotal: number }
  const novos: NovoItem[] = []
  if (input.modo === "troca") {
    if (!input.numeracaoServidor) {
      throw new TrocaError(
        "TROCA_REQUER_NUMERACAO_SERVIDOR",
        "A troca imediata exige a numeração de vendas no servidor, que não está ativa neste ambiente.",
      )
    }
    const agregados = new Map<string, number>()
    for (const n of input.novosItens ?? []) {
      const id = (n.produtoId ?? "").trim()
      if (!id || !Number.isInteger(n.quantidade) || n.quantidade <= 0) {
        throw new TrocaError("NOVO_ITEM_INVALIDO", "Item da nova compra inválido.", 422)
      }
      agregados.set(id, (agregados.get(id) ?? 0) + n.quantidade)
    }
    if (agregados.size === 0) throw new TrocaError("SEM_ITENS_NOVOS", "Adicione ao menos um produto à nova compra.", 422)
    for (const [ref, quantidade] of agregados) {
      const prod = await tx.produto.findFirst({
        where: { storeId, OR: [{ id: ref }, { sku: ref }, { barcode: ref }] },
        select: { id: true, name: true, price: true, active: true, status: true, metadata: true, vestuarioGrade: { select: { id: true } } },
      })
      if (!prod) throw new TrocaError("NOVO_ITEM_NAO_ENCONTRADO", "Produto da nova compra não encontrado nesta loja.", 404, { ref })
      if (prod.active === false || /inativ/i.test(prod.status ?? "")) {
        throw new TrocaError("NOVO_ITEM_INATIVO", `${prod.name} está inativo no cadastro.`)
      }
      if (isSerializedDeviceProduct(prod.metadata)) {
        throw new TrocaError("NOVO_ITEM_APARELHO", `${prod.name} é aparelho por IMEI: venda pelo fluxo de aparelhos.`)
      }
      if (prod.vestuarioGrade) {
        throw new TrocaError("NOVO_ITEM_COM_GRADE", `${prod.name} tem grade de variações: não suportado na troca imediata.`)
      }
      const valorUnitario = arredonda2(prod.price)
      if (!(valorUnitario > 0)) throw new TrocaError("NOVO_ITEM_SEM_PRECO", `${prod.name} está sem preço de venda no cadastro.`)
      novos.push({ produtoId: prod.id, nome: prod.name, quantidade, valorUnitario, valorTotal: arredonda2(valorUnitario * quantidade) })
    }
  }
  const totalNovaCompra = arredonda2(novos.reduce((s, n) => s + n.valorTotal, 0))
  const plano = planoTroca(valorDevolvido, totalNovaCompra)
  const formaDiferenca: FormaDiferenca = input.formaDiferenca ?? "dinheiro"
  const destinoExcedente = input.modo === "troca" && plano.excedente > 0 ? input.destinoExcedente ?? null : null
  if (input.modo === "troca" && plano.excedente > 0) {
    if (!destinoExcedente) {
      throw new TrocaError("DESTINO_EXCEDENTE_OBRIGATORIO", "Escolha se a sobra vira vale ou é devolvida em dinheiro.", 422)
    }
    if (destinoExcedente === "vale" && (!doc || !nome)) {
      throw new TrocaError("TITULAR_OBRIGATORIO", "A sobra em vale exige CPF/CNPJ e nome do titular.", 422)
    }
  }
  const valeEmitido =
    input.modo === "vale_credito" ? valorDevolvido : destinoExcedente === "vale" ? plano.excedente : 0
  const creditoEmitido = input.modo === "troca" ? arredonda2(plano.creditoAplicado + valeEmitido) : valeEmitido
  const reembolsoValor =
    input.modo === "reembolso" ? valorDevolvido : destinoExcedente === "dinheiro" ? plano.excedente : 0
  const formaReembolso: FormaReembolso | null =
    input.modo === "reembolso" ? input.formaReembolso! : destinoExcedente === "dinheiro" ? "dinheiro" : null

  const at = new Date()
  const tipo = TIPO_PERSISTIDO[input.modo]

  // ── 1. Documento de devolução (linhas exatas por lineIndex) ──────────────────────
  const dev = await tx.devolucaoVenda.create({
    data: {
      storeId,
      localId: input.operationId,
      vendaLocalId: pedidoId,
      sessaoId,
      tipo,
      valorTotal: input.modo === "somente_estoque" ? 0 : valorDevolvido,
      creditoEmitido,
      clienteNome: nome,
      clienteDoc: doc,
      operador: input.operadorLabel,
      motivo,
      observacao: "",
      at,
      payload: {
        schema: TROCA_PAYLOAD_SCHEMA,
        operationId: input.operationId,
        requestHash,
        status: "processando",
        linhas: selecionadas.map((s) => ({ lineIndex: s.linha.lineIndex, quantidade: s.quantidade })),
      } as Prisma.InputJsonValue,
      itens: {
        create: selecionadas.map((s) => ({
          inventoryId: s.linha.inventoryId || null,
          nome: s.linha.name,
          quantidade: s.quantidade,
          valorUnitario: arredonda2(s.valor / s.quantidade),
          valorTotal: s.valor,
        })),
      },
    },
    select: { id: true },
  })

  // ── 2. Retorno físico ao estoque (boundary canônico, agregado por produto) ────────
  const itensDevolvidos: ItemDevolvidoResultado[] = []
  const entradaPorProduto = new Map<string, number>()
  for (const s of selecionadas) {
    let destino = s.linha.destino
    let produtoId: string | null = null
    if (destino === "retorna_estoque") {
      const prod = await resolverProdutoDaLinha(tx, storeId, s.linha.produtoId, s.linha.inventoryId)
      if (!prod) {
        destino = "sem_vinculo_estoque" // produto removido do cadastro: nenhum saldo inventado
      } else {
        if (isSerializedDeviceProduct(prod.metadata)) {
          throw new TrocaError(APARELHO_REVERSAO_NAO_INTEGRADA.code, APARELHO_REVERSAO_NAO_INTEGRADA.message)
        }
        produtoId = prod.id
        entradaPorProduto.set(prod.id, (entradaPorProduto.get(prod.id) ?? 0) + s.quantidade)
      }
    }
    itensDevolvidos.push({ lineIndex: s.linha.lineIndex, nome: s.linha.name, quantidade: s.quantidade, valor: s.valor, destino, produtoId })
  }
  if (input.modo === "somente_estoque" && entradaPorProduto.size === 0) {
    throw new TrocaError("SEM_VINCULO_ESTOQUE", "Nenhum item selecionado tem produto no cadastro para voltar ao estoque.")
  }
  for (const [produtoId, quantidade] of entradaPorProduto) {
    const r = await applyStockMutationTx(
      tx as unknown as StockLedgerTx,
      { storeId, principal: null, source: "ops-troca", operatorLabel: input.operadorLabel || null },
      {
        kind: "entrada",
        produtoId,
        quantidade,
        origem: "devolucao",
        documento: input.operationId,
        motivo: motivo || `Devolução da venda ${pedidoId}`,
        idempotencyKey: StockIdempotency.devolucao(input.operationId, produtoId),
      },
    )
    if (!r.ok) throw new TrocaError("ESTOQUE_FALHOU", `Retorno ao estoque recusado: ${r.message}`, 409, { code: r.code, produtoId })
  }

  // ── 3. Crédito (vale e/ou crédito de troca consumido pela nova venda) ─────────────
  let creditoId: string | null = null
  if (creditoEmitido > 0) {
    const c = await tx.clienteCredito.create({
      data: {
        storeId,
        clienteDoc: doc,
        clienteNome: nome,
        devolucaoId: dev.id,
        vendaOrigemId: pedidoId,
        valorOriginal: creditoEmitido,
        saldoAtual: creditoEmitido,
        status: "ativo",
      },
      select: { id: true },
    })
    creditoId = c.id
  }

  // ── 4. Nova venda pelo motor canônico (mesma transação) ──────────────────────────
  let novaVenda: ResultadoTroca["novaVenda"] = null
  let vendaCriada: RegistrarTrocaSaida["vendaCriada"]
  if (input.modo === "troca") {
    const clientSaleId = parseClientSaleId(input.operationId)
    if (!clientSaleId.ok) throw new TrocaError("OPERACAO_INVALIDA", "Identificador da operação inválido.", 400)
    const sale: SalePayload = {
      at: at.toISOString(),
      total: totalNovaCompra,
      customerName: nome || undefined,
      customerCpf: doc || undefined,
      sessaoId,
      terminalId: input.terminalId ?? null,
      paymentBreakdown: paymentBreakdownDaTroca(plano, formaDiferenca),
      lines: novos.map((n) => ({
        inventoryId: n.produtoId,
        produtoId: n.produtoId,
        name: n.nome,
        quantity: n.quantidade,
        unitPrice: n.valorUnitario,
        lineTotal: n.valorTotal,
        itemType: "produto",
      })),
      ...({ trocaOrigem: { vendaOrigem: pedidoId, devolucaoId: dev.id, operationId: input.operationId } } as Record<string, unknown>),
    } as SalePayload
    const r = await upsertVendaInTransaction(tx, storeId, sale, input.operadorLabel || undefined, {
      enforceStock: true,
      requireCaixaSession: true,
      finalizacaoAoVivo: true,
      ...(creditoId && plano.creditoAplicado > 0 ? { creditoValeCreditoId: creditoId } : {}),
      v2: { clientSaleId: clientSaleId.clientSaleId, allocate: (t) => allocateSaleNumberForWriter(t, storeId) },
    })
    if (r.replayed) {
      // A chave da operação já gerou uma venda fora deste fluxo: nunca reaproveitar.
      throw new TrocaError("OPERACAO_REUTILIZADA", "A chave desta operação já foi usada por outra venda.")
    }
    novaVenda = { pedidoId: r.venda.pedidoId, total: totalNovaCompra }
    vendaCriada = { venda: r.venda, sale }
  }

  // ── 5. Saída financeira SOMENTE quando dinheiro sai de fato (reembolso/excedente) ──
  // Vale-troca e crédito consumido na troca não são saída de caixa.
  if (reembolsoValor > 0 && formaReembolso) {
    await tx.movimentacaoFinanceira.create({
      data: {
        storeId,
        tipo: "saida",
        valor: reembolsoValor,
        descricao: `Devolução PDV — ${pedidoId} | reembolso ${formaReembolso}${nome ? ` | ${nome.slice(0, 80)}` : ""}`,
        origem: "devolucao_pdv",
        referenciaId: dev.id,
        createdAt: at,
      },
    })
  }

  // ── 6. Resultado + vínculo persistido + status da venda original ─────────────────
  const resultado: ResultadoTroca = {
    schema: TROCA_PAYLOAD_SCHEMA,
    operationId: input.operationId,
    modo: input.modo,
    devolucaoId: dev.id,
    vendaOrigem: pedidoId,
    novaVenda,
    valorDevolvido: input.modo === "somente_estoque" ? 0 : valorDevolvido,
    totalNovaCompra,
    creditoAplicado: input.modo === "troca" ? plano.creditoAplicado : 0,
    diferenca: { valor: input.modo === "troca" ? plano.diferenca : 0, forma: input.modo === "troca" && plano.diferenca > 0 ? formaDiferenca : null },
    excedente: { valor: input.modo === "troca" ? plano.excedente : 0, destino: destinoExcedente },
    valeEmitido,
    reembolso:
      reembolsoValor > 0 && formaReembolso
        ? { valor: reembolsoValor, forma: formaReembolso, execucaoExterna: formaReembolso === "estorno_cartao" ? "pendente_manual" : null }
        : null,
    itensDevolvidos,
    itensNovos: novos,
    clienteNome: nome,
    clienteDoc: doc,
    operador: input.operadorLabel,
    motivo,
    at: at.toISOString(),
  }
  await tx.devolucaoVenda.update({
    where: { id: dev.id },
    data: {
      payload: {
        schema: TROCA_PAYLOAD_SCHEMA,
        operationId: input.operationId,
        requestHash,
        status: "confirmada",
        linhas: selecionadas.map((s) => ({
          lineIndex: s.linha.lineIndex,
          quantidade: s.quantidade,
          destino: itensDevolvidos.find((i) => i.lineIndex === s.linha.lineIndex)?.destino,
        })),
        resultado,
      } as unknown as Prisma.InputJsonValue,
    },
  })

  const depois = linhasComDisponibilidade(linhasOriginais, [
    ...devolucoesExistentes,
    {
      id: dev.id,
      localId: input.operationId,
      tipo,
      at,
      payload: { schema: TROCA_PAYLOAD_SCHEMA, linhas: selecionadas.map((s) => ({ lineIndex: s.linha.lineIndex, quantidade: s.quantidade })) },
      itens: [],
    },
  ])
  const novoStatus = statusVendaAposDevolucoes(venda.status, depois.linhas)
  if (novoStatus !== venda.status) {
    await tx.venda.update({ where: { id: venda.id }, data: { status: novoStatus } })
  }

  return { replayed: false, resultado, ...(vendaCriada ? { vendaCriada } : {}) }
}

const TX_OPTS = { maxWait: 15_000, timeout: 25_000 } as const

export async function registrarTroca(input: RegistrarTrocaInput): Promise<RegistrarTrocaSaida> {
  if (!OPERATION_ID_RE.test(input.operationId)) {
    throw new TrocaError("OPERACAO_INVALIDA", "Identificador da operação inválido.", 400)
  }
  if (!input.pedidoIdOrigem.trim()) throw new TrocaError("VENDA_OBRIGATORIA", "Informe a venda de origem.", 400)
  const requestHash = hashPedido(input)

  const lock = await verificarPeriodoFechado(input.storeId, new Date())
  if (lock.fechado) {
    throw new TrocaError("PERIODO_FECHADO", "Período financeiro fechado. Reabra o fechamento para registrar devoluções.")
  }

  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => registrarNaTransacao(tx, input, requestHash), TX_OPTS)
    } catch (error) {
      lastError = error
      if (error instanceof TrocaError) throw error
      if (isPrismaUniqueConstraintError(error)) {
        // Corrida da MESMA operação (duas abas/clique duplo): a vencedora já gravou.
        const replay = await prisma.$transaction((tx) => replayExistente(tx, input, requestHash))
        if (replay) return { replayed: true, resultado: replay }
        throw error
      }
      if (!isRetryableSaleNumberingTransactionError(error)) throw error
    }
  }
  throw lastError
}
