import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashOrigem, registrarSolicitacaoTeste, type SolicitacaoDb } from "@/lib/comercial/solicitacao-teste"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SEM_CACHE = { "Cache-Control": "no-store" }

function ipDaRequisicao(headers: Headers): string {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return xff || headers.get("x-real-ip")?.trim() || "desconhecido"
}

/**
 * Público (sem sessão): recebe a solicitação de teste da página `/gestao-lojas`.
 * Não cria conta nem loja — só registra para a liberação assistida da plataforma.
 */
export async function POST(req: Request) {
  const segredo = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!segredo) {
    return NextResponse.json({ ok: false, codigo: "INDISPONIVEL", mensagem: "Solicitações indisponíveis no momento. Nada foi salvo." }, { status: 503, headers: SEM_CACHE })
  }
  const texto = await req.text().catch(() => "")
  if (texto.length > 8_000) {
    return NextResponse.json({ ok: false, codigo: "INVALIDO", campos: { form: "Solicitação grande demais." } }, { status: 413, headers: SEM_CACHE })
  }
  let corpo: unknown = null
  try { corpo = JSON.parse(texto) } catch { corpo = null }

  const resultado = await registrarSolicitacaoTeste(prisma as unknown as SolicitacaoDb, corpo, {
    ipHash: hashOrigem(ipDaRequisicao(req.headers), segredo),
  })
  const status = resultado.ok ? (resultado.repetida ? 200 : 201)
    : resultado.codigo === "INVALIDO" ? 400 : resultado.codigo === "LIMITE" ? 429 : 503
  return NextResponse.json(resultado, { status, headers: SEM_CACHE })
}
