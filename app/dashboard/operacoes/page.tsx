import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Alias legado / bookmarks → Operações HUB atual. */
export default function OperacoesAliasPage() {
  redirect("/dashboard/operacoes-v2");
}
