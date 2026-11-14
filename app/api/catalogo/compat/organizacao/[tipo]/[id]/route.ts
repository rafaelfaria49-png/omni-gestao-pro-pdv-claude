import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readJsonBody, requireCatalogoLojaWrite } from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import { compatResultResponse, compatServerError } from "@/lib/compat/compat-api"
import { deleteLocal, moverLocal, updateLocal } from "@/lib/compat/compat-store"

/**
 * COMPAT-PROFISSIONAL-001 — painel/fileira individual.
 *  - PATCH { version, nome?, descricao?, ativo? } → renomear/descrever/ativar-desativar
 *  - PATCH { mover: "cima" | "baixo" }            → reordenar
 *  - DELETE                                        → só sem vínculos (senão 409 IN_USE)
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type Ctx = { params: Promise<{ tipo: string; id: string }> }

function tipoValido(tipo: string): "painel" | "fileira" | null {
  return tipo === "painel" || tipo === "fileira" ? tipo : null
}

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const { tipo: rawTipo, id } = await ctx.params
  const tipo = tipoValido(rawTipo)
  if (!tipo) return NextResponse.json({ ok: false, error: "Tipo inválido." }, { status: 400 })
  const body = await readJsonBody(req)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  try {
    const b = body as Record<string, unknown>
    if ("mover" in b) return compatResultResponse(await moverLocal(prisma, tipo, gate.storeId, id, b.mover))
    return compatResultResponse(await updateLocal(prisma, tipo, gate.storeId, gate.actorId, id, b))
  } catch (e) {
    return compatServerError("organizacao PATCH", e, "Falha ao gravar")
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const { tipo: rawTipo, id } = await ctx.params
  const tipo = tipoValido(rawTipo)
  if (!tipo) return NextResponse.json({ ok: false, error: "Tipo inválido." }, { status: 400 })
  try {
    return compatResultResponse(await deleteLocal(prisma, tipo, gate.storeId, id))
  } catch (e) {
    return compatServerError("organizacao DELETE", e, "Falha ao excluir")
  }
}
