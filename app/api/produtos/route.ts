import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { createProduct } from "@/lib/cadastros/product-write-service"
import type { ProductWriteInput } from "@/lib/cadastros/product-write-contract"
import {
  PRODUTO_REST_SELECT,
  mapProductWriteFailureToResponse,
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

export async function GET(req: Request) {
  const gate = await requireCadastrosHubApi(req, "read")
  if (!gate.ok) return gate.response

  try {
    const url = new URL(req.url)
    const q = normalizeSearch(url.searchParams.get("q") ?? "")
    const activeOnly = url.searchParams.get("activeOnly") === "1" || url.searchParams.get("activeOnly") === "true"
    const storeId = gate.storeId

    await prismaEnsureConnected()
    const produtos = await prisma.produto.findMany({
      where: {
        storeId,
        ...(activeOnly ? { active: true } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { sku: { contains: q, mode: "insensitive" as const } },
                { barcode: { contains: q, mode: "insensitive" as const } },
                { category: { contains: q, mode: "insensitive" as const } },
                { brand: { contains: q, mode: "insensitive" as const } },
                { supplierName: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: PRODUTO_REST_SELECT,
      take: 500,
    })

    return json({ produtos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/produtos GET]", msg)
    return json(
      { error: "Falha ao listar produtos", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 },
    )
  }
}

export async function POST(req: Request) {
  const gate = await requireCadastrosHubApi(req, "write")
  if (!gate.ok) return gate.response
  const storeId = gate.storeId

  try {
    const raw = (await req.json()) as Record<string, unknown>
    const body = raw as { name?: unknown; stock?: unknown; price?: unknown }

    // Contrato REST preservado (CAD-R2-007): POST exige name/stock/price mesmo
    // que o service tenha defaults. Mensagens idênticas ao comportamento atual.
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const stock = parseStock(body.stock)
    const price = parsePrice(body.price)
    const precoCusto = parsePrice((raw as Record<string, unknown>).precoCusto ?? (raw as Record<string, unknown>).cost) ?? 0

    if (!name) return badRequest('Campo "name" é obrigatório')
    if (stock === null) return badRequest('Campo "stock" é obrigatório (número inteiro)')
    if (stock < 0) return badRequest("Estoque não pode ser negativo")
    if (price === null) return badRequest('Campo "price" é obrigatório (número)')
    if (price < 0) return badRequest("Preço não pode ser negativo")
    if (precoCusto < 0) return badRequest("Preço de custo não pode ser negativo")

    // Boundary canônico: duplicate/metadata/fiscal/accessory/catalogo/audit/
    // stock-inicial-ledger pertencem ao ProductWriteService. A rota é adapter
    // HTTP fino (gate + compat + response shape) — sem Prisma write direto.
    const principal = cadastrosAuditPrincipalFromSession(gate.session)
    const created = await createProduct(
      { storeId, principal },
      raw as unknown as ProductWriteInput,
    )
    if (!created.ok) return mapProductWriteFailureToResponse(created, { context: "create" })

    await prismaEnsureConnected()
    const produto = await prisma.produto.findFirst({
      where: { id: created.id, storeId },
      select: PRODUTO_REST_SELECT,
    })
    if (!produto) {
      console.error("[api/produtos POST] reconsulta pós-create não encontrou o produto")
      return json({ error: "Falha ao criar produto" }, { status: 503 })
    }

    return json({ ok: true, produto }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/produtos POST]", msg)
    return json(
      { error: "Falha ao criar produto", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 },
    )
  }
}
