import { NextResponse } from "next/server"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { executeMerge } from "@/lib/cadastros/client-merge-service"
import { mapClientMergeFailureToResponse } from "@/lib/cadastros/client-merge-http"
import type { ClientMergeFieldResolution } from "@/lib/cadastros/client-merge-contract"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

/**
 * CAD-R2-018-B — Execução do merge em UMA transaction.
 * Exige fingerprint do plano + confirmação destrutiva explícita
 * (survivorId + loserId repetidos). O servidor revalida tudo.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireCadastrosHubApi(req, "write", "admin")
    if (!gate.ok) return gate.response
    const storeId = gate.storeId

    const body = (await req.json().catch(() => ({}))) as {
      survivorId?: unknown
      loserId?: unknown
      resolution?: ClientMergeFieldResolution
      fingerprint?: unknown
      confirmation?: { survivorId?: unknown; loserId?: unknown }
    }

    const result = await executeMerge(
      { storeId, principal: cadastrosAuditPrincipalFromSession(gate.session) },
      {
        survivorId: typeof body.survivorId === "string" ? body.survivorId : "",
        loserId: typeof body.loserId === "string" ? body.loserId : "",
        resolution: body.resolution,
        fingerprint: typeof body.fingerprint === "string" ? body.fingerprint : "",
        confirmation: {
          survivorId: body.confirmation?.survivorId,
          loserId: body.confirmation?.loserId,
        },
      },
    )
    if (!result.ok) return mapClientMergeFailureToResponse(result)
    return json({ ok: true, merge: result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/clientes/merge/execute POST]", msg)
    return json({ error: "Falha ao executar merge" }, { status: 503 })
  }
}
