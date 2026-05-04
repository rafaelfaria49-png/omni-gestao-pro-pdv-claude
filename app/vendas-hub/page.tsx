import { redirect } from "next/navigation"

/** Entrada direta: mesma tela dos cards que em `/vendas-hub/vendas`. */
export default function VendasHubRootPage() {
  redirect("/vendas-hub/vendas")
}
