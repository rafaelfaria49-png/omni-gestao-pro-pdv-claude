import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson } from "@/lib/aparelhos/api-gate"
import { resolveComercialApi } from "@/lib/comercial/api-gate"
import { lancarCustoRateado } from "@/lib/comercial/custos/service"

export const dynamic = "force-dynamic"

/** Rateia um custo entre várias unidades (uma obrigação/origem, soma exata ao centavo). */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await resolveComercialApi(req, true, "commercial.refurbishment")
  if (!gate.ok) return gate.response
  const body = await readJson(req, 100_000)
  if (body === null) return badJson()
  return jsonResult(await lancarCustoRateado(gate.ctx, body, gate.financeiro))
}
