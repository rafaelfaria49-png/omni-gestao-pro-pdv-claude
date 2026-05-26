import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { apiGuardOperacoesHubOrLegacy } from "@/lib/auth/api-enterprise-guard"
import {
  LEGACY_ORDENS_SERVICO_WRITE_DISABLED,
  storeIdFromOperacoesLegacyApiRead,
} from "@/lib/operacoes/legacy-api-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

const ordemInclude = {
  cliente: { select: { id: true, name: true, phone: true, email: true } },
  itens: {
    include: {
      produto: { select: { id: true, name: true, price: true, stock: true } },
    },
  },
} as const

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = url.searchParams.get("q")?.trim() ?? ""
    const storeId = storeIdFromOperacoesLegacyApiRead(req)
    if (!storeId) {
      return json(
        { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId." },
        { status: 400 },
      )
    }

    const guard = await apiGuardOperacoesHubOrLegacy(storeId)
    if (guard) return guard

    const ordens = await prisma.ordemServico.findMany({
      where: {
        storeId,
        ...(q
          ? {
              OR: [
                { equipamento: { contains: q, mode: "insensitive" } },
                { defeito: { contains: q, mode: "insensitive" } },
                { cliente: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: ordemInclude,
    })

    return json({ ordens, deprecated: true, hint: "Preferir Operações HUB V2 (/dashboard/operacoes-v2)." })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/ordens-servico GET]", msg)
    return json(
      { error: "Falha ao listar ordens de serviço", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 },
    )
  }
}

/** Escrita desativada — semântica de estoque legada incompatível com Operações HUB V2. */
export async function POST(req: Request) {
  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return badRequest("Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId.")
  }

  const guard = await apiGuardOperacoesHubOrLegacy(storeId)
  if (guard) return guard

  return json(LEGACY_ORDENS_SERVICO_WRITE_DISABLED, { status: 410 })
}
