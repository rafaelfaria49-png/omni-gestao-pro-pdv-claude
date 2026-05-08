import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Entrada sob `/dashboard/*` → mesma SPA em `/vendas-hub`. */
export default function DashboardVendasHubPage() {
  redirect("/vendas-hub/vendas");
}
