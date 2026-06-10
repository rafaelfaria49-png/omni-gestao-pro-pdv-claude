import { redirect } from "next/navigation";

/** Rota principal: o HUB oficial agora é a Operações V3. A V2 segue acessível
 *  como legado em `/dashboard/operacoes-v2`. */
export default function OperacoesAliasPage() {
  redirect("/dashboard/operacoes-v3");
}
