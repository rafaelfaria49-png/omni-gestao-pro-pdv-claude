"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigField } from "../components/ConfigField";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";

const LAYOUTS = [
  { id: "rapido", name: "PDV rápido", desc: "Menos passos para vendas frequentes." },
  { id: "classico", name: "PDV clássico", desc: "Fluxo tradicional e previsível." },
];

export function PdvSection() {
  return (
    <ConfigSection>
      <ConfigHeader title="PDV" description="Caixa, impressão e modos de venda (mock)." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ConfigCard title="Impressão">
          <ConfigField label="Modelo de cupom">
            <Select defaultValue="bobina">
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bobina">Bobina 80 mm</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
              </SelectContent>
            </Select>
          </ConfigField>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={toastConfigV2Pending}>
            Testar impressão
          </Button>
        </ConfigCard>

        <ConfigCard title="Modo de caixa">
          <div className="grid gap-3">
            {LAYOUTS.map((l) => (
              <div
                key={l.id}
                className="rounded-2xl border border-border bg-muted/15 p-4 transition-colors hover:bg-muted/25"
              >
                <p className="font-semibold">{l.name}</p>
                <p className="text-sm text-muted-foreground">{l.desc}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={toastConfigV2Pending}>
                    Pré-visualizar
                  </Button>
                  <Button size="sm" className="rounded-lg" onClick={toastConfigV2Pending}>
                    Selecionar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ConfigCard>
      </div>
    </ConfigSection>
  );
}
