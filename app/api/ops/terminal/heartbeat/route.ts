import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const schema = z.object({
  terminalId: z.string().min(1).max(60),
  deviceId: z.string().min(1).max(120),
})

/**
 * Prova de vida do terminal ativo. Atualiza `heartbeatAt` apenas se o lock ainda for
 * deste `deviceId`. Se o lock foi perdido (assumido por outro / liberado) → `lost`.
 * Falha de infra → 200 `degraded` (não bloqueia a operação).
 */
export async function POST(req: Request) {
  const lojaId = opsLojaIdFromRequestForWrite(req)
  if (!lojaId) {
    return NextResponse.json(
      { ok: false, error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 422 })
  }
  const { terminalId, deviceId } = parsed.data

  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.hubs.vendas,
    "Sem permissão para operar o PDV.",
    { errorBody: "okFalse" },
  )
  if (denied) return denied

  try {
    const res = await prisma.pdvTerminal.updateMany({
      where: { id: terminalId, storeId: lojaId, lockedByDeviceId: deviceId },
      data: { heartbeatAt: new Date() },
    })
    if (res.count === 1) return NextResponse.json({ ok: true })
    return NextResponse.json({ ok: false, lost: true }, { status: 409 })
  } catch (e) {
    console.warn(
      "[ops/terminal/heartbeat] degradado:",
      e instanceof Error ? e.message : String(e),
    )
    return NextResponse.json({ ok: true, degraded: true })
  }
}
