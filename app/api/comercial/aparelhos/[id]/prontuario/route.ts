import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson } from "@/lib/aparelhos/api-gate"
import { resolveComercialApi } from "@/lib/comercial/api-gate"
import { atualizarPerfil, obterProntuario } from "@/lib/comercial/custos/service"
import { resolveBusinessResource } from "@/lib/store-business-capabilities"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/** Prontuário comercial: perfil, custos aplicados, composição honesta, indicadores e histórico. */
export async function GET(req: Request, { params }: Params): Promise<NextResponse> {
  const gate = await resolveComercialApi(req, false, "commercial.refurbishment")
  if (!gate.ok) return gate.response
  const { id } = await params
  const url = new URL(req.url)
  const num = (k: string) => {
    const v = Number(url.searchParams.get(k))
    return Number.isFinite(v) ? v : undefined
  }
  return jsonResult(await obterProntuario(gate.ctx, id, { taxaPercent: num("taxa"), margemAlvoPercent: num("margem") }))
}

/** Atualiza categoria, funcionamento, finalidade, defeitos, classe estética, conferências e status do custo. */
export async function PATCH(req: Request, { params }: Params): Promise<NextResponse> {
  const gate = await resolveComercialApi(req, true, "commercial.refurbishment")
  if (!gate.ok) return gate.response
  const body = await readJson(req, 50_000)
  if (body === null) return badJson()
  const { id } = await params
  const implantacaoAtiva = resolveBusinessResource(gate.capabilities, "commercial.implantationMode").operational
  return jsonResult(await atualizarPerfil(gate.ctx, id, body, { implantacaoAtiva }))
}
