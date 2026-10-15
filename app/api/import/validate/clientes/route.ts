import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
import { validateClientesImport, type MappingRecord } from "@/lib/import-validate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request) {
  const gate = await requireCadastrosHubApi(req, "write", "admin")
  if (!gate.ok) return gate.response

  const storeId = gate.storeId
  if (!storeId) {
    return clientPrivateJson(
      { error: "Unidade obrigatória: selecione a loja no cabeçalho e envie x-assistec-loja-id." },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return clientPrivateJson({ error: "JSON inválido" }, { status: 400 })
  }

  const rows = (body as { rows?: unknown }).rows
  const mapping = (body as { mapping?: unknown }).mapping
  if (!Array.isArray(rows)) {
    return clientPrivateJson({ error: "rows deve ser um array" }, { status: 400 })
  }
  if (!mapping || typeof mapping !== "object") {
    return clientPrivateJson({ error: "mapping deve ser um objeto" }, { status: 400 })
  }

  const errors = validateClientesImport({
    rows: rows as Record<string, unknown>[],
    mapping: mapping as MappingRecord,
  })

  return clientPrivateJson({
    ok: errors.length === 0,
    storeId,
    errors,
    validRowCount: rows.length,
  })
}
