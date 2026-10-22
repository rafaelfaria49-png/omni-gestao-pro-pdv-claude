import { requireModuleApi } from "@/lib/auth/module-access"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
import { CLIENT_RETENTION_BLOCK } from "@/lib/cadastros/client-privacy"
export const dynamic = "force-dynamic"
export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "catalog")
  if (moduleDenied) return moduleDenied

  const gate = await requireCadastrosHubApi(req, "write", "admin")
  if (!gate.ok) return gate.response
  return clientPrivateJson(CLIENT_RETENTION_BLOCK, { status: 409 })
}
