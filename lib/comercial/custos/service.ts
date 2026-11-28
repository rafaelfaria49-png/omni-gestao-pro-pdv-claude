/**
 * Serviço de custos comerciais e preparação para revenda (OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001 · ADR-0025).
 *
 * Toda escrita recebe o contexto PROVADO pelo servidor (o mesmo `AparelhoCtx` do módulo Aparelhos) e
 * roda numa única transação com a unidade travada (`FOR UPDATE`). Idempotência por `operationId` do
 * cliente: mesma chave + mesmo conteúdo = replay; mesma chave + conteúdo diferente = 409.
 *
 * Origens (ver `contracts.ts`): estoque | preexistente | vinculo_financeiro | nova_compra | gerencial.
 * Nenhuma origem cria movimento de dinheiro. `nova_compra` cria UMA obrigação pendente em Contas a Pagar
 * pelo contrato canônico; o pagamento efetivo é feito no Financeiro.
 */
import type { Prisma, AparelhoFisico, ComercialCustoLancamento } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { buildIdempotencyKey } from "@/lib/estoque/stock-ledger-contract"
import { buildContaPagarLocalKey } from "@/lib/financeiro/contracts/local-key"
import { appendFinanceiroHistorico, buildContaPagarPayload } from "@/lib/financeiro/contracts/payload"
import { FINANCEIRO_ORIGEM } from "@/lib/financeiro/contracts/origem"
import { normalizePagarStatus } from "@/lib/financeiro/contracts/status"
import {
  AparelhoFailError, aparelhoDto, eventoTx, fail, lockUnitTx, runAparelhoTx, transicionarTx,
  type AparelhoCtx, type Fail,
} from "@/lib/aparelhos/service"
import { isSerializedDeviceProduct } from "@/lib/aparelhos/serialized-product"
import { sha256Json } from "@/lib/aparelhos/sale-hook-shared"
import { localDateKey } from "@/lib/aparelhos/warranty"
import {
  CATEGORIAS_POR_ORIGEM, CUSTO_ORIGEM_LABEL, ETAPAS_PREPARACAO, FINALIDADES, FUNCIONAMENTO, UNIDADE_CATEGORIAS,
  isCustoCategoria, isCustoOrigem, isCustoStatus, sanitizeConferencias,
  type CustoCategoria, type CustoOrigem, type CustoStatus, type EtapaPreparacao, type OrigemFinanceiraTipo,
} from "./contracts"
import { asCentavos, centavosParaReais, ratearCentavos, reaisLegadoParaCentavos } from "./money"
import { comporCusto, indicadoresPreco } from "./composicao"

type Db = typeof prisma
export type ComercialCtx = AparelhoCtx

function stop(status: number, code: string, message: string, field?: string): never {
  throw new AparelhoFailError(fail(status, code, message, field))
}

const OPERATION_ID = /^[A-Za-z0-9_-]{8,100}$/
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const UNIDADE_SEM_NOVO_CUSTO = new Set(["vendido", "baixado"])

/** Categoria de Contas a Pagar reconhecida pelo Relatório Geral como compra/insumo (não despesa operacional). */
const CATEGORIA_FINANCEIRA: Record<Exclude<CustoCategoria, "mao_obra_interna">, string> = {
  peca: "Peças e insumos de preparação (estoque)",
  servico_terceirizado: "Serviço terceirizado de preparação (estoque)",
  frete: "Frete de mercadoria (estoque)",
  outro: "Custos de preparação de mercadoria (estoque)",
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

export type NovaCompraInput = {
  condicao: "a_vista" | "a_prazo"
  vencimento: string
  fornecedorId: string | null
  fornecedorNome: string
  numeroDocumento: string
}

export type LancamentoInput = {
  operationId: string
  origem: CustoOrigem
  categoria: CustoCategoria
  descricao: string
  quantidade: number
  /** Valor TOTAL do lançamento em centavos; null = desconhecido (ou calculado: estoque/rateio). */
  valorCentavos: number | null
  custoStatus: CustoStatus
  produtoId: string | null
  justificativa: string
  origemFinanceira: { tipo: OrigemFinanceiraTipo; referenciaId: string; quantidadeTotal: number | null } | null
  novaCompra: NovaCompraInput | null
}

function isDateKey(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`))
}

export function parseLancamentoInput(raw: unknown): { ok: true; input: LancamentoInput } | Fail {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const operationId = str(r.operationId, 100)
  if (!OPERATION_ID.test(operationId)) return fail(400, "OPERACAO_INVALIDA", "operationId inválido (8–100 caracteres A-Z, 0-9, _ ou -).", "operationId")
  if (!isCustoOrigem(r.origem)) return fail(400, "ORIGEM_INVALIDA", "Origem do custo inválida.", "origem")
  const origem = r.origem
  const categoria = r.categoria === undefined && origem === "gerencial" ? "mao_obra_interna" : r.categoria
  if (!isCustoCategoria(categoria) || !CATEGORIAS_POR_ORIGEM[origem].includes(categoria)) {
    return fail(400, "CATEGORIA_INVALIDA", `Categoria não aceita para "${CUSTO_ORIGEM_LABEL[origem]}".`, "categoria")
  }
  const quantidade = r.quantidade === undefined ? 1 : r.quantidade
  if (typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10_000) {
    return fail(400, "QUANTIDADE_INVALIDA", "Quantidade deve ser inteira entre 1 e 10.000.", "quantidade")
  }
  const custoStatus = r.custoStatus === undefined ? "conhecido" : r.custoStatus
  if (!isCustoStatus(custoStatus)) return fail(400, "CUSTO_STATUS_INVALIDO", "Situação do custo inválida.", "custoStatus")
  let valorCentavos: number | null = null
  if (r.valorCentavos !== undefined && r.valorCentavos !== null) {
    valorCentavos = asCentavos(r.valorCentavos)
    if (valorCentavos === null) return fail(400, "VALOR_INVALIDO", "Valor inválido (centavos inteiros ≥ 0).", "valorCentavos")
  }
  if (custoStatus === "desconhecido" && valorCentavos !== null) {
    return fail(400, "VALOR_COM_CUSTO_DESCONHECIDO", "Custo desconhecido não leva valor (desconhecido não é zero).", "valorCentavos")
  }
  const justificativa = str(r.justificativa, 500)
  const descricao = str(r.descricao, 160)
  const produtoId = str(r.produtoId, 64) || null

  let origemFinanceira: LancamentoInput["origemFinanceira"] = null
  let novaCompra: NovaCompraInput | null = null
  switch (origem) {
    case "estoque":
      if (!produtoId) return fail(400, "PRODUTO_OBRIGATORIO", "Selecione o produto do estoque.", "produtoId")
      if (custoStatus !== "conhecido" || valorCentavos !== null) {
        return fail(400, "CUSTO_DO_ESTOQUE", "O custo do material do estoque vem do custo médio histórico — não é digitado.", "valorCentavos")
      }
      break
    case "preexistente":
      if (justificativa.length < 10) return fail(400, "JUSTIFICATIVA_OBRIGATORIA", "Explique a origem do material preexistente (mínimo 10 caracteres).", "justificativa")
      if (custoStatus !== "desconhecido" && valorCentavos === null) return fail(400, "VALOR_OBRIGATORIO", "Informe o custo conhecido ou estimado.", "valorCentavos")
      if (!descricao) return fail(400, "DESCRICAO_OBRIGATORIA", "Descreva o material.", "descricao")
      break
    case "gerencial":
      if (custoStatus === "desconhecido") return fail(400, "VALOR_OBRIGATORIO", "Mão de obra interna exige valor conhecido ou estimado.", "valorCentavos")
      if (valorCentavos === null) return fail(400, "VALOR_OBRIGATORIO", "Informe o valor da mão de obra.", "valorCentavos")
      if (!descricao) return fail(400, "DESCRICAO_OBRIGATORIA", "Descreva o serviço interno.", "descricao")
      break
    case "vinculo_financeiro": {
      const of = (r.origemFinanceira && typeof r.origemFinanceira === "object" ? r.origemFinanceira : {}) as Record<string, unknown>
      const tipo = of.tipo === "gestor_money_gasto" ? "gestor_money_gasto" : of.tipo === "conta_pagar" ? "conta_pagar" : null
      const referenciaId = str(of.referenciaId, 64)
      if (!tipo || !referenciaId) return fail(400, "ORIGEM_FINANCEIRA_OBRIGATORIA", "Selecione a compra ou gasto já registrado.", "origemFinanceira")
      const qt = of.quantidadeTotal
      const quantidadeTotal = qt === undefined || qt === null ? null : typeof qt === "number" && Number.isInteger(qt) && qt >= 1 && qt <= 100_000 ? qt : NaN
      if (Number.isNaN(quantidadeTotal)) return fail(400, "QUANTIDADE_ORIGEM_INVALIDA", "Quantidade total da compra inválida.", "origemFinanceira.quantidadeTotal")
      if (custoStatus === "desconhecido") return fail(400, "CUSTO_DA_ORIGEM", "O custo vem do registro financeiro vinculado.", "custoStatus")
      origemFinanceira = { tipo, referenciaId, quantidadeTotal: quantidadeTotal as number | null }
      break
    }
    case "nova_compra": {
      if (custoStatus !== "conhecido" || valorCentavos === null || valorCentavos <= 0) {
        return fail(400, "VALOR_OBRIGATORIO", "Nova compra exige o valor conhecido e maior que zero.", "valorCentavos")
      }
      if (!descricao) return fail(400, "DESCRICAO_OBRIGATORIA", "Descreva a compra.", "descricao")
      const nc = (r.novaCompra && typeof r.novaCompra === "object" ? r.novaCompra : {}) as Record<string, unknown>
      const condicao = nc.condicao === "a_prazo" ? "a_prazo" : "a_vista"
      const hoje = localDateKey(new Date())
      const vencimento = condicao === "a_vista" ? hoje : str(nc.vencimento, 10)
      if (!isDateKey(vencimento) || vencimento < hoje) return fail(400, "VENCIMENTO_INVALIDO", "Vencimento da compra a prazo deve ser hoje ou depois.", "novaCompra.vencimento")
      novaCompra = {
        condicao, vencimento,
        fornecedorId: str(nc.fornecedorId, 64) || null,
        fornecedorNome: str(nc.fornecedorNome, 120),
        numeroDocumento: str(nc.numeroDocumento, 60),
      }
      break
    }
  }
  return {
    ok: true,
    input: { operationId, origem, categoria, descricao, quantidade, valorCentavos, custoStatus, produtoId, justificativa, origemFinanceira, novaCompra },
  }
}

// ─── Permissões ──────────────────────────────────────────────────────────────

function exigirPermissaoLancamento(ctx: ComercialCtx, origem: CustoOrigem) {
  // Material do estoque pode ser aplicado por quem prepara (técnico); custos com valor digitado
  // ou efeito financeiro exigem quem define custo (gerente/proprietário).
  if (origem === "estoque" ? !(ctx.perms.editar || ctx.perms.definirCusto) : !ctx.perms.definirCusto) {
    stop(403, "SEM_PERMISSAO_CUSTO", "Sem permissão para lançar este custo.")
  }
}

function assertUnidadeAceitaCusto(unit: AparelhoFisico) {
  if (UNIDADE_SEM_NOVO_CUSTO.has(unit.status)) {
    stop(409, "UNIDADE_SEM_NOVO_CUSTO", unit.status === "vendido"
      ? "Unidade vendida: o custo histórico está congelado na venda."
      : "Unidade baixada não recebe custo.")
  }
  if (unit.propriedade !== "loja") {
    stop(409, "PROPRIEDADE_PENDENTE", "A unidade ainda não é da loja. Manutenção de aparelho de cliente é feita pela OS, não por preparação.")
  }
}

// ─── Lançamento ──────────────────────────────────────────────────────────────

type LancamentoRow = ComercialCustoLancamento

function chaveLancamento(aparelhoId: string, operationId: string) {
  return `custo:${aparelhoId}:${operationId}`
}

async function replayOuConflito(tx: Prisma.TransactionClient, storeId: string, idempotencyKey: string, hash: string) {
  const existente = await tx.comercialCustoLancamento.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey } } })
  if (!existente) return null
  if (existente.payloadHash !== hash) stop(409, "OPERACAO_REUTILIZADA", "Esta operação já foi registrada com outro conteúdo.")
  return existente
}

/** Cria (uma vez) a obrigação da nova compra. Idempotente pela localKey derivada do operationId. */
async function criarObrigacaoCompraTx(
  tx: Prisma.TransactionClient,
  ctx: ComercialCtx,
  args: {
    operationId: string; categoria: Exclude<CustoCategoria, "mao_obra_interna">; descricao: string; valorCentavos: number; compra: NovaCompraInput; documento: string
    /** Unidade(s) que recebem a obrigação — entra na chave (revisão P1-3: mesmo operationId em outra unidade ≠ mesmo título). */
    escopo: readonly string[]
  },
): Promise<{ tituloId: string }> {
  const escopoHash = sha256Json(["comercial-custo-escopo", ctx.storeId, [...args.escopo].sort(), args.operationId]).slice(0, 40)
  const localKey = buildContaPagarLocalKey({ kind: "pagar_manual", storeId: ctx.storeId, uuid: `comercial-custo-${escopoHash}` })
  if (args.compra.fornecedorId) {
    const f = await tx.fornecedor.findFirst({ where: { id: args.compra.fornecedorId, storeId: ctx.storeId }, select: { id: true } })
    if (!f) stop(422, "FORNECEDOR_INVALIDO", "Fornecedor não encontrado nesta loja.", "novaCompra.fornecedorId")
  }
  const categoriaFinanceira = CATEGORIA_FINANCEIRA[args.categoria]
  const payload = appendFinanceiroHistorico(
    buildContaPagarPayload({
      origem: FINANCEIRO_ORIGEM.SISTEMA,
      planoContas: categoriaFinanceira,
      categoria: categoriaFinanceira,
      referencia: args.documento,
      numeroDocumento: args.compra.numeroDocumento || args.documento,
      createdFrom: "comercial.custos.nova_compra",
      ...(args.compra.fornecedorId ? { fornecedorId: args.compra.fornecedorId } : {}),
      ...(args.compra.fornecedorNome ? { fornecedorNome: args.compra.fornecedorNome } : {}),
      metadata: {
        comercialCustoOperationId: args.operationId,
        comercialCustoEscopo: escopoHash,
        comercialCustoAparelhoIds: [...args.escopo].sort(),
        condicao: args.compra.condicao,
        apropriacao: "custo de mercadoria em preparação — não somar como despesa operacional e CMV ao mesmo tempo",
      },
    }),
    { tipo: "criacao", userLabel: ctx.actorLabel, observacao: `Compra para preparação (${args.documento})` },
  )
  await tx.contaPagarTitulo.createMany({
    data: [{
      storeId: ctx.storeId,
      localKey,
      fornecedorId: args.compra.fornecedorId,
      descricao: `${args.descricao} — preparação ${args.documento}`.slice(0, 240),
      valor: centavosParaReais(args.valorCentavos),
      vencimento: args.compra.vencimento,
      status: "pendente",
      numeroDocumento: args.compra.numeroDocumento || args.documento,
      payload: payload as Prisma.InputJsonValue,
    }],
    skipDuplicates: true,
  })
  const titulo = await tx.contaPagarTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: ctx.storeId, localKey } }, select: { id: true, valor: true } })
  if (reaisLegadoParaCentavos(titulo.valor) !== args.valorCentavos) {
    stop(409, "OPERACAO_REUTILIZADA", "Esta compra já foi registrada com outro valor.")
  }
  return { tituloId: titulo.id }
}

type OrigemTravada = { id: string; valorTotalCentavos: number; quantidadeTotal: number; usadoCentavos: number; usadoQuantidade: number }

/** Localiza/cria a origem financeira e trava sua capacidade (advisory lock por origem). */
async function travarOrigemFinanceiraTx(
  tx: Prisma.TransactionClient,
  ctx: ComercialCtx,
  of: NonNullable<LancamentoInput["origemFinanceira"]>,
): Promise<OrigemTravada> {
  if (of.tipo === "gestor_money_gasto") {
    stop(409, "GESTOR_MONEY_NAO_DISPONIVEL", "O vínculo com gastos do Gestor Money ainda não está publicado nesta implantação. Vincule pelo título em Contas a Pagar.")
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`comercial-origem:${ctx.storeId}:${of.tipo}:${of.referenciaId}`}))`
  let origem = await tx.comercialCustoOrigem.findUnique({
    where: { storeId_tipo_referenciaId: { storeId: ctx.storeId, tipo: of.tipo, referenciaId: of.referenciaId } },
  })
  // O título é RELIDO a cada rateio (revisão P2-1): cancelado/estornado ou com valor alterado depois
  // do primeiro vínculo não pode continuar sendo apropriado pelo valor antigo.
  const titulo = await tx.contaPagarTitulo.findFirst({ where: { id: of.referenciaId, storeId: ctx.storeId } })
  if (!titulo) stop(404, "TITULO_NAO_ENCONTRADO", "Título não encontrado em Contas a Pagar desta loja.", "origemFinanceira.referenciaId")
  const st = normalizePagarStatus(titulo.status)
  if (st === "cancelado" || st === "estornado") stop(409, "TITULO_CANCELADO", "Título cancelado ou estornado não pode ser apropriado.")
  const meta = ((titulo.payload as Record<string, unknown> | null)?.metadata ?? {}) as Record<string, unknown>
  if (meta.aparelhoAquisicaoId) {
    stop(409, "TITULO_E_AQUISICAO", "Este título é a compra do próprio aparelho: o valor já está no custo de aquisição.")
  }
  if (meta.comercialCustoOperationId) {
    stop(409, "TITULO_JA_APROPRIADO", "Este título foi criado por um custo de preparação e já está apropriado.")
  }
  const valorTotalCentavos = reaisLegadoParaCentavos(titulo.valor)
  if (origem && origem.valorTotalCentavos !== valorTotalCentavos) {
    stop(409, "TITULO_ALTERADO", "O valor do título mudou depois do primeiro rateio. Revise as apropriações no prontuário antes de continuar.")
  }
  if (!origem) {
    if (valorTotalCentavos <= 0) stop(409, "TITULO_SEM_VALOR", "Título sem valor não pode ser rateado.")
    if (!of.quantidadeTotal) stop(400, "QUANTIDADE_ORIGEM_OBRIGATORIA", "Informe a quantidade total comprada neste título (ex.: 5 telas).", "origemFinanceira.quantidadeTotal")
    origem = await tx.comercialCustoOrigem.create({
      data: {
        storeId: ctx.storeId, tipo: of.tipo, referenciaId: of.referenciaId,
        descricao: titulo.descricao.slice(0, 200), valorTotalCentavos, quantidadeTotal: of.quantidadeTotal, createdBy: ctx.actorLabel,
      },
    })
  }
  const soma = await tx.comercialCustoLancamento.aggregate({
    where: { storeId: ctx.storeId, origemFinanceiraId: origem.id, status: "ativo" },
    _sum: { valorCentavos: true, quantidade: true },
  })
  return {
    id: origem.id, valorTotalCentavos: origem.valorTotalCentavos, quantidadeTotal: origem.quantidadeTotal,
    usadoCentavos: soma._sum.valorCentavos ?? 0, usadoQuantidade: soma._sum.quantidade ?? 0,
  }
}

/** Valor proporcional à quantidade; a última unidade absorve o resto (soma sempre exata). */
export function valorProporcionalDaOrigem(o: Pick<OrigemTravada, "valorTotalCentavos" | "quantidadeTotal" | "usadoCentavos" | "usadoQuantidade">, quantidade: number): number {
  const restanteQtd = o.quantidadeTotal - o.usadoQuantidade
  const restanteValor = o.valorTotalCentavos - o.usadoCentavos
  if (quantidade >= restanteQtd) return restanteValor
  return Math.round((o.valorTotalCentavos * quantidade) / o.quantidadeTotal)
}

type AplicarArgs = {
  unit: AparelhoFisico
  input: LancamentoInput
  /** Valor desta unidade (rateio); quando ausente usa o do input. */
  valorCentavos: number | null
  hash: string
  contaPagarTituloId?: string | null
  origemTravada?: OrigemTravada | null
}

async function aplicarLancamentoTx(tx: Prisma.TransactionClient, ctx: ComercialCtx, a: AplicarArgs): Promise<LancamentoRow> {
  const { unit, input } = a
  const idempotencyKey = chaveLancamento(unit.id, input.operationId)
  let valorCentavos = a.valorCentavos
  let custoStatus: CustoStatus = input.custoStatus
  let descricao = input.descricao
  let estoqueIdempotencyKey: string | null = null
  let justificativa = input.justificativa
  let origemFinanceiraId: string | null = null

  if (input.origem === "estoque") {
    const produto = await tx.produto.findFirst({ where: { id: input.produtoId!, storeId: ctx.storeId }, select: { id: true, name: true, metadata: true } })
    if (!produto) stop(404, "PRODUTO_NAO_ENCONTRADO", "Produto não encontrado nesta loja.", "produtoId")
    if (isSerializedDeviceProduct(produto.metadata)) stop(409, "PRODUTO_SERIALIZADO", "Aparelho por IMEI não é material de preparação.")
    estoqueIdempotencyKey = buildIdempotencyKey("comercial-custo", "saida", ctx.storeId, idempotencyKey)
    const res = await applyStockMutationTx(
      tx as unknown as StockLedgerTx,
      { storeId: ctx.storeId, principal: null, source: "comercial-preparacao", operatorLabel: ctx.actorLabel },
      { kind: "saida", produtoId: produto.id, quantidade: input.quantidade, origem: "preparacao_comercial", documento: unit.codigoInterno,
        motivo: `Aplicado na preparação de ${unit.codigoInterno}`, idempotencyKey: estoqueIdempotencyKey },
    )
    if (!res.ok) stop(409, `ESTOQUE_${res.code}`, `Estoque: ${res.message}`)
    descricao = descricao || produto.name
    const unitario = reaisLegadoParaCentavos(res.custoMedioAntes)
    if (unitario > 0) {
      valorCentavos = unitario * input.quantidade
      custoStatus = "conhecido"
    } else {
      // Produto sem custo médio registrado: custo DESCONHECIDO (nunca zero silencioso).
      valorCentavos = null
      custoStatus = "desconhecido"
      justificativa = justificativa || "Produto sem custo médio registrado no estoque."
    }
  } else if (input.origem === "preexistente" && input.produtoId) {
    const produto = await tx.produto.findFirst({ where: { id: input.produtoId, storeId: ctx.storeId }, select: { stock: true, metadata: true } })
    if (!produto) stop(404, "PRODUTO_NAO_ENCONTRADO", "Produto não encontrado nesta loja.", "produtoId")
    // Dupla apropriação: se o material está no estoque, ele precisa SAIR do estoque.
    if (produto.stock >= input.quantidade) {
      stop(409, "PREEXISTENTE_EM_ESTOQUE", "Este material está cadastrado no estoque com saldo: use \"Material do estoque\" para não contar o custo duas vezes.")
    }
  } else if (input.origem === "vinculo_financeiro") {
    const o = a.origemTravada!
    origemFinanceiraId = o.id
    custoStatus = "conhecido"
    if (o.usadoQuantidade + input.quantidade > o.quantidadeTotal) {
      stop(409, "APROPRIACAO_EXCEDE_ORIGEM", `Quantidade acima do disponível na compra (${o.quantidadeTotal - o.usadoQuantidade} restante).`)
    }
    if (valorCentavos === null) valorCentavos = valorProporcionalDaOrigem(o, input.quantidade)
    if (o.usadoCentavos + valorCentavos > o.valorTotalCentavos) {
      stop(409, "APROPRIACAO_EXCEDE_ORIGEM", "Valor acima do disponível na compra já registrada.")
    }
    o.usadoCentavos += valorCentavos
    o.usadoQuantidade += input.quantidade
  }

  const row = await tx.comercialCustoLancamento.create({
    data: {
      storeId: ctx.storeId,
      aparelhoId: unit.id,
      categoria: input.categoria,
      origem: input.origem,
      descricao: descricao || CUSTO_ORIGEM_LABEL[input.origem],
      quantidade: input.quantidade,
      valorCentavos: custoStatus === "desconhecido" ? null : valorCentavos,
      custoStatus,
      produtoId: input.produtoId,
      estoqueIdempotencyKey,
      origemFinanceiraId,
      contaPagarTituloId: a.contaPagarTituloId ?? null,
      justificativa,
      operador: ctx.actorLabel,
      idempotencyKey,
      payloadHash: a.hash,
    },
  })
  await eventoTx(tx, ctx, unit.id, "custo_aplicado", unit.status, unit.status, {
    lancamentoId: row.id, origem: row.origem, categoria: row.categoria, quantidade: row.quantidade,
    valorCentavos: row.valorCentavos, custoStatus: row.custoStatus, ...(row.contaPagarTituloId ? { contaPagarTituloId: row.contaPagarTituloId } : {}),
  })
  return row
}

function lancamentoDto(l: LancamentoRow, verCusto: boolean) {
  return {
    id: l.id, categoria: l.categoria, origem: l.origem, descricao: l.descricao, quantidade: l.quantidade,
    valorCentavos: verCusto ? l.valorCentavos : null, custoStatus: l.custoStatus, produtoId: l.produtoId,
    origemFinanceiraId: l.origemFinanceiraId, contaPagarTituloId: l.contaPagarTituloId,
    justificativa: l.justificativa, status: l.status, estornadoEm: l.estornadoEm, estornadoPor: l.estornadoPor,
    motivoEstorno: l.motivoEstorno, operador: l.operador, createdAt: l.createdAt,
  }
}

/**
 * Permissões FINANCEIRAS da sessão (revisão P2-7): ratear título existente exige ver o Financeiro;
 * criar obrigação nova (nova compra) exige editar o Financeiro. A rota prova pelo papel enterprise.
 */
export type FinanceiroAcesso = { view: boolean; edit: boolean }

function exigirFinanceiro(origem: CustoOrigem, fin: FinanceiroAcesso) {
  if (origem === "vinculo_financeiro" && !fin.view) stop(403, "SEM_PERMISSAO_FINANCEIRO", "Ratear uma compra já registrada exige acesso ao Financeiro.")
  if (origem === "nova_compra" && !fin.edit) stop(403, "SEM_PERMISSAO_FINANCEIRO", "Registrar uma nova compra (Contas a Pagar) exige permissão de edição no Financeiro.")
}

/** Hash estável do pedido: o vencimento "à vista" é derivado do dia — fora do hash (replay no dia seguinte). */
function hashDoInput(scope: unknown[], input: LancamentoInput): string {
  const estavel = input.novaCompra?.condicao === "a_vista" ? { ...input, novaCompra: { ...input.novaCompra, vencimento: "a_vista" } } : input
  return sha256Json([...scope, estavel])
}

/** Trava o produto ANTES da unidade (mesma ordem do motor de venda: produto → unidade) — revisão P2-5. */
async function travarProdutoTx(tx: Prisma.TransactionClient, storeId: string, produtoId: string | null) {
  if (!produtoId) return
  await tx.$queryRaw`SELECT "id" FROM "estoque_produtos" WHERE "id" = ${produtoId} AND "storeId" = ${storeId} FOR UPDATE`
}

/** Lança um custo em UMA unidade. */
export async function lancarCusto(ctx: ComercialCtx, aparelhoId: string, raw: unknown, fin: FinanceiroAcesso, db: Db = prisma) {
  const parsed = parseLancamentoInput(raw)
  if (!parsed.ok) return parsed
  const input = parsed.input
  try {
    exigirPermissaoLancamento(ctx, input.origem)
    exigirFinanceiro(input.origem, fin)
  } catch (e) { if (e instanceof AparelhoFailError) return e.fail; throw e }
  const hash = hashDoInput(["lancamento", ctx.storeId, aparelhoId], input)
  return runAparelhoTx(async (tx) => {
    if (input.origem === "estoque") await travarProdutoTx(tx, ctx.storeId, input.produtoId)
    const unit = await lockUnitTx(tx, ctx.storeId, aparelhoId)
    const replay = await replayOuConflito(tx, ctx.storeId, chaveLancamento(unit.id, input.operationId), hash)
    if (replay) return { ok: true as const, replay: true, lancamento: lancamentoDto(replay, ctx.perms.verCusto) }
    assertUnidadeAceitaCusto(unit)
    let contaPagarTituloId: string | null = null
    if (input.origem === "nova_compra") {
      contaPagarTituloId = (await criarObrigacaoCompraTx(tx, ctx, {
        operationId: input.operationId, categoria: input.categoria as Exclude<CustoCategoria, "mao_obra_interna">,
        descricao: input.descricao, valorCentavos: input.valorCentavos!, compra: input.novaCompra!, documento: unit.codigoInterno,
        escopo: [unit.id],
      })).tituloId
    }
    const origemTravada = input.origem === "vinculo_financeiro" ? await travarOrigemFinanceiraTx(tx, ctx, input.origemFinanceira!) : null
    const row = await aplicarLancamentoTx(tx, ctx, { unit, input, valorCentavos: input.valorCentavos, hash, contaPagarTituloId, origemTravada })
    return { ok: true as const, replay: false, lancamento: lancamentoDto(row, ctx.perms.verCusto) }
  }, db)
}

/**
 * Rateio de UM custo entre várias unidades (ex.: frete de um lote, uma compra de 5 telas).
 * Soma das partes = total, exata ao centavo. Uma única obrigação/origem; N apropriações.
 */
export async function lancarCustoRateado(ctx: ComercialCtx, raw: unknown, fin: FinanceiroAcesso, db: Db = prisma) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const ids = Array.isArray(r.aparelhoIds) ? [...new Set(r.aparelhoIds.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64))] : []
  if (ids.length < 2 || ids.length > 200) return fail(400, "UNIDADES_INVALIDAS", "Selecione de 2 a 200 unidades para o rateio.", "aparelhoIds")
  const pesos = Array.isArray(r.pesos) ? r.pesos.map((p) => (typeof p === "number" && Number.isFinite(p) && p >= 0 ? p : -1)) : ids.map(() => 1)
  if (pesos.length !== ids.length || pesos.some((p) => p < 0)) return fail(400, "PESOS_INVALIDOS", "Pesos do rateio inválidos.", "pesos")
  const parsed = parseLancamentoInput({ ...r, quantidade: 1 })
  if (!parsed.ok) return parsed
  const input = parsed.input
  if (input.origem === "estoque" || input.origem === "gerencial" || input.origem === "preexistente") {
    if (input.origem !== "preexistente" || input.valorCentavos === null) {
      return fail(400, "RATEIO_NAO_SUPORTADO", "Rateio vale para nova compra, compra já registrada ou material preexistente com valor.", "origem")
    }
  }
  try {
    exigirPermissaoLancamento(ctx, input.origem)
    exigirFinanceiro(input.origem, fin)
  } catch (e) { if (e instanceof AparelhoFailError) return e.fail; throw e }
  const hash = hashDoInput(["rateio", ctx.storeId, ids, pesos], input)
  return runAparelhoTx(async (tx) => {
    // Ordem fixa de travamento evita deadlock entre dois rateios concorrentes.
    const units: AparelhoFisico[] = []
    for (const id of [...ids].sort()) units.push(await lockUnitTx(tx, ctx.storeId, id))
    const porId = new Map(units.map((u) => [u.id, u]))
    const replays = await Promise.all(ids.map((id) => replayOuConflito(tx, ctx.storeId, chaveLancamento(id, input.operationId), hash)))
    if (replays.every(Boolean)) return { ok: true as const, replay: true, lancamentos: replays.map((l) => lancamentoDto(l!, ctx.perms.verCusto)) }
    if (replays.some(Boolean)) stop(409, "OPERACAO_REUTILIZADA", "Parte deste rateio já foi registrada com outro conteúdo.")
    for (const u of units) assertUnidadeAceitaCusto(u)

    let total = input.valorCentavos
    let contaPagarTituloId: string | null = null
    let origemTravada: OrigemTravada | null = null
    if (input.origem === "vinculo_financeiro") {
      origemTravada = await travarOrigemFinanceiraTx(tx, ctx, input.origemFinanceira!)
      if (ids.length > origemTravada.quantidadeTotal - origemTravada.usadoQuantidade) {
        stop(409, "APROPRIACAO_EXCEDE_ORIGEM", "Mais unidades do que a quantidade disponível na compra.")
      }
      if (total === null) {
        // Sem valor informado: cada unidade recebe a parte proporcional (1 item cada).
        total = 0
        const simulado = { ...origemTravada }
        for (let i = 0; i < ids.length; i++) {
          const v = valorProporcionalDaOrigem(simulado, 1)
          total += v; simulado.usadoCentavos += v; simulado.usadoQuantidade += 1
        }
      }
    }
    if (total === null) stop(400, "VALOR_OBRIGATORIO", "Informe o valor total a ratear.", "valorCentavos")
    if (input.origem === "nova_compra") {
      contaPagarTituloId = (await criarObrigacaoCompraTx(tx, ctx, {
        operationId: input.operationId, categoria: input.categoria as Exclude<CustoCategoria, "mao_obra_interna">,
        descricao: input.descricao, valorCentavos: total, compra: input.novaCompra!, documento: `rateio ${ids.length} unidades`, escopo: ids,
      })).tituloId
    }
    const partes = ratearCentavos(total, pesos)
    const rows: LancamentoRow[] = []
    for (let i = 0; i < ids.length; i++) {
      rows.push(await aplicarLancamentoTx(tx, ctx, {
        unit: porId.get(ids[i])!, input, valorCentavos: partes[i], hash, contaPagarTituloId, origemTravada,
      }))
    }
    return { ok: true as const, replay: false, totalCentavos: total, lancamentos: rows.map((l) => lancamentoDto(l, ctx.perms.verCusto)) }
  }, db)
}

/** Reversão auditável: ativo → estornado. Material do estoque volta ao estoque pelo custo original. */
export async function estornarCusto(ctx: ComercialCtx, lancamentoId: string, raw: unknown, db: Db = prisma) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const motivo = str(r.motivo, 300)
  if (motivo.length < 5) return fail(400, "MOTIVO_OBRIGATORIO", "Informe o motivo da reversão (mínimo 5 caracteres).", "motivo")
  return runAparelhoTx(async (tx) => {
    const found = await tx.comercialCustoLancamento.findFirst({ where: { id: lancamentoId, storeId: ctx.storeId }, select: { aparelhoId: true, origem: true, produtoId: true } })
    if (!found) stop(404, "NAO_ENCONTRADO", "Lançamento não encontrado nesta loja.")
    // Ordem produto → unidade (a mesma do motor de venda) evita deadlock — revisão P2-5.
    if (found.origem === "estoque") await travarProdutoTx(tx, ctx.storeId, found.produtoId)
    const unit = await lockUnitTx(tx, ctx.storeId, found.aparelhoId)
    await tx.$queryRaw`SELECT "id" FROM "comercial_custos_lancamentos" WHERE "id" = ${lancamentoId} AND "storeId" = ${ctx.storeId} FOR UPDATE`
    const l = await tx.comercialCustoLancamento.findUniqueOrThrow({ where: { id: lancamentoId } })
    if (l.status === "estornado") return { ok: true as const, replay: true, lancamento: lancamentoDto(l, ctx.perms.verCusto) }
    exigirPermissaoLancamento(ctx, l.origem as CustoOrigem)
    if (unit.status === "vendido") stop(409, "CUSTO_JA_CONGELADO", "A unidade já foi vendida: o custo histórico da venda não é alterado.")
    if (l.origem === "estoque" && l.produtoId) {
      const unitarioReais = l.valorCentavos != null ? centavosParaReais(Math.round(l.valorCentavos / l.quantidade)) : 0
      const res = await applyStockMutationTx(
        tx as unknown as StockLedgerTx,
        { storeId: ctx.storeId, principal: null, source: "comercial-preparacao", operatorLabel: ctx.actorLabel },
        { kind: "entrada", produtoId: l.produtoId, quantidade: l.quantidade, custoUnitario: unitarioReais, origem: "preparacao_comercial_estorno",
          documento: unit.codigoInterno, motivo: `Reversão de material aplicado em ${unit.codigoInterno}: ${motivo}`,
          idempotencyKey: buildIdempotencyKey("comercial-custo", "estorno", ctx.storeId, l.id) },
      )
      if (!res.ok) stop(409, `ESTOQUE_${res.code}`, `Estoque: ${res.message}`)
    }
    const upd = await tx.comercialCustoLancamento.updateMany({
      where: { id: l.id, storeId: ctx.storeId, status: "ativo" },
      data: { status: "estornado", estornadoEm: new Date(), estornadoPor: ctx.actorLabel, motivoEstorno: motivo },
    })
    if (upd.count !== 1) stop(409, "CONFLITO", "Lançamento alterado por outra operação. Recarregue.")
    await eventoTx(tx, ctx, unit.id, "custo_estornado", unit.status, unit.status, {
      lancamentoId: l.id, origem: l.origem, motivo,
      ...(l.contaPagarTituloId ? { aviso: "A obrigação em Contas a Pagar permanece; cancele-a no Financeiro se a compra não ocorreu." } : {}),
    })
    const atualizado = await tx.comercialCustoLancamento.findUniqueOrThrow({ where: { id: l.id } })
    return {
      ok: true as const, replay: false, lancamento: lancamentoDto(atualizado, ctx.perms.verCusto),
      ...(l.contaPagarTituloId ? { aviso: "A obrigação em Contas a Pagar permanece; cancele-a no Financeiro se a compra não ocorreu." } : {}),
    }
  }, db)
}

// ─── Perfil / prontuário ─────────────────────────────────────────────────────

const PERFIL_PADRAO = {
  categoria: "smartphone", funcionamento: "nao_avaliado", finalidade: "revenda", etapaPreparacao: "nenhuma",
  custoAquisicaoStatus: "conhecido", custoAquisicaoJustificativa: "", preexistente: false, defeitos: "", classeEstetica: "",
  conferencias: {}, version: 0,
} as const

async function perfilTx(tx: Prisma.TransactionClient, storeId: string, aparelhoId: string) {
  return tx.comercialPerfilUnidade.findUnique({ where: { aparelhoId_storeId: { aparelhoId, storeId } } })
}

async function upsertPerfilTx(tx: Prisma.TransactionClient, ctx: ComercialCtx, aparelhoId: string, data: Partial<Prisma.ComercialPerfilUnidadeUncheckedCreateInput>) {
  return tx.comercialPerfilUnidade.upsert({
    where: { aparelhoId_storeId: { aparelhoId, storeId: ctx.storeId } },
    create: { storeId: ctx.storeId, aparelhoId, updatedBy: ctx.actorLabel, ...data },
    update: { ...data, updatedBy: ctx.actorLabel, version: { increment: 1 } },
  })
}

export type PerfilPatchOpts = { implantacaoAtiva: boolean }

export async function atualizarPerfil(ctx: ComercialCtx, aparelhoId: string, raw: unknown, opts: PerfilPatchOpts, db: Db = prisma) {
  if (!ctx.perms.editar) return fail(403, "SEM_PERMISSAO", "Sem permissão para editar o prontuário.")
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const data: Partial<Prisma.ComercialPerfilUnidadeUncheckedCreateInput> = {}
  const pick = <T extends readonly string[]>(k: string, values: T) => {
    if (r[k] === undefined) return
    if (typeof r[k] !== "string" || !values.includes(r[k] as string)) stop(400, "CAMPO_INVALIDO", `Valor inválido para ${k}.`, k)
    ;(data as Record<string, unknown>)[k] = r[k]
  }
  try {
    pick("categoria", UNIDADE_CATEGORIAS)
    pick("funcionamento", FUNCIONAMENTO)
    pick("finalidade", FINALIDADES)
    if (r.defeitos !== undefined) data.defeitos = str(r.defeitos, 2000)
    if (r.classeEstetica !== undefined) data.classeEstetica = str(r.classeEstetica, 20)
    if (r.conferencias !== undefined) data.conferencias = sanitizeConferencias(r.conferencias) as Prisma.InputJsonValue
    if (r.custoAquisicaoStatus !== undefined || r.custoAquisicaoJustificativa !== undefined) {
      if (!ctx.perms.definirCusto) stop(403, "SEM_PERMISSAO_CUSTO", "Sem permissão para definir custo.")
      pick("custoAquisicaoStatus", ["conhecido", "estimado", "desconhecido"] as const)
      data.custoAquisicaoJustificativa = str(r.custoAquisicaoJustificativa, 500)
      if (data.custoAquisicaoStatus && data.custoAquisicaoStatus !== "conhecido" && (data.custoAquisicaoJustificativa ?? "").length < 10) {
        stop(400, "JUSTIFICATIVA_OBRIGATORIA", "Explique por que o custo de aquisição é estimado ou desconhecido (mínimo 10 caracteres).", "custoAquisicaoJustificativa")
      }
    }
    if (r.preexistente !== undefined) {
      if (typeof r.preexistente !== "boolean") stop(400, "CAMPO_INVALIDO", "preexistente deve ser verdadeiro ou falso.", "preexistente")
      if (r.preexistente && !opts.implantacaoAtiva) stop(409, "IMPLANTACAO_DESLIGADA", "Ative o modo de implantação para registrar mercadoria anterior ao sistema.")
      data.preexistente = r.preexistente
    }
  } catch (e) {
    if (e instanceof AparelhoFailError) return e.fail
    throw e
  }
  const versaoEsperada = typeof r.version === "number" ? r.version : null
  return runAparelhoTx(async (tx) => {
    const unit = await lockUnitTx(tx, ctx.storeId, aparelhoId)
    const atual = await perfilTx(tx, ctx.storeId, unit.id)
    if (versaoEsperada !== null && (atual?.version ?? 0) !== versaoEsperada) {
      stop(409, "VERSAO_DESATUALIZADA", "O prontuário foi alterado por outra pessoa. Recarregue.")
    }
    if (data.finalidade && data.finalidade !== "revenda" && data.finalidade !== "preparacao" && (unit.status === "disponivel" || unit.status === "reservado")) {
      stop(409, "RETIRE_DA_VENDA", "Retire a unidade da venda antes de mudar a finalidade.")
    }
    const perfil = await upsertPerfilTx(tx, ctx, unit.id, data)
    await eventoTx(tx, ctx, unit.id, "prontuario_atualizado", unit.status, unit.status, { campos: Object.keys(data) })
    return { ok: true as const, perfil }
  }, db)
}

/**
 * Preparação para revenda reaproveita o lifecycle existente: a unidade fica em `em_revisao`
 * (fora do estoque vendável); a etapa fina (em preparação / em testes / concluída) é do prontuário.
 * Concluir devolve a unidade para `em_avaliacao`: precificação e liberação continuam com o gerente.
 */
export async function moverPreparacao(ctx: ComercialCtx, aparelhoId: string, raw: unknown, db: Db = prisma) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const etapa = r.etapa as EtapaPreparacao
  if (!(ETAPAS_PREPARACAO as readonly string[]).includes(etapa) || etapa === "nenhuma") {
    return fail(400, "ETAPA_INVALIDA", "Etapa inválida.", "etapa")
  }
  if (!ctx.perms.editar) return fail(403, "SEM_PERMISSAO", "Sem permissão para preparar unidades.")
  const observacao = str(r.observacao, 500)
  return runAparelhoTx(async (tx) => {
    let unit = await lockUnitTx(tx, ctx.storeId, aparelhoId)
    const perfil = await perfilTx(tx, ctx.storeId, unit.id)
    const atual = (perfil?.etapaPreparacao ?? "nenhuma") as EtapaPreparacao
    if (atual === etapa) return { ok: true as const, replay: true, etapa, status: unit.status }
    if (unit.status === "vendido" || unit.status === "baixado" || unit.status === "reservado") {
      stop(409, "UNIDADE_INDISPONIVEL_PREPARACAO", "Unidade vendida, baixada ou reservada não entra em preparação.")
    }
    if (unit.propriedade !== "loja") stop(409, "PROPRIEDADE_PENDENTE", "Confirme a aquisição antes de preparar a unidade.")
    const permitido: Record<EtapaPreparacao, readonly EtapaPreparacao[]> = {
      nenhuma: ["em_preparacao"], concluida: ["em_preparacao"],
      em_preparacao: ["em_testes", "concluida"], em_testes: ["em_preparacao", "concluida"],
    }
    if (!permitido[atual].includes(etapa)) stop(409, "ETAPA_INVALIDA", `Não é possível ir de "${atual}" para "${etapa}".`)

    if (etapa === "em_preparacao" && unit.status !== "em_revisao") {
      if (unit.status === "disponivel" && !ctx.perms.alterarStatus) {
        stop(403, "SEGREGACAO_FUNCOES", "Somente gerente ou proprietário retira da venda uma unidade disponível.")
      }
      if (unit.status === "aguardando_conferencia") unit = await transicionarTx(tx, ctx, unit, "em_avaliacao", "avaliacao_iniciada", { motivo: "preparação" })
      unit = await transicionarTx(tx, ctx, unit, "em_revisao", "preparacao_iniciada", { observacao })
    }
    if (etapa === "concluida" && unit.status === "em_revisao") {
      unit = await transicionarTx(tx, ctx, unit, "em_avaliacao", "preparacao_concluida", { observacao })
    }
    await upsertPerfilTx(tx, ctx, unit.id, {
      etapaPreparacao: etapa,
      ...(etapa === "em_preparacao" && (perfil?.finalidade ?? "revenda") === "revenda" ? { finalidade: "preparacao" } : {}),
      ...(etapa === "concluida" && perfil?.finalidade === "preparacao" ? { finalidade: "revenda" } : {}),
    })
    await eventoTx(tx, ctx, unit.id, "preparacao_etapa", unit.status, unit.status, { de: atual, para: etapa, observacao })
    return { ok: true as const, replay: false, etapa, status: unit.status }
  }, db)
}

export async function obterProntuario(ctx: ComercialCtx, aparelhoId: string, q: { taxaPercent?: number; margemAlvoPercent?: number } = {}, db: Db = prisma) {
  const unit = await db.aparelhoFisico.findFirst({ where: { id: aparelhoId, storeId: ctx.storeId } })
  if (!unit) return fail(404, "NAO_ENCONTRADO", "Aparelho não encontrado nesta loja.")
  const [perfil, lancamentos, eventos, vendas] = await Promise.all([
    db.comercialPerfilUnidade.findUnique({ where: { aparelhoId_storeId: { aparelhoId: unit.id, storeId: ctx.storeId } } }),
    db.comercialCustoLancamento.findMany({ where: { storeId: ctx.storeId, aparelhoId: unit.id }, orderBy: { createdAt: "asc" } }),
    db.aparelhoEvento.findMany({ where: { storeId: ctx.storeId, aparelhoId: unit.id }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.aparelhoVenda.findMany({
      where: { storeId: ctx.storeId, aparelhoId: unit.id }, orderBy: { createdAt: "desc" },
      select: { id: true, pedidoId: true, status: true, precoVenda: true, dataVenda: true, dataEntrega: true, numeroGarantia: true, coberturaFim: true, custoHistorico: true },
    }),
  ])
  const composicao = comporCusto(unit, perfil, lancamentos)
  const verCusto = ctx.perms.verCusto
  return {
    ok: true as const,
    aparelho: aparelhoDto(unit, ctx.perms),
    perfil: perfil ?? { ...PERFIL_PADRAO, storeId: ctx.storeId, aparelhoId: unit.id },
    perfilPersistido: !!perfil,
    lancamentos: lancamentos.map((l) => lancamentoDto(l, verCusto)),
    composicao: verCusto ? composicao : null,
    indicadores: verCusto
      ? indicadoresPreco({ composicao, precoVendaCentavos: reaisLegadoParaCentavos(unit.precoVenda), taxaPercent: q.taxaPercent, margemAlvoPercent: q.margemAlvoPercent })
      : null,
    eventos: eventos.map((e) => ({ id: e.id, tipo: e.tipo, deStatus: e.deStatus, paraStatus: e.paraStatus, operador: e.operador, createdAt: e.createdAt, dados: verCusto ? e.dados : null })),
    vendas: vendas.map((v) => ({ ...v, custoHistorico: verCusto ? v.custoHistorico : null })),
  }
}

/** Títulos de Contas a Pagar que podem ser rateados (exclui a compra do próprio aparelho e custos já criados aqui). */
export async function listarOrigensContaPagar(ctx: ComercialCtx, q: string, db: Db = prisma) {
  if (!ctx.perms.verCusto) return fail(403, "SEM_PERMISSAO_CUSTO", "Sem permissão para ver custos.")
  const termo = q.trim().slice(0, 80)
  const titulos = await db.contaPagarTitulo.findMany({
    where: {
      storeId: ctx.storeId,
      status: { notIn: ["cancelado", "estornado"] },
      valor: { gt: 0 },
      ...(termo ? { OR: [{ descricao: { contains: termo, mode: "insensitive" } }, { numeroDocumento: { contains: termo, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, descricao: true, valor: true, status: true, vencimento: true, numeroDocumento: true, payload: true, createdAt: true },
  })
  const elegiveis = titulos.filter((t) => {
    const meta = ((t.payload as Record<string, unknown> | null)?.metadata ?? {}) as Record<string, unknown>
    return !meta.aparelhoAquisicaoId && !meta.comercialCustoOperationId
  }).slice(0, 30)
  const origens = await db.comercialCustoOrigem.findMany({
    where: { storeId: ctx.storeId, tipo: "conta_pagar", referenciaId: { in: elegiveis.map((t) => t.id) } },
  })
  const somas = origens.length
    ? await db.comercialCustoLancamento.groupBy({
        by: ["origemFinanceiraId"],
        where: { storeId: ctx.storeId, status: "ativo", origemFinanceiraId: { in: origens.map((o) => o.id) } },
        _sum: { valorCentavos: true, quantidade: true },
      })
    : []
  const porRef = new Map(origens.map((o) => [o.referenciaId, o]))
  const somaPor = new Map(somas.map((s) => [s.origemFinanceiraId, s._sum]))
  return {
    ok: true as const,
    titulos: elegiveis.map((t) => {
      const o = porRef.get(t.id)
      const s = o ? somaPor.get(o.id) : null
      return {
        id: t.id, descricao: t.descricao, status: t.status, vencimento: t.vencimento, numeroDocumento: t.numeroDocumento,
        valorCentavos: reaisLegadoParaCentavos(t.valor),
        quantidadeTotal: o?.quantidadeTotal ?? null,
        usadoCentavos: s?.valorCentavos ?? 0,
        usadoQuantidade: s?.quantidade ?? 0,
      }
    }),
  }
}
