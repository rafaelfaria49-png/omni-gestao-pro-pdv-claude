import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

/**
 * Lista todos os produtos da loja com id, nome, sku e barcode (somente admin).
 * Usado pelo fluxo “Corrigir códigos” no importador — não altera dados.
 */
export async function GET(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const storeId = storeIdFromAssistecRequestForRead(req)
  if (!storeId) {
    return json({ error: "Unidade obrigatória: header x-assistec-loja-id ou query storeId." }, { status: 400 })
  }

  try {
    const produtos = await prisma.produto.findMany({
      where: { storeId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
      },
      take: 50_000,
    })
    return json({ ok: true, produtos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/produtos/correcao-codigos GET]", msg)
    return json(
      { error: "Falha ao listar produtos", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}
