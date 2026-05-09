import { ModuleEmDesenvolvimento } from "@/components/painel-inicial/ModuleEmDesenvolvimento";
import { financeiroV2Enabled } from "@/lib/feature-flags";

export default function Page() {
  return (
    <ModuleEmDesenvolvimento
      title="Financeiro (legado)"
      description="Esta rota mantém compatibilidade com atalhos antigos. O painel principal de finanças é o Financeiro HUB; use-o para fluxo de caixa, contas e visão consolidada."
      links={
        financeiroV2Enabled
          ? [{ href: "/dashboard/financeiro-v2", label: "Abrir Financeiro HUB" }]
          : [{ href: "/dashboard/financeiro/contas-a-receber", label: "Contas a receber" }]
      }
    />
  );
}
