import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { getProdutoCatalogoAparelhos } from "@/lib/catalogo-aparelhos/produto-metadata"

/**
 * CATALOGO-APARELHOS-METADATA-MVP-001 — leitura do vínculo de aparelhos salvo no produto.
 *
 * SOMENTE LEITURA. Usado pelo formulário de cadastro para reidratar a seção
 * "Compatibilidade com aparelhos" na edição. Escopado por loja (sessão + storeId), lê
 * apenas `Produto.metadata.catalogoAparelhos`. Não altera estoque/venda/preço.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireCadastrosHubApi(req, "read")
  if (!gate.ok) return gate.response
  const storeId = gate.storeId

  const { id } = await context.params
  if (!id?.trim()) return NextResponse.json({ error: "ID inválido" }, { status: 400 })

  try {
    await prismaEnsureConnected()
    const row = await prisma.produto.findFirst({
      where: { id, storeId },
      select: { metadata: true },
    })
    if (!row) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })

    return NextResponse.json({ catalogoAparelhos: getProdutoCatalogoAparelhos(row) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/catalogo/aparelhos/produto GET]", msg)
    return NextResponse.json({ error: "Falha ao carregar compatibilidade" }, { status: 503 })
  }
}
