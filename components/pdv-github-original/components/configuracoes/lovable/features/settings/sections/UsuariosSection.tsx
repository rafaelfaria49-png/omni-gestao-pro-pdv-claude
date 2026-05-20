"use client";

import { Button } from "@/components/configuracoes/lovable/ui/button";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { toastPending } from "@/components/configuracoes/lovable/utils/safe-actions";

export function UsuariosSection() {
  return (
    <div className="space-y-8">
      <SectionHeader
        title="Usuários"
        description="Gestão de usuários e permissões (modo seguro)."
        right={
          <Button onClick={toastPending} title="Integração pendente">
            Adicionar usuário
          </Button>
        }
      />

      <SettingsCard title="Lista de usuários" description="Ações estão desativadas até integração real.">
        <div className="space-y-2">
          {["Admin", "Operador", "Financeiro"].map((role) => (
            <div key={role} className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{role}</div>
                <div className="text-xs text-muted-foreground">usuario@seudominio.com</div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={toastPending} title="Integração pendente">
                  Editar
                </Button>
                <Button variant="outline" onClick={toastPending} title="Integração pendente">
                  Reset senha
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}

