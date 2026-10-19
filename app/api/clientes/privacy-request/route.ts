import { prisma } from "@/lib/prisma"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { clientPrivateJson as json } from "@/lib/cadastros/client-private-response"
import { cadastrosAuditLogFields, cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
export const dynamic = "force-dynamic"
/** Internal referral only; never verifies a subject or fulfills a legal request. */
export async function POST(req: Request) {
  try {
    const gate = await requireCadastrosHubApi(req, "write", "admin")
    if (!gate.ok) return gate.response
    const body = await req.json().catch(() => null)
    if (!body || typeof body.clientId !== "string" || body.clientId.length > 200 || !["access", "correction", "erasure"].includes(body.kind)) {
      return json({ error: "Informe cliente e tipo de solicitação válidos." }, { status: 400 })
    }
    const client = await prisma.cliente.findFirst({ where: { id: body.clientId, storeId: gate.storeId }, select: { id: true } })
    if (!client) return json({ error: "Cliente não encontrado" }, { status: 404 })
    const audit = cadastrosAuditLogFields(cadastrosAuditPrincipalFromSession(gate.session))
    const referral = await prisma.logsAuditoria.create({ data: {
      action: "cliente.privacy_request", userLabel: audit.userLabel,
      detail: "Solicitação encaminhada para revisão humana; nenhum direito executado automaticamente.", source: "cadastros",
      metadata: JSON.stringify({ entidade: "Cliente", storeId: gate.storeId, clientId: client.id, kind: body.kind,
        status: "PENDING_GOVERNANCE_REVIEW", identityVerified: false, retentionReviewed: false, ...audit.actorMeta }),
    }, select: { id: true } })
    return json({ requestId: referral.id, status: "PENDING_GOVERNANCE_REVIEW",
      message: "Encaminhamento registrado. Identidade, finalidade, autorização e retenção dependem de revisão humana. Nenhum dado foi exportado, corrigido ou excluído.",
    }, { status: 202 })
  } catch {
    console.error("[clientes/privacy-request] operation_failed")
    return json({ error: "Não foi possível registrar o encaminhamento." }, { status: 503 })
  }
}
