import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function safeGroupByResult(rows: Array<{ storeId: string; _count: { _all: number } }>): Array<[string, number]> {
  return rows
    .map((r) => [r.storeId, r._count._all] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
}

/**
 * Diagnóstico read-only para produção.
 * NÃO retorna secrets (não imprime DATABASE_URL).
 */
export async function GET(req: Request) {
  const storeIdResolved = storeIdFromAssistecRequestForRead(req)
  if (!storeIdResolved) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  const hasDatabaseUrl = !!process.env.DATABASE_URL
  const hasDirectUrl = !!process.env.DIRECT_URL

  try {
    await prismaEnsureConnected()

    const [stores, clientes, produtos, vendas] = await Promise.all([
      prisma.store.count(),
      prisma.cliente.count(),
      prisma.produto.count(),
      prisma.venda.count(),
    ])

    const [clientesByStore, produtosByStore, vendasByStore] = await Promise.all([
      prisma.cliente.groupBy({ by: ["storeId"], _count: { _all: true } }).catch(() => []),
      prisma.produto.groupBy({ by: ["storeId"], _count: { _all: true } }).catch(() => []),
      prisma.venda.groupBy({ by: ["storeId"], _count: { _all: true } }).catch(() => []),
    ])

    // Probe: tenta ler 1 produto para detectar erros de schema em produção
    let produtoProbeOk = true
    let produtoProbeError: string | null = null
    try {
      await prisma.produto.findFirst({
        where: { storeId: storeIdResolved },
        select: { id: true, name: true, storeId: true, updatedAt: true },
      })
    } catch (e) {
      produtoProbeOk = false
      produtoProbeError = e instanceof Error ? e.message : String(e)
    }

    return json({
      ok: true,
      env: {
        nodeEnv: process.env.NODE_ENV ?? null,
        hasDatabaseUrl,
        hasDirectUrl,
      },
      storeIdResolved,
      counts: { stores, clientes, produtos, vendas },
      topStoreIds: {
        clientes: safeGroupByResult(clientesByStore as any),
        produtos: safeGroupByResult(produtosByStore as any),
        vendas: safeGroupByResult(vendasByStore as any),
      },
      probes: {
        produtoProbeOk,
        produtoProbeError,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json(
      {
        ok: false,
        env: { nodeEnv: process.env.NODE_ENV ?? null, hasDatabaseUrl, hasDirectUrl },
        storeIdResolved,
        error: msg,
      },
      { status: 503 },
    )
  }
}

