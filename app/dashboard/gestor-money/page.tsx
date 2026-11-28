import type { Metadata } from "next"
import {
  cancelarPareamentoWhatsApp,
  gerarCodigoVinculoWhatsApp,
  revogarVinculoWhatsApp,
  situacaoVinculoWhatsApp,
} from "@/app/actions/gestor-money-vinculo"
import { GestorMoneyApp } from "@/components/gestor-money/GestorMoneyApp"

export const metadata: Metadata = {
  title: "Gestor Money · OmniGestão Pro",
  description: "Gestão financeira pessoal e empresarial com isolamento G001–G008.",
}

/**
 * Rota autenticada do Gestor Money no ERP.
 * Usa estritamente a fronteira real (`mode="real"`) e injeta as Server Actions
 * canônicas de pareamento WhatsApp G007/G008 (`app/actions/gestor-money-vinculo.ts`).
 */
export default function GestorMoneyDashboardPage() {
  return (
    <GestorMoneyApp
      mode="real"
      gerarCodigoVinculoAction={gerarCodigoVinculoWhatsApp}
      situacaoVinculoAction={situacaoVinculoWhatsApp}
      cancelarPareamentoAction={cancelarPareamentoWhatsApp}
      revogarVinculoAction={revogarVinculoWhatsApp}
    />
  )
}
