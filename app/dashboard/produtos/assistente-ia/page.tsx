import type { Metadata } from "next"
import { ProdutoIAAssistente } from "@/components/produto-ia/ProdutoIAAssistente"

export const metadata: Metadata = {
  title: "Assistente IA do Produto · OmniGestão",
}

/**
 * Cadastro Inteligente de Produto — F1 UI.
 * Página enxuta sob o AppShell (layout do dashboard). Toda a lógica vive no painel client,
 * que reutiliza lib/catalog e salva somente em `Produto.metadata`.
 */
export default function Page() {
  return (
    <div className="min-w-0 space-y-4">
      <header className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Assistente IA do Produto</h1>
        <p className="text-sm text-muted-foreground">
          Sugere categoria, marca, compatibilidade, sinônimos e descrições a partir do catálogo —
          revisão do operador, salvo apenas em metadata.
        </p>
      </header>
      <ProdutoIAAssistente />
    </div>
  )
}
