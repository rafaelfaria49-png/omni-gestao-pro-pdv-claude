"use client";

import { Button } from "@/components/configuracoes-v2/ui/button";
import { Badge } from "@/components/configuracoes-v2/ui/badge";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { toastPending } from "@/components/configuracoes-v2/lib/safe-actions";

export function IntegracoesSection() {
  return (
    <div className="space-y-8">
      <SectionHeader
        title="Integrações"
        description="Conexões externas (somente visual, sem backend)."
        right={
          <Button onClick={toastPending} title="Integração pendente">
            Conectar integração
          </Button>
        }
      />

      <SettingsCard title="Serviços" description="Status ilustrativo (mock).">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[
            { name: "Mercado Livre", status: "Conectado" as const },
            { name: "Shopee", status: "Conectado" as const },
            { name: "Amazon", status: "Pendente" as const },
            { name: "WhatsApp", status: "Pendente" as const },
          ].map((it) => (
            <div
              key={it.name}
              className="rounded-xl border border-border bg-card/60 p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold">{it.name}</div>
                <div className="text-xs text-muted-foreground">Integração em preparação</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={it.status === "Conectado" ? "default" : "secondary"}>{it.status}</Badge>
                <Button size="sm" variant="outline" onClick={toastPending} title="Integração pendente">
                  Gerenciar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
