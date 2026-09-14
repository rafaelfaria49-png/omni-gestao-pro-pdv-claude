import { NextResponse } from "next/server"
import { suggestNcmFromProductName } from "@/lib/product-ncm-fiscal-ai"
import { requireCadastrosSession } from "@/lib/cadastros/hub-api-gate"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  const gate = await requireCadastrosSession({ hub: true })
  if (!gate.ok) return gate.response
  try {
    const body = (await req.json()) as { nome?: string }
    const nome = typeof body.nome === "string" ? body.nome.trim() : ""
    if (!nome) {
      return NextResponse.json({ error: "nome obrigatório" }, { status: 400 })
    }
    const result = await suggestNcmFromProductName(nome)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao sugerir NCM"
    const status = msg.includes("Configure OPENAI") || msg.includes("GOOGLE_") ? 503 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
