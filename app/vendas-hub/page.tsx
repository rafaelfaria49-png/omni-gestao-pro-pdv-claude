import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"
export const revalidate = 0

/** Entrada direta: mesma tela dos cards que em `/vendas-hub/vendas`. */
export default function VendasHubRootPage() {
  redirect("/vendas-hub/vendas")
}
