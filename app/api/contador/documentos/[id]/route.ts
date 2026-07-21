/**
 * DELETE /api/contador/documentos/[id]
 *
 * Exclusão SOFT (motivo obrigatório) de um documento da loja ativa. Preenche
 * `excluidoEm/PorId/Motivo` e registra `documento_excluido`. NÃO remove o blob — a
 * retenção e o descarte físico ficam para o GOAL 019.
 *
 * GOAL CONTADOR-HUB-DOCUMENTOS-REAL-010B · Etapa 10.
 */
import { NextResponse } from "next/server"
import { requireContadorScope } from "@/lib/contador/scope"
import { excluirDocumento } from "@/lib/contador/documentos/service"
import { criarRepoPrisma } from "@/lib/contador/documentos/repo-prisma"
import { logEvento, respostaErro, respostaFalhaEscopo } from "@/lib/contador/documentos/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const escopo = await requireContadorScope()
  if (!escopo.ok) return respostaFalhaEscopo(escopo)

  const { id } = await ctx.params
  let motivo: unknown = ""
  try {
    const body = (await req.json()) as Record<string, unknown>
    motivo = body?.motivo
  } catch {
    // Corpo ausente/ inválido → o service rejeita motivo vazio com 422.
  }

  try {
    const documento = await excluirDocumento(
      { storeId: escopo.storeId, userId: escopo.userId },
      id,
      motivo,
      { repo: criarRepoPrisma() },
    )
    logEvento("contador_documento_excluido", {
      storeId: escopo.storeId,
      userId: escopo.userId,
      documentoId: id,
    })
    return NextResponse.json({ ok: true, documento })
  } catch (e) {
    return respostaErro(e)
  }
}
