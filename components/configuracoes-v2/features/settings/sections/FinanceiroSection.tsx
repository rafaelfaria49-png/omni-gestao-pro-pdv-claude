"use client";

import { Button } from "@/components/configuracoes-v2/ui/button";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { toastPending } from "@/components/configuracoes-v2/lib/safe-actions";

export function FinanceiroSection() {
  return (
    <div className="space-y-8">
      <SectionHeader title="Financeiro" description="Parâmetros financeiros (somente visual)." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SettingsCard title="Conciliação" description="Configuração pendente de integração.">
          <Button onClick={toastPending} title="Integração pendente">
            Configurar conciliação
          </Button>
        </SettingsCard>

        <SettingsCard title="Limites e alertas" description="Notificações e regras financeiras.">
          <Button variant="outline" onClick={toastPending} title="Integração pendente">
            Ajustar alertas
          </Button>
        </SettingsCard>
      </div>
    </div>
  );
}
