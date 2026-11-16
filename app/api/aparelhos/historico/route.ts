import { NextResponse } from "next/server"
import { jsonResult, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { historicoLoja } from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "hub", false)
  if (!gate.ok) return gate.response
  const u = new URL(req.url)
  return jsonResult(await historicoLoja(gate.ctx, { q: u.searchParams.get("q") ?? undefined, page: Number(u.searchParams.get("page") ?? 1) }))
}
