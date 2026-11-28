import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson } from "@/lib/aparelhos/api-gate"
import { resolveComercialApi } from "@/lib/comercial/api-gate"
import { moverPreparacao } from "@/lib/comercial/custos/service"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/** Move a etapa de preparação: em_preparacao → em_testes → concluida (concluir volta para avaliação). */
export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const gate = await resolveComercialApi(req, true, "commercial.refurbishment")
  if (!gate.ok) return gate.response
  const body = await readJson(req, 10_000)
  if (body === null) return badJson()
  const { id } = await params
  return jsonResult(await moverPreparacao(gate.ctx, id, body))
}
