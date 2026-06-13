import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import type { Produto } from "@/generated/prisma"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"

export const runtime = "nodejs"
/** Sem cache de rota / fetch no Next — sempre dados frescos do Prisma. */
export const dynamic = "force-dynamic"
export const revalidate = 0

/** Fora de produção, leituras de estoque não exigem cookie de assinatura (dev / preview local). */
function bypassSubscriptionCheck(): boolean {
  return process.env.NODE_ENV !== "production"
}

/** Espelha `rowToItem` de `app/api/ops/inventory/route.ts` para que o PDV consuma o mesmo formato. */
function rowToItem(row: Produto) {
  const sku =
    typeof (row as unknown as { sku?: unknown }).sku === "string"
      ? String((row as unknown as { sku: string }).sku)
      : ""
  const barcode =
    typeof (row as unknown as { barcode?: unknown }).barcode === "string"
      ? String((row as unknown as { barcode: string }).barcode)
      : ""
  const skuTrim = sku.trim()
  const bcTrim = barcode.trim()
  const opId = skuTrim || row.id
  return {
    id: opId,
    name: row.name,
    barcode: bcTrim || undefined,
    sku: skuTrim || undefined,
    dbId: row.id,
    codigo: skuTrim || undefined,
    codigoBarras: bcTrim || undefined,
    stock: row.stock,
    cost: row.precoCusto,
    price: row.price,
    category:
      typeof (row as unknown as { category?: unknown }).category === "string"
        ? (row as unknown as { category: string }).category
        : "",
  }
}

async function requireSubscription() {
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) {
    return { ok: false as const, res: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return { ok: false as const, res: NextResponse.json({ error: "Assinatura inválida" }, { status: 403 }) }
  }
  return { ok: true as const, sub }
}

/**
 * Busca autoritativa de produto por código EXATO no catálogo INTEIRO da loja ativa.
 *
 * Diferente do `GET /api/ops/inventory` (carga completa), este endpoint resolve um único
 * código de bipe contra o banco — independente da página/snapshot carregado em memória pelo
 * PDV. Usado como rede de segurança quando o `findPdvProductByScan` local não encontra o item
 * (snapshot defasado, produto recém-cadastrado em outra aba/dispositivo, etc.).
 *
 * Isolamento multi-loja: filtra sempre por `storeId` (header `x-assistec-loja-id` / query) e
 * valida `canAccessStore` — produto de outra loja nunca é retornado.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const lojaId = storeIdFromAssistecRequestForRead(req)
  if (!lojaId) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  if (!canAccessStore(session, lojaId)) return NextResponse.json({ error: "Sem acesso à loja" }, { status: 403 })

  const url = new URL(req.url)
  const code = (url.searchParams.get("code") || url.searchParams.get("barcode") || "").trim()
  if (!code) return NextResponse.json({ error: "code obrigatório" }, { status: 400 })

  try {
    const gate = await requireSubscription()
    if (!gate.ok) {
      if (!bypassSubscriptionCheck()) return gate.res
      console.warn("[ops/inventory/lookup] bypass subscription check (dev mode)")
    }

    // Match exato pelas chaves canônicas do produto, escopado à loja:
    // - barcode (EAN/GTIN) · sku (código interno / id operacional) · id (cuid Prisma / dbId).
    const rows = await prisma.produto.findMany({
      where: {
        storeId: lojaId,
        OR: [{ barcode: code }, { sku: code }, { id: code }],
      },
      orderBy: { name: "asc" },
      take: 10,
    })

    return NextResponse.json({ items: rows.map(rowToItem), _lojaId: lojaId, _code: code })
  } catch (e) {
    const dev = process.env.NODE_ENV === "development"
    const msg = e instanceof Error ? e.message : String(e)
    const prismaCode = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined
    console.error("[ops/inventory/lookup GET] erro:", msg)
    return NextResponse.json(
      { error: "Falha ao buscar produto", ...(dev ? { detail: msg, prismaCode } : {}) },
      { status: 503 }
    )
  }
}
