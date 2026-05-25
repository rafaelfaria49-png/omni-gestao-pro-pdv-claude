import { PdvGithubOriginal } from "@/components/pdv-github-original/PdvGithubOriginal"
import { ModuleEmDesenvolvimento } from "@/components/painel-inicial/ModuleEmDesenvolvimento"
import { experimentalPdvEnabled } from "@/lib/feature-flags"

export default function PdvGithubOriginalPage() {
  // Versão de referência interna (espelho). Bloqueada para operação real;
  // liberada apenas em desenvolvimento (env NEXT_PUBLIC_OG_EXPERIMENTAL=1).
  if (!experimentalPdvEnabled) {
    return (
      <ModuleEmDesenvolvimento
        title="PDV GitHub Original — referência interna"
        description="Versão de referência mantida apenas para desenvolvimento. Não use para operação real."
        links={[{ href: "/dashboard/vendas", label: "Abrir PDV oficial" }]}
      />
    )
  }
  return <PdvGithubOriginal />
}
