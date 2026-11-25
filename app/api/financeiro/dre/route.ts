import { requireModuleApi } from "@/lib/auth/module-access"
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { NextRequest, NextResponse } from "next/server"
import { getDREMensal } from "@/lib/financeiro/services/dre-service"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"

function err(msg: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg, code }, { status })
}

// ─── GET /api/financeiro/dre?mes=5&ano=2026 ───────────────────────────────────

export async function GET(req: NextRequest) {
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied

  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return respostaFinanceiraPrivada(err("Loja não identificada.", "STORE_REQUIRED", 400))
  const denied = await apiGuardLeituraFinanceira(storeId, undefined, req)
  if (denied) return respostaFinanceiraPrivada(denied)
  const params = req.nextUrl.searchParams

  const mesRaw = params.get("mes")
  const anoRaw = params.get("ano")

  const mes = mesRaw ? parseInt(mesRaw, 10) : undefined
  const ano = anoRaw ? parseInt(anoRaw, 10) : undefined

  if (mes !== undefined && (isNaN(mes) || mes < 1 || mes > 12)) {
    return respostaFinanceiraPrivada(err("Parâmetro 'mes' inválido (1-12).", "INVALID_MES"))
  }
  if (ano !== undefined && (isNaN(ano) || ano < 2000 || ano > 2100)) {
    return respostaFinanceiraPrivada(err("Parâmetro 'ano' inválido.", "INVALID_ANO"))
  }

  try {
    const dre = await getDREMensal(storeId, mes, ano)
    return respostaFinanceiraPrivada(NextResponse.json({ ok: true, dre }))
  } catch {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Não foi possível consultar os dados financeiros." }, { status: 503 }))
  }
}
