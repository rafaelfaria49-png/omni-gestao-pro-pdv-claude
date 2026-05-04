"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";

export function FinanceiroSection() {
  return (
    <ConfigSection>
      <ConfigHeader title="Financeiro" description="Parâmetros ilustrativos de cobrança e relatórios." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ConfigCard title="Cobrança" description="Juros e parcelas (sem persistência).">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Juros em atraso</span>
              <Switch defaultChecked disabled />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Parcelas no cartão</span>
              <Switch defaultChecked disabled />
            </div>
            <Button className="rounded-xl" onClick={toastConfigV2Pending}>
              Guardar preferências
            </Button>
          </div>
        </ConfigCard>

        <ConfigCard title="Relatórios" description="Envio agendado (beta simulado).">
          <p className="text-sm text-muted-foreground">
            Configure relatórios automáticos quando a integração estiver disponível.
          </p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={toastConfigV2Pending}>
            Configurar relatórios
          </Button>
        </ConfigCard>
      </div>
    </ConfigSection>
  );
}
