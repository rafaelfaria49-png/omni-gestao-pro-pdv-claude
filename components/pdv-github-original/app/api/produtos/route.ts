import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForRead, storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
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

function normalizeSearch(s: string) {
  return s.trim()
}

function parseStock(body: unknown): number | null {
  if (typeof body === "number" && Number.isFinite(body)) return Math.floor(body)
  if (typeof body === "string" && body.trim() !== "") {
    const n = parseInt(body, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parsePrice(body: unknown): number | null {
  if (typeof body === "number" && Number.isFinite(body)) return body
  if (typeof body === "string") return Number.isFinite(Number(body)) ? Number(body) : null
  return null
}

function optTrim(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = body[k]
    if (typeof v !== "string") continue
    const t = v.trim()
    if (t) return t
  }
  return undefined
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = normalizeSearch(url.searchParams.get("q") ?? "")
    const storeId = storeIdFromAssistecRequestForRead(req)

    const produtos = await prisma.produto.findMany({
      where: {
        storeId,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        stock: true,
        price: true,
        precoCusto: true,
        storeId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 500,
    })

    return json({ produtos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/produtos GET]", msg)
    return json(
      { error: "Falha ao listar produtos", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
    const raw = (await req.json()) as Record<string, unknown>
    const body = raw as { name?: unknown; stock?: unknown; price?: unknown }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const stock = parseStock(body.stock)
    const price = parsePrice(body.price)
    const precoCusto = parsePrice(raw.precoCusto ?? raw.cost) ?? 0
    const category = optTrim(raw, "category", "categoria")
    const sku = optTrim(raw, "sku", "codigo")
    const barcode = optTrim(raw, "barcode", "codigoBarras")
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) return badRequest("Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId.")

    if (!name) return badRequest('Campo "name" é obrigatório')
    if (stock === null) return badRequest('Campo "stock" é obrigatório (número inteiro)')
    if (stock < 0) return badRequest("Estoque não pode ser negativo")
    if (price === null) return badRequest('Campo "price" é obrigatório (número)')
    if (price < 0) return badRequest("Preço não pode ser negativo")
    if (precoCusto < 0) return badRequest("Preço de custo não pode ser negativo")

    const created = await prisma.produto.create({
      data: {
        name,
        stock,
        price,
        storeId,
        precoCusto,
        category: category ?? null,
        sku: sku ?? null,
        barcode: barcode ?? null,
      },
      select: {
        id: true,
        name: true,
        stock: true,
        price: true,
        precoCusto: true,
        sku: true,
        barcode: true,
        category: true,
        storeId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return json({ ok: true, produto: created }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/produtos POST]", msg)
    return json(
      { error: "Falha ao criar produto", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}
