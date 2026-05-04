"use client";

import { Button } from "@/components/configuracoes/lovable/ui/button";
import { Badge } from "@/components/configuracoes/lovable/ui/badge";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { toastPending } from "../utils/safe-actions";

export function LojasSection() {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Lojas"
        description="Gestão de unidades (somente visual). Plano atual: até 5 lojas."
        right={
          <Button onClick={toastPending} title="Integração pendente">
            Adicionar loja
          </Button>
        }
      />

      <SettingsCard title="Unidades" description="Lista ilustrativa (mock).">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {["Matriz", "Shopping Norte", "Centro", "Outlet"].map((name, idx) => (
            <div
              key={name}
              className="rounded-2xl border border-border bg-card/60 p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold truncate">{name}</div>
                  {idx === 0 ? <Badge>Principal</Badge> : null}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Ativa • Configuração local pendente</div>
              </div>
              <Button size="sm" variant="outline" onClick={toastPending} title="Integração pendente">
                Gerenciar
              </Button>
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}

