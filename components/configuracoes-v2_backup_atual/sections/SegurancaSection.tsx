"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigField } from "../components/ConfigField";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";

export function SegurancaSection() {
  return (
    <ConfigSection>
      <ConfigHeader title="Segurança" description="Senha, sessões e auditoria (mock)." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ConfigCard title="Alterar palavra-passe">
          <div className="space-y-4">
            <ConfigField label="Palavra-passe atual">
              <Input className="h-11 rounded-xl" type="password" placeholder="••••••••" />
            </ConfigField>
            <ConfigField label="Nova palavra-passe">
              <Input className="h-11 rounded-xl" type="password" placeholder="••••••••" />
            </ConfigField>
            <Button className="rounded-xl" onClick={toastConfigV2Pending}>
              Atualizar
            </Button>
          </div>
        </ConfigCard>

        <ConfigCard title="Sessões">
          <div className="space-y-3">
            <div className="rounded-xl border border-border px-4 py-3">
              <p className="text-sm font-medium">Chrome — Windows</p>
              <p className="text-xs text-muted-foreground">Sessão atual</p>
            </div>
            <div className="rounded-xl border border-border px-4 py-3">
              <p className="text-sm font-medium">Safari — iPhone</p>
              <p className="text-xs text-muted-foreground">Há 2 dias</p>
            </div>
            <Button variant="outline" className="w-full rounded-xl" onClick={toastConfigV2Pending}>
              Terminar outras sessões
            </Button>
          </div>
        </ConfigCard>
      </div>
    </ConfigSection>
  );
}
