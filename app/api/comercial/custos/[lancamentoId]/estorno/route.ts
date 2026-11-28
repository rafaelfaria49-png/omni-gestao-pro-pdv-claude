import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson } from "@/lib/aparelhos/api-gate"
import { resolveComercialApi } from "@/lib/comercial/api-gate"
import { estornarCusto } from "@/lib/comercial/custos/service"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ lancamentoId: string }> }

/** Reverte um custo aplicado (auditável; material do estoque retorna ao estoque). */
export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const gate = await resolveComercialApi(req, true, "commercial.refurbishment")
  if (!gate.ok) return gate.response
  const body = await readJson(req, 10_000)
  if (body === null) return badJson()
  const { lancamentoId } = await params
  return jsonResult(await estornarCusto(gate.ctx, lancamentoId, body))
}
