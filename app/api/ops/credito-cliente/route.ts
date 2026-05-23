/**
 * GET /api/ops/credito-cliente
 *
 * Retorna créditos ativos agregados por clienteDoc (CPF/CNPJ somente dígitos).
 *
 * Query params:
 *   lojaId  — obrigatório (ou header x-assistec-loja-id)
 *   doc     — opcional; filtra um CPF/CNPJ específico (somente dígitos)
 *
 * Response: { creditos: Record<doc, { nome: string; saldo: number }> }
 *
 * Usado por:
 *   - operations-store.tsx bootstrap para reconciliar customerCredits com o DB
 *   - vendas-arquivo-geral.tsx drawer para mostrar saldo atual do cliente
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const lojaId = opsLojaIdFromRequest(req)
  if (!lojaId) {
    return NextResponse.json({ error: "lojaId obrigatório" }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const docFilter = (searchParams.get("doc") ?? "").replace(/\D/g, "")

  try {
    const where = docFilter
      ? { storeId: lojaId, clienteDoc: docFilter, status: "ativo" as const, saldoAtual: { gt: 0 } }
      : { storeId: lojaId, status: "ativo" as const, saldoAtual: { gt: 0 } }

    const rows = await prisma.clienteCredito.findMany({
      where,
      select: { clienteDoc: true, clienteNome: true, saldoAtual: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    })

    // Agrega saldos por CPF/CNPJ (um cliente pode ter vários vales ativos)
    const creditos: Record<string, { nome: string; saldo: number }> = {}
    for (const r of rows) {
      const existing = creditos[r.clienteDoc]
      if (existing) {
        existing.saldo = Math.round((existing.saldo + r.saldoAtual) * 100) / 100
      } else {
        creditos[r.clienteDoc] = {
          nome: r.clienteNome,
          saldo: Math.round(r.saldoAtual * 100) / 100,
        }
      }
    }

    return NextResponse.json({ creditos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[credito-cliente/GET]", msg)
    return NextResponse.json({ error: "Falha ao buscar créditos" }, { status: 503 })
  }
}
