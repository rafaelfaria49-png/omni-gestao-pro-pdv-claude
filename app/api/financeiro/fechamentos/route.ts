/**
 * GET /api/financeiro/fechamentos
 *
 * Query params opcionais:
 *   tipo — diario | mensal
 */
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import { prismaEnsureConnected } from "@/lib/prisma"
import {
  listarFechamentos,
  type TipoFechamento,
} from "@/lib/financeiro/services/fechamento-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  const denied = await apiGuardFinanceiroViewOrOps(storeId)
  if (denied) return denied
  const url = new URL(req.url)
  const tipo = (url.searchParams.get("tipo") ?? undefined) as TipoFechamento | undefined

  try {
    const items = await listarFechamentos(storeId, tipo)
    return NextResponse.json({ ok: true, items, total: items.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
