"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { Monitor, Check, Zap, Wrench, LayoutGrid, MessageCircle, FileText, ExternalLink, Store, Info } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/configuracoes-v3/components/ui/radio-group";
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

/** Mesma chave que `vendas-pdv.tsx` — layout principal no browser: `classic` | `supermercado`. */
const PDV_LAYOUT_STORAGE_KEY = "@omnigestao:pdv-layout";

/**
 * Espelho em `printerConfig` só para compatibilidade com a UI V3 / relatórios.
 * Valores oficiais gravados: `classico` | `assistencia` | `supermercado`.
 * Legado lido: `rapido` (tratado como Classic + modo rápido), `ia` → assistência.
 * O runtime do PDV em `/dashboard/vendas` usa `@omnigestao:pdv-layout`, `omni-pdv-classic-layout` e `omnigestao-pdv-modo`, não este campo isoladamente.
 */
const V3_PDV_SECTION_CARD_KEY = "v3PdvSectionCard";

/**
 * Espelho V3 do modo inicial no PDV Clássico/Omni (`normal` | `rapido`).
 * Runtime: `omnigestao-pdv-modo` + URL `?modo=rapido` quando aplicável.
 */
const V3_PDV_CLASSIC_MODO_KEY = "v3PdvClassicModoInicial";

type PdvFlowId = "classico" | "assistencia" | "supermercado";

type ClassicModoInicial = "normal" | "rapido";

interface PdvFlowOption {
  id: PdvFlowId;
  name: string;
  description: string;
  icon: React.ElementType;
}

/** Três fluxos oficiais na UI (Classic/Omni, Assistência, Supermercado). Modo rápido e venda completa são internos ao Classic. */
export const PDV_LAYOUTS_COUNT = 3 as const;

const FLOWS: PdvFlowOption[] = [
  {
    id: "classico",
    name: "PDV Clássico / Omni Classic",
    description:
      "Shell principal de vendas (grade, bipe, atalhos). Inclui modo balcão, modo rápido e venda completa no mesmo fluxo — não são PDVs separados.",
    icon: LayoutGrid,
  },
  {
    id: "assistencia",
    name: "PDV Assistência",
    description: "Fluxo especializado para assistência técnica, peças e atendimento.",
    icon: Wrench,
  },
  {
    id: "supermercado",
    name: "PDV Supermercado",
    description: "Fluxo de alto giro com visão em tabela e painel lateral.",
    icon: Store,
  },
];

/**
 * Motor real (rota `/dashboard/vendas`):
 * - Classic/Omni: `PdvClassic` → `PdvOmniClassicShell` com `pdvClassicLayout=lovable`; modo rápido = `isModoRapido` + LS `omnigestao-pdv-modo` (+ query `?modo=rapido`).
 * - Assistência: `PdvClassic` → `PdvAssistenciaEnterprise` (`pdvClassicLayout=services`).
 * - Supermercado: `PdvSupermercado` quando `@omnigestao:pdv-layout=supermercado` (e heurísticas em `vendas-pdv.tsx`).
 */

const PDV_CARD_TEST_ID: Record<PdvFlowId, string> = {
  classico: "pdv-classic",
  assistencia: "pdv-assistencia",
  supermercado: "pdv-supermercado",
};

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

function isOfficialFlowCard(v: unknown): v is PdvFlowId {
  return v === "classico" || v === "assistencia" || v === "supermercado";
}

function resolveFlowFromPrinterConfig(printerConfig: Record<string, unknown> | null): PdvFlowId {
  const rawCard = printerConfig?.[V3_PDV_SECTION_CARD_KEY];
  if (rawCard === "ia") return "assistencia";
  if (rawCard === "rapido") return "classico";
  if (isOfficialFlowCard(rawCard)) return rawCard;

  if (readLocalPdvMain() === "supermercado") return "supermercado";

  const pdvParamsRaw = printerConfig?.pdvParams;
  const pdvParams =
    pdvParamsRaw && typeof pdvParamsRaw === "object" ? (pdvParamsRaw as Record<string, unknown>) : null;
  if (pdvParams?.pdvClassicLayout === "services") return "assistencia";

  return "classico";
}

function resolveClassicModoInicial(printerConfig: Record<string, unknown> | null, flow: PdvFlowId): ClassicModoInicial {
  if (flow !== "classico") return "normal";

  const rawCard = printerConfig?.[V3_PDV_SECTION_CARD_KEY];
  if (rawCard === "rapido") return "rapido";

  const mirror = printerConfig?.[V3_PDV_CLASSIC_MODO_KEY];
  if (mirror === "rapido" || mirror === "normal") return mirror;

  return readOmnigestaoPdvModoPreferencia() === "rapido" ? "rapido" : "normal";
}

function safePrinterRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
}

function PdvSectionContent() {
  const { toast } = useToast();
  const { lojaAtivaId, lojaAtivaRaw } = useLojaAtiva();
  const { hydrated, settings, pdvParams, refresh, storeId } = useStoreSettings();

  const [remotePrinterConfig, setRemotePrinterConfig] = useState<Record<string, unknown>>({});
  const [draftFlow, setDraftFlow] = useState<PdvFlowId>("classico");
  const [savedFlow, setSavedFlow] = useState<PdvFlowId>("classico");
  const [draftClassicModo, setDraftClassicModo] = useState<ClassicModoInicial>("normal");
  const [savedClassicModo, setSavedClassicModo] = useState<ClassicModoInicial>("normal");
  const [saving, setSaving] = useState(false);

  const syncFromServer = useCallback(() => {
    const base = safePrinterRecord(settings?.printerConfig);
    setRemotePrinterConfig(base);
    const flow = resolveFlowFromPrinterConfig(base);
    const modo = resolveClassicModoInicial(base, flow);
    setDraftFlow(flow);
    setSavedFlow(flow);
    setDraftClassicModo(modo);
    setSavedClassicModo(modo);
  }, [settings?.printerConfig]);

  useEffect(() => {
    if (!hydrated) return;
    syncFromServer();
  }, [hydrated, syncFromServer, storeId]);

  const dirty = useMemo(() => {
    if (draftFlow !== savedFlow) return true;
    if (draftFlow === "classico" && draftClassicModo !== savedClassicModo) return true;
    return false;
  }, [draftFlow, savedFlow, draftClassicModo, savedClassicModo]);

  const noLoja = !lojaAtivaId?.trim();
  const busy = !hydrated || saving;
  const lojaNome =
    lojaAtivaId && lojaAtivaRaw
      ? nomeFantasiaOuFallbackUnidade(lojaAtivaId, lojaAtivaRaw.nomeFantasia)
      : "";

  const handleCancel = () => {
    setDraftFlow(savedFlow);
    setDraftClassicModo(savedClassicModo);
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
        draftFlow === "assistencia" ? "services" : "lovable";
      const nextPdvParams = {
        ...pdvParams,
        pdvClassicLayout: classicLayoutKind,
      };

      const mirrorModo: ClassicModoInicial = draftFlow === "classico" ? draftClassicModo : "normal";

      const nextPrinter: Record<string, unknown> = {
        ...base,
        pdvParams: nextPdvParams,
        [V3_PDV_SECTION_CARD_KEY]: draftFlow,
        [V3_PDV_CLASSIC_MODO_KEY]: mirrorModo,
      };

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
          if (draftFlow === "supermercado") {
            localStorage.setItem(PDV_LAYOUT_STORAGE_KEY, "supermercado");
            writeOmnigestaoPdvModoPreferencia("normal");
          } else {
            localStorage.setItem(PDV_LAYOUT_STORAGE_KEY, "classic");
            writePdvClassicLayout(draftFlow === "assistencia" ? "services" : "lovable");
            writeOmnigestaoPdvModoPreferencia(draftFlow === "classico" && draftClassicModo === "rapido" ? "rapido" : "normal");
          }
          notifyPdvMainLayoutChanged();
        }
      } catch {
        /* ignore */
      }

      setRemotePrinterConfig(nextPrinter);
      setSavedFlow(draftFlow);
      setSavedClassicModo(draftFlow === "classico" ? draftClassicModo : "normal");
      await refresh();
      toast({
        title: "PDV atualizado",
        description: "Preferências gravadas para a unidade ativa. Recarregue o PDV se já estiver aberto.",
      });
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
        title="Layout e modo do PDV"
        description="Escolha o fluxo principal de venda e, no Clássico/Omni, se o caixa inicia em modo normal ou rápido. Configurável por unidade."
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
            As alterações valem para a unidade ativa. Salve para gravar no servidor e no navegador deste aparelho
            (`@omnigestao:pdv-layout`, `omni-pdv-classic-layout`, `omnigestao-pdv-modo`).
          </p>
        </div>
      </div>

      <div className="min-w-0 w-full overflow-visible">
        <div className="mb-4 min-w-0">
          <h2 className="text-base font-semibold text-foreground">Fluxos principais</h2>
          <p className="text-sm font-normal text-muted-foreground">
            O PDV Clássico é um único fluxo: modo balcão, modo rápido e venda completa coexistem no mesmo ecrã. Assistência e Supermercado trocam o layout raiz em `/dashboard/vendas`.
          </p>
        </div>

        <div
          className="grid w-full min-w-0 auto-rows-fr gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          data-pdv-layout-cards={String(FLOWS.length)}
        >
          {FLOWS.map((opt) => {
            const active = draftFlow === opt.id;
            const Icon = opt.icon;
            return (
              <div
                key={opt.id}
                data-testid={PDV_CARD_TEST_ID[opt.id]}
                className={cn(
                  "relative flex min-h-[17rem] w-full min-w-0 max-w-none flex-col gap-6 rounded-xl border bg-card p-6 shadow-soft transition-all",
                  active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40 hover:shadow-card",
                )}
              >
                {active && (
                  <div className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
                    <Check className="h-4 w-4" />
                  </div>
                )}

                <div className="rounded-lg border border-border bg-surface">
                  <div className="flex min-h-32 h-auto">
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
                      setDraftFlow(opt.id);
                    }}
                  >
                    {active ? "Selecionado" : "Selecionar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {draftFlow === "classico" ? (
          <div
            className="mt-6 rounded-xl border border-border bg-card p-5 shadow-soft"
            data-testid="pdv-classic-modo-inicial"
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Zap className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Modo inicial no PDV Clássico</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O modo rápido não é um PDV separado: apenas define se o caixa abre já em fluxo enxuto (`omnigestao-pdv-modo` e
                  `?modo=rapido` quando o browser redireciona). Venda completa continua a ser escolhida dentro do próprio
                  ecrã de venda.
                </p>
              </div>
            </div>
            <Label className="text-sm font-medium text-foreground">Ao abrir /dashboard/vendas</Label>
            <RadioGroup
              className="mt-2 gap-3"
              value={draftClassicModo}
              onValueChange={(v) => {
                if (v === "normal" || v === "rapido") setDraftClassicModo(v);
              }}
              disabled={controlsDisabled}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="normal" id="pdv-modo-normal" />
                <Label htmlFor="pdv-modo-normal" className="cursor-pointer font-normal">
                  Normal (modo balcão / completo no ecrã)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="rapido" id="pdv-modo-rapido" />
                <Label htmlFor="pdv-modo-rapido" className="cursor-pointer font-normal">
                  Rápido por padrão (foco em bipe e fluxo enxuto)
                </Label>
              </div>
            </RadioGroup>
          </div>
        ) : null}

        <p className="mt-6 flex gap-2 rounded-lg border border-border bg-card-muted/80 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden />
          <span>
            Após salvar alterações do PDV, recarregue a tela do PDV para garantir que o novo modo/layout seja aplicado.
          </span>
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving || noLoja || !dirty}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={controlsDisabled || !dirty}>
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
