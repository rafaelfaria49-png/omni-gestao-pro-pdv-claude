"use client"

import dynamic from "next/dynamic"
import { GestaoProdutos } from "@/components/dashboard/estoque/gestao-produtos"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import { usesClientExperience } from "@/lib/navigation/client-experience"

const EstoqueCliente = dynamic(
  () => import("@/components/dashboard/estoque/estoque-cliente").then((m) => m.EstoqueCliente),
  { ssr: false },
)

export default function DashboardEstoquePage() {
  // Aguarda a sessão: nenhuma das duas telas é montada (nem inicia leituras) antes da decisão.
  const client = usesClientExperience(useEnterprisePermissions())
  if (client === null) {
    return <p role="status" className="py-10 text-center text-sm text-muted-foreground">Carregando estoque…</p>
  }
  return client ? <EstoqueCliente /> : <GestaoProdutos />
}
