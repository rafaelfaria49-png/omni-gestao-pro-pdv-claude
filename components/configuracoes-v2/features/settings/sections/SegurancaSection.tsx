"use client";

import { Button } from "@/components/configuracoes-v2/ui/button";
import { Input } from "@/components/configuracoes-v2/ui/input";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { toastPending } from "@/components/configuracoes-v2/lib/safe-actions";

export function SegurancaSection() {
  return (
    <div className="space-y-8">
      <SectionHeader title="Segurança" description="Configurações de acesso (modo seguro)." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SettingsCard title="Senha" description="A atualização real será ativada nas próximas etapas.">
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-muted-foreground">Senha atual</div>
              <Input type="password" placeholder="••••••••" />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground">Nova senha</div>
              <Input type="password" placeholder="••••••••" />
            </div>
            <Button onClick={toastPending} title="Integração pendente">
              Atualizar senha
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard title="Sessões" description="Encerrar sessões e rever dispositivos.">
          <Button variant="outline" onClick={toastPending} title="Integração pendente">
            Encerrar sessões em outros dispositivos
          </Button>
        </SettingsCard>
      </div>
    </div>
  );
}
