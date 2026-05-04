"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { Monitor, Check, Zap, Sparkles, LayoutGrid } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { cn } from "@/components/configuracoes-v3/lib/utils";
import { ConfigEmpresaProvider } from "@/lib/config-empresa";
import { LojaAtivaProvider, useLojaAtiva } from "@/lib/loja-ativa";
import { StoreSettingsProvider, useStoreSettings } from "@/lib/store-settings-provider";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { writePdvClassicLayout } from "@/lib/pdv-classic-layout";
import { nomeFantasiaOuFallbackUnidade } from "@/lib/store-display-name";

/** Mesma chave que `vendas-pdv.tsx` / `configuracoes-sistema.tsx` (layout classic vs supermercado no navegador). */
const PDV_LAYOUT_STORAGE_KEY = "@omnigestao:pdv-layout";

/** Chave opcional em `printerConfig` só para a UI V3 diferenciar cartões “Clássico” e “IA” (mesmo backend `pdvClassicLayout: lovable`). */
const V3_PDV_SECTION_CARD_KEY = "v3PdvSectionCard";

type LayoutId = "classico" | "rapido" | "ia";

interface PdvLayout {
  id: LayoutId;
  name: string;
  description: string;
  icon: React.ElementType;
}

const LAYOUTS: PdvLayout[] = [
  { id: "classico", name: "PDV Clássico", description: "Layout tradicional com grid de produtos e carrinho lateral.", icon: LayoutGrid },
  { id: "rapido", name: "PDV Rápido", description: "Foco em código de barras e teclas de atalho para alta rotatividade.", icon: Zap },
  { id: "ia", name: "PDV Inteligente (IA)", description: "Sugestões automáticas, busca semântica e cross-sell por IA.", icon: Sparkles },
];

function readLocalPdvMain(): "classic" | "supermercado" {
  if (typeof window === "undefined") return "classic";
  try {
    const raw = String(localStorage.getItem(PDV_LAYOUT_STORAGE_KEY) || "").trim();
    if (raw === "supermercado" || raw === "classic") return raw;
  } catch {
    /* ignore */
  }
  return "classic";
}

function layoutIdFromPrinterAndLocal(
  localMain: "classic" | "supermercado",
  printerConfig: Record<string, unknown> | null
): LayoutId {
  if (localMain === "supermercado") return "rapido";
  const card = printerConfig?.[V3_PDV_SECTION_CARD_KEY];
  if (card === "ia") return "ia";
  return "classico";
}

function safePrinterRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
}

function PdvSectionContent() {
  const { toast } = useToast();
  const { lojaAtivaId, lojaAtivaRaw } = useLojaAtiva();
  const { hydrated, settings, pdvParams, refresh, storeId } = useStoreSettings();

  const [remotePrinterConfig, setRemotePrinterConfig] = useState<Record<string, unknown>>({});
  const [draftLayout, setDraftLayout] = useState<LayoutId>("classico");
  const [savedLayout, setSavedLayout] = useState<LayoutId>("classico");
  const [saving, setSaving] = useState(false);

  const syncFromServer = useCallback(() => {
    const base = safePrinterRecord(settings?.printerConfig);
    setRemotePrinterConfig(base);
    const localMain = readLocalPdvMain();
    const id = layoutIdFromPrinterAndLocal(localMain, base);
    setDraftLayout(id);
    setSavedLayout(id);
  }, [settings?.printerConfig]);

  useEffect(() => {
    if (!hydrated) return;
    syncFromServer();
  }, [hydrated, syncFromServer, storeId]);

  const noLoja = !lojaAtivaId?.trim();
  const busy = !hydrated || saving;
  const lojaNome =
    lojaAtivaId && lojaAtivaRaw
      ? nomeFantasiaOuFallbackUnidade(lojaAtivaId, lojaAtivaRaw.nomeFantasia)
      : "";

  const handleCancel = () => {
    setDraftLayout(savedLayout);
  };

  const handleSave = async () => {
    const lojaHeader = lojaAtivaId?.trim();
    if (!lojaHeader) {
      toast({
        title: "Nenhuma unidade ativa",
        description: "Defina a unidade ativa na seção Lojas e tente novamente.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const base = safePrinterRecord(remotePrinterConfig);
      const nextPdvParams = {
        ...pdvParams,
        ...(draftLayout === "rapido" ? {} : { pdvClassicLayout: "lovable" as const }),
      };

      const nextPrinter: Record<string, unknown> = {
        ...base,
        pdvParams: nextPdvParams,
      };

      if (draftLayout === "ia") nextPrinter[V3_PDV_SECTION_CARD_KEY] = "ia";
      else if (draftLayout === "classico") nextPrinter[V3_PDV_SECTION_CARD_KEY] = "classico";
      else Reflect.deleteProperty(nextPrinter, V3_PDV_SECTION_CARD_KEY);

      const res = await fetch(`/api/stores/${encodeURIComponent(lojaHeader)}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: lojaHeader,
        },
        body: JSON.stringify({ printerConfig: nextPrinter }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Falha ao salvar (HTTP ${res.status})`);
      }

      try {
        if (typeof window !== "undefined") {
          if (draftLayout === "rapido") {
            localStorage.setItem(PDV_LAYOUT_STORAGE_KEY, "supermercado");
          } else {
            localStorage.setItem(PDV_LAYOUT_STORAGE_KEY, "classic");
            writePdvClassicLayout("lovable");
          }
        }
      } catch {
        /* ignore */
      }

      setRemotePrinterConfig(nextPrinter);
      setSavedLayout(draftLayout);
      await refresh();
      toast({ title: "PDV atualizado", description: "Preferências gravadas para a unidade ativa. Recarregue o PDV se já estiver aberto." });
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const controlsDisabled = busy || noLoja;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Monitor className="h-5 w-5" />}
        title="Tema do PDV"
        description="Defina como será a tela de vendas — configurável por loja."
      />

      <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5 sm:max-w-xs sm:flex-1">
            <Label>Unidade ativa</Label>
            <div
              className={cn(
                "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm",
                noLoja && "text-muted-foreground",
              )}
            >
              {noLoja ? "Nenhuma unidade selecionada" : hydrated ? lojaNome || lojaAtivaId : "Carregando…"}
            </div>
          </div>
          <p className="text-sm font-normal text-muted-foreground">
            As alterações valem para a unidade ativa. Salve para gravar no servidor e no navegador deste aparelho.
          </p>
        </div>
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">Layout do PDV</h2>
          <p className="text-sm font-normal text-muted-foreground">Escolha o estilo de operação do ponto de venda.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {LAYOUTS.map((opt) => {
            const active = draftLayout === opt.id;
            const Icon = opt.icon;
            return (
              <div
                key={opt.id}
                className={cn(
                  "relative flex min-h-[17rem] flex-col gap-6 rounded-xl border bg-card p-6 shadow-soft transition-all",
                  active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40 hover:shadow-card",
                )}
              >
                {active && (
                  <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
                    <Check className="h-4 w-4" />
                  </div>
                )}

                <div className="overflow-hidden rounded-lg border border-border bg-surface">
                  <div className="flex h-32">
                    <div className="flex-1 grid grid-cols-3 gap-1.5 p-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="rounded bg-card border border-border" />
                      ))}
                    </div>
                    <div className="w-1/3 border-l border-border bg-card-muted p-2 space-y-1.5">
                      <div className="h-1.5 w-full rounded bg-muted" />
                      <div className="h-1.5 w-3/4 rounded bg-muted" />
                      <div className="h-1.5 w-2/3 rounded bg-muted" />
                      <div className="mt-3 h-5 w-full rounded bg-gradient-primary" />
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold leading-snug text-foreground">{opt.name}</h4>
                    <p className="text-sm font-normal leading-relaxed text-muted-foreground">{opt.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" disabled>
                    Em breve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={active ? "secondary" : "default"}
                    disabled={active || controlsDisabled}
                    onClick={() => setDraftLayout(opt.id)}
                  >
                    {active ? "Selecionado" : "Selecionar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving || noLoja || draftLayout === savedLayout}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={controlsDisabled || draftLayout === savedLayout}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PdvSection() {
  return (
    <ConfigEmpresaProvider>
      <LojaAtivaProvider>
        <StoreSettingsProvider>
          <PdvSectionContent />
        </StoreSettingsProvider>
      </LojaAtivaProvider>
    </ConfigEmpresaProvider>
  );
}
