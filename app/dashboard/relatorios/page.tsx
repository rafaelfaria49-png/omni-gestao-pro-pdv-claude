export const dynamic = "force-dynamic"
export const revalidate = 0

import { ModuleEmDesenvolvimento } from "@/components/painel-inicial/ModuleEmDesenvolvimento";

export default function Page() {
  return (
    <ModuleEmDesenvolvimento
      title="Relatórios"
      description="O centro de relatórios gerenciais ainda não está disponível nesta versão. Você pode consultar o histórico de vendas enquanto os demais relatórios são implementados."
      links={[
        { href: "/dashboard/vendas-arquivo-geral", label: "Histórico de vendas" },
      ]}
    />
  );
}
