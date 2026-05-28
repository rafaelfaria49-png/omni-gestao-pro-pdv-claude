"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Monitor, Check, Zap, Wrench, LayoutGrid, MessageCircle, FileText, ExternalLink, Store, Info, Cpu, Eye, ArrowLeft } from "lucide-react";
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
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { notifyPdvMainLayoutChanged, writePdvClassicLayout } from "@/lib/pdv-classic-layout";
import { readPdvMainLayout, writePdvMainLayout } from "@/lib/pdv-layout-storage";
import { nomeFantasiaOuFallbackUnidade } from "@/lib/store-display-name";
import { UnidadeAtivaRequiredBanner } from "../components/UnidadeAtivaRequiredBanner";
import { ImpressaoPdvSettingsCard } from "./ImpressaoPdvSettingsCard";
import {
  readOmnigestaoPdvModoPreferencia,
  writeOmnigestaoPdvModoPreferencia,
} from "@/lib/omnigestao-pdv-modo";
import { useConfiguracoesNav } from "@/components/configuracoes-v3/contexts/ConfiguracoesNavContext";
import { experimentalPdvEnabled } from "@/lib/feature-flags";

/** Layout principal por unidade — ver `lib/pdv-layout-storage.ts`. */

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
    name: "PDV Clássico",
    description: "Grade de produtos, leitor de código de barras, atalhos e totalizadores à vista.",
    whenToUse: "Ideal para atendimento de balcão rápido com alta variedade de itens.",
    icon: LayoutGrid,
  },
  {
    id: "assistencia",
    name: "PDV Assistência",
    description: "Fluxo focado em ordens de serviço, controle de peças e orçamentos integrados.",
    whenToUse: "Indicado para prestadores de serviços, oficinas e assistência técnica.",
    icon: Wrench,
  },
  {
    id: "supermercado",
    name: "PDV Rápido / Grade",
    description: "Caixa de alto giro no modelo de grade de produtos rápida com tabela de itens.",
    whenToUse: "Ideal para lojas de assistência, acessórios, variedades e faturamentos rápidos.",
    icon: Store,
  },
  {
    id: "next",
    name: "PDV Next",
    description: "Layout premium moderno com multi-temas (Light, Midnight, Black e Ice).",
    whenToUse: "Experiência premium de alta produtividade e performance visual.",
    icon: Cpu,
  },
];

const PDV_CARD_TEST_ID: Record<PdvFlowId, string> = {
  classico: "pdv-classic",
  assistencia: "pdv-assistencia",
  supermercado: "pdv-supermercado",
  next: "pdv-black-edition",
};

function readLocalPdvMain(storeId: string | null | undefined): "classic" | "supermercado" | "next" {
  const fromScoped = readPdvMainLayout(storeId)
  if (fromScoped) return fromScoped
  return "classic";
}

function isOfficialFlowCard(v: unknown): v is PdvFlowId {
  return v === "classico" || v === "assistencia" || v === "supermercado" || v === "next";
}

function resolveFlowFromPrinterConfig(
  printerConfig: Record<string, unknown> | null,
  storeId: string | null | undefined,
): PdvFlowId {
  const rawCard = printerConfig?.[V3_PDV_SECTION_CARD_KEY];
  if (rawCard === "ia") return "assistencia";
  if (rawCard === "rapido") return "classico";
  if (isOfficialFlowCard(rawCard)) return rawCard;

  if (readLocalPdvMain(storeId) === "supermercado") return "supermercado";
  if (readLocalPdvMain(storeId) === "next") return "next";

  const pdvParamsRaw = printerConfig?.pdvParams;
  const pdvParams =
    pdvParamsRaw && typeof pdvParamsRaw === "object" ? (pdvParamsRaw as Record<string, unknown>) : null;
  if (pdvParams?.pdvClassicLayout === "services") return "assistencia";

  return "classico";
}

function resolveClassicModoInicial(
  printerConfig: Record<string, unknown> | null,
  flow: PdvFlowId,
  storeId: string | null | undefined,
): ClassicModoInicial {
  if (flow !== "classico") return "normal";

  const rawCard = printerConfig?.[V3_PDV_SECTION_CARD_KEY];
  if (rawCard === "rapido") return "rapido";

  const mirror = printerConfig?.[V3_PDV_CLASSIC_MODO_KEY];
  if (mirror === "rapido" || mirror === "normal") return mirror;

  return readOmnigestaoPdvModoPreferencia(storeId) === "rapido" ? "rapido" : "normal";
}

function safePrinterRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
}

/**
 * Renderiza um mockup vetorial elegante representando a estrutura do PDV selecionado
 * como fallback premium no caso de falha de carregamento de imagem.
 */
function PdvSvgFallback({ variant }: { variant: PdvFlowId }) {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-zinc-950 p-4 font-sans text-white select-none">
      {/* Topbar simulada */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-[9px] font-bold tracking-wider text-zinc-400 uppercase">
            Omni PDV · {variant === "supermercado" ? "Grade" : variant}
          </span>
        </div>
        <div className="h-3 w-16 rounded bg-zinc-900" />
      </div>

      {/* Corpo principal */}
      <div className="grid flex-1 grid-cols-3 gap-2.5 pt-2.5 min-h-0">
        {/* Esquerda: Lista de itens ou Grade */}
        <div className="col-span-2 space-y-2 rounded border border-zinc-900 bg-zinc-900/20 p-2 overflow-hidden">
          {variant === "supermercado" || variant === "classico" ? (
            /* Mockup de Grid de Produtos ou Lista */
            <div className="grid grid-cols-3 gap-1.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded border border-zinc-800/80 bg-zinc-950 p-1 space-y-1">
                  <div className="aspect-[4/3] rounded bg-zinc-900/60" />
                  <div className="h-1.5 w-10/12 rounded bg-zinc-800" />
                  <div className="h-1.5 w-1/2 rounded bg-zinc-700" />
                </div>
              ))}
            </div>
          ) : variant === "assistencia" ? (
            /* Mockup de OS/Serviços */
            <div className="space-y-1.5">
              <div className="h-5 w-full rounded bg-zinc-900/60 flex items-center px-1.5 justify-between">
                <div className="h-1.5 w-20 rounded bg-zinc-800" />
                <div className="h-1.5 w-8 rounded bg-zinc-800" />
              </div>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-zinc-900/50">
                  <div className="h-1.5 w-24 rounded bg-zinc-850" />
                  <div className="h-1.5 w-10 rounded bg-zinc-850" />
                </div>
              ))}
            </div>
          ) : (
            /* Next: Premium Dashboard */
            <div className="space-y-2">
              <div className="h-6 rounded bg-zinc-900/60 flex items-center px-2">
                <div className="h-1.5 w-1/3 rounded bg-zinc-800" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-10 rounded bg-zinc-900 border border-zinc-800" />
                <div className="h-10 rounded bg-zinc-900 border border-zinc-800" />
              </div>
            </div>
          )}
        </div>

        {/* Direita: Totalizador e Pagamento */}
        <div className="flex flex-col justify-between rounded border border-zinc-900 bg-zinc-900/20 p-2 overflow-hidden">
          <div className="space-y-2">
            <div className="h-1.5 w-full rounded bg-zinc-800" />
            <div className="h-1.5 w-2/3 rounded bg-zinc-800" />
            <div className="pt-2 border-t border-zinc-900/60 space-y-1.5">
              <div className="flex justify-between">
                <div className="h-1 w-6 rounded bg-zinc-855" />
                <div className="h-1 w-8 rounded bg-zinc-855" />
              </div>
              <div className="flex justify-between">
                <div className="h-1.5 w-10 rounded bg-zinc-800" />
                <div className="h-1.5 w-12 rounded bg-zinc-855" />
              </div>
            </div>
          </div>
          {/* Botão de pagamento */}
          <div className="h-6 w-full rounded bg-emerald-600/90 flex items-center justify-center">
            <div className="h-1.5 w-10 rounded bg-white/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mini-preview do layout do PDV usando as capturas de tela reais armazenadas no repositório.
 * Seleciona a imagem dinamicamente de acordo com o tema selecionado na barra superior.
 * Inclui fallback vetorial resiliente se a imagem falhar ao carregar.
 */
function PdvMiniPreview({ variant, activeTheme }: { variant: PdvFlowId; activeTheme?: string }) {
  const { mode } = useTheme();
  const themeMode = activeTheme || (mode === "classic" ? "light" : mode); // "light" | "soft-ice" | "midnight" | "black"
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

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

  useEffect(() => {
    let src = `/images/pdv-${prefix}-${themeMode}.png`;
    if (variant === "next") {
      src = `/images/pdv-next/${themeMode}.png`;
    } else if (variant === "assistencia") {
      src = `/images/pdv-assistencia/${themeMode}.png`;
    }
    setImgSrc(src);
    setHasError(false);
  }, [variant, themeMode, prefix]);

  const handleImageError = () => {
    const fallback = srcMap[variant];
    if (imgSrc !== fallback) {
      setImgSrc(fallback);
    } else {
      setHasError(true);
    }
  };

  if (hasError || !imgSrc) {
    return <PdvSvgFallback variant={variant} />;
  }

  return (
    <div className="relative h-full w-full bg-muted">
      <img
        src={imgSrc}
        alt={`Preview ${variant}`}
        className="h-full w-full object-cover object-top transition-all duration-350"
        onError={handleImageError}
      />
    </div>
  );
}

function PdvSectionContent() {
  const { toast } = useToast();
  const { navigateToSection } = useConfiguracoesNav();
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
  const [assistenciaCardTheme, setAssistenciaCardTheme] = useState<string>("midnight");
  const [modalActiveTheme, setModalActiveTheme] = useState<string>("black");

  useEffect(() => {
    if (themeMode === "light" || themeMode === "soft-ice" || themeMode === "midnight" || themeMode === "black") {
      setNextCardTheme(themeMode);
      setAssistenciaCardTheme(themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    if (previewFlow === "next") {
      setModalActiveTheme(nextCardTheme || themeMode);
    } else if (previewFlow === "assistencia") {
      setModalActiveTheme(assistenciaCardTheme || themeMode);
    }
  }, [previewFlow, nextCardTheme, assistenciaCardTheme, themeMode]);

  const syncFromServer = useCallback(() => {
    const base = safePrinterRecord(settings?.printerConfig);
    setRemotePrinterConfig(base);
    const flow = resolveFlowFromPrinterConfig(base, lojaAtivaId);
    const modo = resolveClassicModoInicial(base, flow, lojaAtivaId);
    setDraftFlow(flow);
    setSavedFlow(flow);
    setDraftClassicModo(modo);
    setSavedClassicModo(modo);
  }, [lojaAtivaId, settings?.printerConfig]);

  useEffect(() => {
    if (!hydrated) return;
    syncFromServer();
  }, [hydrated, syncFromServer, storeId]);

  const dirty = useMemo(() => {
    if (draftFlow !== savedFlow) return true;
    if (draftFlow === "classico" && draftClassicModo !== savedClassicModo) return true;
    return false;
  }, [draftFlow, savedFlow, draftClassicModo, savedClassicModo]);

  const isLightTheme = useMemo(() => {
    if (!previewFlow) return false;
    if (previewFlow === "classico" || previewFlow === "supermercado") return true;
    return modalActiveTheme === "light" || modalActiveTheme === "soft-ice";
  }, [previewFlow, modalActiveTheme]);

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
        if (typeof window !== "undefined" && lojaHeader) {
          if (draftFlow === "supermercado") {
            writePdvMainLayout(lojaHeader, "supermercado");
            writeOmnigestaoPdvModoPreferencia("normal", lojaHeader);
          } else if (draftFlow === "next") {
            writePdvMainLayout(lojaHeader, "next");
            writeOmnigestaoPdvModoPreferencia("normal", lojaHeader);
          } else {
            writePdvMainLayout(lojaHeader, "classic");
            writePdvClassicLayout(draftFlow === "assistencia" ? "services" : "lovable", lojaHeader);
            writeOmnigestaoPdvModoPreferencia(
              draftFlow === "classico" && draftClassicModo === "rapido" ? "rapido" : "normal",
              lojaHeader,
            );
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
        description: "Preferências gravadas com sucesso.",
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

  // PDV Next é experimental (não persiste vendas): ocultar o card da galeria em
  // operação real. Liberado em dev via env NEXT_PUBLIC_OG_EXPERIMENTAL=1.
  const visibleFlows = experimentalPdvEnabled ? FLOWS : FLOWS.filter((f) => f.id !== "next");

  const previewMeta =
    previewFlow === null
      ? undefined
      : FLOWS.find((f) => f.id === previewFlow);
  const PreviewIcon = previewMeta?.icon ?? Monitor;
  const previewIsActiveFlow = previewMeta !== undefined && previewMeta.id === draftFlow;

  return (
    <div className="space-y-6">
      {/* Topbar de Navegação Premium */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-border/40 pb-5">
        <div className="space-y-1.5">
          <button
            onClick={() => navigateToSection("geral")}
            className="group inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Voltar para Configurações
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Fluxo e Layout do PDV</h1>
            {lojaNome && (
              <Badge variant="secondary" className="px-2 py-0.5 text-[10px] font-semibold bg-primary/5 text-primary border border-primary/10">
                {lojaNome}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Ações de Salvamento Elegantes no Topo */}
        {dirty && (
          <div className="flex items-center gap-2 animate-fade-in">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs h-8 font-medium px-3"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs h-8 font-semibold bg-foreground hover:bg-foreground/90 text-background"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        )}
      </div>

      {noLoja ? (
        <UnidadeAtivaRequiredBanner hint="Layout e modo do PDV são salvos por unidade neste navegador e na API." />
      ) : null}

      <div className="min-w-0 w-full overflow-visible">
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Salvar alterações</span> grava o fluxo na unidade.{" "}
          <span className="font-medium text-foreground">Visualizar</span> e os temas no card são prévia local — use
          &quot;Usar layout&quot; e salve para persistir.
        </p>
        {/* Grid 2x2 Premium */}
        <div
          className="grid w-full min-w-0 auto-rows-fr gap-6 grid-cols-1 lg:grid-cols-2"
          data-pdv-layout-cards={String(visibleFlows.length)}
        >
          {visibleFlows.map((opt) => {
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
                  "group relative flex flex-col rounded-2xl border p-5 transition-all duration-300 outline-none",
                  active
                    ? "border-primary bg-primary/[0.01] dark:bg-primary/[0.02] shadow-[0_0_24px_-6px_rgba(239,68,68,0.08)]"
                    : "border-border/60 bg-card hover:border-border hover:bg-accent/5 hover:shadow-soft cursor-pointer"
                )}
              >
                {/* Preview Dominante */}
                <div className="relative mb-5 aspect-video w-full overflow-hidden rounded-xl border border-border/40 bg-muted/20 transition-all duration-500 group-hover:scale-[1.005] group-hover:border-border/80 shadow-sm">
                  <PdvMiniPreview
                    variant={opt.id}
                    activeTheme={
                      opt.id === "next"
                        ? nextCardTheme
                        : opt.id === "assistencia"
                        ? assistenciaCardTheme
                        : undefined
                    }
                  />
                  
                  {(opt.id === "next" || opt.id === "assistencia") && (
                    <>
                      <div className="absolute top-3 left-3 z-10">
                        <Badge className="bg-emerald-500/90 text-white border-none text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 shadow-sm">
                          {opt.id === "next" ? "Multi-tema" : "Prévia real"}
                        </Badge>
                      </div>
                      <div className="absolute bottom-3 right-3 z-10 flex gap-1 bg-black/75 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-lg">
                        {[
                          { key: "light", color: "bg-white border-slate-300", label: "Light" },
                          { key: "soft-ice", color: "bg-[#e2eafc] border-[#b6ccfe]", label: "Soft Ice" },
                          { key: "midnight", color: "bg-[#1e293b] border-blue-900", label: "Midnight" },
                          { key: "black", color: "bg-black border-emerald-500", label: "Black" }
                        ].map((t) => {
                          const currentTheme = opt.id === "next" ? nextCardTheme : assistenciaCardTheme;
                          const setTheme = opt.id === "next" ? setNextCardTheme : setAssistenciaCardTheme;
                          return (
                            <button
                              key={t.key}
                              type="button"
                              title={`Visualizar tema ${t.label}`}
                              className={cn(
                                "h-3.5 w-3.5 rounded-full border transition-all duration-205 hover:scale-120",
                                t.color,
                                currentTheme === t.key ? "ring-1 ring-offset-1 ring-white scale-110" : "opacity-75 hover:opacity-100"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTheme(t.key);
                              }}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Textos Simplificados e Hierarquia Limpa */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold leading-none tracking-tight text-foreground flex items-center gap-2">
                      {opt.name}
                      {active && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/20">
                          Ativo
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-normal">{opt.description}</p>
                  </div>
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    active ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted/30 border-border/40 text-muted-foreground"
                  )}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                </div>

                {/* Ações do Card */}
                <div className="flex items-center gap-2 pt-3 border-t border-border/40 mt-auto">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground font-medium px-2.5"
                    title={`Visualizar ${opt.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewFlow(opt.id);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Visualizar
                  </Button>

                  <a
                    href={openPdvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center justify-center h-8 px-2.5 text-xs font-medium rounded-md border border-border/50 bg-background text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors ml-auto animate-fade-in"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Abrir PDV
                  </a>

                  {active ? (
                    <div className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-3 text-xs font-semibold dark:bg-emerald-500/20 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      Selecionado
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 font-semibold text-xs px-3 shadow-sm bg-foreground text-background hover:bg-foreground/90 transition-all duration-200"
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

        {/* Modal de Prévia Ampliada */}
        <Dialog open={previewFlow !== null} onOpenChange={(open) => { if (!open) setPreviewFlow(null); }}>
          <DialogContent className={cn("transition-all duration-300 flex flex-col p-0 overflow-hidden max-h-[calc(100vh-6rem)]", (previewFlow === "next" || previewFlow === "assistencia") ? "max-w-4xl w-full" : "max-w-2xl")}>
            {previewMeta && (
              <>
                {/* Cabeçalho Fixo */}
                <div className="px-6 pt-6 pb-4 border-b border-border/30">
                  <div className="flex items-start gap-3 pr-6 text-left">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        previewMeta.id === "next" ? "bg-[#000000] text-emerald-400" :
                        previewMeta.id === "assistencia" ? "bg-primary/10 text-primary border border-primary/20" :
                        "bg-accent text-accent-foreground"
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
                        {previewMeta.id === "assistencia" && (
                          <Badge className="bg-primary/20 text-primary border border-primary/30 text-[9px] uppercase font-bold tracking-wide">
                            Assistência Técnica — Multi-Temas Reais
                          </Badge>
                        )}
                      </div>
                      <DialogDescription className="mt-1">{previewMeta.description}</DialogDescription>
                    </div>
                  </div>
                </div>

                {/* Conteúdo com Scroll */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {(previewMeta.id === "next" || previewMeta.id === "assistencia") ? (
                    <div className="space-y-4">
                      {/* Seletor de Temas (Abas Sticky) */}
                      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md pb-2 pt-1">
                        <div className="flex flex-wrap gap-1.5 p-1 bg-muted rounded-lg border border-border/60 shadow-sm">
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
                      </div>

                      {/* Imagem Ampliada com moldura premium */}
                      <div className={cn(
                        "relative aspect-video w-full overflow-hidden rounded-xl border transition-all duration-300 p-2.5",
                        isLightTheme 
                          ? "border-slate-300 dark:border-zinc-700 bg-slate-100/70 shadow-md ring-1 ring-black/5"
                          : "border-zinc-850 bg-zinc-950 shadow-lg"
                      )}>
                        <div className="relative w-full h-full rounded-lg overflow-hidden border border-black/10 dark:border-white/5 bg-slate-200/50 dark:bg-zinc-900/50 shadow-[inset_0_2px_8px_rgba(0,0,0,0.08)]">
                          <img
                            src={
                              previewMeta.id === "next"
                                ? `/images/pdv-next/${modalActiveTheme}.png`
                                : `/images/pdv-assistencia/${modalActiveTheme}.png`
                            }
                            alt={`${previewMeta.name} Tema ${modalActiveTheme}`}
                            className="h-full w-full object-contain transition-all duration-300"
                            onError={(e) => {
                              const fallback =
                                previewMeta.id === "next"
                                  ? "/images/pdv-next-thumb.png"
                                  : "/images/pdv-assistencia-thumb.png";
                              e.currentTarget.src = fallback;
                            }}
                          />
                        </div>
                        
                        <div className="absolute bottom-5 left-5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] text-white font-medium border border-white/10 uppercase tracking-wider shadow-md">
                          Visualizando: {modalActiveTheme.replace("-", " ")}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Preview dos outros fluxos com moldura premium */
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-100/70 shadow-md ring-1 ring-black/5 p-2.5">
                      <div className="relative w-full h-full rounded-lg overflow-hidden border border-black/10 dark:border-white/5 bg-slate-200/50 dark:bg-zinc-900/50 shadow-[inset_0_2px_8px_rgba(0,0,0,0.08)]">
                        <PdvMiniPreview variant={previewMeta.id} />
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-card-muted/60 p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quando usar</p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground">{previewMeta.whenToUse}</p>
                  </div>
                </div>

                {/* Rodapé Sticky */}
                <div className="px-6 py-4 border-t border-border/30 bg-card/90 backdrop-blur-sm sticky bottom-0 z-10 flex justify-end">
                  {previewIsActiveFlow ? (
                    <div className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-4 text-xs font-semibold dark:bg-emerald-500/20 dark:text-emerald-400">
                      <Check className="h-4 w-4" />
                      Layout ativo
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="text-xs h-9 px-4 bg-foreground text-background hover:bg-foreground/90 font-semibold"
                      disabled={controlsDisabled}
                      onClick={() => {
                        if (isOfficialFlowCard(previewMeta.id)) setDraftFlow(previewMeta.id);
                        setPreviewFlow(null);
                      }}
                    >
                      Usar layout
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Modo Inicial do Caixa Clássico */}
        {draftFlow === "classico" ? (
          <div
            className="mt-6 rounded-xl border border-border/50 bg-card/50 p-5 shadow-sm"
            data-testid="pdv-classic-modo-inicial"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Modo Inicial do Caixa</h3>
                <p className="text-xs text-muted-foreground">Defina a interface inicial padrão para o PDV Clássico.</p>
              </div>
            </div>
            
            <RadioGroup
              className="gap-3 md:pl-11"
              value={draftClassicModo}
              onValueChange={(v) => {
                if (v === "normal" || v === "rapido") setDraftClassicModo(v);
              }}
              disabled={controlsDisabled}
            >
              <div className="flex items-center space-x-2.5">
                <RadioGroupItem value="normal" id="pdv-modo-normal" />
                <Label htmlFor="pdv-modo-normal" className="cursor-pointer text-xs font-medium text-foreground hover:text-foreground/95">
                  Completo (Modo balcão tradicional)
                </Label>
              </div>
              <div className="flex items-center space-x-2.5">
                <RadioGroupItem value="rapido" id="pdv-modo-rapido" />
                <Label htmlFor="pdv-modo-rapido" className="cursor-pointer text-xs font-medium text-foreground hover:text-foreground/95">
                  Simplificado (Foco em bipe rápido de itens)
                </Label>
              </div>
            </RadioGroup>
          </div>
        ) : null}

        {/* Tip Informativo Minimalista */}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/80 pl-1">
          <Info className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
          <span>Recarregue a página do PDV após salvar para aplicar as alterações.</span>
        </div>

        {/* Ações de Salvamento Elegantes no Rodapé */}
        {dirty && (
          <div className="mt-6 pt-4 border-t border-border/40 flex justify-end gap-2 animate-fade-in">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs px-3"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs px-4 bg-foreground text-background hover:bg-foreground/90"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        )}
      </div>

      <div className="pt-6 border-t border-border/40 mt-8">
        <ImpressaoPdvSettingsCard />
      </div>

      {/* Outros Fluxos Integrados — Mini-cards horizontais */}
      <div className="pt-6 border-t border-border/40 mt-8">
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outros Fluxos Integrados</h3>
        </div>

        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {/* PDV WhatsApp */}
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/30 p-3 hover:bg-accent/5 transition-all duration-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <span>PDV WhatsApp</span>
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" title="Ativo" />
                </h4>
              </div>
            </div>
            <a
              href="/dashboard/whatsapp"
              className="shrink-0 text-[11px] font-semibold text-foreground bg-background hover:bg-accent/10 border border-border/50 px-2.5 py-1 rounded-md transition-all duration-200"
            >
              Acessar
            </a>
          </div>

          {/* OS → Venda */}
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/30 p-3 hover:bg-accent/5 transition-all duration-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <span>OS → Venda</span>
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" title="Integrado" />
                </h4>
              </div>
            </div>
            <a
              href="/dashboard/operacoes-v2"
              className="shrink-0 text-[11px] font-semibold text-foreground bg-background hover:bg-accent/10 border border-border/50 px-2.5 py-1 rounded-md transition-all duration-200"
            >
              Acessar
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PdvSection() {
  return <PdvSectionContent />;
}
