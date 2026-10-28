import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * GET /api/vendas/produtos-vendidos/variantes?produtoId=&from=&to=
 * Detalhamento por modelo/cor de UM produto do catálogo da loja
 * (RELATORIOS-PRODUTOS-VENDIDOS-REAL-001). Somente leitura; quantidades brutas.
 * Regras: `lib/relatorios/produtos-vendidos-variantes.ts`.
 */
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { criarResolvedor, parsePeriodoRelatorio } from "@/lib/relatorios/produtos-vendidos"
import { agregarVariantes, LIMITE_VENDAS_VARIANTES } from "@/lib/relatorios/produtos-vendidos-variantes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const NO_STORE = { "Cache-Control": "no-store, max-age=0" }

export async function GET(req: Request) {
  const reportsDenied = await requireModuleApi(req, "reports")
  if (reportsDenied) return reportsDenied
  const salesDenied = await requireModuleApi(req, "sales")
  if (salesDenied) return salesDenied

  const session = await auth()
  if (!session?.user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 })
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return NextResponse.json({ ok: false, error: "storeId obrigatório" }, { status: 400 })
  if (!canAccessStore(session, storeId)) return NextResponse.json({ ok: false, error: "Sem acesso à loja" }, { status: 403 })

  const url = new URL(req.url)
  const produtoId = url.searchParams.get("produtoId")?.trim() ?? ""
  if (!produtoId) return NextResponse.json({ ok: false, error: "produtoId obrigatório" }, { status: 400 })
  const periodo = parsePeriodoRelatorio(url.searchParams.get("from"), url.searchParams.get("to"))
  if (!periodo.ok) return NextResponse.json({ ok: false, error: periodo.error }, { status: 400 })

  try {
    await prismaEnsureConnected()
    const produto = await prisma.produto.findFirst({
      where: { id: produtoId, storeId },
      select: { id: true, sku: true, barcode: true },
    })
    if (!produto) return NextResponse.json({ ok: false, error: "Produto não encontrado nesta loja" }, { status: 404 })

    // Linhas legadas podem ter gravado SKU/código de barras no lugar do id. Só valem as
    // refs que o ranking atribui a ESTE produto (mesma ordem id → sku → barcode).
    const candidatas = [produto.id, produto.sku, produto.barcode].map((r) => r?.trim()).filter((r): r is string => !!r)
    const concorrentes = await prisma.produto.findMany({
      where: { storeId, OR: [{ id: { in: candidatas } }, { sku: { in: candidatas } }, { barcode: { in: candidatas } }] },
      select: { id: true, name: true, sku: true, barcode: true, category: true, brand: true, active: true },
    })
    const resolver = criarResolvedor(concorrentes)
    const refs = candidatas.filter((r) => resolver(r, "").produto?.id === produto.id)
    const vendas = await prisma.venda.findMany({
      where: {
        storeId,
        at: { gte: periodo.periodo.inicio, lte: periodo.periodo.fim },
        status: { not: "cancelada" },
        itens: { some: { inventoryId: { in: refs } } },
      },
      select: {
        payload: true,
        itens: { where: { inventoryId: { in: refs } }, select: { quantidade: true, lineTotal: true } },
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: LIMITE_VENDAS_VARIANTES + 1,
    })
    const truncado = vendas.length > LIMITE_VENDAS_VARIANTES
    const resultado = agregarVariantes(truncado ? vendas.slice(0, LIMITE_VENDAS_VARIANTES) : vendas, refs)

    return NextResponse.json({ ok: true, produtoId: produto.id, truncado, ...resultado }, { headers: NO_STORE })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[vendas/produtos-vendidos/variantes]", msg)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      { ok: false, error: "Falha ao detalhar variantes", ...(dev ? { detail: msg } : {}) },
      { status: 503, headers: NO_STORE },
    )
  }
}
