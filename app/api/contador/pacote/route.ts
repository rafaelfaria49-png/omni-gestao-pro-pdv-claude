/**
 * GET /api/contador/pacote?c=AAAA-MM
 *
 * Gera SOB DEMANDA o Pacote do Contador (MVP) da loja ativa na competência e devolve um
 * ZIP para download. Não persiste nada: sem storage, sem registro em banco, sem snapshot,
 * sem cache. Reflete os dados vivos da competência no instante da requisição.
 *
 * Autenticação: mesmo gate interno do Contador HUB (sessão NextAuth + cookie de loja
 * ativa + ACL multi-loja + permissão financeiro), via `requireContadorScope`. O escopo é
 * a única fonte de `storeId`; nunca vem da query.
 *
 * GOAL CONTADOR-HUB-PACOTE-EXPORT-MVP-008.
 */
import { NextResponse } from "next/server"
import { resolveCompetenciaFromSearchParam } from "@/lib/contador/competencia"
import { requireContadorScope } from "@/lib/contador/scope"
import type { FalhaEscopoContador } from "@/lib/contador/scope-core"
import { gerarPacoteContador } from "@/lib/contador/pacote"

// jszip + Prisma exigem Node; o download é dinâmico e nunca cacheado.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MOTIVO_STATUS: Record<FalhaEscopoContador["motivo"], number> = {
  nao_autenticado: 401,
  loja_ausente: 400,
  sem_acesso_loja: 403,
  sem_permissao: 403,
}

const MOTIVO_MSG: Record<FalhaEscopoContador["motivo"], string> = {
  nao_autenticado: "Sessão não encontrada. Faça login para gerar o pacote da competência.",
  loja_ausente: "Nenhuma loja ativa selecionada. Escolha uma unidade para gerar o pacote.",
  sem_acesso_loja: "Pacote indisponível para a unidade ativa.",
  sem_permissao: "Sua conta não tem permissão para gerar o pacote do Contador HUB.",
}

export async function GET(req: Request) {
  const escopo = await requireContadorScope()
  if (!escopo.ok) {
    return NextResponse.json(
      { ok: false, motivo: escopo.motivo, mensagem: MOTIVO_MSG[escopo.motivo] },
      { status: MOTIVO_STATUS[escopo.motivo] },
    )
  }

  const url = new URL(req.url)
  const competencia = resolveCompetenciaFromSearchParam(url.searchParams.get("c") ?? undefined)

  try {
    const pacote = await gerarPacoteContador({ scope: escopo, competencia, agora: new Date() })
    return new NextResponse(Buffer.from(pacote.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pacote.nomeArquivo}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (e) {
    console.error("[contador/pacote]", e instanceof Error ? e.message : String(e))
    return NextResponse.json(
      {
        ok: false,
        mensagem:
          "Não foi possível gerar o pacote desta competência agora. Tente novamente em instantes.",
      },
      { status: 503 },
    )
  }
}
