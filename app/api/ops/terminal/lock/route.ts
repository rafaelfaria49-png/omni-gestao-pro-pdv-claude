import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { TERMINAL_LOCK_TTL_MS } from "@/lib/pdv-terminal-lock"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const schema = z.object({
  terminalId: z.string().min(1).max(60),
  deviceId: z.string().min(1).max(120),
  /** Força a tomada do terminal mesmo ocupado (admin/gerente) — exige permissão. */
  force: z.boolean().optional(),
})

/**
 * Reserva (lock) um terminal para o `deviceId`. Concede se livre, já meu, ou expirado.
 * Se ocupado por outro device com heartbeat fresco → 409 (a UI oferece "Assumir" admin).
 * Falha de infra (coluna ausente / DB) → 200 `degraded` para NÃO bloquear a operação.
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

  // "Assumir" forçado exige permissão de supervisor (admin/gerente — mesmo nível de cancelar venda).
  if (force) {
    const deniedForce = await apiGuardEnterpriseOrOps(
      lojaId,
      (p) => p.pdv.cancelarVenda,
      "Sem permissão para assumir um terminal ocupado.",
      { errorBody: "okFalse" },
    )
    if (deniedForce) return deniedForce
  }

  const session = await auth()
  const operador = session?.user ? getOperatorLabelFromSession(session) : ""

  try {
    const term = await prisma.pdvTerminal.findFirst({
      where: { id: terminalId, storeId: lojaId },
      select: { id: true, status: true },
    })
    if (!term) {
      return NextResponse.json({ ok: false, error: "Terminal não encontrado." }, { status: 404 })
    }
    if (term.status === "INACTIVE") {
      return NextResponse.json(
        { ok: false, inactive: true, error: "Terminal inativo." },
        { status: 409 },
      )
    }

    const now = new Date()
    const cutoff = new Date(now.getTime() - TERMINAL_LOCK_TTL_MS)

    const where = force
      ? { id: terminalId, storeId: lojaId }
      : {
          id: terminalId,
          storeId: lojaId,
          OR: [
            { lockedByDeviceId: null },
            { lockedByDeviceId: deviceId },
            { heartbeatAt: null },
            { heartbeatAt: { lt: cutoff } },
          ],
        }

    const res = await prisma.pdvTerminal.updateMany({
      where,
      data: {
        lockedByDeviceId: deviceId,
        lockedByOperador: operador || null,
        lockedAt: now,
        heartbeatAt: now,
      },
    })

    if (res.count === 1) {
      return NextResponse.json({
        ok: true,
        granted: true,
        lock: {
          lockedByOperador: operador || null,
          lockedAt: now.toISOString(),
          heartbeatAt: now.toISOString(),
        },
      })
    }

    // Não concedido: ocupado por outro device com heartbeat fresco.
    const atual = await prisma.pdvTerminal.findFirst({
      where: { id: terminalId, storeId: lojaId },
      select: { lockedByOperador: true, heartbeatAt: true },
    })
    return NextResponse.json(
      {
        ok: false,
        occupied: true,
        lockedByOperador: atual?.lockedByOperador ?? null,
        heartbeatAt: atual?.heartbeatAt ? atual.heartbeatAt.toISOString() : null,
        error: "Terminal em uso por outro dispositivo.",
      },
      { status: 409 },
    )
  } catch (e) {
    // Coluna/tabela podem não existir (migration não aplicada) ou DB indisponível.
    // Não bloquear a operação: degradar com aviso.
    console.warn(
      "[ops/terminal/lock] degradado:",
      e instanceof Error ? e.message : String(e),
    )
    return NextResponse.json({ ok: true, degraded: true })
  }
}
