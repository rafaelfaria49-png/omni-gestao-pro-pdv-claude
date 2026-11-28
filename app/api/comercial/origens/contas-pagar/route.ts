import { NextResponse } from "next/server"
import { jsonResult } from "@/lib/aparelhos/api-gate"
import { resolveComercialApi } from "@/lib/comercial/api-gate"
import { listarOrigensContaPagar } from "@/lib/comercial/custos/service"

export const dynamic = "force-dynamic"

/** Compras já registradas em Contas a Pagar que podem ser rateadas, com capacidade restante. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await resolveComercialApi(req, false, "commercial.refurbishment")
  if (!gate.ok) return gate.response
  if (!gate.financeiro.view) {
    return NextResponse.json({ ok: false, code: "SEM_PERMISSAO_FINANCEIRO", error: "Listar compras de Contas a Pagar exige acesso ao Financeiro." }, { status: 403 })
  }
  const q = new URL(req.url).searchParams.get("q") ?? ""
  return jsonResult(await listarOrigensContaPagar(gate.ctx, q))
}
