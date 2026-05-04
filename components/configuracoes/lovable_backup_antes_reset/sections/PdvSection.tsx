"use client";

import { Button } from "@/components/configuracoes/lovable/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/configuracoes/lovable/ui/select";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { toastPending } from "../utils/safe-actions";
import { cn } from "@/components/configuracoes/lovable/lib/utils";

type PdvLayoutId = "compacto" | "classico";

function PdvLayoutCard({
  id,
  title,
  desc,
  selected,
  onPreview,
  onSelect,
}: {
  id: PdvLayoutId;
  title: string;
  desc: string;
  selected: boolean;
  onPreview: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/60 p-4 transition-smooth",
        selected && "border-primary/35 shadow-elegant"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", selected ? "bg-primary" : "bg-muted-foreground/35")} />
      </div>

      {/* mini preview */}
      <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <div className="space-y-2">
            <div className="h-6 rounded-lg bg-muted/40" />
            <div className="h-10 rounded-lg bg-primary/10" />
            <div className="h-10 rounded-lg bg-muted/30" />
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-2">
            <div className="h-6 rounded-md bg-muted/40" />
            <div className="mt-2 h-6 rounded-md bg-muted/30" />
            <div className="mt-2 h-6 rounded-md bg-primary/15" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onPreview} title="Integração pendente">
          Visualizar
        </Button>
        <Button size="sm" className="flex-1" onClick={onSelect} title="Integração pendente">
          {selected ? "Selecionado" : "Selecionar"}
        </Button>
      </div>
    </div>
  );
}

export function PdvSection() {
  return (
    <div className="space-y-5">
      <SectionHeader title="PDV" description="Parâmetros do caixa (somente visual)." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SettingsCard title="Impressão" description="Configuração de impressão (pendente).">
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-muted-foreground">Modelo de cupom</div>
              <Select defaultValue="a4" disabled>
                <SelectTrigger title="Integração pendente">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4</SelectItem>
                  <SelectItem value="bobina">Bobina 80mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={toastPending} title="Integração pendente">
              Testar impressão
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard title="Layout do PDV" description="Escolha um layout (visual) para o caixa.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PdvLayoutCard
              id="compacto"
              title="Compacto"
              desc="Mais rápido, foco em atalhos."
              selected
              onPreview={toastPending}
              onSelect={toastPending}
            />
            <PdvLayoutCard
              id="classico"
              title="Clássico"
              desc="Mais espaçado, foco em leitura."
              selected={false}
              onPreview={toastPending}
              onSelect={toastPending}
            />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

