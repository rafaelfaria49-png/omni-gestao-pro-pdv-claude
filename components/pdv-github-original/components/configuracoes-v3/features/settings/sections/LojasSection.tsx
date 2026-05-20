"use client";

import { Store } from "lucide-react";
import { GestaoUnidadesSaas } from "@/components/dashboard/configuracoes/gestao-unidades-saas";
import { ConfigEmpresaProvider } from "@/lib/config-empresa";
import { LojaAtivaProvider } from "@/lib/loja-ativa";
import { SectionHeader } from "../components/SectionHeader";

function LojasSectionContent() {
  return (
    <div className="space-y-8">
      <SectionHeader
        icon={<Store className="h-5 w-5" />}
        title="Gestão de Lojas"
        description="Gerencie todas as unidades da sua empresa. Toque em uma unidade para editar e defina a unidade ativa para o sistema."
      />

      <GestaoUnidadesSaas embed />
    </div>
  );
}

/** Mesmos providers de multiloja do dashboard (`AppOpsProviders` inclui estes). */
export function LojasSection() {
  return (
    <ConfigEmpresaProvider>
      <LojaAtivaProvider>
        <LojasSectionContent />
      </LojaAtivaProvider>
    </ConfigEmpresaProvider>
  );
}
