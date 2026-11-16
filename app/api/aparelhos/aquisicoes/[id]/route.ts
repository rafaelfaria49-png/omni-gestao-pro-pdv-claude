import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { decidirAquisicao } from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

/** Aprovar (confirma a propriedade da loja) ou recusar a aquisição — com segregação de funções. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", true)
  if (!gate.ok) return gate.response
  const body = await readJson(req)
  if (body === null) return badJson()
  const { id } = await params
  return jsonResult(await decidirAquisicao(gate.ctx, id, body))
}
