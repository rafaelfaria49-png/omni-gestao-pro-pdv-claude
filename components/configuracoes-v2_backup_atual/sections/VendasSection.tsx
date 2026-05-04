"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";

export function VendasSection() {
  return (
    <ConfigSection>
      <ConfigHeader title="Vendas" description="Regras comerciais e checkout (demonstração)." />

      <ConfigCard
        title="Regras"
        description="Ative ou desative comportamentos no PDV."
        footer={
          <div className="flex justify-end">
            <Button className="rounded-xl" onClick={toastConfigV2Pending}>
              Guardar regras
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Desconto manual</p>
              <p className="text-xs text-muted-foreground">Permitir no operador</p>
            </div>
            <Switch defaultChecked disabled />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Bloquear sem stock</p>
              <p className="text-xs text-muted-foreground">Validação no caixa</p>
            </div>
            <Switch disabled />
          </div>
        </div>
      </ConfigCard>
    </ConfigSection>
  );
}
