import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

function normalizeCodeField(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v === "number" && Number.isFinite(v)) {
    const abs = Math.abs(v)
    if (abs >= 1e9 && abs < 1e15) return String(Math.round(v))
    return String(v)
  }
  if (typeof v !== "string") return undefined
  const t = v.trim()
  return t === "" ? null : t
}

/**
 * Atualiza apenas `sku` e/ou `barcode` do produto (admin).
 * Não altera nome, estoque, preço nem categoria.
 */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id?.trim()) return badRequest("ID inválido")

  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) return badRequest("Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId.")

  let raw: Record<string, unknown>
  try {
    raw = (await req.json()) as Record<string, unknown>
  } catch {
    return badRequest("JSON inválido")
  }

  const hasSku = Object.prototype.hasOwnProperty.call(raw, "sku") || Object.prototype.hasOwnProperty.call(raw, "codigo")
  const hasBarcodeKey = Object.prototype.hasOwnProperty.call(raw, "barcode")
  const hasCodigoBarrasKey = Object.prototype.hasOwnProperty.call(raw, "codigoBarras")
  const hasBarcode = hasBarcodeKey || hasCodigoBarrasKey

  if (!hasSku && !hasBarcode) {
    return badRequest('Informe ao menos um campo: "sku"/"codigo" ou "barcode"/"codigoBarras".')
  }

  const skuRaw = hasSku ? (raw.sku ?? raw.codigo) : undefined

  const skuNorm = hasSku ? normalizeCodeField(skuRaw) : undefined
  const barcodeNorm = hasBarcodeKey ? normalizeCodeField(raw.barcode) : undefined
  const codigoBarrasNorm = hasCodigoBarrasKey ? normalizeCodeField(raw.codigoBarras) : undefined

  const data: { sku?: string | null; barcode?: string | null } = {}
  if (hasSku) {
    if (skuNorm === undefined && skuRaw != null && typeof skuRaw !== "string" && typeof skuRaw !== "number") {
      return badRequest('Campo "sku"/"codigo" inválido.')
    }
    data.sku = skuNorm === undefined ? null : skuNorm
  }
  if (hasBarcode) {
    if (hasBarcodeKey && hasCodigoBarrasKey && barcodeNorm !== codigoBarrasNorm) {
      return badRequest('Os campos "barcode" e "codigoBarras" devem ter o mesmo valor (ambos atualizam Produto.barcode).')
    }
    const merged =
      hasBarcodeKey && hasCodigoBarrasKey
        ? (barcodeNorm ?? codigoBarrasNorm)
        : hasBarcodeKey
          ? barcodeNorm
          : codigoBarrasNorm
    if (
      merged === undefined &&
      ((hasBarcodeKey && raw.barcode != null && typeof raw.barcode !== "string" && typeof raw.barcode !== "number") ||
        (hasCodigoBarrasKey &&
          raw.codigoBarras != null &&
          typeof raw.codigoBarras !== "string" &&
          typeof raw.codigoBarras !== "number"))
    ) {
      return badRequest('Campo "barcode"/"codigoBarras" inválido.')
    }
    data.barcode = merged === undefined ? null : merged
  }

  if (Object.keys(data).length === 0) {
    return badRequest("Nenhum valor válido para atualizar.")
  }

  try {
    const updated = await prisma.produto.update({
      where: { id, storeId },
      data,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        storeId: true,
        updatedAt: true,
      },
    })
    return json({ ok: true, produto: updated })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        return json({ error: "Produto não encontrado" }, { status: 404 })
      }
      if (e.code === "P2002") {
        return json(
          { error: "Conflito: outro produto já usa este SKU ou código de barras nesta loja." },
          { status: 409 }
        )
      }
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/produtos PATCH codigos]", msg)
    return json(
      { error: "Falha ao atualizar códigos", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}
