import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * GET /api/vendas/produtos-vendidos — relatório "Produtos Mais Vendidos"
 * (RELATORIOS-PRODUTOS-VENDIDOS-REAL-001). Somente leitura, escopo de UMA loja.
 *
 * Query:
 *  from, to   — instantes ISO (obrigatórios; `to` inclusivo; máx. 366 dias)
 *  categoria  — chave de categoria devolvida em `categorias[].chave`
 *  q          — busca por nome, nome gravado na venda, SKU ou código de barras
 *  todos      — "1" inclui itens avulsos, serviços e O.S. (padrão: só produtos)
 *  ordem      — quantidade | receita (padrão quantidade)
 *  limite     — 1..500 (padrão 100)
 *
 * Regras de cálculo: `lib/relatorios/produtos-vendidos.ts`.
 */
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { agregarProdutosVendidos, parsePeriodoRelatorio } from "@/lib/relatorios/produtos-vendidos"
import { carregarDadosProdutosVendidos } from "@/lib/relatorios/produtos-vendidos-query"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const NO_STORE = { "Cache-Control": "no-store, max-age=0" }

export async function GET(req: Request) {
  // Relatório expõe faturamento por produto: exige a central de relatórios E o módulo de vendas.
  const reportsDenied = await requireModuleApi(req, "reports")
  if (reportsDenied) return reportsDenied
  const salesDenied = await requireModuleApi(req, "sales")
  if (salesDenied) return salesDenied

  // `storeId` de header/query/cookie é só seleção; autorização é a ACL da sessão (padrão vendas-list).
  const session = await auth()
  if (!session?.user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 })
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return NextResponse.json({ ok: false, error: "storeId obrigatório" }, { status: 400 })
  if (!canAccessStore(session, storeId)) return NextResponse.json({ ok: false, error: "Sem acesso à loja" }, { status: 403 })

  const url = new URL(req.url)
  const periodo = parsePeriodoRelatorio(url.searchParams.get("from"), url.searchParams.get("to"))
  if (!periodo.ok) return NextResponse.json({ ok: false, error: periodo.error }, { status: 400 })

  try {
    await prismaEnsureConnected()
    const dados = await carregarDadosProdutosVendidos(prisma, storeId, periodo.periodo)
    const relatorio = agregarProdutosVendidos(dados, {
      categoria: url.searchParams.get("categoria") ?? undefined,
      busca: url.searchParams.get("q") ?? undefined,
      incluirNaoCatalogo: url.searchParams.get("todos") === "1",
      ordem: url.searchParams.get("ordem") === "receita" ? "receita" : "quantidade",
      limite: Number.parseInt(url.searchParams.get("limite") ?? "", 10) || undefined,
    })
    return NextResponse.json(
      {
        ok: true,
        periodo: { from: periodo.periodo.inicio.toISOString(), to: periodo.periodo.fim.toISOString() },
        ...relatorio,
      },
      { headers: NO_STORE },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[vendas/produtos-vendidos]", msg)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      { ok: false, error: "Falha ao gerar o relatório de produtos vendidos", ...(dev ? { detail: msg } : {}) },
      { status: 503, headers: NO_STORE },
    )
  }
}
