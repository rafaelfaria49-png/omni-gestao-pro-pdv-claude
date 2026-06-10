import { redirect } from "next/navigation";

/** Orçamentos legado (localStorage) desativado — fluxo oficial no Operações HUB V3. */
export default function LegacyOrcamentosRedirectPage() {
  redirect("/dashboard/operacoes-v3");
}
