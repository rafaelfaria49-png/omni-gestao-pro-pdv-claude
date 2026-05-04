"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigField } from "../components/ConfigField";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";

export function GeralSection() {
  return (
    <ConfigSection>
      <ConfigHeader
        title="Geral"
        description="Dados da empresa e preferências regionais (demonstração)."
        right={
          <Button size="lg" className="rounded-xl px-6 shadow-md" onClick={toastConfigV2Pending}>
            Salvar alterações
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ConfigCard
          title="Empresa"
          description="Informações exibidas em documentos e no painel."
        >
          <div className="grid gap-5">
            <ConfigField label="Nome fantasia">
              <Input className="h-11 rounded-xl" defaultValue="OmniGestão Demo" readOnly />
            </ConfigField>
            <ConfigField label="E-mail comercial">
              <Input className="h-11 rounded-xl" type="email" defaultValue="contato@empresa.com" readOnly />
            </ConfigField>
            <ConfigField label="Telefone">
              <Input className="h-11 rounded-xl" defaultValue="(11) 3000-0000" readOnly />
            </ConfigField>
          </div>
        </ConfigCard>

        <ConfigCard title="Preferências" description="Comportamento da interface.">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Densidade compacta</p>
                <p className="text-xs text-muted-foreground">Mais informação por ecrã</p>
              </div>
              <Switch defaultChecked disabled />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Sugestões contextuais</p>
                <p className="text-xs text-muted-foreground">Dicas ao navegar</p>
              </div>
              <Switch defaultChecked disabled />
            </div>
          </div>
        </ConfigCard>
      </div>
    </ConfigSection>
  );
}
