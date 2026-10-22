import { requireModuleApi } from "@/lib/auth/module-access"
import { handleClientList } from "@/lib/cadastros/client-read-api"
import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
export const dynamic = "force-dynamic"
export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedCatalog")
  if (moduleDenied) return moduleDenied

  let body: unknown
  try { body = await req.json() } catch { return clientPrivateJson({ error: "JSON inválido" }, { status: 400 }) }
  const q = body && typeof body === "object" && "q" in body ? body.q : undefined
  if (typeof q !== "string" || q.length > 200) return clientPrivateJson({ error: "Busca inválida" }, { status: 400 })
  return handleClientList(req, q.trim(), true)
}
