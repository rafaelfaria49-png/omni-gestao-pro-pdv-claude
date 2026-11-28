/**
 * Modo de implantação — saldo inicial de mercadoria anterior ao sistema (ADR-0025 · item 13).
 *
 * Saldo inicial NÃO é compra, pagamento, consumo, ajuste nem perda: é uma entrada de estoque com
 * origem `implantacao`, sem nenhuma movimentação financeira (o material foi pago antes do sistema).
 * Regras:
 * - só com o recurso `commercial.implantationMode` ligado (a rota confere) e permissão de configuração;
 * - uma única vez por produto (chave estável `implantacao:saldo-inicial:{produto}`); repetir com o
 *   mesmo conteúdo é replay, com outro conteúdo é 409;
 * - só para produto com saldo ZERO: saldo existente não é reinterpretado nem duplicado (use inventário);
 * - aparelho por IMEI, produto por peso e grade ficam fora (têm escritores próprios);
 * - custo conhecido / estimado / desconhecido, com justificativa — desconhecido não vira custo zero
 *   inventado: a entrada preserva o custo médio e o motivo registra "custo desconhecido".
 */
import { prisma } from "@/lib/prisma"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { buildIdempotencyKey } from "@/lib/estoque/stock-ledger-contract"
import { isSerializedDeviceProduct } from "@/lib/aparelhos/serialized-product"
import { productCommercialCatalogProjection } from "@/lib/cadastros/product-commercial-contract"
import { asCentavos, centavosParaReais } from "./custos/money"
import { isCustoStatus, type CustoStatus } from "./custos/contracts"

export type ImplantacaoCtx = { storeId: string; actorLabel: string }
type Fail = { ok: false; status: number; code: string; message: string; field?: string }
const fail = (status: number, code: string, message: string, field?: string): Fail => ({ ok: false, status, code, message, ...(field ? { field } : {}) })

class ImplantacaoError extends Error {
  constructor(readonly f: Fail) { super(f.message) }
}
function stop(status: number, code: string, message: string, field?: string): never {
  throw new ImplantacaoError(fail(status, code, message, field))
}

export type SaldoInicialInput = {
  produtoId: string
  quantidade: number
  custoStatus: CustoStatus
  custoUnitarioCentavos: number | null
  justificativa: string
}

export function parseSaldoInicial(raw: unknown): { ok: true; input: SaldoInicialInput } | Fail {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const produtoId = typeof r.produtoId === "string" ? r.produtoId.trim().slice(0, 64) : ""
  if (!produtoId) return fail(400, "PRODUTO_OBRIGATORIO", "Selecione o produto.", "produtoId")
  const q = r.quantidade
  if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > 1_000_000) return fail(400, "QUANTIDADE_INVALIDA", "Quantidade inteira entre 1 e 1.000.000.", "quantidade")
  const custoStatus = r.custoStatus ?? "conhecido"
  if (!isCustoStatus(custoStatus)) return fail(400, "CUSTO_STATUS_INVALIDO", "Situação do custo inválida.", "custoStatus")
  let custoUnitarioCentavos: number | null = null
  if (custoStatus !== "desconhecido") {
    custoUnitarioCentavos = asCentavos(r.custoUnitarioCentavos)
    if (custoUnitarioCentavos === null) return fail(400, "CUSTO_OBRIGATORIO", "Informe o custo unitário conhecido ou estimado (centavos).", "custoUnitarioCentavos")
  } else if (r.custoUnitarioCentavos !== undefined && r.custoUnitarioCentavos !== null) {
    return fail(400, "VALOR_COM_CUSTO_DESCONHECIDO", "Custo desconhecido não leva valor.", "custoUnitarioCentavos")
  }
  const justificativa = typeof r.justificativa === "string" ? r.justificativa.trim().slice(0, 500) : ""
  if (justificativa.length < 10) return fail(400, "JUSTIFICATIVA_OBRIGATORIA", "Justifique a origem do saldo inicial (mínimo 10 caracteres).", "justificativa")
  return { ok: true, input: { produtoId, quantidade: q, custoStatus, custoUnitarioCentavos, justificativa } }
}

export function chaveSaldoInicial(storeId: string, produtoId: string): string {
  return buildIdempotencyKey("implantacao", "saldo-inicial", storeId, produtoId)
}

export async function registrarSaldoInicial(ctx: ImplantacaoCtx, raw: unknown, db: typeof prisma = prisma) {
  const parsed = parseSaldoInicial(raw)
  if (!parsed.ok) return parsed
  const input = parsed.input
  const idempotencyKey = chaveSaldoInicial(ctx.storeId, input.produtoId)
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; stock: number; metadata: unknown; price: number; price_cost: number; name: string }>>`
        SELECT "id", "stock", "metadata", "price", "price_cost", "name" FROM "estoque_produtos" WHERE "id" = ${input.produtoId} AND "storeId" = ${ctx.storeId} FOR UPDATE`
      const produto = rows[0]
      if (!produto) stop(404, "PRODUTO_NAO_ENCONTRADO", "Produto não encontrado nesta loja.", "produtoId")
      const anterior = await tx.movimentacaoEstoque.findUnique({
        where: { storeId_idempotencyKey: { storeId: ctx.storeId, idempotencyKey } },
        select: { id: true, quantidade: true, custoUnitario: true, createdAt: true },
      })
      if (anterior) {
        const mesmoCusto = Math.round(anterior.custoUnitario * 100) === (input.custoUnitarioCentavos ?? 0)
        if (anterior.quantidade === input.quantidade && mesmoCusto) {
          return { ok: true as const, replay: true, movimentacaoId: anterior.id }
        }
        stop(409, "SALDO_INICIAL_JA_REGISTRADO", "Este produto já recebeu saldo inicial. Use o inventário para corrigir o saldo.")
      }
      if (isSerializedDeviceProduct(produto!.metadata)) {
        stop(409, "PRODUTO_SERIALIZADO", "Aparelho por IMEI entra pela unidade física (Cadastros → Aparelhos), marcado como preexistente.")
      }
      const proj = productCommercialCatalogProjection(produto!.metadata, produto!.price)
      if (!proj.vendaOperacional) stop(409, "PRODUTO_NAO_OPERACIONAL", "Produto por peso, com grade ou declaração inválida não recebe saldo inicial por unidade.")
      // Revisão P2-6: "desconhecido" com custo já no cadastro viraria custo CONHECIDO no consumo
      // posterior (custo médio preservado). Fica explícito: informe como estimado/conhecido.
      if (input.custoStatus === "desconhecido" && produto!.price_cost > 0) {
        stop(409, "CUSTO_CADASTRO_EXISTENTE", "O cadastro deste produto já tem custo. Informe o custo como conhecido ou estimado (ou zere o custo no cadastro).")
      }
      if (produto!.stock !== 0) {
        stop(409, "SALDO_EXISTENTE", "O produto já tem saldo. Saldo inicial só vale para produto zerado; para corrigir, use o inventário.")
      }
      const res = await applyStockMutationTx(
        tx as unknown as StockLedgerTx,
        { storeId: ctx.storeId, principal: null, source: "comercial-implantacao", operatorLabel: ctx.actorLabel },
        {
          kind: "entrada", produtoId: produto!.id, quantidade: input.quantidade,
          ...(input.custoUnitarioCentavos ? { custoUnitario: centavosParaReais(input.custoUnitarioCentavos) } : {}),
          origem: "implantacao", documento: "IMPLANTACAO",
          motivo: `Saldo inicial de implantação (custo ${input.custoStatus}) — sem movimentação financeira`,
          observacao: input.justificativa, idempotencyKey,
        },
      )
      if (!res.ok) stop(409, `ESTOQUE_${res.code}`, `Estoque: ${res.message}`)
      return {
        ok: true as const, replay: res.idempotente, movimentacaoId: res.movimentacaoId,
        estoqueDepois: res.estoqueDepois, custoStatus: input.custoStatus,
      }
    }, { timeout: 20_000, maxWait: 10_000 })
  } catch (e) {
    if (e instanceof ImplantacaoError) return e.f
    throw e
  }
}

export type SaldoInicialResult = Awaited<ReturnType<typeof registrarSaldoInicial>>
