import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { cadastrarAparelho, listarAparelhos } from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

/** Lista paginada de aparelhos físicos da loja (Cadastros HUB → Aparelhos). */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", false)
  if (!gate.ok) return gate.response
  const u = new URL(req.url)
  const ordem = u.searchParams.get("ordem")
  return jsonResult(await listarAparelhos(gate.ctx, {
    q: u.searchParams.get("q") ?? undefined,
    status: u.searchParams.get("status") ?? undefined,
    condicao: u.searchParams.get("condicao") ?? undefined,
    origem: u.searchParams.get("origem") ?? undefined,
    page: Number(u.searchParams.get("page") ?? 1),
    pageSize: Number(u.searchParams.get("pageSize") ?? 10),
    ordem: ordem === "preco_asc" || ordem === "preco_desc" || ordem === "modelo" ? ordem : "recentes",
  }))
}

/** Cadastra aparelho próprio da loja (novo ou usado). */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", true)
  if (!gate.ok) return gate.response
  const body = await readJson(req)
  if (body === null) return badJson()
  return jsonResult(await cadastrarAparelho(gate.ctx, body))
}
