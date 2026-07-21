/**
 * GET /api/contador/documentos?c=AAAA-MM
 *
 * Lista os documentos NÃO excluídos da loja ativa na competência. Filtros opcionais:
 * `categoria`, `status`, `titulo`, `vencimentoAte` (ISO). O DTO nunca expõe
 * `storageRef`, token, service role nem URL assinada. Não cria competência.
 *
 * GOAL CONTADOR-HUB-DOCUMENTOS-REAL-010B · Etapa 7.
 */
import { NextResponse } from "next/server"
import { requireContadorScope } from "@/lib/contador/scope"
import { listarDocumentos, type CategoriaDocumento } from "@/lib/contador/documentos/service"
import { criarRepoPrisma } from "@/lib/contador/documentos/repo-prisma"
import { respostaErro, respostaFalhaEscopo } from "@/lib/contador/documentos/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const CATEGORIAS = new Set(["fiscal", "financeiro", "folha", "juridico", "outro"])

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.has("storeId") || url.searchParams.has("lojaId")) {
    return NextResponse.json(
      { ok: false, mensagem: "O endpoint não aceita seleção de loja por parâmetro." },
      { status: 400 },
    )
  }

  const escopo = await requireContadorScope()
  if (!escopo.ok) return respostaFalhaEscopo(escopo)

  const c = url.searchParams.get("c") ?? ""
  const filtros: {
    categoria?: CategoriaDocumento
    status?: string
    titulo?: string
    vencimentoAte?: Date
  } = {}
  const cat = url.searchParams.get("categoria")?.trim().toLowerCase()
  if (cat && CATEGORIAS.has(cat)) filtros.categoria = cat as CategoriaDocumento
  const status = url.searchParams.get("status")?.trim()
  if (status) filtros.status = status.toUpperCase()
  const titulo = url.searchParams.get("titulo")?.trim()
  if (titulo) filtros.titulo = titulo
  const vencAte = url.searchParams.get("vencimentoAte")?.trim()
  if (vencAte) {
    const d = new Date(vencAte)
    if (!Number.isNaN(d.getTime())) filtros.vencimentoAte = d
  }

  try {
    const documentos = await listarDocumentos(
      { storeId: escopo.storeId, userId: escopo.userId },
      c,
      filtros,
      { repo: criarRepoPrisma() },
    )
    return NextResponse.json(
      { ok: true, competencia: c, documentos },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    )
  } catch (e) {
    return respostaErro(e)
  }
}
