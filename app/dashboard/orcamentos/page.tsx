import { redirect } from "next/navigation";

/** Orçamentos legado (localStorage) desativado — fluxo oficial no Operações HUB V2. */
export default function LegacyOrcamentosRedirectPage() {
  redirect("/dashboard/operacoes-v2");
}
