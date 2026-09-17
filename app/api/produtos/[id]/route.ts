import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import {
  PRODUCT_WRITE_AUDIT_SOURCE,
  updateProduct,
  updateProductTx,
  type ProductWriteTx,
} from "@/lib/cadastros/product-write-service"
import type { ProductWriteInput, ProductWriteResult } from "@/lib/cadastros/product-write-contract"
import { applyStockMutation, applyStockMutationTx } from "@/lib/estoque/stock-ledger-service"
import type { StockLedgerResult } from "@/lib/estoque/stock-ledger-contract"
import {
  PRODUTO_REST_SELECT,
  mapProductWriteFailureToResponse,
  mapStockLedgerFailureToResponse,
  restPatchIdempotencyKey,
} from "@/lib/cadastros/product-rest-write-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

function parseStockValue(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v)
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

class CadFailure {
  constructor(public result: Extract<ProductWriteResult, { ok: false }>) {}
}

class StockFailure {
  constructor(public result: Extract<StockLedgerResult, { ok: false }>) {}
}

function isCadFailure(e: unknown): e is CadFailure {
  return e instanceof CadFailure
}

function isStockFailure(e: unknown): e is StockFailure {
  return e instanceof StockFailure
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCadastrosHubApi(req, "write")
  if (!gate.ok) return gate.response
  const storeId = gate.storeId

  const { id } = await context.params
  if (!id?.trim()) return badRequest("ID inválido")
  const productId = id.trim()

  try {
    const raw = (await req.json()) as Record<string, unknown>

    // Contrato REST preservado: `stock` continua válido e significa AJUSTE
    // ABSOLUTO via StockLedger (nunca `produto.update({ stock })`).
    const hasStock = raw.stock !== undefined
    let targetStock: number | undefined
    if (hasStock) {
      const parsed = parseStockValue(raw.stock)
      if (parsed === null) return badRequest('Campo "stock" inválido')
      if (parsed < 0) return badRequest("Estoque não pode ser negativo")
      targetStock = parsed
    }

    // Intenção explícita REST: `metadata: null` continua LIMPANDO (CLEAR);
    // interactive sem a opção continua preservando. Sem heurística.
    const clearMetadata = raw.metadata === null

    // Cadastral = tudo exceto saldo operacional. `estoque` (alias legado) nunca
    // vai ao service como PATCH (service bloqueia); `stock` é ledger.
    const cadastral: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (key === "stock" || key === "estoque") continue
      cadastral[key] = value
    }
    const hasCadastralKeys = Object.keys(cadastral).length > 0

    if (!hasStock && !hasCadastralKeys) {
      return badRequest("Nada para atualizar")
    }

    const principal = cadastrosAuditPrincipalFromSession(gate.session)
    const writeContext = { storeId, principal }
    const stockContext = { storeId, principal, source: PRODUCT_WRITE_AUDIT_SOURCE }
    const idempotencyKey = restPatchIdempotencyKey(req, productId)

    // ── STOCK-ONLY: somente ledger, sem updateProduct vazio ──────────────
    if (hasStock && !hasCadastralKeys) {
      const ledger = await applyStockMutation(
        stockContext,
        {
          kind: "ajuste",
          produtoId: productId,
          novoSaldo: targetStock as number,
          origem: "cadastro",
          motivo: "Ajuste de estoque via REST",
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      )
      if (!ledger.ok) {
        // Retry sem chave para saldo já atingido: sem efeito econômico novo.
        if (ledger.code === "VALIDATION" && ledger.estoqueAntes === targetStock) {
          await prismaEnsureConnected()
          const current = await prisma.produto.findFirst({
            where: { id: productId, storeId },
            select: PRODUTO_REST_SELECT,
          })
          if (!current) return json({ error: "Produto não encontrado" }, { status: 404 })
          return json({ ok: true, produto: current })
        }
        return mapStockLedgerFailureToResponse(ledger)
      }
      await prismaEnsureConnected()
      const updated = await prisma.produto.findFirst({
        where: { id: productId, storeId },
        select: PRODUTO_REST_SELECT,
      })
      if (!updated) return json({ error: "Produto não encontrado" }, { status: 404 })
      return json({ ok: true, produto: updated })
    }

    // ── PRODUCT-ONLY: service canônico, nenhum ledger ────────────────────
    if (!hasStock) {
      const updated = await updateProduct(
        writeContext,
        productId,
        cadastral as unknown as ProductWriteInput,
        { clearMetadata },
      )
      if (!updated.ok) return mapProductWriteFailureToResponse(updated, { context: "update" })
      await prismaEnsureConnected()
      const row = await prisma.produto.findFirst({
        where: { id: productId, storeId },
        select: PRODUTO_REST_SELECT,
      })
      if (!row) return json({ error: "Produto não encontrado" }, { status: 404 })
      return json({ ok: true, produto: row })
    }

    // ── MIXED: UMA transaction (cadastral via tx + ledger via mesma tx) ──
    // Falha em qualquer lado reverte o outro — nunca persiste metade.
    await prismaEnsureConnected()
    try {
      await prisma.$transaction(async (tx) => {
        const cad = await updateProductTx(
          tx as unknown as ProductWriteTx,
          writeContext,
          productId,
          cadastral as unknown as ProductWriteInput,
          { clearMetadata },
        )
        if (!cad.ok) {
          // Campo desconhecido/ignorado com stock presente = stock-only efetivo
          // (paridade com o PATCH antigo, que ignorava chaves desconhecidas).
          if (cad.code === "VALIDATION" && cad.message === "Nada para atualizar.") {
            // segue só com o ledger abaixo
          } else {
            throw new CadFailure(cad)
          }
        }
        const led = await applyStockMutationTx(
          tx as unknown as Parameters<typeof applyStockMutationTx>[0],
          stockContext,
          {
            kind: "ajuste",
            produtoId: productId,
            novoSaldo: targetStock as number,
            origem: "cadastro",
            motivo: "Ajuste de estoque via REST",
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
        )
        if (!led.ok) {
          if (led.code === "VALIDATION" && led.estoqueAntes === targetStock) {
            return
          }
          throw new StockFailure(led)
        }
      })
    } catch (e) {
      if (isCadFailure(e)) return mapProductWriteFailureToResponse(e.result, { context: "update" })
      if (isStockFailure(e)) return mapStockLedgerFailureToResponse(e.result)
      throw e
    }

    const mixed = await prisma.produto.findFirst({
      where: { id: productId, storeId },
      select: PRODUTO_REST_SELECT,
    })
    if (!mixed) return json({ error: "Produto não encontrado" }, { status: 404 })
    return json({ ok: true, produto: mixed })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/produtos PATCH]", msg)
    return json(
      { error: "Falha ao atualizar produto", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 },
    )
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCadastrosHubApi(req, "write")
  if (!gate.ok) return gate.response
  const storeId = gate.storeId

  const { id } = await context.params
  if (!id?.trim()) return badRequest("ID inválido")

  try {
    await prismaEnsureConnected()
    const del = await prisma.produto.deleteMany({ where: { id, storeId } })
    if (del.count === 0) {
      return json({ error: "Produto não encontrado" }, { status: 404 })
    }
    return json({ ok: true })
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return json({ error: "Produto não encontrado" }, { status: 404 })
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/produtos DELETE]", msg)
    return json(
      { error: "Falha ao excluir produto", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 },
    )
  }
}
