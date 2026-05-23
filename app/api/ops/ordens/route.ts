import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import { StatusOrdemServico } from "@/generated/prisma"
import { storeIdFromAssistecRequestForRead, storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import {
  apiGuardOperacoesEditEnterpriseOrLegacySubAdmin,
  apiGuardOperacoesHubOrLegacy,
} from "@/lib/auth/api-enterprise-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const storeId = storeIdFromAssistecRequestForRead(req)
  const denied = await apiGuardOperacoesHubOrLegacy(storeId)
  if (denied) return denied
  try {
    const rows = await prisma.ordemServico.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      include: { cliente: true, garantiasOperacionais: true },
    })
    const { hydrateOSRows } = await import("@/lib/operacoes/services/hydration-service")
    const ordens = hydrateOSRows(
      rows.map((r) => ({
        ...r,
        clienteId: r.clienteId ?? null,
        numero: r.numero ?? "",
        payload: r.payload ?? {},
        itensPersistidos: [],
        garantiasOperacionais: r.garantiasOperacionais ?? [],
      }))
    )
    return NextResponse.json({ ordens })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/ordens GET]", msg)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      { error: "Falha ao carregar ordens", ...(dev ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}

export async function PUT(req: Request) {
  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId." },
      { status: 400 }
    )
  }

  const denied = await apiGuardOperacoesEditEnterpriseOrLegacySubAdmin(storeId)
  if (denied) return denied

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const list = (body as { ordens?: unknown }).ordens
  if (!Array.isArray(list)) {
    return NextResponse.json({ error: "ordens deve ser um array" }, { status: 400 })
  }

  const rows: {
    id: string
    storeId: string
    numero: string
    payload: Prisma.InputJsonValue
    clienteId: null
    equipamento: string
    defeito: string
    valorBase: number
    valorTotal: number
    status: StatusOrdemServico
  }[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue
    const o = raw as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id : ""
    const numero = typeof o.numero === "string" ? o.numero : ""
    if (!id || !numero) continue
    rows.push({
      id,
      storeId,
      numero,
      payload: o as Prisma.InputJsonValue,
      clienteId: null,
      equipamento: "",
      defeito: "",
      valorBase: 0,
      valorTotal: 0,
      status: StatusOrdemServico.Aberto,
    })
  }

  // Guard de segurança: este PUT é uma migração one-shot do localStorage legado
  // para o banco (`lib/operations-store.tsx` só chama quando ambos inventory+ordens
  // vêm vazios do servidor). Se a loja já tem OS persistidas, recusar — evita que
  // uma chamada acidental (curl, bug de UI, terceiro malicioso com permissão de
  // edição) apague todas as OS via deleteMany.
  try {
    const existingCount = await prisma.ordemServico.count({ where: { storeId } })
    if (existingCount > 0) {
      return NextResponse.json(
        {
          error: "Operação bloqueada: a loja já possui ordens de serviço persistidas.",
          code: "ordens_ja_existentes",
          existingCount,
        },
        { status: 409 },
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/ordens PUT] guard count", msg)
    return NextResponse.json({ error: "Falha ao validar estado atual das ordens" }, { status: 503 })
  }

  try {
    await prisma.$transaction([
      prisma.ordemServico.deleteMany({ where: { storeId } }),
      prisma.ordemServico.createMany({ data: rows }),
    ])
    return NextResponse.json({ ok: true, count: rows.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/ordens PUT]", msg)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      { error: "Falha ao salvar ordens", ...(dev ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}
