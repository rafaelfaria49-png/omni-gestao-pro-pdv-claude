import { clientEditorTags, canReadClientRegister, CLIENT_LOOKUP_SELECT, CLIENT_REGISTER_SELECT, CLIENT_RETENTION_BLOCK } from "@/lib/cadastros/client-privacy"
import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
import { Prisma, StatusOrdemServico } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { isValidPhoneBr } from "@/lib/phone-br"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { updateClient } from "@/lib/cadastros/client-write-service"
import { mapClientWriteFailureToResponse } from "@/lib/cadastros/client-write-http"
import type { ClientWriteInput } from "@/lib/cadastros/client-write-contract"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return clientPrivateJson(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCadastrosHubApi(req, "read", "shared")
  if (!gate.ok) return gate.response
  const storeId = gate.storeId

  const { id } = await context.params
  if (!id?.trim()) return badRequest("ID inválido")

  try {
    if (!canReadClientRegister(gate.session)) {
      const cliente = await prisma.cliente.findFirst({ where: { id, storeId }, select: CLIENT_LOOKUP_SELECT })
      return cliente ? json({ ok: true, cliente }) : json({ error: "Cliente não encontrado" }, { status: 404 })
    }
    const cliente = await prisma.cliente.findFirst({
      where: { id, storeId },
      select: {
        ...CLIENT_REGISTER_SELECT,
        ordensServico: {
          where: { storeId },
          select: { id: true, numero: true, equipamento: true, defeito: true, status: true, valorTotal: true, createdAt: true, updatedAt: true },
          orderBy: { createdAt: "desc" },
          take: 15,
        },
        vendas: {
          where: { storeId },
          select: { id: true, pedidoId: true, total: true, status: true, at: true },
          orderBy: { at: "desc" },
          take: 15,
        },
      },
    })

    if (!cliente) {
      return json({ error: "Cliente não encontrado" }, { status: 404 })
    }

    // Total gasto REAL (não limitado aos 15 últimos do include): agrega TODAS as
    // OS concluídas (Pronto/Entregue) + Vendas concluídas do cliente. Fallback para
    // a coluna estática Cliente.totalSpent quando não há OS/Venda no app.
    let totalSpentReal: number = cliente.totalSpent
    try {
      const [osAgg, vendaAgg] = await Promise.all([
        prisma.ordemServico.aggregate({
          where: {
            storeId,
            clienteId: id,
            status: { in: [StatusOrdemServico.Pronto, StatusOrdemServico.Entregue] },
          },
          _sum: { valorTotal: true },
        }),
        prisma.venda.aggregate({
          where: { storeId, clienteId: id, status: "concluida" },
          _sum: { total: true },
        }),
      ])
      if (osAgg._sum.valorTotal != null || vendaAgg._sum.total != null) {
        totalSpentReal = Number(osAgg._sum.valorTotal ?? 0) + Number(vendaAgg._sum.total ?? 0)
      }
    } catch (aggErr) {
      console.error("[api/clientes/[id] GET] agregação totalSpent falhou:")
    }

    return json({ ok: true, cliente: { ...cliente, tags: clientEditorTags(cliente.tags), totalSpent: totalSpentReal } })
  } catch (e) {
    console.error("[api/clientes/[id] GET]")
    return json(
      { error: "Falha ao obter detalhes do cliente" },
      { status: 503 }
    )
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCadastrosHubApi(req, "write", "admin")
  if (!gate.ok) return gate.response
  const storeId = gate.storeId

  const { id } = await context.params
  if (!id?.trim()) return badRequest("ID inválido")

  try {
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
    const kind = typeof body.kind === "string" ? body.kind.trim() : undefined
    const document = typeof body.document === "string" ? body.document.trim() : undefined
    const city = typeof body.city === "string" ? body.city.trim() : undefined
    const tags = body.tags !== undefined ? body.tags : undefined
    const active = typeof body.active === "boolean" ? body.active : undefined
    const totalSpent = typeof body.totalSpent === "number" ? body.totalSpent : undefined
    
    let lastPurchaseAt: Date | null | undefined = undefined
    if (body.lastPurchaseAt !== undefined) {
      if (body.lastPurchaseAt === null) {
        lastPurchaseAt = null
      } else {
        const d = new Date(body.lastPurchaseAt as string)
        if (!Number.isNaN(d.getTime())) {
          lastPurchaseAt = d
        }
      }
    }

    if (!name) return badRequest('Campo "name" é obrigatório')
    if (!phone) return badRequest('Campo "phone" é obrigatório')
    if (!isValidPhoneBr(phone)) return badRequest("Telefone inválido (use DDD + número, 10 ou 11 dígitos)")

    const patch: ClientWriteInput = {
      name,
      phone,
      email: email || null,
    }
    if (kind !== undefined) patch.kind = kind
    if (document !== undefined) patch.document = document
    if (city !== undefined) patch.city = city
    if (tags !== undefined) patch.tags = tags || null
    if (active !== undefined) patch.active = active
    if (totalSpent !== undefined) patch.totalSpent = totalSpent
    if (lastPurchaseAt !== undefined) patch.lastPurchaseAt = lastPurchaseAt

    const written = await updateClient(
      { storeId, principal: cadastrosAuditPrincipalFromSession(gate.session) },
      id,
      patch,
    )
    if (!written.ok) return mapClientWriteFailureToResponse(written)

    const updated = await prisma.cliente.findFirst({
      where: { id, storeId },
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

    return json({ ok: true, cliente: updated ? { ...updated, tags: clientEditorTags(updated.tags) } : null })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return json({ error: "Cliente não encontrado" }, { status: 404 })
    }
    console.error("[api/clientes PATCH]")
    return json(
      { error: "Falha ao atualizar cliente" },
      { status: 503 }
    )
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCadastrosHubApi(req, "write", "admin")
  if (!gate.ok) return gate.response
  const { id } = await context.params
  if (!id?.trim()) return badRequest("ID inválido")

  return json(CLIENT_RETENTION_BLOCK, { status: 409 })
}
