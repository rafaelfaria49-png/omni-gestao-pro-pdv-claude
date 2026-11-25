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
import { sumPagamentosHistorico } from "@/lib/vendas/venda-financeiro-resumo"
import { ehTituloDaVenda, recebimentoDaVenda, titulosDaVendaWhere } from "@/lib/pdv/trocas/troca-recebimento"
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
  /**
   * Regularização de troca/devolução JÁ REALIZADA no balcão e não registrada a tempo
   * (P1-002). Reusa o contrato retroativo do motor (`allowClosedOriginalSession`): grava na
   * sessão de caixa ORIGINAL (fechada) e na data econômica real, com trilha de auditoria —
   * sem dinheiro novo na gaveta atual e sem sangria. Exige permissão de gerente (rota).
   */
  regularizacao?: {
    sessaoId: string
    dataEconomica: string
    justificativa: string
    /** Horário exato desconhecido: a data/hora informada é aproximada (registrado na trilha). */
    horarioAproximado?: boolean
    /**
     * Valores PRATICADOS na ocasião (P1-003), obrigatórios na troca regularizada: o preço do
     * cadastro pode ter mudado desde então. O servidor confere a coerência com o valor devolvido.
     */
    valoresConfirmados?: { totalNovaCompra: number; diferencaRecebida: number } | null
  } | null
  /** Executa tudo e DESFAZ no fim: devolve os efeitos para o operador conferir antes de confirmar. */
  simular?: boolean
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
  /** Regularização: retornos ao estoque já refletidos por contagem física posterior (não reaplicados). */
  estoqueAbsorvidoPorAjuste?: Array<{ produtoId: string; quantidade: number; inventario: string }>
  clienteNome: string
  clienteDoc: string
  operador: string
  motivo: string
  at: string
  /** Presente quando a operação regularizou uma troca já feita (data econômica ≠ registro). */
  regularizacao?: {
    dataEconomica: string
    registradaEm: string
    sessaoOriginal: string | null
    justificativa: string
    operador: string
    horarioAproximado: boolean
    precos?: { precoAtual: number; precoConfirmado: number; diferencaRecebida: number; divergente: boolean }
  } | null
}

export type RegistrarTrocaSaida = {
  replayed: boolean
  /** Resultado de simulação (transação desfeita — nada gravado). */
  simulado?: boolean
  resultado: ResultadoTroca
  /** Nova venda criada nesta chamada (para automação pós-commit). Ausente em replay. */
  vendaCriada?: { venda: UpsertVendaResult["venda"]; sale: SalePayload }
}

const OPERATION_ID_RE = /^trc_[A-Za-z0-9_-]{8,100}$/

function hashPedido(input: RegistrarTrocaInput): string {
  const canon = {
    pedido: input.pedidoIdOrigem.trim(),
    modo: input.modo,
    linhas: [...input.linhas].sort((a, b) => a.lineIndex - b.lineIndex).map((l) => [l.lineIndex, l.quantidade, l.naoRevendavel === true]),
    novos: [...(input.novosItens ?? [])].sort((a, b) => a.produtoId.localeCompare(b.produtoId)).map((n) => [n.produtoId, n.quantidade]),
    fd: input.formaDiferenca ?? null,
    reg: input.regularizacao
      ? [
          input.regularizacao.sessaoId,
          input.regularizacao.dataEconomica,
          input.regularizacao.horarioAproximado === true,
          input.regularizacao.valoresConfirmados
            ? [arredonda2(input.regularizacao.valoresConfirmados.totalNovaCompra), arredonda2(input.regularizacao.valoresConfirmados.diferencaRecebida)]
            : null,
        ]
      : null,
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

/** Movimento de CONTAGEM FÍSICA de inventário do produto depois de `desde` (chave do ledger). */
async function contagemFisicaPosterior(
  tx: Prisma.TransactionClient,
  storeId: string,
  produtoId: string,
  desde: Date,
): Promise<string | null> {
  const m = await tx.movimentacaoEstoque.findFirst({
    where: { storeId, produtoId, tipo: "ajuste", idempotencyKey: { startsWith: "inventario:" }, createdAt: { gt: desde } },
    select: { idempotencyKey: true },
    orderBy: { createdAt: "asc" },
  })
  return m?.idempotencyKey ?? null
}

class SimulacaoDesfeita extends Error {
  constructor(readonly saida: RegistrarTrocaSaida) {
    super("simulacao")
  }
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
      at: true,
      payload: true,
      clienteNome: true,
      contaReceberTituloId: true,
      itens: { select: { inventoryId: true, nome: true, quantidade: true, precoUnitario: true, lineTotal: true }, orderBy: { id: "asc" } },
    },
  })
  if (!venda) throw new TrocaError("VENDA_NAO_ENCONTRADA", "Venda não encontrada nesta loja.", 404)
  if (venda.status === "cancelada") throw new TrocaError("VENDA_CANCELADA", "Venda cancelada não admite troca ou devolução.")

  const devolucoesExistentes: DevolucaoPersistida[] = await tx.devolucaoVenda.findMany({
    where: { storeId, vendaLocalId: pedidoId },
    select: { id: true, localId: true, tipo: true, at: true, payload: true, valorTotal: true, itens: { select: { inventoryId: true, nome: true, quantidade: true } } },
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

  // Devolução financeira só devolve o que a loja RECEBEU (a prazo/carnê em aberto bloqueia).
  if (input.modo !== "somente_estoque") {
    const titulos = (
      await tx.contaReceberTitulo.findMany({
        where: titulosDaVendaWhere(storeId, pedidoId, venda.contaReceberTituloId),
        select: { id: true, localKey: true, status: true, valor: true, payload: true },
      })
    ).filter((t) => ehTituloDaVenda(t, pedidoId, venda.contaReceberTituloId))
    const pbOrigem = (venda.payload as { paymentBreakdown?: unknown } | null)?.paymentBreakdown
    const rec = recebimentoDaVenda(
      venda.total,
      pbOrigem,
      titulos.map((t) => ({ status: t.status, valor: t.valor, pago: sumPagamentosHistorico(t.payload) })),
    )
    if (rec.saldoAberto > 0.009) {
      throw new TrocaError(
        "VENDA_COM_SALDO_EM_ABERTO",
        rec.carne > 0
          ? `Esta venda tem ${rec.carne.toFixed(2).replace(".", ",")} em carnê, sem controle de recebimento no sistema: reembolso, vale e troca não são liberados automaticamente. Use "Apenas estoque" e trate o valor com o Financeiro.`
          : `Esta venda ainda tem ${rec.saldoAberto.toFixed(2).replace(".", ",")} a receber (a prazo). Reembolso, vale e troca ficam bloqueados até a quitação do título; use "Apenas estoque" ou trate o título no Financeiro.`,
        409,
        { recebido: rec.recebido, saldoAberto: rec.saldoAberto },
      )
    }
    const jaDevolvidoFinanceiro = devolucoesExistentes
      .filter((d) => d.tipo !== "somente_estoque")
      .reduce((s, d) => s + (Number(d.valorTotal) || 0), 0)
    if (jaDevolvidoFinanceiro + validacao.valorTotal > rec.recebido + 0.009) {
      throw new TrocaError("DEVOLUCAO_ACIMA_DO_RECEBIDO", "O valor a devolver passa do que foi efetivamente recebido nesta venda.", 409, {
        recebido: rec.recebido,
        jaDevolvido: arredonda2(jaDevolvidoFinanceiro),
      })
    }
  }

  const doc = normalizeDocDigits(input.clienteDoc ?? "")
  if (doc && doc.length !== 11 && doc.length !== 14) {
    throw new TrocaError("DOCUMENTO_INVALIDO", "CPF/CNPJ inválido: informe 11 ou 14 dígitos (ou deixe em branco).", 422)
  }
  const nome = (input.clienteNome ?? "").trim() || (venda.clienteNome ?? "").trim()
  const motivo = (input.motivo ?? "").trim().slice(0, 500)
  const valorDevolvido = validacao.valorTotal

  // Sessão de caixa: obrigatória e ABERTA quando há dinheiro/nova venda; senão opcional.
  // Na regularização, é a sessão ORIGINAL (fechada) que recebeu o dinheiro na época.
  const reg = input.regularizacao ?? null
  let sessaoId = (reg ? reg.sessaoId : input.sessaoId)?.trim() || null
  const exigeCaixa =
    input.modo === "troca" || (input.modo === "reembolso" && input.formaReembolso === "dinheiro")
  let dataEconomica: Date | null = null
  if (reg) {
    dataEconomica = new Date(reg.dataEconomica)
    if (!sessaoId || Number.isNaN(dataEconomica.getTime()) || dataEconomica.getTime() > Date.now()) {
      throw new TrocaError("REGULARIZACAO_INVALIDA", "Informe a data/hora real da troca (no passado) e a sessão de caixa da época.", 422)
    }
    if ((reg.justificativa ?? "").trim().length < 10) {
      throw new TrocaError("REGULARIZACAO_INVALIDA", "Descreva a justificativa da regularização (mínimo 10 caracteres).", 422)
    }
    const s = await tx.$queryRaw<Array<{ status: string; abertaEm: Date; fechadaEm: Date | null }>>`
      SELECT "status"::text AS status, "abertaEm", "fechadaEm" FROM "sessoes_caixa"
      WHERE "id" = ${sessaoId} AND "storeId" = ${storeId} FOR UPDATE`
    const sessaoOrig = s[0]
    if (!sessaoOrig) throw new TrocaError("CAIXA_SESSAO_INVALIDA", "Sessão de caixa não encontrada nesta loja.", 404)
    if (sessaoOrig.status !== "FECHADA" || !sessaoOrig.fechadaEm) {
      throw new TrocaError("REGULARIZACAO_SESSAO_ABERTA", "A sessão escolhida ainda está aberta: registre a troca normalmente, sem regularização.")
    }
    const t = dataEconomica.getTime()
    if (t < new Date(sessaoOrig.abertaEm).getTime() || t > new Date(sessaoOrig.fechadaEm).getTime()) {
      throw new TrocaError("REGULARIZACAO_FORA_DA_SESSAO", "A data informada está fora do horário da sessão de caixa escolhida.", 422)
    }
    if (t < new Date(venda.at).getTime()) {
      throw new TrocaError("REGULARIZACAO_ANTES_DA_VENDA", "A data da troca não pode ser anterior à venda original.", 422)
    }
  } else if (sessaoId) {
    // Trava a linha da sessão (mesma trava do fechamento de caixa): um reembolso não entra
    // numa sessão que está sendo fechada, e o fechamento recalcula com este reembolso incluído.
    const travada = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status"::text AS status FROM "sessoes_caixa" WHERE "id" = ${sessaoId} AND "storeId" = ${storeId} FOR UPDATE`
    const sessao = travada[0] ?? null
    if (!sessao) throw new TrocaError("CAIXA_SESSAO_INVALIDA", "Sessão de caixa não encontrada nesta loja.", 404)
    if (exigeCaixa && sessao.status !== "ABERTA") {
      throw new TrocaError("CAIXA_FECHADO", "O caixa está fechado. Abra o caixa para concluir a operação.")
    }
    // Sem dinheiro na gaveta (vale, Pix, estorno, estoque) e caixa já fechado: não vincula a uma
    // sessão encerrada — senão a operação apareceria no fechamento de um dia que já foi conferido.
    if (sessao.status !== "ABERTA") sessaoId = null
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
  type NovoItem = {
    produtoId: string
    nome: string
    quantidade: number
    valorUnitario: number
    valorTotal: number
    /** Códigos resolvidos NO SERVIDOR no momento da troca (snapshot histórico da linha). */
    sku?: string
    barcode?: string
  }
  const novos: NovoItem[] = []
  if (input.modo === "troca") {
    // A nova venda SEMPRE recebe o número do alocador canônico do servidor (série da loja),
    // nunca um número gerado no navegador — independe do gate que escolhe o writer do PDV.
    // Loja sem código de numeração → erro explícito do alocador (SALE_NUMBERING_NOT_CONFIGURED).
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
        select: { id: true, name: true, sku: true, barcode: true, price: true, active: true, status: true, metadata: true, vestuarioGrade: { select: { id: true } } },
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
      novos.push({
        produtoId: prod.id,
        nome: prod.name,
        quantidade,
        valorUnitario,
        valorTotal: arredonda2(valorUnitario * quantidade),
        ...(prod.sku ? { sku: prod.sku } : {}),
        ...(prod.barcode ? { barcode: prod.barcode } : {}),
      })
    }
  }
  const precoAtualNovaCompra = arredonda2(novos.reduce((s, n) => s + n.valorTotal, 0))
  let totalNovaCompra = precoAtualNovaCompra
  // ── Valor histórico confirmado (só regularização de troca) ──────────────────────────
  const vc = reg?.valoresConfirmados ?? null
  if (vc && (!reg || input.modo !== "troca")) {
    throw new TrocaError("VALOR_CONFIRMADO_SO_REGULARIZACAO", "Valor confirmado só é aceito na regularização de troca.", 422)
  }
  let precosTrilha: { precoAtual: number; precoConfirmado: number; diferencaRecebida: number; divergente: boolean } | null = null
  if (reg && input.modo === "troca") {
    if (!vc) {
      throw new TrocaError(
        "REGULARIZACAO_VALOR_HISTORICO_OBRIGATORIO",
        "Na regularização, confirme o valor cobrado pela nova compra na ocasião e a diferença efetivamente recebida.",
        422,
        { precoAtual: precoAtualNovaCompra },
      )
    }
    const conf = arredonda2(vc.totalNovaCompra)
    if (!(conf > 0)) throw new TrocaError("REGULARIZACAO_VALORES_INCONSISTENTES", "Valor confirmado da nova compra inválido.", 422)
    const diferencaEsperada = arredonda2(Math.max(0, conf - valorDevolvido))
    if (Math.abs(arredonda2(vc.diferencaRecebida) - diferencaEsperada) > 0.009) {
      throw new TrocaError(
        "REGULARIZACAO_VALORES_INCONSISTENTES",
        `Os valores não fecham: devolvido ${valorDevolvido.toFixed(2)} e nova compra ${conf.toFixed(2)} resultam em diferença de ${diferencaEsperada.toFixed(2)}, não ${arredonda2(vc.diferencaRecebida).toFixed(2)}. Revise antes de regularizar.`,
        422,
        { diferencaEsperada, valorDevolvido },
      )
    }
    // Rateio determinístico do valor confirmado entre os itens novos (proporcional ao preço atual,
    // em centavos); cada linha precisa fechar exatamente em unitário × quantidade.
    const pesos = novos.map((nv) => Math.round(nv.valorTotal * 100))
    const somaPesos = pesos.reduce((a, b) => a + b, 0)
    const alvo = Math.round(conf * 100)
    const base = pesos.map((p) => Math.floor((p * alvo) / somaPesos))
    let resto = alvo - base.reduce((a, b) => a + b, 0)
    for (let i = 0; resto > 0; i = (i + 1) % base.length, resto -= 1) base[i]! += 1
    novos.forEach((nv, i) => {
      const totalCent = base[i]!
      if (totalCent % nv.quantidade !== 0) {
        throw new TrocaError("REGULARIZACAO_VALOR_NAO_DIVISIVEL", "O valor confirmado não se divide exatamente pelas unidades da nova compra. Revise os itens.", 422)
      }
      nv.valorUnitario = totalCent / nv.quantidade / 100
      nv.valorTotal = totalCent / 100
    })
    totalNovaCompra = conf
    precosTrilha = {
      precoAtual: precoAtualNovaCompra,
      precoConfirmado: conf,
      diferencaRecebida: diferencaEsperada,
      divergente: Math.abs(conf - precoAtualNovaCompra) > 0.009,
    }
  }
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

  const at = dataEconomica ?? new Date()
  const regularizacaoTrilha = reg
    ? {
        dataEconomica: at.toISOString(),
        registradaEm: new Date().toISOString(),
        sessaoOriginal: sessaoId,
        justificativa: reg.justificativa.trim().slice(0, 500),
        operador: input.operadorLabel,
        horarioAproximado: reg.horarioAproximado === true,
        ...(precosTrilha ? { precos: precosTrilha } : {}),
      }
    : null
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
    if (destino === "retorna_estoque" && s.naoRevendavel) {
      // Defeito / sem condição de venda: não volta ao estoque vendável (tratamento explícito).
      destino = "nao_revendavel"
    }
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
  if (selecionadas.some((s) => s.naoRevendavel) && motivo.length < 5) {
    throw new TrocaError("MOTIVO_AVARIA_OBRIGATORIO", "Descreva o defeito do item que não volta ao estoque vendável.", 422)
  }
  // Regularização: só uma CONTAGEM FÍSICA de inventário (ledger `inventario:<sessão>:<produto>`)
  // feita depois da data econômica absorve o movimento — ela fixou o saldo físico real.
  // Ajuste administrativo, correção de cadastro, ajuste relativo e reconciliação estrutural NÃO.
  const estoqueAbsorvidoPorAjuste: Array<{ produtoId: string; quantidade: number; inventario: string }> = []
  for (const [produtoId, quantidade] of entradaPorProduto) {
    if (regularizacaoTrilha) {
      // Trava o produto ANTES de procurar a contagem: uma contagem concorrente que comite nesse
      // intervalo seria ignorada e o retorno somaria por cima dela (dupla contagem, provado em PG).
      await tx.$queryRaw`SELECT "id" FROM "estoque_produtos" WHERE "id" = ${produtoId} AND "storeId" = ${storeId} FOR UPDATE`
      const contagem = await contagemFisicaPosterior(tx, storeId, produtoId, at)
      if (contagem) {
        estoqueAbsorvidoPorAjuste.push({ produtoId, quantidade, inventario: contagem })
        continue
      }
    }
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
        ...(regularizacaoTrilha ? { observacao: `Regularização da troca de ${regularizacaoTrilha.dataEconomica} (registrada em ${regularizacaoTrilha.registradaEm})` } : {}),
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
        ...(n.sku ? { sku: n.sku } : {}),
        ...(n.barcode ? { barcode: n.barcode } : {}),
      })),
      ...({
        trocaOrigem: { vendaOrigem: pedidoId, devolucaoId: dev.id, operationId: input.operationId },
        ...(regularizacaoTrilha ? { regularizacaoTroca: regularizacaoTrilha } : {}),
      } as Record<string, unknown>),
    } as SalePayload
    const r = await upsertVendaInTransaction(tx, storeId, sale, input.operadorLabel || undefined, {
      enforceStock: true,
      requireCaixaSession: true,
      // Regularização: grava na sessão original fechada (contrato retroativo do motor, auditado).
      // + `historicalRecovery`: a baixa do item novo é pulada se uma contagem posterior já a refletiu.
      ...(regularizacaoTrilha
        ? { allowClosedOriginalSession: true, historicalRecovery: true, historicalAbsorcaoSomenteInventario: true }
        : { finalizacaoAoVivo: true }),
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
    ...(estoqueAbsorvidoPorAjuste.length > 0 ? { estoqueAbsorvidoPorAjuste } : {}),
    clienteNome: nome,
    clienteDoc: doc,
    operador: input.operadorLabel,
    motivo,
    at: at.toISOString(),
    ...(regularizacaoTrilha ? { regularizacao: regularizacaoTrilha } : {}),
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

/**
 * Deadlock/serialização transitórios entre trocas concorrentes (estoque de um produto × alocação
 * de número × estoque de outro). Vindo de SQL cru o Prisma devolve P2010 com o SQLSTATE na
 * mensagem, não P2034 — a transação inteira foi revertida, então repetir é seguro.
 */
function isTransientLockError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  const msg = error instanceof Error ? error.message : String(error)
  return code === "P2034" || /40P01|40001|deadlock detected|could not serialize access/i.test(msg)
}

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
  if (input.regularizacao) {
    // A data econômica cai num período que também não pode estar fechado no Financeiro.
    const d = new Date(input.regularizacao.dataEconomica)
    if (!Number.isNaN(d.getTime())) {
      const lockEco = await verificarPeriodoFechado(input.storeId, d)
      if (lockEco.fechado) {
        throw new TrocaError("PERIODO_FECHADO", "O período financeiro da data da troca está fechado. Reabra-o no Financeiro para regularizar.")
      }
    }
  }

  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const out = await registrarNaTransacao(tx, input, requestHash)
        // Simulação: tudo foi executado de verdade (mesmas regras/travas); o throw desfaz a transação.
        if (input.simular && !out.replayed) throw new SimulacaoDesfeita(out)
        return out
      }, TX_OPTS)
    } catch (error) {
      lastError = error
      if (error instanceof SimulacaoDesfeita) return { replayed: false, simulado: true, resultado: error.saida.resultado }
      if (error instanceof TrocaError) throw error
      if (isPrismaUniqueConstraintError(error)) {
        // Corrida da MESMA operação (duas abas/clique duplo): a vencedora já gravou.
        const replay = await prisma.$transaction((tx) => replayExistente(tx, input, requestHash))
        if (replay) return { replayed: true, resultado: replay }
        throw error
      }
      if (!isRetryableSaleNumberingTransactionError(error) && !isTransientLockError(error)) throw error
    }
  }
  throw lastError
}
