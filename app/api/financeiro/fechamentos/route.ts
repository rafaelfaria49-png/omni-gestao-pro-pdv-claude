import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * GET /api/financeiro/fechamentos
 *
 * Query params opcionais:
 *   tipo — diario | mensal
 */
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected } from "@/lib/prisma"
import {
  listarFechamentos,
  type TipoFechamento,
} from "@/lib/financeiro/services/fechamento-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  // Reconciliação main × G003: módulo finance por loja (main) + guard de leitura privada (G003).
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return respostaFinanceiraPrivada(moduleDenied)
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return respostaFinanceiraPrivada(NextResponse.json({ error: "storeId obrigatório" }, { status: 400 }))
  const denied = await apiGuardLeituraFinanceira(storeId, undefined, req)
  if (denied) return respostaFinanceiraPrivada(denied)
  const url = new URL(req.url)
  const tipo = (url.searchParams.get("tipo") ?? undefined) as TipoFechamento | undefined

  try {
    await prismaEnsureConnected()
    const items = await listarFechamentos(storeId, tipo)
    return respostaFinanceiraPrivada(NextResponse.json({ ok: true, items, total: items.length }))
  } catch {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Não foi possível consultar os dados financeiros." }, { status: 503 }))
  }
}
