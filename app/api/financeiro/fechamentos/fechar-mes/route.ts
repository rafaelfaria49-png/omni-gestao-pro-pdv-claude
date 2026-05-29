/**
 * POST /api/financeiro/fechamentos/fechar-mes
 *
 * Body:
 *   mes            — 1..12
 *   ano            — 4 dígitos
 *   observacao?    — string
 *   fechadoPor?    — nome do usuário
 *   saldoInformado? — número
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { prismaEnsureConnected } from "@/lib/prisma"
import { fecharMes } from "@/lib/financeiro/services/fechamento-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2020).max(2099),
  observacao: z.string().max(500).optional(),
  fechadoPor: z.string().max(100).optional(),
  saldoInformado: z.number().optional(),
})

export async function POST(req: Request) {
  await prismaEnsureConnected()
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  const denied = await apiGuardEnterpriseOrOps(
    storeId,
    (p) => p.financeiro.fecharPeriodo,
    "Sem permissão para fechar período financeiro.",
    { errorBody: "okFalse" },
  )
  if (denied) return denied

  let body: unknown
  try { body = await req.json() } catch { body = {} }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dados inválidos", code: "validation_error" }, { status: 400 })
  }

  try {
    const fechamento = await fecharMes(storeId, parsed.data.mes, parsed.data.ano, {
      observacao: parsed.data.observacao,
      fechadoPor: parsed.data.fechadoPor,
      saldoInformado: parsed.data.saldoInformado,
    })
    return NextResponse.json({ ok: true, fechamento }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg, code: "service_error" }, { status: 422 })
  }
}
