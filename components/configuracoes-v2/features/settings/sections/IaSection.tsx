"use client";

import { Button } from "@/components/configuracoes-v2/ui/button";
import { Progress } from "@/components/configuracoes-v2/ui/progress";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { toastPending } from "@/components/configuracoes-v2/lib/safe-actions";

export function IaSection() {
  return (
    <div className="space-y-8">
      <SectionHeader title="IA" description="Recursos inteligentes (modo seguro)." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SettingsCard title="Créditos" description="Exibição ilustrativa. Compra desativada por enquanto.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-2xl font-display font-bold">120</div>
              <div className="text-xs text-muted-foreground">créditos disponíveis</div>
            </div>
            <Button onClick={toastPending} title="Integração pendente">
              Comprar créditos
            </Button>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Uso mensal</span>
              <span>40%</span>
            </div>
            <Progress value={40} className="mt-2" />
          </div>
        </SettingsCard>

        <SettingsCard title="Automação" description="Ativações reais serão integradas depois.">
          <div className="space-y-2">
            {["Sugestões de texto", "Geração de imagem", "Resumo de relatórios"].map((it) => (
              <div
                key={it}
                className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3"
              >
                <div className="text-sm font-semibold">{it}</div>
                <Button size="sm" variant="outline" onClick={toastPending} title="Integração pendente">
                  Configurar
                </Button>
              </div>
            ))}
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
