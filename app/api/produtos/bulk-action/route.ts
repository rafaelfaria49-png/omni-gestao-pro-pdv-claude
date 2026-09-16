import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"
import {
  cadastrosAuditLogFields,
  cadastrosAuditPrincipalFromSession,
} from "@/lib/cadastros/cadastros-audit-principal"
import { updateProductTx, type ProductWriteTx } from "@/lib/cadastros/product-write-service"

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

  const principal = cadastrosAuditPrincipalFromSession(gate.session)
  const audit = cadastrosAuditLogFields(principal, {
    operatorNote: userLabel,
  })
  const operator = audit.userLabel
  const writeContext = { storeId, principal }

  const items = await prisma.produto.findMany({
    where: { id: { in: normalizedIds }, storeId },
    select: { id: true, name: true },
  })

  // Dependências só são consultadas quando necessário (action === "delete")
  let linkedIds: string[] = []
  let freeIds: string[] = []

  if (action === "delete") {
    const [osItemLinks, vendaLinks, listingLinks, linkLinks] = await Promise.all([
      prisma.ordemServicoItem.findMany({
        where: { produtoId: { in: normalizedIds } },
        select: { produtoId: true },
      }),
      prisma.itemVenda.findMany({
        where: { inventoryId: { in: normalizedIds } },
        select: { inventoryId: true },
      }),
      prisma.marketplaceListing.findMany({
        where: { productId: { in: normalizedIds } },
        select: { productId: true },
      }),
      prisma.marketplaceProductLink.findMany({
        where: { produtoId: { in: normalizedIds } },
        select: { produtoId: true },
      }),
    ])

    const linkedSet = new Set<string>([
      ...osItemLinks.map((l) => l.produtoId).filter((id): id is string => id != null),
      ...vendaLinks.map((l) => l.inventoryId).filter((id): id is string => id != null),
      ...listingLinks.map((l) => l.productId).filter((id): id is string => id != null),
      ...linkLinks.map((l) => l.produtoId).filter((id): id is string => id != null),
    ])

    linkedIds = items.filter((p) => linkedSet.has(p.id)).map((p) => p.id)
    freeIds = items.filter((p) => !linkedSet.has(p.id)).map((p) => p.id)
  }

  let deletedCount = 0
  let inactivatedCount = 0

  // CAD-R2-007: cadastro-base em lote via primitive canônica (Tx variant) na
  // MESMA transação do lote — nenhum item usa Prisma Produto direto; nenhum
  // bulk altera stock (só active/status). DELETE permanece fora do contrato.
  async function inactivateBatch(
    tx: ProductWriteTx,
    targetIds: string[],
  ): Promise<number> {
    let count = 0
    for (const pid of targetIds) {
      const r = await updateProductTx(tx, writeContext, pid, { active: false })
      if (r.ok) {
        count += 1
        continue
      }
      // Paridade com o updateMany anterior: ids inexistentes/cross-store apenas
      // não contam — não abortam o lote.
      if (r.code === "NOT_FOUND" || r.code === "CROSS_STORE") continue
      throw new Error(`[bulk-action] inativação falhou para ${pid}: ${r.code} ${r.message}`)
    }
    return count
  }

  await prisma.$transaction(async (tx) => {
    const btx = tx as unknown as ProductWriteTx
    if (action === "inactivate") {
      inactivatedCount = await inactivateBatch(btx, normalizedIds)

      await tx.logsAuditoria.create({
        data: {
          action: "produto.bulk_inactivate",
          userLabel: operator,
          detail: `${operator} inativou ${inactivatedCount} produto(s) em lote na loja ${storeId}.`,
          metadata: JSON.stringify({
            entidade: "Produto",
            ids: normalizedIds,
            produtos: items.map((p) => ({ id: p.id, nome: p.name })),
            ...audit.actorMeta,
          }),
          source: "dashboard",
        },
      })
    } else {
      if (freeIds.length > 0) {
        const delRes = await tx.produto.deleteMany({
          where: { id: { in: freeIds }, storeId },
        })
        deletedCount = delRes.count
      }

      if (linkedIds.length > 0) {
        inactivatedCount = await inactivateBatch(btx, linkedIds)
      }

      await tx.logsAuditoria.create({
        data: {
          action: "produto.bulk_delete_inactivate",
          userLabel: operator,
          detail: `${operator} excluiu ${deletedCount} produto(s) e inativou ${inactivatedCount} produto(s) (por conterem histórico) em lote na loja ${storeId}.`,
          metadata: JSON.stringify({
            entidade: "Produto",
            deletedIds: freeIds,
            inactivatedIds: linkedIds,
            deleted: items.filter((p) => freeIds.includes(p.id)).map((p) => ({ id: p.id, nome: p.name })),
            inactivated: items.filter((p) => linkedIds.includes(p.id)).map((p) => ({ id: p.id, nome: p.name })),
            ...audit.actorMeta,
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
