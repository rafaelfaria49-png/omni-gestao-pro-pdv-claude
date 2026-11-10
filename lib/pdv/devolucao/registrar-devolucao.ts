/**
 * PDV-F8 — registro AUTORITATIVO de devolução.
 * PADARIA-KG-F8-TROCAS-CONFIGURAVEIS-FINAL-001: linhas KG devolvíveis por peso
 * (3 casas), por linha e pela configuração da loja (`printerConfig.pdvTrocasPeso`,
 * padrão ATIVADO). Vendas mistas KG+UN devolvem por linha; a venda inteira nunca é
 * bloqueada por conter produtos KG (decisão do proprietário — o bloqueio comercial
 * anterior foi substituído).
 *
 * Único writer de `DevolucaoVenda` (rota `POST /api/ops/devolucao`).
 *
 * Garantias (todas na MESMA transação, READ COMMITTED + releitura após o lock):
 *  1. Lock de linha na venda de origem (`SELECT … FOR UPDATE`): duas devoluções
 *     simultâneas da mesma venda são serializadas; a segunda relê o que já foi
 *     devolvido DEPOIS da espera e nunca ultrapassa a quantidade vendida — em UN
 *     (unidades inteiras) ou KG (gramas inteiras, sem arredondamento binário).
 *  2. Teto por item = vendido − já devolvido, com quantidades e valores derivados do
 *     banco — o client nunca é autoridade. KG usa o contrato de gramas/centavos
 *     inteiros da venda manual (BigInt), nunca Float para validar milésimos.
 *  3. Idempotência por (loja, localId) avaliada depois do lock: replay idêntico
 *     devolve o mesmo resultado; mesmo localId com conteúdo diferente é CONFLITO.
 *  4. Crédito (vale) criado uma única vez, do valor calculado no servidor, junto do
 *     documento. Sem titular (CPF/CNPJ) não há vale — recusa em vez de "emitir" nada.
 *     KG devolve o valor efetivamente pago, proporcional ao peso, com absorção de
 *     arredondamento na última devolução elegível (Σ créditos ≤ total pago).
 *  5. Nenhuma saída financeira: vale-troca não é dinheiro saindo do caixa.
 *  6. Reembolso em dinheiro (`tipo: "devolucao"`) BLOQUEADO até haver fluxo/política
 *     aprovados (G-H01..03 / CASH_HANDOVER_RECOVERY = RELEASE_BLOCKER).
 *  7. Condição da mercadoria (GOAL §5): só `apto_revenda` gera entrada de estoque.
 *     KG (perecível) exige condição EXPLÍCITA; UN sem condição preserva o
 *     comportamento validado (entrada). Destino/justificativa gravados no payload.
 *  8. Escrita em venda KG somente pelo caminho transacional auditável (GUC
 *     `omni.f8_kg_return_writer` + `omni.manual_kg_writer`); os triggers do banco
 *     revalidam política da loja, teto KG e duplicatas — gravadores legados
 *     continuam bloqueados no banco.
 */
import type { Prisma } from "@/generated/prisma"
import { StockIdempotency } from "@/lib/estoque/stock-ledger-contract"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { productCommercialFromMetadata } from "@/lib/cadastros/product-commercial-contract"
import { toStockUnits } from "@/lib/estoque/stock-quantity"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import { canonicalProductKeyResolver, saleProductKeyResolver, type SaleForKeys } from "@/lib/pdv/devolucao/product-keys"
import { MANUAL_KG_SALE } from "@/lib/vendas/manual-kg-contract"
import { isKgItem } from "@/lib/vendas/item-quantity"
import { ProductCommercialInvalidError } from "@/lib/cadastros/product-commercial-contract"
import {
  condicaoGeraEntradaEstoque,
  enterF8KgReturnTransaction,
  f8KgReturnSchemaReady,
  isCondicaoMercadoria,
  trocasPesoPermitidasTx,
  type CondicaoMercadoria,
} from "@/lib/pdv/devolucao/trocas-peso-policy"
import { enterManualKgTransaction } from "@/lib/vendas/manual-kg-server"

export type DevolucaoTipo = "vale_credito" | "somente_estoque" | "troca" | "devolucao"

export type RegistrarDevolucaoItemInput = {
  inventoryId?: string
  produtoId?: string
  nome?: string
  /** UN: quantidade inteira ≥ 1 (formato legado, única forma de clientes Prisma antigos). */
  quantidade?: number
  /** KG: decimal exato com até 3 casas (string, nunca Float do client como autoridade). */
  quantidadeKg?: string
  /** Condição da mercadoria devolvida; OBRIGATÓRIA para KG (perecível). */
  condicao?: string
  justificativa?: string
}

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
  itens: RegistrarDevolucaoItemInput[]
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
  /** `inventoryId` = chave do client (SKU/EAN); `produtoId` = Produto.id histórico gravado. */
  itens: Array<{
    inventoryId: string
    produtoId?: string
    nome: string
    quantidade: number | null
    quantidadeKg: number | null
    valorUnitario: number
    valorTotal: number
    condicao: CondicaoMercadoria
    estoque: "entrada" | "sem_entrada"
  }>
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
  | "ITEM_SEM_LASTRO_BLOQUEADO"
  | "DEVOLUCAO_ENCAMINHADA_FINANCEIRO"
  | "HISTORICO_DEVOLUCAO_NAO_RESOLVIDO"
  | "PRODUTO_COMERCIAL_INVALIDO"
  // ─── Contrato KG configurável (PADARIA-KG-F8-TROCAS-CONFIGURAVEIS-FINAL-001) ──
  | "TROCA_KG_DESATIVADA_LOJA"
  | "TROCA_KG_SCHEMA_INDISPONIVEL"
  | "QUANTIDADE_KG_INVALIDA"
  | "QUANTIDADE_ITEM_INVALIDA"
  | "CONDICAO_MERCADORIA_OBRIGATORIA_KG"
  | "CONDICAO_MERCADORIA_INVALIDA"
  | "JUSTIFICATIVA_CONDICAO_OBRIGATORIA"
  | "LINHA_VENDA_QUANTIDADE_INVALIDA"

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

export const ITEM_SEM_LASTRO_MENSAGEM =
  "serviço, item avulso ou linha sem produto em estoque não gera vale nem volta ao estoque — ainda não há política aprovada para esse caso. Nada foi gravado."

export const REEMBOLSO_BLOQUEADO_MENSAGEM =
  "Reembolso em dinheiro bloqueado: ainda não há fluxo financeiro aprovado para tirar dinheiro do caixa em devoluções. Use Vale-Troca ou Troca Imediata."

export const TROCA_KG_DESATIVADA_MENSAGEM_SERVER =
  "Trocas e devoluções de produtos vendidos por peso estão desativadas para esta loja. Produtos por unidade continuam liberados. Direitos legais do consumidor: registre a pendência para o Financeiro com justificativa — nada foi gravado."

export const QUANTIDADE_KG_INVALIDA_MENSAGEM =
  "Quantidade em kg inválida: informe um peso maior que zero, com até 3 casas decimais (mínimo 0,001 kg)."

function arredonda2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

function normInv(id: string | null | undefined): string {
  return (id ?? "").trim()
}

/** Unidade histórica da LINHA vendida — nunca o cadastro atual do produto. */
export type UnidadeLinha = "UN" | "KG"

/** Quantidade da linha em unidades mínimas inteiras (UN=unidades, KG=gramas). */
export function linhaVendidaUnidades(item: {
  quantidade: number | null
  quantidadeKg?: unknown
}): { unidade: UnidadeLinha; units: number } | null {
  if (isKgItem(item)) {
    const grams = toStockUnits(Number(String(item.quantidadeKg)), "KG")
    return grams !== null && grams > 0 ? { unidade: "KG", units: grams } : null
  }
  if (typeof item.quantidade === "number" && Number.isInteger(item.quantidade) && item.quantidade >= 0) {
    return { unidade: "UN", units: item.quantidade }
  }
  return null
}

/** Peso pedido (string do client) → gramas inteiras; null = fora do contrato. */
export function parseQuantidadeKgRequest(raw: unknown): number | null {
  if (typeof raw !== "string") return null
  const t = raw.trim()
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null
  const grams = toStockUnits(Number(t), "KG")
  return grams !== null && grams >= 1 ? grams : null
}

/**
 * Fração do preço de linha que o cliente efetivamente pagou. `ItemVenda.lineTotal` é
 * preço × quantidade ANTES do desconto da venda (que só existe no payload); o motor
 * garante apenas pagamentos = `Venda.total`. Sem o fator, item de R$100 vendido com 50%
 * de desconto virava vale de R$100. Acréscimo não é devolvido (fator nunca passa de 1).
 */
export function fatorValorPago(total: number, itens: Array<{ lineTotal: number }>): number {
  const soma = itens.reduce((s, i) => s + (Number.isFinite(i.lineTotal) ? i.lineTotal : 0), 0)
  if (!(soma > 0) || !Number.isFinite(total) || total < 0) return 1
  return Math.min(1, total / soma)
}

/** Crédito acumulado (centavos) por peso, meia-casa para cima em inteiro — contrato da venda KG. */
function creditoKgCentavos(paidCents: number, gramsAcum: number, gramsVendidos: number): number {
  const v = (BigInt(Math.round(paidCents)) * BigInt(gramsAcum) + BigInt(Math.floor(gramsVendidos / 2))) / BigInt(gramsVendidos)
  return Number(v)
}

/** Identidade de conteúdo de uma devolução — base da comparação de replay. */
export function devolucaoFingerprint(input: {
  vendaLocalId: string
  tipo: string
  clienteDoc: string
  itens: Array<{ inventoryId?: string | null; quantidade?: number | null; quantidadeKg?: unknown }>
}): string {
  const itens = input.itens
    .map((i) => {
      // Do banco vem Prisma.Decimal; do client vem string — normaliza antes de parsear.
      const kgText = i.quantidadeKg === null || i.quantidadeKg === undefined ? null : String(i.quantidadeKg)
      const grams = kgText !== null ? parseQuantidadeKgRequest(kgText) : null
      const qtd = grams !== null ? `g${grams}` : `u${Math.round(i.quantidade ?? 0)}`
      return `${normInv(i.inventoryId)}:${qtd}`
    })
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
  payload: unknown
  itens: Array<{ inventoryId: string | null; nome: string; quantidade: number | null; quantidadeKg: { toString(): string } | null; valorUnitario: number; valorTotal: number }>
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
  payload: true,
  itens: { select: { inventoryId: true, nome: true, quantidade: true, quantidadeKg: true, valorUnitario: true, valorTotal: true } },
} as const

const VENDA_SELECT = {
  id: true,
  status: true,
  total: true,
  payload: true,
  itens: { select: { id: true, inventoryId: true, nome: true, quantidade: true, quantidadeKg: true, lineTotal: true } },
} as const

type VendaLocked = SaleForKeys & {
  id: string
  status: string
  total: number
  itens: Array<{ id: string; inventoryId: string | null; nome: string; quantidade: number | null; quantidadeKg: unknown; lineTotal: number }>
}

/** Venda protegida pelo protocolo KG (marcador do payload ou qualquer linha por peso). */
export function vendaKgProtegida(venda: {
  payload: unknown
  itens: Array<{ quantidade: number | null; quantidadeKg?: unknown }>
}): boolean {
  const payload = venda.payload as { manualKgSale?: unknown } | null
  return (
    payload?.manualKgSale === MANUAL_KG_SALE ||
    venda.itens.some((i) => isKgItem(i) || typeof i.quantidade !== "number" || !Number.isInteger(i.quantidade))
  )
}

/**
 * Resolve chaves de produto ancoradas na venda (identidade histórica) quando ela
 * existe; sem venda (replay de legado) cai no catálogo atual.
 */
async function keyResolverFor(
  tx: Prisma.TransactionClient,
  storeId: string,
  venda: VendaLocked | null,
  extra: Array<string | null | undefined>,
): Promise<(key: string | null | undefined, produtoId?: string | null) => string> {
  if (venda) {
    const r = await saleProductKeyResolver(tx, storeId, venda, extra)
    return (k, pid) => r.resolve(k, pid) || `?${normInv(pid) || normInv(k)}`
  }
  const canon = await canonicalProductKeyResolver(tx, storeId, extra)
  return (k, pid) => canon(normInv(pid) || k)
}

async function classifyReplay(
  tx: Prisma.TransactionClient,
  input: RegistrarDevolucaoInput,
  existing: ExistingDev,
  vendaArg?: VendaLocked | null,
): Promise<RegistrarDevolucaoOk> {
  const docNorm = input.clienteDoc.replace(/\D/g, "")
  const venda =
    vendaArg !== undefined
      ? vendaArg
      : ((await tx.venda.findFirst({
          where: { storeId: input.storeId, pedidoId: existing.vendaLocalId },
          select: VENDA_SELECT,
        })) as VendaLocked | null)
  // Mesma identidade histórica do escritor: SKU renomeado depois da gravação não
  // transforma o reenvio idêntico em "conflito" (que viraria uma 2ª devolução).
  const canon = await keyResolverFor(tx, input.storeId, venda, [
    ...input.itens.flatMap((i) => [i.inventoryId, i.produtoId]),
    ...existing.itens.map((i) => i.inventoryId),
  ])
  const fpPedido = devolucaoFingerprint({
    ...input,
    clienteDoc: docNorm,
    itens: input.itens.map((i) => ({ inventoryId: canon(i.inventoryId, i.produtoId), quantidade: i.quantidade ?? null, quantidadeKg: i.quantidadeKg ?? null })),
  })
  const fpExistente = devolucaoFingerprint({
    vendaLocalId: existing.vendaLocalId,
    tipo: existing.tipo,
    clienteDoc: existing.clienteDoc,
    itens: existing.itens.map((i) => ({ inventoryId: canon(i.inventoryId), quantidade: i.quantidade, quantidadeKg: i.quantidadeKg })),
  })
  // Devolve a chave que o client conhece (SKU/código) — a do banco é o Produto.id.
  const chaveDoClient = (dbKey: string | null) =>
    input.itens.find((r) => canon(r.inventoryId, r.produtoId) === canon(dbKey))?.inventoryId?.trim() || normInv(dbKey)
  if (fpPedido !== fpExistente) {
    throw new DevolucaoBusinessError(
      "LOCAL_ID_CONFLITO",
      `O identificador ${input.localId} já pertence a outra devolução desta loja. Nada foi gravado — gere a devolução novamente.`,
      { localId: input.localId },
    )
  }
  // Condição/estoque reais do replay vêm do payload gravado (espelho local fiel).
  const mercadoria = ((existing.payload as { mercadoria?: Array<{ produtoId: string; condicao: CondicaoMercadoria; estoque?: string }> } | null)?.mercadoria) ?? []
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
    itens: existing.itens.map((i) => {
      const m = mercadoria.find((x) => x.produtoId === normInv(i.inventoryId))
      return {
        inventoryId: chaveDoClient(i.inventoryId),
        produtoId: normInv(i.inventoryId),
        nome: i.nome,
        quantidade: i.quantidade,
        quantidadeKg: i.quantidadeKg === null ? null : Number(String(i.quantidadeKg)),
        valorUnitario: i.valorUnitario,
        valorTotal: i.valorTotal,
        condicao: m?.condicao ?? "apto_revenda",
        estoque: (m?.estoque === "sem_entrada" ? "sem_entrada" : "entrada") as "entrada" | "sem_entrada",
      }
    }),
  }
}

/** Linha já validada, pronta para gravação. */
type ItemCalculado = {
  k: string
  chaveClient: string
  nome: string
  unidade: UnidadeLinha
  units: number
  /** KG: gramas; exibição/espelho usam kg com 3 casas. */
  quantidadeKg: string | null
  quantidade: number | null
  valorUnitario: number
  valorTotal: number
  condicao: CondicaoMercadoria
  justificativa?: string
  geraEntrada: boolean
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

  const venda =
    locked.length > 0
      ? ((await tx.venda.findFirst({ where: { id: locked[0]!.id, storeId }, select: VENDA_SELECT })) as VendaLocked | null)
      : null

  // ── 1b. Mesma chave do encaminhamento ao Financeiro (pendencia-financeiro.ts):
  // devolução já encaminhada como "não gravada" NUNCA é gravada depois — senão o
  // cliente recebe o vale aqui e a compensação do Financeiro (crédito em dobro).
  const chavePendencia = `devolucao-pendencia:${storeId}:${input.localId}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chavePendencia}))`
  const encaminhada = await tx.auditoriaFinanceira.findFirst({
    where: { storeId, entidade: "devolucao_pdv_pendencia", entidadeId: chavePendencia },
    select: { id: true },
  })

  // ── 2. Idempotência APÓS o lock (o vencedor concorrente já está visível) ───
  const existing = await tx.devolucaoVenda.findUnique({
    where: { storeId_localId: { storeId, localId: input.localId } },
    select: EXISTING_SELECT,
  })
  if (existing) return classifyReplay(tx, input, existing, venda)
  if (encaminhada) {
    throw new DevolucaoBusinessError(
      "DEVOLUCAO_ENCAMINHADA_FINANCEIRO",
      `A devolução ${input.localId} já foi encaminhada ao Financeiro como não gravada (ref. ${encaminhada.id}). Nada foi gravado — trate com o Financeiro.`,
      { localId: input.localId, ref: encaminhada.id },
    )
  }

  if (locked.length === 0) {
    throw new DevolucaoBusinessError(
      "VENDA_ORIGEM_NAO_ENCONTRADA",
      `A venda ${vendaLocalId} ainda não está no servidor desta loja. Sincronize a venda e tente novamente — nada foi gravado.`,
      { vendaLocalId },
    )
  }

  if (!venda) {
    throw new DevolucaoBusinessError("VENDA_ORIGEM_NAO_ENCONTRADA", `Venda ${vendaLocalId} não encontrada.`, { vendaLocalId })
  }
  if (venda.status === "cancelada") {
    throw new DevolucaoBusinessError("VENDA_CANCELADA", `A venda ${vendaLocalId} está cancelada: não há o que devolver.`)
  }

  // ── 3. Teto por item: vendido − já devolvido (releitura pós-lock) ──────────
  const anteriores = await tx.itemDevolucaoVenda.findMany({
    where: { devolucao: { storeId, vendaLocalId } },
    select: { inventoryId: true, quantidade: true, quantidadeKg: true, valorTotal: true },
  })
  // Identidade HISTÓRICA: a chave gravada na venda (Produto.id). SKU/EAN só localizam.
  const keys = await saleProductKeyResolver(tx, storeId, venda, [
    ...anteriores.map((i) => i.inventoryId),
    ...input.itens.flatMap((i) => [i.inventoryId, i.produtoId]),
  ])
  const canon = (k: string | null | undefined, pid?: string | null) => keys.resolve(k, pid)

  /** Vendido por produto, na unidade HISTÓRICA da linha (nunca o cadastro atual). */
  const vendido = new Map<string, { unidade: UnidadeLinha; units: number; lineTotal: number; nome: string }>()
  for (const it of venda.itens) {
    const k = normInv(it.inventoryId)
    if (!k) continue
    const linha = linhaVendidaUnidades(it)
    if (!linha) {
      // Linha corrompida (sem quantidade válida nem peso): a venda inteira falha
      // fechada — sem lastro confiável para teto, crédito ou estoque.
      throw new DevolucaoBusinessError(
        "LINHA_VENDA_QUANTIDADE_INVALIDA",
        `A venda ${vendaLocalId} tem linha com quantidade ilegível (${it.nome || k}). Nada foi gravado — exige conferência manual.`,
        { vendaLocalId, inventoryId: k },
      )
    }
    const cur = vendido.get(k)
    if (cur && cur.unidade !== linha.unidade) {
      throw new DevolucaoBusinessError(
        "LINHA_VENDA_QUANTIDADE_INVALIDA",
        `A venda ${vendaLocalId} mistura unidade e peso no MESMO produto (${cur.nome}). Nada foi gravado — exige conferência manual.`,
        { vendaLocalId, inventoryId: k },
      )
    }
    if (!cur) vendido.set(k, { unidade: linha.unidade, units: linha.units, lineTotal: it.lineTotal || 0, nome: it.nome })
    else {
      cur.units += linha.units
      cur.lineTotal += it.lineTotal || 0
    }
  }
  const jaDevolvido = new Map<string, number>()
  /** Valor JÁ restituído por produto (o que as devoluções anteriores de fato gravaram). */
  const jaRestituidoItem = new Map<string, number>()
  for (const it of anteriores) {
    const k = canon(it.inventoryId)
    // Devolução anterior cuja chave não casa com nenhuma linha da venda (legado gravado
    // por SKU depois renomeado): o devolvido não é contável → recusa em vez de liberar
    // a mesma unidade de novo.
    if (!k || !vendido.has(k)) {
      throw new DevolucaoBusinessError(
        "HISTORICO_DEVOLUCAO_NAO_RESOLVIDO",
        `A venda ${vendaLocalId} tem devolução anterior com item não identificável (${normInv(it.inventoryId) || "sem código"}). Nada foi gravado — exige conferência manual.`,
        { vendaLocalId, inventoryId: normInv(it.inventoryId) },
      )
    }
    const linha = it.quantidadeKg !== null && it.quantidadeKg !== undefined
      ? parseQuantidadeKgRequest(String(it.quantidadeKg))
      : typeof it.quantidade === "number" && Number.isInteger(it.quantidade)
        ? it.quantidade
        : null
    if (linha === null) {
      throw new DevolucaoBusinessError(
        "HISTORICO_DEVOLUCAO_NAO_RESOLVIDO",
        `A venda ${vendaLocalId} tem devolução anterior com quantidade ilegível (${normInv(it.inventoryId)}). Nada foi gravado — exige conferência manual.`,
        { vendaLocalId, inventoryId: normInv(it.inventoryId) },
      )
    }
    jaDevolvido.set(k, (jaDevolvido.get(k) ?? 0) + linha)
    jaRestituidoItem.set(k, arredonda2(arredonda2((jaRestituidoItem.get(k) ?? 0) + (it.valorTotal || 0))))
  }

  // ── 3b. Política KG da loja + readiness do schema (lidas NO COMMIT, pós-lock) ──
  const temLinhaKg = (i: RegistrarDevolucaoItemInput) => i.quantidadeKg !== undefined
  const pedeKg = input.itens.some(temLinhaKg)
  const vendaKg = vendaKgProtegida(venda)
  if (pedeKg || vendaKg) await enterF8KgReturnTransaction(tx)
  if (vendaKg) await enterManualKgTransaction(tx)
  if (pedeKg) {
    if (!(await f8KgReturnSchemaReady(tx))) {
      throw new DevolucaoBusinessError(
        "TROCA_KG_SCHEMA_INDISPONIVEL",
        "A estrutura de devolução por peso ainda não foi aplicada no banco desta loja. Nada foi gravado — contate o suporte.",
        { vendaLocalId },
      )
    }
    if (!(await trocasPesoPermitidasTx(tx, storeId))) {
      throw new DevolucaoBusinessError("TROCA_KG_DESATIVADA_LOJA", TROCA_KG_DESATIVADA_MENSAGEM_SERVER, { vendaLocalId })
    }
  }

  const fatorPago = fatorValorPago(venda.total, venda.itens)
  const vistos = new Set<string>()
  const itensCalc: ItemCalculado[] = []
  const mercadoria: Array<{ produtoId: string; condicao: CondicaoMercadoria; justificativa?: string; estoque: "entrada" | "sem_entrada" }> = []
  /** Cadastro ATUAL dos produtos (só decide ELEGIBILIDADE DE ESTOQUE, nunca o crédito). */
  const produtosAtuais = await tx.produto.findMany({
    where: { storeId, id: { in: [...new Set(input.itens.map((i) => canon(i.inventoryId, i.produtoId)).filter((k): k is string => !!k && vendido.has(k)))] } },
    select: { id: true, metadata: true },
  })
  const unidadeCadastro = new Map<string, "UN" | "KG" | "G">(produtosAtuais.map((p) => [p.id, productCommercialFromMetadata(p.metadata).unidade]))

  for (const req of input.itens) {
    const k = canon(req.inventoryId, req.produtoId)
    if (k && vistos.has(k)) {
      throw new DevolucaoBusinessError("ITENS_DUPLICADOS", "Item repetido na mesma devolução.", { inventoryId: k })
    }
    if (k) vistos.add(k)
    const orig = k ? vendido.get(k) : undefined
    if (!orig || orig.units <= 0) {
      throw new DevolucaoBusinessError(
        "ITEM_NAO_CONSTA_NA_VENDA",
        `O item ${req.nome || normInv(req.inventoryId) || "(sem código)"} não consta na venda ${vendaLocalId}.`,
        { inventoryId: normInv(req.inventoryId), produtoId: normInv(req.produtoId) },
      )
    }
    // Sem lastro (serviço, avulso, O.S. ou linha sem Produto): sem política aprovada,
    // não há vale nem entrada de estoque — recusa explícita, nada é gravado.
    if (isVirtualSaleLine(k) || !keys.isProduto(k)) {
      throw new DevolucaoBusinessError("ITEM_SEM_LASTRO_BLOQUEADO", `${orig.nome}: ${ITEM_SEM_LASTRO_MENSAGEM}`, {
        inventoryId: k,
        virtual: isVirtualSaleLine(k),
      })
    }
    // Declaração comercial inválida: mesmo guard da venda (#335) — sem vale nem entrada.
    if (keys.isComercialInvalido(k)) throw new ProductCommercialInvalidError()

    // ── Unidade do pedido: KG (string exata) ou UN (inteiro legado) ──────────
    const pedeKgItem = req.quantidadeKg !== undefined
    const temUn = req.quantidade !== undefined
    if (pedeKgItem === temUn) {
      throw new DevolucaoBusinessError(
        "QUANTIDADE_ITEM_INVALIDA",
        `${orig.nome}: informe a quantidade em unidades inteiras OU o peso em kg (exatamente um dos dois).`,
        { inventoryId: k },
      )
    }
    if (!pedeKgItem && (typeof req.quantidade !== "number" || !Number.isInteger(req.quantidade) || req.quantidade < 1)) {
      throw new DevolucaoBusinessError(
        "QUANTIDADE_ITEM_INVALIDA",
        `${orig.nome}: produto por unidade exige quantidade inteira maior que zero.`,
        { inventoryId: k },
      )
    }
    // A unidade pedida tem que ser a da LINHA vendida (identidade histórica): linha
    // KG devolve por peso; linha UN devolve em unidades — o cadastro atual não decide.
    if (pedeKgItem && orig.unidade !== "KG") {
      throw new DevolucaoBusinessError(
        "QUANTIDADE_ITEM_INVALIDA",
        `${orig.nome}: este item foi vendido por unidade — devolva em unidades inteiras.`,
        { inventoryId: k },
      )
    }
    if (!pedeKgItem && orig.unidade !== "UN") {
      throw new DevolucaoBusinessError(
        "QUANTIDADE_ITEM_INVALIDA",
        `${orig.nome}: este item foi vendido por peso — informe o peso em kg (até 3 casas).`,
        { inventoryId: k },
      )
    }
    // ── Condição da mercadoria (GOAL §5) ─────────────────────────────────────
    const condicaoIndefinida = req.condicao === undefined || req.condicao === ""
    if (!condicaoIndefinida && !isCondicaoMercadoria(req.condicao)) {
      throw new DevolucaoBusinessError("CONDICAO_MERCADORIA_INVALIDA", `${orig.nome}: condição da mercadoria inválida.`, { inventoryId: k })
    }
    if (pedeKgItem && condicaoIndefinida) {
      // Perecível: sem confirmação EXPLÍCITA de aptidão nada volta ao estoque comercial.
      throw new DevolucaoBusinessError(
        "CONDICAO_MERCADORIA_OBRIGATORIA_KG",
        `${orig.nome}: informe a condição da mercadoria devolvida (apta para revenda, não apta, não recebida ou descarte).`,
        { inventoryId: k },
      )
    }
    const condicao: CondicaoMercadoria | undefined = condicaoIndefinida ? undefined : (req.condicao as CondicaoMercadoria)
    const justificativa = (req.justificativa ?? "").trim()
    if (condicao !== undefined && condicao !== "apto_revenda" && !justificativa) {
      throw new DevolucaoBusinessError(
        "JUSTIFICATIVA_CONDICAO_OBRIGATORIA",
        `${orig.nome}: mercadoria fora de condição de revenda exige justificativa (destino registrado para auditoria).`,
        { inventoryId: k },
      )
    }

    // ── Quantidade em unidades mínimas + teto ────────────────────────────────
    let qtyUnits: number
    let quantidadeKg: string | null = null
    let quantidade: number | null = null
    if (pedeKgItem) {
      const grams = parseQuantidadeKgRequest(req.quantidadeKg)
      if (grams === null) {
        throw new DevolucaoBusinessError("QUANTIDADE_KG_INVALIDA", `${orig.nome}: ${QUANTIDADE_KG_INVALIDA_MENSAGEM}`, { inventoryId: k })
      }
      qtyUnits = grams
      quantidadeKg = String(grams / 1000)
    } else {
      qtyUnits = req.quantidade as number
      quantidade = qtyUnits
    }
    const anteriorUnits = jaDevolvido.get(k) ?? 0
    const disponivel = orig.units - anteriorUnits
    if (qtyUnits < 1 || qtyUnits > disponivel) {
      throw new DevolucaoBusinessError(
        "QUANTIDADE_EXCEDE_DEVOLVIVEL",
        `${orig.nome}: ainda devolvível ${orig.unidade === "KG" ? `${(Math.max(0, disponivel) / 1000).toFixed(3)} kg` : Math.max(0, disponivel)}, solicitado ${orig.unidade === "KG" ? `${(qtyUnits / 1000).toFixed(3)} kg` : qtyUnits}.`,
        { inventoryId: k, unidade: orig.unidade, disponivel: Math.max(0, disponivel), solicitado: qtyUnits },
      )
    }

    // ── Valor PAGO, não o de tabela ──────────────────────────────────────────
    // Por ACUMULADO do produto: valor proporcional a (já devolvido + esta) menos o que
    // já foi restituído. Parciais isoladas perdem centavos; assim a última absorve o
    // resto. KG calcula em centavos×gramas inteiros (BigInt) — nunca Float em milésimos.
    let valorItem: number
    let valorUnitario: number
    if (orig.unidade === "KG") {
      const paidCents = Math.round(orig.lineTotal * fatorPago * 100)
      const acumCents = creditoKgCentavos(paidCents, anteriorUnits + qtyUnits, orig.units)
      valorItem = Math.max(0, acumCents - Math.round((jaRestituidoItem.get(k) ?? 0) * 100)) / 100
    } else {
      const pagoLinha = orig.lineTotal * fatorPago
      valorItem = Math.max(
        0,
        arredonda2(arredonda2((pagoLinha * (anteriorUnits + qtyUnits)) / orig.units) - (jaRestituidoItem.get(k) ?? 0)),
      )
    }
    valorUnitario = arredonda2(valorItem / (orig.unidade === "KG" ? qtyUnits / 1000 : qtyUnits))

    // ── Entrada de estoque: mercadoria apta E unidade do cadastro ATUAL coerente
    // com a da linha. Cadastro que mudou de unidade depois da venda não corrompe o
    // saldo (KG não vira 1000 UN, UN não vira 0,001 KG): a transação histórica
    // continua gerando crédito exato — apenas sem entrada no estoque comercial.
    const geraEntrada =
      condicaoGeraEntradaEstoque(condicao) &&
      (orig.unidade === "UN" ? (unidadeCadastro.get(k) ?? "UN") === "UN" : unidadeCadastro.get(k) === "KG")

    itensCalc.push({
      k,
      chaveClient: normInv(req.inventoryId),
      nome: orig.nome,
      unidade: orig.unidade,
      units: qtyUnits,
      quantidadeKg,
      quantidade,
      valorUnitario,
      valorTotal: valorItem,
      condicao: condicao ?? "apto_revenda",
      ...(justificativa ? { justificativa } : {}),
      geraEntrada,
    })
    mercadoria.push({
      produtoId: k,
      condicao: condicao ?? "apto_revenda",
      ...(justificativa ? { justificativa } : {}),
      estoque: geraEntrada ? "entrada" : "sem_entrada",
    })
  }

  // Teto acumulado: o que já foi devolvido desta venda + esta devolução nunca passa
  // do total PAGO (arredondamento de parciais não cria centavos de vale).
  const jaRestituido = await tx.devolucaoVenda.aggregate({
    where: { storeId, vendaLocalId },
    _sum: { valorTotal: true },
  })
  const restante = Math.max(0, arredonda2(venda.total - (jaRestituido._sum.valorTotal ?? 0)))
  const valorBruto = arredonda2(itensCalc.reduce((s, i) => s + i.valorTotal, 0))
  const valorTotal = Math.min(valorBruto, restante)
  // Mantém Σ itens = documento quando o teto corta (desconta do fim para o início).
  let excesso = arredonda2(valorBruto - valorTotal)
  for (let i = itensCalc.length - 1; i >= 0 && excesso > 0; i--) {
    const corte = Math.min(excesso, itensCalc[i]!.valorTotal)
    itensCalc[i]!.valorTotal = arredonda2(itensCalc[i]!.valorTotal - corte)
    itensCalc[i]!.valorUnitario = arredonda2(itensCalc[i]!.valorTotal / (itensCalc[i]!.unidade === "KG" ? itensCalc[i]!.units / 1000 : itensCalc[i]!.units))
    excesso = arredonda2(excesso - corte)
  }
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
      payload: { ...(input.payload ?? {}), mercadoria } as Prisma.InputJsonValue,
      itens: {
        create: itensCalc.map((i) => ({
          inventoryId: i.k,
          nome: i.nome,
          quantidade: i.quantidade,
          quantidadeKg: i.quantidadeKg,
          valorUnitario: i.valorUnitario,
          valorTotal: i.valorTotal,
        })),
      },
    },
    select: { id: true },
  })

  // ── 5. Estoque — ENTRADA compensatória pelo boundary canônico ──────────────
  for (const it of itensCalc) {
    if (!it.geraEntrada) continue
    // `it.k` é o Produto.id histórico (garantido por `isProduto` acima): nunca busca
    // por SKU/EAN de hoje, que pode ser de outro produto.
    const mov = await applyStockMutationTx(
      tx as unknown as StockLedgerTx,
      { storeId, principal: null, source: "ops-devolucao", operatorLabel: input.ledgerOperator },
      {
        kind: "entrada",
        produtoId: it.k,
        quantidade: it.unidade === "KG" ? it.units / 1000 : it.units,
        origem: "devolucao",
        documento: input.localId,
        motivo: input.motivo?.trim() || `Devolução ${input.localId}`,
        idempotencyKey: StockIdempotency.devolucao(input.localId, it.k),
      },
    )
    if (!mov.ok) {
      throw new Error(`[devolucao] devolução ao estoque falhou: ${mov.code} ${mov.message}`)
    }
  }

  // ── 6. Status da venda (agregado pós-lock, por UNIDADE da linha) ───────────
  const devolvidoTotal = new Map<string, number>()
  for (const [k, units] of jaDevolvido) devolvidoTotal.set(k, units)
  for (const i of itensCalc) devolvidoTotal.set(i.k, (devolvidoTotal.get(i.k) ?? 0) + i.units)
  const tudoDevolvido = [...vendido.entries()].every(([k, v]) => (devolvidoTotal.get(k) ?? 0) >= v.units)
  const algoDevolvido = [...devolvidoTotal.values()].some((u) => u > 0)
  const novoStatus = tudoDevolvido && algoDevolvido ? "devolvida" : algoDevolvido ? "parcialmente_devolvida" : venda.status
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
    itens: itensCalc.map((i) => ({
      inventoryId: i.chaveClient || i.k,
      produtoId: i.k,
      nome: i.nome,
      quantidade: i.quantidade,
      quantidadeKg: i.quantidadeKg === null ? null : Number(i.quantidadeKg),
      valorUnitario: i.valorUnitario,
      valorTotal: i.valorTotal,
      condicao: i.condicao,
      estoque: i.geraEntrada ? ("entrada" as const) : ("sem_entrada" as const),
    })),
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
