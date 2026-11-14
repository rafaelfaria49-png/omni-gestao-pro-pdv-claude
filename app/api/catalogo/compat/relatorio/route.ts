import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireModuleApi } from "@/lib/auth/module-access"
import { compatServerError, requireCompatGestaoRead } from "@/lib/compat/compat-api"
import { listDevolucoesPorVenda, listProdutosCapinha } from "@/lib/compat/compat-store"
import { montarRelatorioCapinhas } from "@/lib/compat/capinhas"

/**
 * COMPAT-PROFISSIONAL-001 — relatório de capinhas (SOMENTE LEITURA).
 * GET ?dias=30 (1–92) → vendas por produto/tipo, modelos e cores INFORMADOS, vendas sem modelo,
 * estoque geral × estoque por modelo (só controle detalhado) e últimas movimentações.
 *
 * Exige também o módulo de Relatórios. Nunca inventa saldo por modelo para produto genérico.
 * Janela por `Venda.at` (relógio do PDV), limitada para não pesar no banco.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_VENDAS = 5000

export async function GET(req: Request) {
  const gate = await requireCompatGestaoRead(req)
  if (!gate.ok) return gate.response
  const deniedReports = await requireModuleApi(req, "reports")
  if (deniedReports) return deniedReports

  const diasRaw = parseInt(new URL(req.url).searchParams.get("dias") ?? "", 10)
  const dias = Number.isFinite(diasRaw) ? Math.min(Math.max(diasRaw, 1), 92) : 30
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  try {
    // Histórico inclui produtos desativados depois; estoque/disponibilidade usa só os ativos.
    const produtos = await listProdutosCapinha(prisma, gate.storeId, { incluirInativos: true })
    const ativos = produtos.filter((p) => p.active)
    const vendas = produtos.length
      ? await prisma.venda.findMany({
          where: { storeId: gate.storeId, at: { gte: desde } },
          select: { pedidoId: true, status: true, payload: true },
          orderBy: { at: "desc" },
          take: MAX_VENDAS,
        })
      : []
    // Devoluções canônicas (DevolucaoVenda + itens) das vendas do período, escopadas pela loja.
    const devolucoes = await listDevolucoesPorVenda(prisma, gate.storeId, vendas.map((v) => v.pedidoId))
    const relatorio = montarRelatorioCapinhas(vendas, produtos, devolucoes)
    const movimentacoes = produtos.length
      ? await prisma.movimentacaoEstoque.findMany({
          where: { storeId: gate.storeId, produtoId: { in: ativos.map((p) => p.id).slice(0, 1000) } },
          select: {
            id: true,
            produtoId: true,
            produtoNome: true,
            tipo: true,
            origem: true,
            quantidade: true,
            estoqueAntes: true,
            estoqueDepois: true,
            motivo: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : []
    return NextResponse.json({
      ok: true,
      dias,
      truncado: vendas.length >= MAX_VENDAS,
      relatorio,
      estoque: {
        geral: ativos
          .filter((p) => p.controle === "geral")
          .map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
        detalhado: ativos
          .filter((p) => p.controle === "detalhado")
          .map((p) => ({ id: p.id, name: p.name, stock: p.stock, modelos: p.deviceModelKeys.length })),
      },
      movimentacoes,
    })
  } catch (e) {
    return compatServerError("relatorio GET", e, "Falha ao montar o relatório")
  }
}
