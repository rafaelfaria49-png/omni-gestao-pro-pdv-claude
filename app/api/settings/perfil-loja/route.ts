import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { type PerfilLojaId } from "@/lib/perfil-loja-types"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import { requireStoreAccess } from "@/lib/auth/guard-enterprise"
import { configuredBusinessBranch, legacyBusinessBranch, resolveBusinessResource } from "@/lib/store-business-capabilities"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function getLojaId(req?: Request): string | null {
  if (!req) return null
  return storeIdFromAssistecRequestForRead(req)
}

export async function GET(req: Request) {
  try {
    const lojaId = getLojaId(req)
    if (!lojaId) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
    const guard = await requireStoreAccess(lojaId)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
    const store = await prisma.store.findUnique({ where: { id: lojaId } })
    if (!store) return NextResponse.json({ error: "Unidade não encontrada." }, { status: 404 })
    const settings = await prisma.storeSettings.findUnique({ where: { storeId: lojaId } })
    const blob = settings?.printerConfig as { capabilities?: StoreCapabilitiesV1 } | null
    const capabilities = blob?.capabilities
    const branch = configuredBusinessBranch(capabilities) ?? legacyBusinessBranch(store.profile)
    const perfilLoja: PerfilLojaId = branch === "assistencia" ? "assistencia" : branch === "supermercado" ? "supermercado" : "variedades"
    return NextResponse.json({ perfilLoja, lojaId, mostraTecnicoLaudoOs: resolveBusinessResource(capabilities, "service.technical", store.profile).operational })
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar o perfil da unidade." }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  // Adapter read-only; o editor oficial é Configurações gerais.
  // Esta rota fica read-only para evitar criação automática de unidades e efeitos colaterais.
  void req
  return NextResponse.json(
    { ok: false, error: 'Edite ramo e recursos em "Configurações gerais".' },
    { status: 405 }
  )
}
