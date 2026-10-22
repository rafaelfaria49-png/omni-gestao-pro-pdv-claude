import { requireModuleApi } from "@/lib/auth/module-access"
import { clientPrivateJson as json } from "@/lib/cadastros/client-private-response"
import { matchClientesByPhone } from "@/lib/cliente-phone-match"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
export const dynamic = "force-dynamic"
export async function GET(accessRequest: Request) {
  const moduleDenied = await requireModuleApi(accessRequest, "sharedCatalog")
  if (moduleDenied) return moduleDenied

  return json({ error: "Use POST para buscas por telefone." }, { status: 405 })
}
export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedCatalog")
  if (moduleDenied) return moduleDenied

  try {
    const gate = await requireCadastrosHubApi(req, "read", "shared")
    if (!gate.ok) return gate.response
    const body = await req.json().catch(() => null)
    const phone = typeof body?.phone === "string" ? body.phone.trim() : ""
    if (!phone || phone.length > 40) return json({ error: "Telefone inválido" }, { status: 400 })
    const result = await matchClientesByPhone(gate.storeId, phone)
    const candidates = result.candidates.map(({ id, name, phone }) => ({ id, name, phone }))
    return json({ ok: true, status: result.status, candidates, uniqueMatch: candidates.length === 1 ? candidates[0] : null })
  } catch {
    console.error("[clientes/match-by-phone] operation_failed")
    return json({ error: "Falha ao buscar cliente" }, { status: 503 })
  }
}
