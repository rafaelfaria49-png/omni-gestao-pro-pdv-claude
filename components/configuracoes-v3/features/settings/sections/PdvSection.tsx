"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { SectionHeader } from "../components/SectionHeader";
import { Monitor, Check, Zap, Wrench, LayoutGrid, MessageCircle, FileText, ExternalLink, Store, Info, Cpu, Eye } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/configuracoes-v3/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/configuracoes-v3/components/ui/dialog";
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

type PdvFlowId = "classico" | "assistencia" | "supermercado" | "next";

type ClassicModoInicial = "normal" | "rapido";

type PreviewVariant = PdvFlowId;

interface PdvFlowOption {
  id: PdvFlowId;
  name: string;
  description: string;
  whenToUse: string;
  icon: React.ElementType;
}

/** Quatro fluxos oficiais na UI. */
export const PDV_LAYOUTS_COUNT = 4 as const;

const FLOWS: PdvFlowOption[] = [
  {
    id: "classico",
    name: "PDV Clássico / Omni Classic",
    description:
      "Shell principal de vendas (grade, bipe, atalhos). Inclui modo balcão, modo rápido e venda completa no mesmo fluxo — não são PDVs separados.",
    whenToUse:
      "Use no balcão do dia a dia: grade de produtos, leitor de código de barras, busca por nome/SKU e total sempre à vista. É o fluxo padrão recomendado para a maioria das lojas.",
    icon: LayoutGrid,
  },
  {
    id: "assistencia",
    name: "PDV Assistência",
    description: "Fluxo especializado para assistência técnica, peças e atendimento.",
    whenToUse:
      "Use quando o atendimento gira em torno de ordens de serviço: identificar o cliente, registrar o aparelho e o defeito e montar o orçamento antes de fechar a venda.",
    icon: Wrench,
  },
  {
    id: "supermercado",
    name: "PDV Supermercado",
    description: "Fluxo de alto giro com visão em tabela e painel lateral.",
    whenToUse:
      "Use em operações de alto giro com fila no caixa: itens grandes, totais sempre visíveis e teclado numérico em destaque para máxima velocidade de bipe.",
    icon: Store,
  },
  {
    id: "next",
    name: "PDV Next / Black Edition",
    description:
      "Caixa premium com design monocromático escuro, barra operacional completa e atalhos rápidos F1–F9 para máxima eficiência.",
    whenToUse:
      "Use para uma experiência de caixa moderna e de alta performance, com design escuro sempre ativo e painel operacional completo no mesmo ecrã.",
    icon: Cpu,
  },
];

const PDV_CARD_TEST_ID: Record<PdvFlowId, string> = {
  classico: "pdv-classic",
  assistencia: "pdv-assistencia",
  supermercado: "pdv-supermercado",
  next: "pdv-black-edition",
};

function readLocalPdvMain(): "classic" | "supermercado" | "next" {
  if (typeof window === "undefined") return "classic";
  try {
    const raw = String(localStorage.getItem(PDV_LAYOUT_STORAGE_KEY) || "").trim();
    if (raw === "supermercado" || raw === "classic" || raw === "next") return raw;
  } catch {
    /* ignore */
  }
  return "classic";
}

function isOfficialFlowCard(v: unknown): v is PdvFlowId {
  return v === "classico" || v === "assistencia" || v === "supermercado" || v === "next";
}

function resolveFlowFromPrinterConfig(printerConfig: Record<string, unknown> | null): PdvFlowId {
  const rawCard = printerConfig?.[V3_PDV_SECTION_CARD_KEY];
  if (rawCard === "ia") return "assistencia";
  if (rawCard === "rapido") return "classico";
  if (isOfficialFlowCard(rawCard)) return rawCard;

  if (readLocalPdvMain() === "supermercado") return "supermercado";
  if (readLocalPdvMain() === "next") return "next";

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

/**
 * Mini-preview do layout do PDV usando as capturas de tela reais armazenadas no repositório.
 * Seleciona a imagem dinamicamente de acordo com o tema selecionado na barra superior.
 */
function PdvMiniPreview({ variant, activeTheme }: { variant: PdvFlowId; activeTheme?: string }) {
  const { mode } = useTheme();
  const themeMode = activeTheme || (mode === "classic" ? "light" : mode); // "light" | "soft-ice" | "midnight" | "black"

  const flowPrefixMap: Record<PdvFlowId, string> = {
    classico: "classic",
    assistencia: "assistencia",
    supermercado: "supermercado",
    next: "next",
  };

  const srcMap: Record<PdvFlowId, string> = {
    classico: "/images/pdv-classic-thumb.png",
    assistencia: "/images/pdv-assistencia-thumb.png",
    supermercado: "/images/pdv-supermercado-thumb.png",
    next: "/images/pdv-next-thumb.png",
  };

  const prefix = flowPrefixMap[variant];
  let dynamicSrc = `/images/pdv-${prefix}-${themeMode}.png`;

  if (variant === "next") {
    dynamicSrc = `/images/pdv-next/${themeMode}.png`;
  }

  return (
    <div className="relative h-full w-full bg-muted">
      <img
        src={dynamicSrc}
        alt={`Preview ${variant}`}
        className="h-full w-full object-cover object-top transition-all duration-300"
        onError={(e) => {
          // Fallback resiliente: se a imagem do tema não existir, usa a de preview legado do repositório
          const fallback = srcMap[variant];
          const currentUrl = e.currentTarget.src;
          const fallbackAbsolute = window.location.origin + fallback;
          if (currentUrl !== fallbackAbsolute) {
            e.currentTarget.src = fallback;
          } else {
            e.currentTarget.style.display = "none";
          }
        }}
      />
    </div>
  );
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
  const [previewFlow, setPreviewFlow] = useState<PreviewVariant | null>(null);

  const { mode } = useTheme();
  const themeMode = mode === "classic" ? "light" : mode;
  const [nextCardTheme, setNextCardTheme] = useState<string>("black");
  const [modalActiveTheme, setModalActiveTheme] = useState<string>("black");

  useEffect(() => {
    if (themeMode === "light" || themeMode === "soft-ice" || themeMode === "midnight" || themeMode === "black") {
      setNextCardTheme(themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    if (previewFlow === "next") {
      setModalActiveTheme(nextCardTheme || themeMode);
    }
  }, [previewFlow, nextCardTheme, themeMode]);

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
          } else if (draftFlow === "next") {
            localStorage.setItem(PDV_LAYOUT_STORAGE_KEY, "next");
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

  const previewMeta =
    previewFlow === null
      ? undefined
      : FLOWS.find((f) => f.id === previewFlow);
  const PreviewIcon = previewMeta?.icon ?? Monitor;
  const previewIsActiveFlow = previewMeta !== undefined && previewMeta.id === draftFlow;

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
        <div className="mb-6 min-w-0">
          <h2 className="text-lg font-bold text-foreground tracking-tight">Escolha o Layout do PDV</h2>
          <p className="text-sm text-muted-foreground">
            Selecione o fluxo ideal para sua operação. As alterações afeta        <div
          className="grid w-full min-w-0 auto-rows-fr gap-6 grid-cols-1 lg:grid-cols-2"
          data-pdv-layout-cards={String(FLOWS.length)}
        >
          {FLOWS.map((opt) => {
            const active = draftFlow === opt.id;
            const Icon = opt.icon;
            const selectCard = () => {
              if (!controlsDisabled) setDraftFlow(opt.id);
            };
            const openPdvUrl = opt.id === "next" ? "/dashboard/pdv-next" : "/dashboard/vendas";
            return (
              <div
                key={opt.id}
                data-testid={PDV_CARD_TEST_ID[opt.id]}
                role="button"
                tabIndex={controlsDisabled ? -1 : 0}
                aria-pressed={active}
                aria-label={`Selecionar ${opt.name}`}
                onClick={selectCard}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectCard();
                  }
                }}
                className={cn(
                  "group relative flex h-full w-full min-w-0 max-w-none flex-col rounded-2xl p-5 outline-none transition-all duration-300",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  controlsDisabled ? "cursor-default" : "cursor-pointer",
                  active
                    ? "bg-primary/5 ring-2 ring-primary shadow-lg dark:bg-primary/10"
                    : "bg-card ring-1 ring-slate-900/5 shadow-sm hover:ring-primary/45 hover:shadow-xl dark:ring-white/10"
                )}
              >
                <div className="relative mb-5 aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-muted transition-transform duration-500 group-hover:scale-[1.01] shadow-inner">
                  <PdvMiniPreview variant={opt.id} activeTheme={opt.id === "next" ? nextCardTheme : undefined} />
                  
                  {opt.id === "next" && (
                    <>
                      <div className="absolute top-3 left-3 z-10">
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 shadow-sm">
                          Prévia Real
                        </Badge>
                      </div>
                      <div className="absolute bottom-3 right-3 z-10 flex gap-1.5 bg-black/60 backdrop-blur-sm p-1.5 rounded-full border border-white/15 shadow-md">
                        {[
                          { key: "light", color: "bg-white border-slate-350", label: "Light" },
                          { key: "soft-ice", color: "bg-[#e2eafc] border-[#b6ccfe]", label: "Soft Ice" },
                          { key: "midnight", color: "bg-[#1e293b] border-blue-900", label: "Midnight" },
                          { key: "black", color: "bg-black border-emerald-500", label: "Black" }
                        ].map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            title={`Visualizar tema ${t.label}`}
                            className={cn(
                              "h-4 w-4 rounded-full border transition-all duration-200 hover:scale-125",
                              t.color,
                              nextCardTheme === t.key ? "ring-2 ring-emerald-400 scale-110" : "opacity-80"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setNextCardTheme(t.key);
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10" />
                </div>

                <div className="relative mb-5 flex items-start gap-4">
                  <div className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors shadow-sm",
                    active ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
                  )}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0 pr-16">
                    <h4 title={opt.name} className="text-base font-bold leading-tight tracking-tight text-foreground">{opt.name}</h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">{opt.description}</p>
                  </div>
                  {active && (
                    <div className="absolute right-0 top-0">
                      <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider text-primary shadow-sm">
                        <Check className="h-3 w-3" />
                        Ativo
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-3 border-t border-border/50 flex w-full items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9 font-medium text-xs border-border/80"
                    title={`Visualizar ${opt.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewFlow(opt.id);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Visualizar
                  </Button>

                  <a
                    href={openPdvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "inline-flex items-center justify-center h-9 px-3 text-xs font-semibold rounded-md transition-all duration-200 border border-border/80 hover:bg-muted text-foreground flex-1"
                    )}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    Abrir PDV
                  </a>

                  {active ? (
                    <div className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 px-3 text-xs font-bold shadow-sm dark:bg-emerald-500/20 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      Selecionado
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="flex-1 h-9 font-bold text-xs transition-all duration-200 hover:scale-[1.01]"
                      disabled={controlsDisabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDraftFlow(opt.id);
                      }}
                    >
                      Usar layout
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

        </div>

        <Dialog open={previewFlow !== null} onOpenChange={(open) => { if (!open) setPreviewFlow(null); }}>
          <DialogContent className={cn("transition-all duration-300", previewFlow === "next" ? "max-w-4xl w-full" : "max-w-2xl")}>
            {previewMeta && (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-3 pr-6 text-left">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        previewMeta.id === "next" ? "bg-[#000000] text-emerald-400" : "bg-accent text-accent-foreground"
                      )}
                    >
                      <PreviewIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <DialogTitle>{previewMeta.name}</DialogTitle>
                        {previewMeta.id === "next" && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] uppercase font-bold tracking-wide">
                            Black Edition — Multi-Temas Reais
                          </Badge>
                        )}
                      </div>
                      <DialogDescription className="mt-1">{previewMeta.description}</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                {previewMeta.id === "next" ? (
                  <div className="space-y-4">
                    {/* Seletor de Temas (Abas) */}
                    <div className="flex flex-wrap gap-1.5 p-1 bg-muted rounded-lg border border-border/60">
                      {[
                        { key: "light", label: "Light Mode", desc: "Claro corporativo limpo" },
                        { key: "soft-ice", label: "Soft Ice Mode", desc: "Tom azul gelo suave" },
                        { key: "midnight", label: "Midnight Mode", desc: "Azul escuro moderno" },
                        { key: "black", label: "Black Mode", desc: "Modo escuro oficial premium" }
                      ].map((t) => {
                        const isSelected = modalActiveTheme === t.key;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => setModalActiveTheme(t.key)}
                            className={cn(
                              "flex-1 min-w-[120px] px-3 py-2 text-xs font-semibold rounded-md transition-all duration-200 text-center flex flex-col items-center justify-center gap-0.5",
                              isSelected 
                                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
                            )}
                          >
                            <span>{t.label}</span>
                            <span className="text-[9px] font-normal opacity-70">{t.desc}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Imagem Ampliada */}
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-inner">
                      <img
                        src={`/images/pdv-next/${modalActiveTheme}.png`}
                        alt={`PDV Next Tema ${modalActiveTheme}`}
                        className="h-full w-full object-contain transition-all duration-300"
                        onError={(e) => {
                          e.currentTarget.src = "/images/pdv-next-thumb.png";
                        }}
                      />
                      
                      {/* Overlay indicando qual tema está sendo visualizado */}
                      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded text-[10px] text-white font-medium border border-white/10 uppercase tracking-wider">
                        Visualizando: {modalActiveTheme.replace("-", " ")}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/50 bg-muted">
                    <PdvMiniPreview variant={previewMeta.id} />
                  </div>
                )}

                <div className="rounded-lg border border-border bg-card-muted/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quando usar</p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground">{previewMeta.whenToUse}</p>
                </div>

                <DialogFooter>
                  {previewIsActiveFlow ? (
                    <div className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                      <Check className="h-4 w-4" />
                      Layout ativo
                    </div>
                  ) : (
                    <Button
                      type="button"
                      disabled={controlsDisabled}
                      onClick={() => {
                        if (isOfficialFlowCard(previewMeta.id)) setDraftFlow(previewMeta.id);
                        setPreviewFlow(null);
                      }}
                    >
                      Usar layout
                    </Button>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

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

        <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-card-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <span>
            Lembre-se de recarregar a tela do PDV após salvar para aplicar as novas configurações.
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving || noLoja || !dirty}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={controlsDisabled || !dirty}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
        </div>

      {/* Fluxos integrados — compactos */}
      <div className="pt-4 border-t border-border/60">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Outros fluxos de venda integrados</h3>
          <p className="text-xs text-muted-foreground">
            Integrações auxiliares que compartilham o mesmo caixa e motor central.
          </p>
        </div>

        <div className="grid min-w-0 gap-4 grid-cols-1 sm:grid-cols-2">
          {/* PDV WhatsApp */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <span>PDV WhatsApp</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-info/30 bg-info/5 text-info uppercase font-bold tracking-wide">
                    WhatsApp HUB
                  </Badge>
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px] md:max-w-xs">Registra vendas por voz/texto no WhatsApp.</p>
              </div>
            </div>
            <a
              href="/dashboard/whatsapp"
              className="shrink-0 text-xs font-semibold text-primary underline-offset-4 hover:underline flex items-center gap-1 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Acessar
            </a>
          </div>

          {/* OS → Venda */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <span>OS → Venda</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-warning/30 bg-warning/5 text-warning uppercase font-bold tracking-wide">
                    Ordens de Serviço
                  </Badge>
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px] md:max-w-xs">Faturamento direto via Operações HUB.</p>
              </div>
            </div>
            <a
              href="/dashboard/operacoes-v2"
              className="shrink-0 text-xs font-semibold text-primary underline-offset-4 hover:underline flex items-center gap-1 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Acessar
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
