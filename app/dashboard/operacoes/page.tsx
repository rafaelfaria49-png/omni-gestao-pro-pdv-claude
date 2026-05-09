import { redirect } from "next/navigation";

/** Alias amigável: o HUB real vive em `/dashboard/operacoes-v2`. */
export default function OperacoesAliasPage() {
  redirect("/dashboard/operacoes-v2");
}
