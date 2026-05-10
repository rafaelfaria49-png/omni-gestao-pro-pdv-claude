import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/** TEMP: diagnóstico Histórico Operações — remover após análise. */
function allowOperacoesHistoryDebug(req: Request): boolean {
  if (process.env.NODE_ENV === "development") return true
  const secret =
    process.env.ASSISTEC_DEBUG_OPERACOES_HISTORY_SECRET?.trim() ||
    process.env.ASSISTEC_MASTER_PASSWORD?.trim()
  if (!secret) return false
  const url = new URL(req.url)
  const q = url.searchParams.get("secret")?.trim()
  return q === secret
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function payloadClienteSnapshot(payload: unknown): {
  id?: string
  nome?: string
  telefone?: string
} {
  if (!isRecord(payload)) return {}
  const c = payload.cliente
  if (!isRecord(c)) return {}
  return {
    id: typeof c.id === "string" ? c.id : undefined,
    nome: typeof c.nome === "string" ? c.nome : undefined,
    telefone: typeof c.telefone === "string" ? c.telefone : undefined,
  }
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "")
}

export async function GET(req: Request) {
  if (!allowOperacoesHistoryDebug(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const focusNome = (url.searchParams.get("focusNome") ?? "SILVANA APARECIDA PEREIRA").trim()

  const storeScoped = storeIdFromAssistecRequestForRead(req)

  try {
    const db = prisma
    const [osByStore, totalOs, withClienteId, withValidClienteFk] = await Promise.all([
      db.ordemServico.groupBy({ by: ["storeId"], _count: { _all: true } }),
      db.ordemServico.count(),
      db.ordemServico.count({ where: { clienteId: { not: null } } }),
      db.ordemServico.count({
        where: {
          clienteId: { not: null },
          cliente: { isNot: null },
        },
      }),
    ])

    const recent = await db.ordemServico.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        storeId: true,
        clienteId: true,
        payload: true,
        valorTotal: true,
        valorBase: true,
        status: true,
        updatedAt: true,
      },
    })

    const recentSamples = recent.map((r) => {
      const snap = payloadClienteSnapshot(r.payload)
      return {
        id: r.id,
        storeId: r.storeId,
        clienteId: r.clienteId,
        payloadClienteId: snap.id ?? null,
        payloadClienteNome: snap.nome ?? null,
        payloadClienteTelefone: snap.telefone ?? null,
        valorTotal: r.valorTotal,
        valorBase: r.valorBase,
        status: r.status,
        updatedAt: r.updatedAt.toISOString(),
      }
    })

    const scopedCounts = await Promise.all([
      db.ordemServico.count({ where: { storeId: storeScoped } }),
      db.ordemServico.count({
        where: { storeId: storeScoped, clienteId: { not: null } },
      }),
      db.ordemServico.count({
        where: {
          storeId: storeScoped,
          clienteId: { not: null },
          cliente: { isNot: null },
        },
      }),
      db.cliente.count({ where: { storeId: storeScoped } }),
    ])

    const clientesMatch = await db.cliente.findMany({
      where: {
        storeId: storeScoped,
        name: { contains: focusNome, mode: "insensitive" },
      },
      take: 10,
      select: { id: true, name: true, phone: true, storeId: true },
    })

    const clienteIds = clientesMatch.map((c) => c.id)

    const osByClienteId =
      clienteIds.length > 0
        ? await db.ordemServico.findMany({
            where: { storeId: storeScoped, clienteId: { in: clienteIds } },
            take: 20,
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              clienteId: true,
              numero: true,
              valorTotal: true,
              status: true,
            },
          })
        : []

    const safeIlike = `%${focusNome.replace(/[%_\\]/g, "")}%`

    const osPayloadNomeRaw = await db.$queryRaw<Array<{ id: string; storeId: string; clienteId: string | null }>>(
      Prisma.sql`
        SELECT id, "storeId", "clienteId"
        FROM ordens_servico
        WHERE "storeId" = ${storeScoped}
          AND payload->'cliente'->>'nome' ILIKE ${safeIlike}
        ORDER BY "updatedAt" DESC
        LIMIT 20
      `
    )

    const phones = [...new Set(clientesMatch.map((c) => c.phone).filter(Boolean) as string[])]
    const normalizedPhones = phones.map(onlyDigits).filter((d) => d.length >= 8)

    let osPayloadPhoneRaw: Array<{ id: string; storeId: string; clienteId: string | null }> = []
    if (normalizedPhones.length > 0) {
      const orParts = normalizedPhones.map(
        (digits) =>
          Prisma.sql`(regexp_replace(coalesce(payload->'cliente'->>'telefone',''), '[^0-9]', '', 'g') LIKE ${`%${digits}%`})`
      )
      const condition = orParts.slice(1).reduce((acc, part) => Prisma.sql`${acc} OR ${part}`, orParts[0]!)
      osPayloadPhoneRaw = await db.$queryRaw(
        Prisma.sql`
          SELECT id, "storeId", "clienteId"
          FROM ordens_servico
          WHERE "storeId" = ${storeScoped}
            AND (${condition})
          ORDER BY "updatedAt" DESC
          LIMIT 20
        `
      )
    }

    const data = {
      storeScoped,
      hint: "Em dev: sem secret. Produção: ?secret=... (ASSISTEC_DEBUG_OPERACOES_HISTORY_SECRET ou ASSISTEC_MASTER_PASSWORD). Passe x-assistec-loja-id ou ?storeId= para escopo da loja.",
      ordemServico: {
        totalAllStores: totalOs,
        countByStoreId: osByStore.map((g) => ({ storeId: g.storeId, count: g._count._all })),
        withClienteIdNotNull: withClienteId,
        withClienteIdMatchingClienteRow: withValidClienteFk,
        orphanClienteIdCount: withClienteId - withValidClienteFk,
      },
      scopedToActiveStore: {
        storeId: storeScoped,
        ordensCount: scopedCounts[0],
        ordensWithClienteId: scopedCounts[1],
        ordensWithValidClienteFk: scopedCounts[2],
        clientesCount: scopedCounts[3],
      },
      recentOsSamples: recentSamples,
      focus: {
        nome: focusNome,
        clientesFound: clientesMatch,
        osByClienteId: osByClienteId,
        osByPayloadClienteNomeIlike: osPayloadNomeRaw,
        osByPayloadClienteTelefoneNormalized: osPayloadPhoneRaw,
        normalizedPhonesUsed: normalizedPhones,
      },
    }

    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: "prisma_error", detail: msg }, { status: 503 })
  }
}
