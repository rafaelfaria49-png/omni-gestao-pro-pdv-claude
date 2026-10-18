import { clientPrivateJson as json } from "@/lib/cadastros/client-private-response"
import { importClientesItems, listClientesForLoja } from "@/lib/clientes-import-handler"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
export const dynamic = "force-dynamic"
export async function GET(req: Request) {
  try {
    const gate = await requireCadastrosHubApi(req, "read", "hub")
    if (!gate.ok) return gate.response
    return json({ clientes: await listClientesForLoja(gate.storeId) })
  } catch { return json({ error: "Falha ao carregar clientes" }, { status: 503 }) }
}
export async function POST(req: Request) {
  try {
    const gate = await requireCadastrosHubApi(req, "write", "admin")
    if (!gate.ok) return gate.response
    const body = await req.json().catch(() => null)
    if (!Array.isArray(body?.items) || body.items.length > 5000) return json({ error: "Lote inválido (máximo 5000 linhas)" }, { status: 400 })
    const result = await importClientesItems(gate.storeId, body.items, cadastrosAuditPrincipalFromSession(gate.session))
    return json({ ok: true, ...result })
  } catch {
    console.error("[clientes/importar] operation_failed")
    return json({ error: "Falha na importação" }, { status: 503 })
  }
}
export async function PUT(req: Request) { return POST(req) }
