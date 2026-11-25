/**
 * POST /api/ops/trocas — troca imediata, vale-troca, reembolso ou retorno ao estoque,
 * numa única transação autoritativa (`lib/pdv/trocas/troca-service.ts`).
 *
 * Idempotente por `operationId` (`trc_…`): reenvio após falha de rede devolve o mesmo
 * resultado, sem duplicar devolução, venda, crédito, estoque ou financeiro. A resposta
 * `ok: true` só existe depois do COMMIT — o cliente nunca declara troca concluída antes.
 */
import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { ProductCommercialInvalidError, ProductWeightNotOperationalError } from "@/lib/cadastros/product-commercial-contract"
import {
  CaixaSessaoInvalidaError,
  CreditoValeInsuficienteError,
  FractionalQuantityError,
  InsufficientStockError,
  InvalidSaleLinesError,
  SalePaymentsMismatchError,
  StockLedgerBusinessError,
  UnresolvedProductError,
  ClientSaleIdReusedError,
} from "@/lib/ops-upsert-venda"
import { isSaleNumberingError } from "@/lib/vendas/server-sale-numbering"
import { resolveSaleNumberingWriter } from "@/lib/vendas/sale-numbering-runtime-gate"
import { SALE_WRITER_FLOW } from "@/lib/vendas/sale-identity-contracts"
import { handleEvent } from "@/lib/automation/automation-engine"
import { dispatchSaleAutomationIfCreated } from "@/lib/vendas/sale-automation-dispatch"
import { registrarTroca, TrocaError } from "@/lib/pdv/trocas/troca-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const schema = z.object({
  operationId: z.string().min(12).max(120),
  pedidoIdOrigem: z.string().min(1).max(80),
  modo: z.enum(["troca", "vale_credito", "reembolso", "somente_estoque"]),
  linhas: z.array(z.object({ lineIndex: z.number().int().min(0), quantidade: z.number().int().min(1) })).min(1).max(100),
  novosItens: z.array(z.object({ produtoId: z.string().min(1).max(120), quantidade: z.number().int().min(1).max(999) })).max(50).optional(),
  formaDiferenca: z.enum(["dinheiro", "pix", "debito", "credito"]).optional(),
  destinoExcedente: z.enum(["vale", "dinheiro"]).optional(),
  formaReembolso: z.enum(["dinheiro", "pix", "estorno_cartao"]).optional(),
  clienteDoc: z.string().max(32).optional(),
  clienteNome: z.string().max(160).optional(),
  motivo: z.string().max(500).optional(),
  sessaoId: z.string().max(120).nullish(),
  terminalId: z.string().max(60).nullish(),
})

const ENGINE_409 = [
  CaixaSessaoInvalidaError,
  CreditoValeInsuficienteError,
  FractionalQuantityError,
  InsufficientStockError,
  InvalidSaleLinesError,
  SalePaymentsMismatchError,
  StockLedgerBusinessError,
  UnresolvedProductError,
  ClientSaleIdReusedError,
  ProductCommercialInvalidError,
  ProductWeightNotOperationalError,
] as const

export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedPayment")
  if (moduleDenied) return moduleDenied

  const lojaId = opsLojaIdFromRequestForWrite(req)
  if (!lojaId) return NextResponse.json({ error: "Unidade obrigatória: envie o header x-assistec-loja-id." }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Dados da troca inválidos.", code: "PAYLOAD_INVALIDO" }, { status: 422 })
  const data = parsed.data

  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.pdv.devolucao && (data.modo !== "troca" || p.hubs.vendas),
    "Sem permissão para registrar trocas e devoluções.",
  )
  if (denied) return denied

  const session = await auth()
  const operadorLabel = (session?.user ? getOperatorLabelFromSession(session) : "").trim()

  try {
    await prismaEnsureConnected()
    const out = await registrarTroca({
      storeId: lojaId,
      operationId: data.operationId,
      pedidoIdOrigem: data.pedidoIdOrigem,
      modo: data.modo,
      linhas: data.linhas,
      novosItens: data.novosItens,
      formaDiferenca: data.formaDiferenca,
      destinoExcedente: data.destinoExcedente,
      formaReembolso: data.formaReembolso,
      clienteDoc: data.clienteDoc,
      clienteNome: data.clienteNome,
      motivo: data.motivo,
      sessaoId: data.sessaoId ?? null,
      terminalId: data.terminalId ?? null,
      operadorLabel,
      numeracaoServidor: resolveSaleNumberingWriter().writer === SALE_WRITER_FLOW.V2,
    })

    if (out.vendaCriada) {
      try {
        await dispatchSaleAutomationIfCreated(
          { replayed: false, storeId: lojaId, venda: out.vendaCriada.venda, sale: out.vendaCriada.sale },
          handleEvent,
          (err) => console.error("[ops/trocas] automacao-pos-commit-falhou", err instanceof Error ? err.message : String(err)),
        )
      } catch (err) {
        console.error("[ops/trocas] automacao-pos-commit-falhou", err instanceof Error ? err.message : String(err))
      }
    }
    return NextResponse.json({ ok: true, replayed: out.replayed, resultado: out.resultado })
  } catch (e) {
    if (e instanceof TrocaError) {
      return NextResponse.json({ error: e.message, code: e.code, ...(e.detail ? { detail: e.detail } : {}) }, { status: e.status })
    }
    if (ENGINE_409.some((C) => e instanceof C)) {
      const err = e as Error & { code?: string }
      return NextResponse.json({ error: err.message, code: err.code ?? "TROCA_RECUSADA" }, { status: 409 })
    }
    if (isSaleNumberingError(e)) {
      return NextResponse.json({ error: "Numeração de vendas indisponível. Tente novamente.", code: (e as { code?: string }).code }, { status: 503 })
    }
    console.error("[ops/trocas]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: "Falha ao registrar a troca. Nada foi gravado.", code: "TROCA_FALHOU" }, { status: 500 })
  }
}
