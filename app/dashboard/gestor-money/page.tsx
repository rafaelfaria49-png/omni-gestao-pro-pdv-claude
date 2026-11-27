import type { Metadata } from "next"
import { GestorMoneyApp } from "@/components/gestor-money/GestorMoneyApp"

export const metadata: Metadata = {
  title: "Gestor Money · OmniGestão Pro",
  description: "Gestão financeira pessoal e empresarial com isolamento G001–G006.",
}

/**
 * Rota autenticada do Gestor Money no ERP.
 * Usa estritamente a fronteira real (`mode="real"`): nunca apresenta dados simulados
 * como reais enquanto a PR #405 / G001–G006 estiver pendente de integração.
 */
export default function GestorMoneyDashboardPage() {
  return <GestorMoneyApp mode="real" />
}
