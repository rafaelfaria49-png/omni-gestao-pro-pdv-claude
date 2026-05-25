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
  deviceId: z.string().max(120).optional(),
  /** Libera mesmo sem ser o dono (admin/gerente) — exige permissão. */
  force: z.boolean().optional(),
})

/**
 * Libera o lock do terminal. Sem `force`: só libera o próprio lock (deviceId). Com
 * `force`: libera qualquer lock (admin/gerente). Falha de infra → 200 `degraded`.
 * Idempotente (libera 0 ou 1 linha).
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
  const { terminalId, deviceId, force } = parsed.data

  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.hubs.vendas,
    "Sem permissão para operar o PDV.",
    { errorBody: "okFalse" },
  )
  if (denied) return denied

  if (force) {
    const deniedForce = await apiGuardEnterpriseOrOps(
      lojaId,
      (p) => p.pdv.cancelarVenda,
      "Sem permissão para liberar um terminal de outro dispositivo.",
      { errorBody: "okFalse" },
    )
    if (deniedForce) return deniedForce
  } else if (!deviceId || !deviceId.trim()) {
    return NextResponse.json(
      { ok: false, error: "deviceId obrigatório para liberar o próprio terminal." },
      { status: 400 },
    )
  }

  try {
    const where = force
      ? { id: terminalId, storeId: lojaId }
      : { id: terminalId, storeId: lojaId, lockedByDeviceId: deviceId }
    const res = await prisma.pdvTerminal.updateMany({
      where,
      data: {
        lockedByDeviceId: null,
        lockedByOperador: null,
        lockedAt: null,
        heartbeatAt: null,
      },
    })
    return NextResponse.json({ ok: true, released: res.count })
  } catch (e) {
    console.warn(
      "[ops/terminal/unlock] degradado:",
      e instanceof Error ? e.message : String(e),
    )
    return NextResponse.json({ ok: true, degraded: true })
  }
}
