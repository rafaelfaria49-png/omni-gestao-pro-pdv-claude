import { requireModuleApi } from "@/lib/auth/module-access"
import { clientEditorTags } from "@/lib/cadastros/client-privacy"
import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
import { prisma } from "@/lib/prisma"
import { handleClientList } from "@/lib/cadastros/client-read-api"
import { isValidPhoneBr } from "@/lib/phone-br"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { createClient } from "@/lib/cadastros/client-write-service"
import { mapClientWriteFailureToResponse } from "@/lib/cadastros/client-write-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return clientPrivateJson(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedCatalog")
  if (moduleDenied) return moduleDenied

  if (new URL(req.url).searchParams.has("q")) return json({ error: "Use POST /api/clientes/search para buscas." }, { status: 400 })
  return handleClientList(req)
}

export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "catalog")
  if (moduleDenied) return moduleDenied

  try {
    const gate = await requireCadastrosHubApi(req, "write", "admin")
    if (!gate.ok) return gate.response
    const storeId = gate.storeId
    const body = (await req.json()) as {
      name?: unknown
      phone?: unknown
      email?: unknown
      kind?: unknown
      document?: unknown
      city?: unknown
      tags?: unknown
      active?: unknown
      totalSpent?: unknown
      lastPurchaseAt?: unknown
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const phone = typeof body.phone === "string" ? body.phone.trim() : ""
    const email = typeof body.email === "string" ? body.email.trim() : ""
    const kind = typeof body.kind === "string" ? body.kind.trim() : "PF"
    const document = typeof body.document === "string" ? body.document.trim() : ""
    const city = typeof body.city === "string" ? body.city.trim() : ""
    const tags = body.tags !== undefined ? body.tags : null
    const active = typeof body.active === "boolean" ? body.active : true
    const totalSpent = typeof body.totalSpent === "number" ? body.totalSpent : 0
    
    let lastPurchaseAt: Date | null = null
    if (body.lastPurchaseAt) {
      const d = new Date(body.lastPurchaseAt as string)
      if (!Number.isNaN(d.getTime())) {
        lastPurchaseAt = d
      }
    }

    if (!name) return badRequest('Campo "name" é obrigatório')
    if (!phone) return badRequest('Campo "phone" é obrigatório')
    if (!isValidPhoneBr(phone)) return badRequest("Telefone inválido (use DDD + número, 10 ou 11 dígitos)")

    const written = await createClient(
      { storeId, principal: cadastrosAuditPrincipalFromSession(gate.session) },
      {
        name,
        phone,
        email: email || null,
        kind,
        document,
        city,
        ...(tags ? { tags } : {}),
        active,
        totalSpent,
        lastPurchaseAt,
      },
    )
    if (!written.ok) return mapClientWriteFailureToResponse(written)

    const created = await prisma.cliente.findFirst({
      where: { id: written.id, storeId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        document: true,
        kind: true,
        city: true,
        tags: true,
        active: true,
        totalSpent: true,
        lastPurchaseAt: true,
        createdAt: true,
      },
    })

    return json({ ok: true, cliente: created ? { ...created, tags: clientEditorTags(created.tags) } : null }, { status: 201 })
  } catch (e) {
    console.error("[api/clientes POST]")
    return json(
      { error: "Falha ao criar cliente" },
      { status: 503 }
    )
  }
}

