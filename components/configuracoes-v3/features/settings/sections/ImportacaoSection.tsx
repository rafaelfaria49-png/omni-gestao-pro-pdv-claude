"use client";

import { Upload } from "lucide-react";
import { AppOpsProviders } from "@/components/dashboard/app-ops-providers";
import { ImportadorDadosExternos } from "@/components/dashboard/configuracoes/backup-importador/importador-dados-externos";
import { SectionHeader } from "../components/SectionHeader";

export function ImportacaoSection() {
  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Upload className="h-5 w-5" />}
        title="Importação de Dados"
        description="Envie planilhas CSV ou Excel para importar clientes, produtos, vendas, financeiro e ordens de serviço."
      />
      <AppOpsProviders>
        <ImportadorDadosExternos />
      </AppOpsProviders>
    </div>
  );
}
