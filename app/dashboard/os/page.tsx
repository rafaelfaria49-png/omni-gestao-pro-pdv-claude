import { redirect } from "next/navigation";

/** Painel legado desativado — semântica de estoque incompatível com Operações HUB V2. */
export default function LegacyOsRedirectPage() {
  redirect("/dashboard/operacoes-v2");
}
