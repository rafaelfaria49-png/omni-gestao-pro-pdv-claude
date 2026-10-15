import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import {
  discoverDuplicateGroups,
  discoverForClient,
  DUPLICATE_DISCOVERY_MAX_GROUPS,
  DUPLICATE_DISCOVERY_MAX_SCAN,
} from "@/lib/cadastros/client-merge-discovery"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return clientPrivateJson(data, init)
}

/**
 * CAD-R2-018-B — Discovery read-only de duplicidades (store-scoped, bounded).
 *
 * GET /api/clientes/duplicates?clientId=<id>  → classifica um seed contra a loja
 * GET /api/clientes/duplicates?scan=1          → varredura bounded da loja
 *
 * Nunca executa merge. Nome sozinho nunca gera candidato.
 */
export async function GET(req: Request) {
  try {
    const gate = await requireCadastrosHubApi(req, "read", "admin")
    if (!gate.ok) return gate.response
    const storeId = gate.storeId

    const url = new URL(req.url)
    const clientId = (url.searchParams.get("clientId") ?? "").trim()
    const scan = url.searchParams.get("scan") === "1"

    if (clientId) {
      const result = await discoverForClient({ storeId, clientId })
      return json({ ok: true, ...result })
    }

    if (scan) {
      const result = await discoverDuplicateGroups({ storeId })
      return json({
        ok: true,
        groups: result.groups,
        scanned: result.scanned,
        truncated: result.truncated,
        bounds: { maxScan: DUPLICATE_DISCOVERY_MAX_SCAN, maxGroups: DUPLICATE_DISCOVERY_MAX_GROUPS },
      })
    }

    return json({ error: 'Informe "clientId" ou "scan=1".' }, { status: 400 })
  } catch (e) {
    console.error("[api/clientes/duplicates GET]")
    return json({ error: "Falha ao listar duplicidades" }, { status: 503 })
  }
}
