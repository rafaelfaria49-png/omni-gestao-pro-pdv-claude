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

  let body: { ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const ids = body.ids
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids deve ser um array" }, { status: 400 })
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

  // 4 queries totais, independente do número de IDs (elimina N+1)
  const [clientes, osLinks, vendasLinks, transLinks] = await Promise.all([
    prisma.cliente.findMany({
      where: { id: { in: normalizedIds }, storeId },
      select: { id: true, name: true, document: true },
    }),
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

  // Contagem em memória — O(M) onde M = total de registros vinculados, nunca O(N × queries)
  const osMap = new Map<string, number>()
  for (const l of osLinks) {
    if (l.clienteId) osMap.set(l.clienteId, (osMap.get(l.clienteId) ?? 0) + 1)
  }

  const vendasMap = new Map<string, number>()
  for (const l of vendasLinks) {
    if (l.clienteId) vendasMap.set(l.clienteId, (vendasMap.get(l.clienteId) ?? 0) + 1)
  }

  const transMap = new Map<string, number>()
  for (const l of transLinks) {
    if (l.clienteId) transMap.set(l.clienteId, (transMap.get(l.clienteId) ?? 0) + 1)
  }

  const clienteMap = new Map(clientes.map((c) => [c.id, c]))

  const results = normalizedIds.map((id) => {
    const cli = clienteMap.get(id)
    if (!cli) {
      return { id, exists: false, name: "", isLinked: false, reasons: ["Não encontrado"] }
    }

    const osCount = osMap.get(id) ?? 0
    const vendasCount = vendasMap.get(id) ?? 0
    const transCount = transMap.get(id) ?? 0

    const isLinked = osCount + vendasCount + transCount > 0
    const reasons: string[] = []
    if (osCount > 0) reasons.push(`${osCount} ordem(ns) de serviço`)
    if (vendasCount > 0) reasons.push(`${vendasCount} venda(s)`)
    if (transCount > 0) reasons.push(`${transCount} transação(ões) financeira(s)`)

    return {
      id,
      exists: true,
      name: cli.name,
      document: cli.document,
      isLinked,
      reasons,
    }
  })

  return NextResponse.json({ results })
}
