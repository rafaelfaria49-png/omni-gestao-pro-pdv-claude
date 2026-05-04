"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";

export function IaSection() {
  return (
    <ConfigSection>
      <ConfigHeader title="IA e créditos" description="Saldo e automações simuladas." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ConfigCard title="Créditos">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-bold tabular-nums">1.240</p>
              <p className="text-sm text-muted-foreground">créditos (demonstração)</p>
            </div>
            <Button className="rounded-xl" onClick={toastConfigV2Pending}>
              Comprar créditos
            </Button>
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Uso do mês</span>
              <span>62%</span>
            </div>
            <Progress value={62} className="h-2" />
          </div>
        </ConfigCard>

        <ConfigCard title="Modelos">
          <p className="text-sm text-muted-foreground">
            Escolha o modelo predefinido quando a integração estiver ativa.
          </p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={toastConfigV2Pending}>
            Configurar modelos
          </Button>
        </ConfigCard>
      </div>
    </ConfigSection>
  );
}
