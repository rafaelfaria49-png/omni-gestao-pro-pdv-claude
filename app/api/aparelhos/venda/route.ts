import { NextResponse } from "next/server"
import { jsonResult, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { buscarParaVenda, obterPolitica } from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

/** Busca de unidades VENDÁVEIS para PDV / Venda Completa (caixa incluso; custo nunca exposto sem permissão). */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "venda", false)
  if (!gate.ok) return gate.response
  const u = new URL(req.url)
  const r = await buscarParaVenda(gate.ctx, u.searchParams.get("q") ?? "")
  if (!r.ok) return jsonResult(r)
  return jsonResult({
    ...r,
    politica: await obterPolitica(gate.ctx.storeId),
    permissoes: { vender: gate.ctx.perms.vender, reservar: gate.ctx.perms.reservar, verCusto: gate.ctx.perms.verCusto },
  })
}
