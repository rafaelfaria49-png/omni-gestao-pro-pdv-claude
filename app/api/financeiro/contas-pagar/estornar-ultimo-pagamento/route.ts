import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"
import { estornarContaPagar, buildContaPagarAuditTrail } from "@/lib/financeiro/services"

export const runtime = "nodejs"

const bodySchema = z.object({
  lojaId: z.string().min(1).max(120).optional(),
  tituloId: z.union([z.string(), z.number()]).optional(),
  localKey: z.string().min(1).max(260).optional(),
  motivo: z.string().max(2000).optional(),
})

function pickTituloRef(input: { tituloId?: string | number; localKey?: string }): { id?: string; localKey?: string } {
  const idRaw = input.tituloId != null ? String(input.tituloId).trim() : ""
  const lk = (input.localKey ?? "").trim()
  if (idRaw) return { id: idRaw }
  if (lk) return { localKey: lk }
  return {}
}

export async function POST(request: Request) {
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 })

  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res

  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 403 })
  }

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

  const storeId = storeIdFromAssistecRequestForWrite(request)
  if (!storeId) {
    return NextResponse.json(
      { ok: false, error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId." },
      { status: 400 },
    )
  }
  if (parsed.data.lojaId && parsed.data.lojaId !== storeId) {
    return NextResponse.json(
      { ok: false, error: "Unidade inconsistente: o corpo e o header devem referir a mesma loja." },
      { status: 400 },
    )
  }

  const ref = pickTituloRef(parsed.data)
  if (!ref.id && !ref.localKey) {
    return NextResponse.json({ ok: false, error: "Informe tituloId ou localKey." }, { status: 400 })
  }

  const res = await estornarContaPagar({
    storeId,
    id: ref.id,
    localKey: ref.localKey,
    modo: "ultimo_pagamento",
    motivo: parsed.data.motivo,
    userLabel: "dashboard",
  })

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.reason }, { status: 404 })
  }

  try {
    await prismaEnsureConnected()
    await prisma.logsAuditoria.create({
      data: {
        action: "estorno_ultimo_pagamento_conta_pagar",
        userLabel: "dashboard",
        detail: `Estorno CP (último pagamento) — loja ${storeId}, título ${res.data.id}`,
        metadata: JSON.stringify({
          storeId,
          tituloId: res.data.id,
          localKey: res.data.localKey,
          motivo: parsed.data.motivo,
          at: new Date().toISOString(),
        }).slice(0, 8000),
        source: "api",
      },
    })
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.error("[contas-pagar/estornar-ultimo-pagamento] audit", e)
  }

  const audit = buildContaPagarAuditTrail([res.data])[0] ?? null

  return NextResponse.json({
    ok: true,
    titulo: {
      id: res.data.id,
      storeId: res.data.storeId,
      localKey: res.data.localKey,
      status: res.data.status,
      valor: res.data.valor,
      vencimento: res.data.vencimento,
      numeroDocumento: res.data.numeroDocumento,
      fornecedorId: res.data.fornecedorId,
    },
    audit,
  })
}

