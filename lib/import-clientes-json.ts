import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
/**
 * Importação JSON de clientes via ClientWriteService (CAD-R2-008).
 * Campos persistidos: `storeId`, `name`, `phone`, `email`.
 */
import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
import { cellToTrimmedString } from "@/lib/import-normalize"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { createClient } from "@/lib/cadastros/client-write-service"
import { clientWriteImportMessage } from "@/lib/cadastros/client-write-contract"

function pickName(o: Record<string, unknown>): string {
  return cellToTrimmedString(o["Nome"] ?? o.name ?? o["nome"] ?? o["nome completo"])
}

function pickPhone(o: Record<string, unknown>): string {
  return cellToTrimmedString(
    o["Telefone/WhatsApp"] ??
      o["Telefone/WhatsApp "] ??
      o.telefone ??
      o.Telefone ??
      o.celular ??
      o.Celular ??
      o["Celular WhatsApp"] ??
      o["Celular/WhatsApp"] ??
      o.whatsapp ??
      o.WhatsApp
  )
}

function pickEmail(o: Record<string, unknown>): string {
  return cellToTrimmedString(o["Email"] ?? o["E-mail"] ?? o.email ?? o.Email ?? o.mail)
}

export async function importClientesJson(req: Request) {
  const gate = await requireCadastrosHubApi(req, "write", "admin")
  if (!gate.ok) return gate.response
  const storeId = gate.storeId
  if (!storeId) {
    return clientPrivateJson(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId." },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return clientPrivateJson({ error: "JSON inválido" }, { status: 400 })
  }

  const items = (body as { items?: unknown }).items
  if (!Array.isArray(items)) {
    return clientPrivateJson({ error: "items deve ser um array" }, { status: 400 })
  }

  let created = 0
  let updated = 0

  try {
    const principal = cadastrosAuditPrincipalFromSession(gate.session)
    const writeContext = { storeId, principal }

    const batchSize = 10
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      for (const raw of batch) {
        if (!raw || typeof raw !== "object") continue
        const o = raw as Record<string, unknown>
        const name = pickName(o)
        if (!name) continue
        const phone = pickPhone(o) || null
        const email = pickEmail(o) || null

        const written = await createClient(writeContext, { name, phone, email })
        if (written.ok) {
          created += 1
        } else if (
          written.code === "IDENTITY_REVIEW_REQUIRED" ||
          written.code === "IDENTITY_CONFLICT" ||
          written.code === "AMBIGUOUS"
        ) {
          console.info("[import-clientes-json] linha exigiu revisão de identidade:", written.code)
        } else {
          console.info("[import-clientes-json] linha ignorada:", clientWriteImportMessage(written))
        }
      }
    }

    return clientPrivateJson({ ok: true, count: items.length, created, updated })
  } catch {
    console.error("[import-clientes-json] operation_failed")
    return clientPrivateJson({ error: "Falha ao importar clientes" }, { status: 503 })
  }
}
