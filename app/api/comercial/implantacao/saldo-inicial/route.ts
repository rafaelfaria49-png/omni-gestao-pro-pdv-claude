import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { requireModuleApi } from "@/lib/auth/module-access"
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { resolveBusinessResource } from "@/lib/store-business-capabilities"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"
import { badJson, jsonResult, readJson } from "@/lib/aparelhos/api-gate"
import { registrarSaldoInicial } from "@/lib/comercial/implantacao"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Saldo inicial de implantação (mercadoria anterior ao sistema). Entrada de estoque SEM
 * movimentação financeira. Exige: módulo de estoque, permissão de configuração da loja e o
 * recurso `commercial.implantationMode` ligado explicitamente.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const denied = await requireModuleApi(req, "stock")
  if (denied) return denied
  const storeId = storeIdFromAssistecRequestForWrite(req)?.trim()
  if (!storeId) return NextResponse.json({ ok: false, error: "Unidade obrigatória: envie o header x-assistec-loja-id." }, { status: 400 })
  const guard = await requireEnterpriseWith(storeId, (p) => p.admin.configuracoes, "Somente quem configura a loja registra saldo de implantação.")
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const settings = await prisma.storeSettings.findUnique({ where: { storeId }, select: { printerConfig: true } })
  const caps = (settings?.printerConfig as { capabilities?: StoreCapabilitiesV1 } | null)?.capabilities ?? null
  if (!resolveBusinessResource(caps, "commercial.implantationMode").operational) {
    return NextResponse.json(
      { ok: false, code: "IMPLANTACAO_DESLIGADA", error: "Modo de implantação desligado. Ative em Configurações → Ramo e recursos." },
      { status: 403 },
    )
  }
  const body = await readJson(req, 20_000)
  if (body === null) return badJson()
  const session = await auth()
  return jsonResult(await registrarSaldoInicial({ storeId, actorLabel: getOperatorLabelFromSession(session) }, body))
}
