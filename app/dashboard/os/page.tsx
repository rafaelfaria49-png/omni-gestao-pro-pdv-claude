import { redirect } from "next/navigation";

/** Painel legado desativado — fluxo oficial de OS agora no Operações HUB V3. */
export default function LegacyOsRedirectPage() {
  redirect("/dashboard/operacoes-v3");
}
