import { NextRequest, NextResponse } from "next/server"
import { getDREMensal } from "@/lib/financeiro/services/dre-service"
import { apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"

function getStoreId(req: NextRequest): string {
  return (
    req.headers.get("x-assistec-loja-id") ??
    req.nextUrl.searchParams.get("storeId") ??
    "loja-1"
  )
}

function err(msg: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg, code }, { status })
}

// ─── GET /api/financeiro/dre?mes=5&ano=2026 ───────────────────────────────────

export async function GET(req: NextRequest) {
  const storeId = getStoreId(req)
  const denied = await apiGuardFinanceiroViewOrOps(storeId)
  if (denied) return denied
  const params = req.nextUrl.searchParams

  const mesRaw = params.get("mes")
  const anoRaw = params.get("ano")

  const mes = mesRaw ? parseInt(mesRaw, 10) : undefined
  const ano = anoRaw ? parseInt(anoRaw, 10) : undefined

  if (mes !== undefined && (isNaN(mes) || mes < 1 || mes > 12)) {
    return err("Parâmetro 'mes' inválido (1-12).", "INVALID_MES")
  }
  if (ano !== undefined && (isNaN(ano) || ano < 2000 || ano > 2100)) {
    return err("Parâmetro 'ano' inválido.", "INVALID_ANO")
  }

  try {
    const dre = await getDREMensal(storeId, mes, ano)
    return NextResponse.json({ ok: true, dre })
  } catch (e) {
    console.error("[GET /api/financeiro/dre]", e)
    return err("Erro ao calcular DRE.", "INTERNAL_ERROR", 500)
  }
}
