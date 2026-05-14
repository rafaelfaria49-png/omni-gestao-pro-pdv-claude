import { redirect } from "next/navigation"

/**
 * Rota legada — redirecionada para o histórico oficial.
 * O histórico de vendas real está em /dashboard/vendas-arquivo-geral.
 */
export default function HistoricoVendasRedirect() {
  redirect("/dashboard/vendas-arquivo-geral")
}
