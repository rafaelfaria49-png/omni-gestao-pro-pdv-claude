"use client";

import { Button } from "@/components/configuracoes/lovable/ui/button";
import { Switch } from "@/components/configuracoes/lovable/ui/switch";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { toastPending } from "@/components/configuracoes/lovable/utils/safe-actions";

export function VendasSection() {
  return (
    <div className="space-y-8">
      <SectionHeader title="Vendas" description="Regras comerciais (somente visual)." />

      <SettingsCard title="Regras" description="Ativações reais serão integradas depois.">
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Permitir desconto manual</div>
              <div className="text-xs text-muted-foreground">No PDV e orçamentos.</div>
            </div>
            <Switch defaultChecked disabled title="Integração pendente" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Bloquear venda sem estoque</div>
              <div className="text-xs text-muted-foreground">Validações no caixa.</div>
            </div>
            <Switch disabled title="Integração pendente" />
          </label>
        </div>
        <div className="mt-4">
          <Button onClick={toastPending} title="Integração pendente">
            Salvar regras
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}

