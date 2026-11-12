import { NextResponse } from "next/server"
import { jsonResult, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { listarGarantias } from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<NextResponse> {
  const u = new URL(req.url)
  const gate = await resolveAparelhoApi(req, u.searchParams.get("canal") === "venda" ? "venda" : "hub", false)
  if (!gate.ok) return gate.response
  return jsonResult(await listarGarantias(gate.ctx, { q: u.searchParams.get("q") ?? undefined, vigentes: u.searchParams.get("vigentes") === "1", page: Number(u.searchParams.get("page") ?? 1) }))
}
