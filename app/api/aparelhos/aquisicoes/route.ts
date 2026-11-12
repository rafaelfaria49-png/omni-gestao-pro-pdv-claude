import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { criarAquisicao, listarAquisicoes } from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", false)
  if (!gate.ok) return gate.response
  const u = new URL(req.url)
  return jsonResult(await listarAquisicoes(gate.ctx, { status: u.searchParams.get("status") ?? undefined, page: Number(u.searchParams.get("page") ?? 1) }))
}

/** Registra compra de cliente / fornecedor / lote (fica aguardando aprovação; sem estoque). */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", true)
  if (!gate.ok) return gate.response
  const body = await readJson(req)
  if (body === null) return badJson()
  return jsonResult(await criarAquisicao(gate.ctx, body))
}
