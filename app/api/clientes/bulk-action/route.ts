import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
import { CLIENT_RETENTION_BLOCK } from "@/lib/cadastros/client-privacy"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { prisma } from "@/lib/prisma"
import {
  cadastrosAuditPrincipalFromSession,
} from "@/lib/cadastros/cadastros-audit-principal"
import { updateClientTx } from "@/lib/cadastros/client-write-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_IDS = 200

export async function POST(req: Request) {
  const gate = await requireCadastrosHubApi(req, "write", "admin")
  if (!gate.ok) return gate.response

  let body: { ids?: string[]; action?: "delete" | "inactivate"; userLabel?: string }
  try {
    body = await req.json()
  } catch {
    return clientPrivateJson({ error: "JSON inválido" }, { status: 400 })
  }

  const { ids, action } = body
  if (action === "delete") return clientPrivateJson(CLIENT_RETENTION_BLOCK, { status: 409 })
  if (!Array.isArray(ids)) {
    return clientPrivateJson({ error: "ids deve ser um array" }, { status: 400 })
  }
  if (action !== "inactivate") {
    return clientPrivateJson({ error: "action deve ser delete ou inactivate" }, { status: 400 })
  }

  const storeId = gate.storeId
  if (!storeId) {
    return clientPrivateJson({ error: "Loja não selecionada" }, { status: 400 })
  }

  const normalizedIds = Array.from(new Set(ids.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean)))
  if (normalizedIds.length === 0) {
    return clientPrivateJson({ error: "Nenhum id válido fornecido" }, { status: 400 })
  }
  if (normalizedIds.length > MAX_IDS) {
    return clientPrivateJson({ error: `Máximo de ${MAX_IDS} itens por lote` }, { status: 400 })
  }

  const writeContext = {
    storeId,
    principal: cadastrosAuditPrincipalFromSession(gate.session),
  }

  try {
    const inactivated = await prisma.$transaction(async (tx) => {
      let count = 0
      for (const id of normalizedIds) {
        const result = await updateClientTx(tx, writeContext, id, { active: false })
        if (!result.ok) throw new Error("Falha na inativação")
        count += 1
      }
      return count
    })
    return clientPrivateJson({ ok: true, deleted: 0, inactivated })
  } catch {
    console.error("[clientes/bulk-action] operation_failed")
    return clientPrivateJson({ error: "Falha na inativação" }, { status: 503 })
  }
}
