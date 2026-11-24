import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { obterPolitica, salvarPolitica } from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<NextResponse> {
  const u = new URL(req.url)
  const gate = await resolveAparelhoApi(req, u.searchParams.get("canal") === "venda" ? "venda" : "hub", false)
  if (!gate.ok) return gate.response
  return jsonResult({ ok: true as const, politica: await obterPolitica(gate.ctx.storeId) })
}

/** Proprietário altera a política (nova versão; garantias emitidas não mudam). */
export async function PUT(req: Request): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", true)
  if (!gate.ok) return gate.response
  const body = await readJson(req)
  if (body === null) return badJson()
  return jsonResult(await salvarPolitica(gate.ctx, body))
}
