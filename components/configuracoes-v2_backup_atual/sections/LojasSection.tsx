"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";

const STORES = ["Matriz", "Shopping Norte", "Centro", "Outlet"];

export function LojasSection() {
  return (
    <ConfigSection>
      <ConfigHeader
        title="Lojas"
        description="Plano de exemplo: até 5 unidades."
        right={
          <Button size="lg" className="rounded-xl px-6" onClick={toastConfigV2Pending}>
            Adicionar loja
          </Button>
        }
      />

      <ConfigCard title="Unidades" description="Cartões ilustrativos.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {STORES.map((name, i) => (
            <div
              key={name}
              className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-muted/20 p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{name}</span>
                  {i === 0 ? <Badge>Principal</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Configuração local pendente</p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0 rounded-lg" onClick={toastConfigV2Pending}>
                Gerir
              </Button>
            </div>
          ))}
        </div>
      </ConfigCard>
    </ConfigSection>
  );
}
