import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { atualizarAparelho, detalheAparelho } from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/** Ficha completa: dados, fotos, linha do tempo, vendas/garantias, aquisição e OS vinculadas. */
export async function GET(req: Request, { params }: Params): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", false)
  if (!gate.ok) return gate.response
  const { id } = await params
  return jsonResult(await detalheAparelho(gate.ctx, id))
}

export async function PATCH(req: Request, { params }: Params): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", true)
  if (!gate.ok) return gate.response
  const body = await readJson(req)
  if (body === null) return badJson()
  const { id } = await params
  return jsonResult(await atualizarAparelho(gate.ctx, id, body))
}
