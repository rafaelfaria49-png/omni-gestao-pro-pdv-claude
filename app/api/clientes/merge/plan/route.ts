import { NextResponse } from "next/server"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { buildMergePlan } from "@/lib/cadastros/client-merge-service"
import { mapClientMergeFailureToResponse } from "@/lib/cadastros/client-merge-http"
import type { ClientMergeFieldResolution } from "@/lib/cadastros/client-merge-contract"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

/**
 * CAD-R2-018-B — Preview read-only do merge (plano + fingerprint).
 * Não escreve nada. A execução exige o fingerprint deste plano.
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
    }

    const plan = await buildMergePlan(
      { storeId, principal: cadastrosAuditPrincipalFromSession(gate.session) },
      {
        survivorId: typeof body.survivorId === "string" ? body.survivorId : "",
        loserId: typeof body.loserId === "string" ? body.loserId : "",
        resolution: body.resolution,
      },
    )
    if (!("fingerprint" in plan)) {
      return mapClientMergeFailureToResponse(plan)
    }
    return json({ ok: true, plan })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/clientes/merge/plan POST]", msg)
    return json({ error: "Falha ao gerar plano de merge" }, { status: 503 })
  }
}
