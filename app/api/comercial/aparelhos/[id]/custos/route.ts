import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson } from "@/lib/aparelhos/api-gate"
import { resolveComercialApi } from "@/lib/comercial/api-gate"
import { lancarCusto } from "@/lib/comercial/custos/service"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/** Lança um custo (estoque | preexistente | vínculo financeiro | nova compra | gerencial) na unidade. */
export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const gate = await resolveComercialApi(req, true, "commercial.refurbishment")
  if (!gate.ok) return gate.response
  const body = await readJson(req, 50_000)
  if (body === null) return badJson()
  const { id } = await params
  return jsonResult(await lancarCusto(gate.ctx, id, body, gate.financeiro))
}
