import { NextResponse } from "next/server"
import { jsonResult, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { obterPolitica, resumoAparelhos } from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

/** Indicadores reais da Visão geral + permissões efetivas do usuário nesta loja. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", false)
  if (!gate.ok) return gate.response
  const dias = Number(new URL(req.url).searchParams.get("dias") ?? 30)
  const r = await resumoAparelhos(gate.ctx, Number.isFinite(dias) ? dias : 30)
  if (!r.ok) return jsonResult(r)
  const politica = await obterPolitica(gate.ctx.storeId)
  return jsonResult({ ...r, politica, permissoes: gate.ctx.perms })
}
