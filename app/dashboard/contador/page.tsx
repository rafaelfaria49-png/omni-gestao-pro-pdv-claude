import type { Metadata } from "next"
import { ContadorHubPreview } from "@/components/dashboard/contador/contador-hub-preview"
import { APP_DISPLAY_NAME } from "@/lib/app-brand"

export const metadata: Metadata = {
  title: `Contador HUB · ${APP_DISPLAY_NAME}`,
  description: "Contador HUB interno — organize documentos, pendências e o fechamento do mês com seu contador (preview visual).",
}

/**
 * Contador HUB interno (lojista/equipe) · GOAL CONTADOR-HUB-VISUAL-PREVIEW-ONLY-001.
 *
 * Casca VISUAL/preview: nenhum dado real, backend, API, upload/download ou emissão
 * fiscal. Os botões sem efeito real disparam toast honesto. Não confundir com o
 * portal EXTERNO antigo do contador em `/contador` (login por PIN, exportações),
 * que permanece intacto. `min-w-0` evita overflow; o AppShell segue dono do scroll.
 */
export default function ContadorHubPage() {
  return (
    <div className="w-full min-w-0">
      <ContadorHubPreview />
    </div>
  )
}
