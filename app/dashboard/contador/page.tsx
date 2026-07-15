import type { Metadata } from "next"
import { Suspense } from "react"
import { ContadorHubPreview } from "@/components/dashboard/contador/contador-hub-preview"
import { APP_DISPLAY_NAME } from "@/lib/app-brand"
import { resolveCompetenciaFromSearchParam } from "@/lib/contador/competencia"

export const metadata: Metadata = {
  title: `Contador HUB · ${APP_DISPLAY_NAME}`,
  description:
    "Contador HUB interno — organize documentos, pendências e o fechamento do mês com seu contador (preview visual).",
}

type ContadorHubPageProps = {
  /**
   * Next.js 16: `searchParams` é Promise.
   * Competência canônica: `?c=AAAA-MM` (GOAL CONTADOR-HUB-COMPETENCIA-CONTRATOS-005).
   */
  searchParams: Promise<{ c?: string | string[] }>
}

/**
 * Contador HUB interno (lojista/equipe) · GOAL CONTADOR-HUB-VISUAL-PREVIEW-ONLY-001
 * + competência por URL (GOAL CONTADOR-HUB-COMPETENCIA-CONTRATOS-005).
 *
 * Casca VISUAL/preview: nenhum dado real, backend, API, upload/download ou emissão
 * fiscal. Os botões sem efeito real disparam toast honesto. Não confundir com o
 * portal EXTERNO antigo do contador em `/contador` (login por PIN, exportações),
 * que permanece intacto. `min-w-0` evita overflow; o AppShell segue dono do scroll.
 *
 * Fonte da competência: `searchParams.c` (AAAA-MM). Inválido/ausente → mês atual
 * em America/Sao_Paulo. Valores ilustrativos do preview ainda não variam por
 * competência (honestidade visual mantida).
 */
export default async function ContadorHubPage({ searchParams }: ContadorHubPageProps) {
  const params = await searchParams
  const competencia = resolveCompetenciaFromSearchParam(params.c)

  return (
    <div className="w-full min-w-0">
      {/* useSearchParams no seletor exige boundary de Suspense (Next.js). */}
      <Suspense
        fallback={
          <div className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
            Carregando Contador HUB…
          </div>
        }
      >
        <ContadorHubPreview competencia={competencia} />
      </Suspense>
    </div>
  )
}
