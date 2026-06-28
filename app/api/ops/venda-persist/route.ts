import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import {
  upsertVendaInTransaction,
  InsufficientStockError,
  UnresolvedProductError,
  CaixaSessaoInvalidaError,
  type SalePayload,
} from "@/lib/ops-upsert-venda"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request) {
  const lojaId = opsLojaIdFromRequestForWrite(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId." },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const sale = (body as { sale?: SalePayload }).sale
  if (!sale || typeof sale !== "object") {
    return NextResponse.json({ error: "sale obrigatório" }, { status: 400 })
  }

  const pedidoId = typeof sale.id === "string" && sale.id.trim() ? sale.id.trim() : ""
  if (!pedidoId) {
    return NextResponse.json({ error: "sale.id inválido" }, { status: 400 })
  }

  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.hubs.vendas,
    "Sem permissão para registrar vendas.",
  )
  if (denied) return denied

  // Resolve o operador a partir da sessão NextAuth — mais confiável que o cashierId do cliente.
  const session = await auth()
  const operadorLabel = session?.user ? getOperatorLabelFromSession(session) : undefined

  try {
    await prismaEnsureConnected()
    await prisma.$transaction(async (tx) => {
      await upsertVendaInTransaction(tx, lojaId, sale, operadorLabel, {
        enforceStock: true,
        requireCaixaSession: true,
      })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    // Caixa servidor obrigatório (P1 OPS-SALE-SAFETY-P1-001): venda com entrada no caixa
    // sem `SessaoCaixa` ABERTA válida é falha de negócio (409), não erro de servidor.
    // Nada foi gravado (validação dentro da transação). O PDV mantém `syncPending` e
    // mostra o toast — o operador abre o caixa e usa "Reenviar sync".
    if (e instanceof CaixaSessaoInvalidaError) {
      console.warn(
        "[ops/venda-persist] caixa-fechado",
        JSON.stringify({ lojaId, pedidoId, sessaoId: sale.sessaoId ?? null, terminalId: sale.terminalId ?? null }),
      )
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 })
    }
    // Produto físico não resolvido (P1): item sem casamento em `Produto` não pode gerar
    // venda/financeiro sem baixa de estoque. Nada foi gravado (transação revertida).
    if (e instanceof UnresolvedProductError) {
      console.warn(
        "[ops/venda-persist] produto-nao-resolvido",
        JSON.stringify({ lojaId, pedidoId, inventoryIds: e.inventoryIds }),
      )
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 })
    }
    // Anti-negativo (DT-B): saldo insuficiente é falha de negócio explícita (409),
    // não erro de servidor. O cliente PDV mantém a venda em `syncPending` e mostra o
    // toast com `detail`, permitindo reabrir o caixa/ajustar estoque e reenviar.
    if (e instanceof InsufficientStockError) {
      console.warn(
        "[ops/venda-persist] estoque-insuficiente",
        JSON.stringify({
          lojaId,
          pedidoId,
          produtoId: e.produtoId,
          disponivel: e.disponivel,
          solicitado: e.solicitado,
        }),
      )
      return NextResponse.json(
        { error: "Estoque insuficiente", detail: e.message, code: e.code },
        { status: 409 },
      )
    }
    const msg = e instanceof Error ? e.message : String(e)
    // Extrai code do PrismaClientKnownRequestError (P2002 unique, P2003 FK, P2025 not found, etc.)
    const code =
      e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
        ? (e as { code: string }).code
        : undefined
    const meta =
      e && typeof e === "object" && "meta" in e ? (e as { meta: unknown }).meta : undefined
    console.error(
      "[ops/venda-persist] erro",
      JSON.stringify({ lojaId, pedidoId, code, msg, meta }),
    )
    return NextResponse.json(
      { error: "Falha ao salvar venda no servidor", detail: msg, code },
      { status: 503 },
    )
  }
}
