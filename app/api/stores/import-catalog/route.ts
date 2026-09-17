import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { canAuthorizeCadastrosStore } from "@/lib/cadastros/cadastros-api-access"
import type { ProductWriteInput } from "@/lib/cadastros/product-write-contract"
import {
  PRODUCT_WRITE_AUDIT_SOURCE,
  createProductTx,
  updateProductTx,
  type ProductWriteTx,
} from "@/lib/cadastros/product-write-service"
import { StockIdempotency } from "@/lib/estoque/stock-ledger-contract"
import { applyStockMutationTx } from "@/lib/estoque/stock-ledger-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Importa SOMENTE Produtos + Categorias de uma unidade para outra.
 * Não copia vendas, clientes ou financeiro.
 *
 * POST /api/stores/import-catalog
 * body: { fromStoreId: string, toStoreId: string, mode?: "merge" | "overwrite" }
 *
 * mode=merge (default): upsert por (toStoreId, sku) e cria categorias que não existem.
 */
export async function POST(req: Request) {
  const actorStore = storeIdFromAssistecRequestForRead(req)
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
    const body = (await req.json()) as {
      fromStoreId?: unknown
      toStoreId?: unknown
      mode?: unknown
    }
    const fromStoreId = typeof body.fromStoreId === "string" ? body.fromStoreId.trim() : ""
    const toStoreId = typeof body.toStoreId === "string" ? body.toStoreId.trim() : ""
    const mode = body.mode === "overwrite" ? "overwrite" : "merge"

    if (!fromStoreId || !toStoreId) {
      return NextResponse.json({ ok: false, error: "fromStoreId e toStoreId são obrigatórios" }, { status: 400 })
    }
    if (fromStoreId === toStoreId) {
      return NextResponse.json({ ok: false, error: "Origem e destino não podem ser iguais" }, { status: 400 })
    }

    // CAD-R2-014: body nunca é prova de autorização. Ambas as lojas precisam
    // ser autorizadas para a sessão (fail-closed; ADMIN tem acesso global).
    if (
      !canAuthorizeCadastrosStore(gate.session, fromStoreId) ||
      !canAuthorizeCadastrosStore(gate.session, toStoreId)
    ) {
      return NextResponse.json({ ok: false, error: "Sem permissão para esta unidade" }, { status: 403 })
    }
    // Principal humano canônico quando houver; null = origem técnica honesta.
    const principal = cadastrosAuditPrincipalFromSession(gate.session)
    const wctx = { storeId: toStoreId, principal }
    const stockCtx = { storeId: toStoreId, principal, source: PRODUCT_WRITE_AUDIT_SOURCE }
    // Identidade estável da operação (para ledger `importacao` dentro do lote).
    // Não é chave de retry entre requests — retry entre requests é dedupado
    // pela igualdade semântica (destino já no saldo alvo = no-op).
    const batchId = `catalog-${randomUUID()}`

    const [fromExists, toExists] = await Promise.all([
      prisma.store.findUnique({ where: { id: fromStoreId }, select: { id: true } }),
      prisma.store.findUnique({ where: { id: toStoreId }, select: { id: true } }),
    ])
    if (!fromExists || !toExists) {
      return NextResponse.json({ ok: false, error: "Unidade origem/destino inválida" }, { status: 404 })
    }

    const [cats, prods] = await Promise.all([
      prisma.categoriaProduto.findMany({
        where: { storeId: fromStoreId },
        select: { slug: true, nome: true },
      }),
      prisma.produto.findMany({
        where: { storeId: fromStoreId },
        select: { sku: true, name: true, stock: true, precoCusto: true, price: true, category: true },
      }),
    ])

    let categoriasCriadas = 0
    let produtosCriados = 0
    let produtosAtualizados = 0
    let produtosIgnoradosSemSku = 0

    // CAD-R2-014: UMA transação (categoria + cadastro via Tx + ledger via
    // mesma Tx) — commit único, sem nested transaction. CREATE/UPDATE de
    // Produto via ProductWriteService; mudança de saldo via StockLedger.
    await prisma.$transaction(async (tx) => {
      const txx = tx as unknown as ProductWriteTx
      for (const c of cats) {
        const slug = (c.slug || "").trim()
        if (!slug) continue
        await tx.categoriaProduto.upsert({
          where: { lojaId_slug: { storeId: toStoreId, slug } },
          update: mode === "overwrite" ? { nome: c.nome } : {},
          create: { storeId: toStoreId, slug, nome: c.nome },
        })
        categoriasCriadas += 1
      }

      for (const p of prods) {
        const sku = (p.sku || "").trim()
        if (!sku) {
          produtosIgnoradosSemSku += 1
          continue
        }
        const targetStock = Math.max(0, Math.floor(Number(p.stock ?? 0) || 0))
        const existing = await tx.produto.findFirst({
          where: { storeId: toStoreId, sku },
          select: { id: true, stock: true },
        })
        if (!existing) {
          // Novo: cadastral + estoque inicial via ledger `cadastro` (mesma tx).
          const created = await createProductTx(txx, wctx, {
            nome: p.name,
            sku,
            categoria: p.category ?? undefined,
            custo: p.precoCusto,
            preco: p.price,
            estoque: targetStock,
          } as unknown as ProductWriteInput)
          if (!created.ok) {
            throw new Error(`[import-catalog] create ${sku} falhou: ${created.code} ${created.message}`)
          }
          produtosCriados += 1
          continue
        }
        if (mode === "merge") {
          // merge: atualiza dados básicos (mas não apaga nada); preserva estoque.
          const updated = await updateProductTx(
            txx,
            wctx,
            existing.id,
            {
              nome: p.name,
              preco: p.price,
              categoria: p.category ?? undefined,
            } as unknown as ProductWriteInput,
          )
          if (!updated.ok) {
            throw new Error(`[import-catalog] merge ${sku} falhou: ${updated.code} ${updated.message}`)
          }
          produtosAtualizados += 1
          continue
        }
        // overwrite: cadastral completo (sem saldo) + ajuste de saldo via ledger.
        const updated = await updateProductTx(
          txx,
          wctx,
          existing.id,
          {
            nome: p.name,
            custo: p.precoCusto,
            preco: p.price,
            categoria: p.category ?? undefined,
          } as unknown as ProductWriteInput,
        )
        if (!updated.ok) {
          throw new Error(`[import-catalog] overwrite ${sku} falhou: ${updated.code} ${updated.message}`)
        }
        const currentStock = Math.max(0, Math.floor(Number(existing.stock ?? 0) || 0))
        if (currentStock !== targetStock) {
          const led = await applyStockMutationTx(txx as unknown as Parameters<typeof applyStockMutationTx>[0], stockCtx, {
            kind: "ajuste",
            produtoId: existing.id,
            novoSaldo: targetStock,
            origem: "importacao",
            motivo: `Importação de catálogo (${mode}) de ${fromStoreId}`,
            idempotencyKey: StockIdempotency.importacao(batchId, existing.id),
          })
          if (!led.ok) {
            // Retry semântico: destino já no saldo alvo = no-op honesto.
            if (!(led.code === "VALIDATION" && led.estoqueAntes === targetStock)) {
              throw new Error(`[import-catalog] ledger ${sku} falhou: ${led.code} ${led.message}`)
            }
          }
        }
        produtosAtualizados += 1
      }
    })

    return NextResponse.json({
      ok: true,
      actorStore,
      fromStoreId,
      toStoreId,
      mode,
      categoriasCopiadas: cats.length,
      categoriasCriadas,
      produtosLidos: prods.length,
      produtosIgnoradosSemSku,
      produtosCriados,
      produtosAtualizados,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao importar"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

