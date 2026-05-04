"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";

const ROWS = [
  { name: "WhatsApp", status: "Não ligado" },
  { name: "OpenAI", status: "Não ligado" },
  { name: "Marketplaces", status: "Rascunho" },
  { name: "Pagamentos", status: "Não ligado" },
];

export function IntegracoesSection() {
  return (
    <ConfigSection>
      <ConfigHeader
        title="Integrações"
        description="Canais e APIs externas (sem credenciais reais)."
        right={
          <Button variant="outline" size="lg" className="rounded-xl" onClick={toastConfigV2Pending}>
            Nova ligação
          </Button>
        }
      />

      <ConfigCard title="Serviços">
        <div className="divide-y divide-border rounded-xl border border-border">
          {ROWS.map((r) => (
            <div
              key={r.name}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold">{r.name}</p>
                <Badge variant="outline" className="mt-1">
                  {r.status}
                </Badge>
              </div>
              <Button size="sm" variant="secondary" className="rounded-lg" onClick={toastConfigV2Pending}>
                Configurar
              </Button>
            </div>
          ))}
        </div>
      </ConfigCard>
    </ConfigSection>
  );
}
