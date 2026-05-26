"use client"

import { GestaoUnidadesSaas } from "@/components/dashboard/configuracoes/gestao-unidades-saas"

/**
 * Gestão de unidades da rede (Master Console / multi-loja).
 * A UI (cards, sem seletor em barra) está em `GestaoUnidadesSaas`.
 */
export default function DashboardUnidadesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Gestão da Rede</h1>
        <p className="text-sm text-muted-foreground/85">
          Adicione e gerencie unidades (Loja 1, Loja 2...) e o perfil de cada uma
        </p>
      </div>
      <GestaoUnidadesSaas />
    </div>
  )
}
