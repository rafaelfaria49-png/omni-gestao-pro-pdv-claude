import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { apiGuardFinanceiroEditEnterpriseOrLegacy } from "@/lib/auth/api-enterprise-guard"

export const runtime = "nodejs"

const bodySchema = z.object({
  lojaId: z.string().min(1).max(120),
  tituloId: z.union([z.string(), z.number()]),
  movimentoId: z.string().min(1).max(200),
  valorEstorno: z.number().finite().positive().max(1e12),
})

/**
 * Registra o estorno no servidor (auditoria) e devolve confirmação para o cliente
 * aplicar a remoção do movimento e a atualização do título em localStorage.
 */
export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { lojaId, tituloId, movimentoId, valorEstorno } = parsed.data

  const storeId = storeIdFromAssistecRequestForWrite(request)
  if (!storeId) {
    return NextResponse.json(
      { ok: false, error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId." },
      { status: 400 },
    )
  }
  if (lojaId !== storeId) {
    return NextResponse.json(
      { ok: false, error: "Unidade inconsistente: o corpo e o header devem referir a mesma loja." },
      { status: 400 },
    )
  }

  const denied = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (denied) return denied

  const userLabel = getOperatorLabelFromSession(await auth())

  try {
    await prismaEnsureConnected()
    await prisma.logsAuditoria.create({
      data: {
        action: "estorno_conta_receber",
        userLabel,
        detail: `Estorno de recebimento — loja ${lojaId}, título ${String(tituloId)}, movimento ${movimentoId}, valor R$ ${valorEstorno.toFixed(2)}`,
        metadata: JSON.stringify({
          lojaId,
          tituloId,
          movimentoId,
          valorEstorno,
          at: new Date().toISOString(),
        }).slice(0, 8000),
        source: "api",
      },
    })
  } catch (e) {
    console.error("[estorno-conta-receber]", e)
    return NextResponse.json(
      { ok: false, error: "Não foi possível registrar o estorno no servidor. Tente novamente." },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    lojaId,
    tituloId,
    movimentoId,
    valorEstorno,
  })
}
