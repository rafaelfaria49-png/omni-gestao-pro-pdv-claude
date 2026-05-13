"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { Monitor, Check, Zap, Wrench, LayoutGrid, MessageCircle, FileText, ExternalLink, Store } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/configuracoes-v3/lib/utils";
import { ConfigEmpresaProvider } from "@/lib/config-empresa";
import { LojaAtivaProvider, useLojaAtiva } from "@/lib/loja-ativa";
import { StoreSettingsProvider, useStoreSettings } from "@/lib/store-settings-provider";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { notifyPdvMainLayoutChanged, writePdvClassicLayout } from "@/lib/pdv-classic-layout";
import { nomeFantasiaOuFallbackUnidade } from "@/lib/store-display-name";
import {
  readOmnigestaoPdvModoPreferencia,
  writeOmnigestaoPdvModoPreferencia,
} from "@/lib/omnigestao-pdv-modo";

/** Mesma chave que `vendas-pdv.tsx` / `configuracoes-sistema.tsx` (layout classic vs supermercado no navegador). */
const PDV_LAYOUT_STORAGE_KEY = "@omnigestao:pdv-layout";

/** Chave opcional em `printerConfig` para preservar preferência visual do card selecionado no V3. */
const V3_PDV_SECTION_CARD_KEY = "v3PdvSectionCard";

type LayoutId = "classico" | "rapido" | "assistencia" | "supermercado";

interface PdvLayout {
  id: LayoutId;
  name: string;
  description: string;
  icon: React.ElementType;
}

/** Número fixo de opções de layout na UI (Clássico, Rápido, Assistência, Supermercado). */
export const PDV_LAYOUTS_COUNT = 4 as const;

const LAYOUTS: PdvLayout[] = [
  { id: "classico", name: "PDV Clássico", description: "Layout tradicional com grid de produtos e carrinho lateral.", icon: LayoutGrid },
  {
    id: "rapido",
    name: "PDV Rápido",
    description: "Mesmo motor Clássico com fluxo enxuto e atalhos; use /dashboard/vendas?modo=rapido ou o PDV aplicará a preferência salva.",
    icon: Zap,
  },
  {
    id: "assistencia",
    name: "PDV Assistência",
    description: "Foco em assistência técnica, venda de peças e atendimento no balcão.",
    icon: Wrench,
  },
  {
    id: "supermercado",
    name: "PDV Supermercado",
    description: "Tela dedicada com busca e fluxo orientado a variedades / alto giro no mesmo motor de vendas e caixa.",
    icon: Store,
  },
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

/** Resolve o card ativo a partir do LS de layout + preferência de modo rápido + settings remotos. */
function resolveActiveLayoutId(printerConfig: Record<string, unknown> | null): LayoutId {
  const localMain = readLocalPdvMain();
  if (localMain === "supermercado") return "supermercado";
  const modo = readOmnigestaoPdvModoPreferencia();
  if (modo === "rapido") return "rapido";
  const pdvParamsRaw = printerConfig?.pdvParams;
  const pdvParams =
    pdvParamsRaw && typeof pdvParamsRaw === "object" ? (pdvParamsRaw as Record<string, unknown>) : null;
  if (pdvParams?.pdvClassicLayout === "services") return "assistencia";
  const card = printerConfig?.[V3_PDV_SECTION_CARD_KEY];
  if (card === "assistencia" || card === "ia") return "assistencia";
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
    const id = resolveActiveLayoutId(base);
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
      const classicLayoutKind: "services" | "lovable" =
        draftLayout === "assistencia" ? "services" : "lovable";
      const nextPdvParams = {
        ...pdvParams,
        ...(draftLayout === "rapido" || draftLayout === "supermercado"
          ? {}
          : { pdvClassicLayout: classicLayoutKind }),
      };

      const nextPrinter: Record<string, unknown> = {
        ...base,
        pdvParams: nextPdvParams,
      };

      if (draftLayout === "assistencia") nextPrinter[V3_PDV_SECTION_CARD_KEY] = "assistencia";
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
          if (draftLayout === "supermercado") {
            localStorage.setItem(PDV_LAYOUT_STORAGE_KEY, "supermercado");
            writeOmnigestaoPdvModoPreferencia("normal");
          } else if (draftLayout === "rapido") {
            localStorage.setItem(PDV_LAYOUT_STORAGE_KEY, "classic");
            writePdvClassicLayout("lovable");
            writeOmnigestaoPdvModoPreferencia("rapido");
          } else {
            localStorage.setItem(PDV_LAYOUT_STORAGE_KEY, "classic");
            writePdvClassicLayout(draftLayout === "assistencia" ? "services" : "lovable");
            writeOmnigestaoPdvModoPreferencia("normal");
          }
          notifyPdvMainLayoutChanged();
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

      <p
        className="rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 text-center text-sm font-semibold tracking-tight text-destructive"
        data-debug-pdv-config="v4"
      >
        DEBUG PDV CONFIG v4 - commit e14cfaa
      </p>

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
          <h2 className="text-base font-semibold text-foreground">Layouts do PDV</h2>
          <p className="text-sm font-normal text-muted-foreground">
            Escolha o estilo principal do ponto de venda. A alteração vale para este navegador e é gravada na unidade ativa.
          </p>
        </div>

        <div
          className="grid min-w-0 gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          data-pdv-layout-cards={String(LAYOUTS.length)}
        >
          {LAYOUTS.map((opt) => {
            const active = draftLayout === opt.id;
            const Icon = opt.icon;
            return (
              <div
                key={opt.id}
                className={cn(
                  "relative flex min-h-[17rem] min-w-0 flex-col gap-6 rounded-xl border bg-card p-6 shadow-soft transition-all",
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

                <div className="flex w-full">
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    variant={active ? "secondary" : "default"}
                    disabled={active || controlsDisabled}
                    onClick={() => {
                      setDraftLayout(opt.id);
                    }}
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

      {/* Fluxos integrados — informativos */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">Outros fluxos de venda</h2>
          <p className="text-sm font-normal text-muted-foreground">
            Integrações que compartilham o motor de vendas, caixa e histórico, sem substituir o layout principal acima.
          </p>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {/* PDV WhatsApp */}
          <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-foreground">PDV WhatsApp</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-info/30 bg-info/5 text-info">
                    Integrado
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Registra vendas via comando de voz / texto no WhatsApp HUB. Integrado ao motor central de
                  vendas e ao caixa.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3 space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Persiste no banco</span>
                <Check className="h-3.5 w-3.5 text-success" />
              </div>
              <div className="flex items-center justify-between">
                <span>Abre caixa automático</span>
                <Check className="h-3.5 w-3.5 text-success" />
              </div>
              <div className="flex items-center justify-between">
                <span>Histórico de vendas</span>
                <Check className="h-3.5 w-3.5 text-success" />
              </div>
              <div className="flex items-center justify-between">
                <span>Layout selecionável</span>
                <span className="text-muted-foreground/60">Não aplicável</span>
              </div>
            </div>
            <a
              href="/dashboard/whatsapp"
              className="text-[11px] text-primary underline-offset-2 hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Acessar WhatsApp HUB
            </a>
          </div>

          {/* OS → Venda */}
          <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-foreground">OS → Venda</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning/30 bg-warning/5 text-warning">
                    Fluxo próprio
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Faturamento de Ordens de Serviço gera venda diretamente no banco (via Operações HUB).
                  Não usa sessão de caixa — é um fluxo de cobrança separado.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3 space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Persiste no banco</span>
                <Check className="h-3.5 w-3.5 text-success" />
              </div>
              <div className="flex items-center justify-between">
                <span>Histórico de vendas</span>
                <Check className="h-3.5 w-3.5 text-success" />
              </div>
              <div className="flex items-center justify-between">
                <span>Sessão de caixa</span>
                <span className="text-muted-foreground/60">Não aplicável</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Cancelamento PDV</span>
                <span className="text-muted-foreground/60">Via OS HUB</span>
              </div>
            </div>
            <a
              href="/dashboard/operacoes-v2"
              className="text-[11px] text-primary underline-offset-2 hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Acessar Operações HUB
            </a>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground pt-2 border-t border-border/60">
        Layouts disponíveis: {PDV_LAYOUTS_COUNT}
      </p>
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
