import { prisma } from "@/lib/prisma"
import { StatusOrdemServico } from "@/generated/prisma"
import { requireCadastrosHubApi } from "./hub-api-gate"
import { clientEditorTags, canReadClientRegister, CLIENT_LOOKUP_SELECT } from "./client-privacy"
import { clientPrivateJson as json } from "./client-private-response"

export async function handleClientList(req: Request, q = "", lookupOnly = false) {
  try {
    const gate = await requireCadastrosHubApi(req, "read", "shared")
    if (!gate.ok) return gate.response
    const storeId = gate.storeId

    if (lookupOnly || !canReadClientRegister(gate.session)) {
      const clientes = await prisma.cliente.findMany({
        where: { storeId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { document: { contains: q } }] } : {}) },
        select: CLIENT_LOOKUP_SELECT, orderBy: { createdAt: "desc" }, take: 50,
      })
      return json({ clientes })
    }
    const clientes = await prisma.cliente.findMany({
      where: {
        storeId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q, mode: "insensitive" as const } },
                { document: { contains: q, mode: "insensitive" as const } },
                { city: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
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
      take: 200,
    })

    // Total gasto REAL e consistente com o Cadastros HUB: agrega OS concluídas
    // (Pronto/Entregue) + Vendas concluídas por clienteId. Fallback para a coluna
    // estática Cliente.totalSpent (clientes importados sem OS/Venda no app).
    let totalPorCliente = new Map<string, number>()
    try {
      const [osTotals, vendaTotals] = await Promise.all([
        prisma.ordemServico.groupBy({
          by: ["clienteId"],
          where: {
            storeId,
            clienteId: { not: null },
            status: { in: [StatusOrdemServico.Pronto, StatusOrdemServico.Entregue] },
          },
          _sum: { valorTotal: true },
        }),
        prisma.venda.groupBy({
          by: ["clienteId"],
          where: { storeId, clienteId: { not: null }, status: "concluida" },
          _sum: { total: true },
        }),
      ])
      const totais = new Map<string, number>()
      for (const r of osTotals) {
        if (r.clienteId) totais.set(r.clienteId, (totais.get(r.clienteId) ?? 0) + Number(r._sum.valorTotal ?? 0))
      }
      for (const r of vendaTotals) {
        if (r.clienteId) totais.set(r.clienteId, (totais.get(r.clienteId) ?? 0) + Number(r._sum.total ?? 0))
      }
      totalPorCliente = totais
    } catch (aggErr) {
      console.error("[api/clientes GET] agregação totalSpent falhou:")
    }

    const clientesComTotal = clientes.map((c) => ({
      ...c,
      tags: clientEditorTags(c.tags),
      totalSpent: totalPorCliente.get(c.id) ?? Number(c.totalSpent ?? 0),
    }))

    return json({ clientes: clientesComTotal })
  } catch (e) {
    console.error("[api/clientes GET]")
    return json(
      { error: "Falha ao listar clientes" },
      { status: 503 }
    )
  }
}
