import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { updateLojaModelo } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import {
  catalogoLojaFailureResponse,
  readJsonBody,
  requireCatalogoLojaWrite,
} from "@/lib/catalogo-aparelhos/loja-catalogo-api"

/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — editar / desativar / reativar modelo manual.
 * PATCH { version, brand?, name?, aliases?, notes?, active? }. A `modelKey` nunca muda.
 * Desativar só esconde da busca: produtos vinculados e vendas registradas ficam intactos.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const { id } = await context.params
  if (!id?.trim() || id.length > 64) return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 })
  const body = await readJsonBody(req)
  if (body === null) return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  try {
    const result = await updateLojaModelo(prisma, loadCatalogoIndex(), gate.storeId, gate.actorId, id.trim(), body)
    if (!result.ok) return catalogoLojaFailureResponse(result)
    return NextResponse.json({ ok: true, modelo: result.value })
  } catch (e) {
    console.error("[api/catalogo/aparelhos/modelos PATCH]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ ok: false, error: "Falha ao atualizar modelo" }, { status: 500 })
  }
}
