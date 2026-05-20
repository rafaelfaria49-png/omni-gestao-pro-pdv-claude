"use client";

import { Button } from "@/components/configuracoes/lovable/ui/button";
import { Input } from "@/components/configuracoes/lovable/ui/input";
import { Switch } from "@/components/configuracoes/lovable/ui/switch";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { toastPending } from "@/components/configuracoes/lovable/utils/safe-actions";

export function GeralSection() {
  return (
    <div className="space-y-8">
      <SectionHeader
        title="Geral"
        description="Preferências gerais do OmniGestão Pro."
        right={
          <Button
            onClick={toastPending}
            title="Integração pendente"
            className="rounded-lg bg-[hsl(var(--primary))] px-5 py-2.5 font-medium text-white shadow-sm hover:opacity-90"
          >
            Salvar alterações
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SettingsCard title="Empresa" description="Dados exibidos na interface (sem persistência por enquanto).">
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-muted-foreground">Nome fantasia</div>
              <Input defaultValue="OmniGestão Pro" />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground">Domínio</div>
              <Input defaultValue="seudominio.com" />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard title="Preferências" description="Comportamentos visuais e de navegação.">
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Densidade compacta</div>
                <div className="text-xs text-muted-foreground">Mais informação por tela.</div>
              </div>
              <Switch defaultChecked disabled title="Integração pendente" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Sugestões inteligentes</div>
                <div className="text-xs text-muted-foreground">Dicas contextuais na interface.</div>
              </div>
              <Switch defaultChecked disabled title="Integração pendente" />
            </label>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

