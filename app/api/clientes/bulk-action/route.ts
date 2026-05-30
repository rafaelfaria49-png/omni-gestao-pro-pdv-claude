import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_IDS = 200

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  let body: { ids?: string[]; action?: "delete" | "inactivate"; userLabel?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const { ids, action, userLabel } = body
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids deve ser um array" }, { status: 400 })
  }
  if (action !== "delete" && action !== "inactivate") {
    return NextResponse.json({ error: "action deve ser delete ou inactivate" }, { status: 400 })
  }

  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json({ error: "Loja não selecionada" }, { status: 400 })
  }

  const normalizedIds = Array.from(new Set(ids.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean)))
  if (normalizedIds.length === 0) {
    return NextResponse.json({ error: "Nenhum id válido fornecido" }, { status: 400 })
  }
  if (normalizedIds.length > MAX_IDS) {
    return NextResponse.json({ error: `Máximo de ${MAX_IDS} itens por lote` }, { status: 400 })
  }

  const operator = userLabel?.trim() || "Operador"

  const items = await prisma.cliente.findMany({
    where: { id: { in: normalizedIds }, storeId },
    select: { id: true, name: true },
  })

  // Dependências só são consultadas quando necessário (action === "delete")
  let linkedIds: string[] = []
  let freeIds: string[] = []

  if (action === "delete") {
    const [osLinks, vendasLinks, transLinks] = await Promise.all([
      prisma.ordemServico.findMany({
        where: { clienteId: { in: normalizedIds } },
        select: { clienteId: true },
      }),
      prisma.venda.findMany({
        where: { clienteId: { in: normalizedIds } },
        select: { clienteId: true },
      }),
      prisma.financialTransaction.findMany({
        where: { clienteId: { in: normalizedIds } },
        select: { clienteId: true },
      }),
    ])

    const linkedSet = new Set<string>([
      ...osLinks.map((l) => l.clienteId).filter((id): id is string => id != null),
      ...vendasLinks.map((l) => l.clienteId).filter((id): id is string => id != null),
      ...transLinks.map((l) => l.clienteId).filter((id): id is string => id != null),
    ])

    linkedIds = items.filter((c) => linkedSet.has(c.id)).map((c) => c.id)
    freeIds = items.filter((c) => !linkedSet.has(c.id)).map((c) => c.id)
  }

  let deletedCount = 0
  let inactivatedCount = 0

  await prisma.$transaction(async (tx) => {
    if (action === "inactivate") {
      const res = await tx.cliente.updateMany({
        where: { id: { in: normalizedIds }, storeId },
        data: { active: false },
      })
      inactivatedCount = res.count

      await tx.logsAuditoria.create({
        data: {
          action: "cliente.bulk_inactivate",
          userLabel: operator,
          detail: `${operator} inativou ${inactivatedCount} cliente(s) em lote na loja ${storeId}.`,
          metadata: JSON.stringify({
            entidade: "Cliente",
            ids: normalizedIds,
            clientes: items.map((c) => ({ id: c.id, nome: c.name })),
          }),
          source: "dashboard",
        },
      })
    } else {
      if (freeIds.length > 0) {
        const delRes = await tx.cliente.deleteMany({
          where: { id: { in: freeIds }, storeId },
        })
        deletedCount = delRes.count
      }

      if (linkedIds.length > 0) {
        const inactRes = await tx.cliente.updateMany({
          where: { id: { in: linkedIds }, storeId },
          data: { active: false },
        })
        inactivatedCount = inactRes.count
      }

      await tx.logsAuditoria.create({
        data: {
          action: "cliente.bulk_delete_inactivate",
          userLabel: operator,
          detail: `${operator} excluiu ${deletedCount} cliente(s) e inativou ${inactivatedCount} cliente(s) (por conterem histórico) em lote na loja ${storeId}.`,
          metadata: JSON.stringify({
            entidade: "Cliente",
            deletedIds: freeIds,
            inactivatedIds: linkedIds,
            deleted: items.filter((c) => freeIds.includes(c.id)).map((c) => ({ id: c.id, nome: c.name })),
            inactivated: items.filter((c) => linkedIds.includes(c.id)).map((c) => ({ id: c.id, nome: c.name })),
          }),
          source: "dashboard",
        },
      })
    }
  })

  return NextResponse.json({
    ok: true,
    deleted: deletedCount,
    inactivated: inactivatedCount,
  })
}
