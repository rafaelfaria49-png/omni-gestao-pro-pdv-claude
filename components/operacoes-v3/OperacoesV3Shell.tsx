"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { cn } from "@/lib/utils";
import { OperacoesV3Context, type OperacoesV3ContextValue } from "./context/OperacoesV3Context";
import { OperacoesV3Nav } from "./OperacoesV3Nav";
import { useOrdensV3 } from "./hooks/use-ordens-v3";
import { navItem } from "./data/navigation";
import type { ScreenId } from "./data/types";
import { ButtonV3 } from "./components/UiV3";

import { DashboardV3 } from "./pages/DashboardV3";
import { FilaOSV3 } from "./pages/FilaOSV3";
import { AtendimentoRapidoV3 } from "./pages/AtendimentoRapidoV3";
import { BancadaV3 } from "./pages/BancadaV3";
import { SlaAtrasosV3 } from "./pages/SlaAtrasosV3";
import { OSWorkspaceV3 } from "./pages/OSWorkspaceV3";
import { PdvServicoV3 } from "./pages/PdvServicoV3";
import { OrcamentosV3 } from "./pages/OrcamentosV3";
import { GarantiasV3 } from "./pages/GarantiasV3";
import { RetornosV3 } from "./pages/RetornosV3";
import { PortalClienteV3 } from "./pages/PortalClienteV3";
import { NotificacoesV3 } from "./pages/NotificacoesV3";
import { ServicosV3 } from "./pages/ServicosV3";
import { PecasPedidosV3 } from "./pages/PecasPedidosV3";
import { RastreioFisicoV3 } from "./pages/RastreioFisicoV3";
import { TecnicosV3 } from "./pages/TecnicosV3";
import { HistoricoClientesV3 } from "./pages/HistoricoClientesV3";
import { RelatoriosV3 } from "./pages/RelatoriosV3";
import { ConfiguracoesV3 } from "./pages/ConfiguracoesV3";

const SCREENS: Record<ScreenId, ComponentType> = {
  dashboard: DashboardV3,
  fila: FilaOSV3,
  atendimento: AtendimentoRapidoV3,
  bancada: BancadaV3,
  sla: SlaAtrasosV3,
  workspace: OSWorkspaceV3,
  "pdv-servico": PdvServicoV3,
  orcamentos: OrcamentosV3,
  garantias: GarantiasV3,
  retornos: RetornosV3,
  portal: PortalClienteV3,
  notificacoes: NotificacoesV3,
  servicos: ServicosV3,
  pecas: PecasPedidosV3,
  rastreio: RastreioFisicoV3,
  tecnicos: TecnicosV3,
  historico: HistoricoClientesV3,
  relatorios: RelatoriosV3,
  configuracoes: ConfiguracoesV3,
};

const WIDE_SCREENS = new Set<ScreenId>(["workspace", "fila", "bancada", "historico", "orcamentos", "sla"]);

interface ToastItem {
  id: number;
  msg: string;
}

export function OperacoesV3Shell() {
  const { lojaAtivaId } = useLojaAtiva();
  const storeId = (lojaAtivaId ?? "").trim() || null;
  const { ordens, loading, primeiraCarga, error, reload } = useOrdensV3(storeId);

  const [activeScreen, setActiveScreen] = useState<ScreenId>("dashboard");
  const [selectedOsId, setSelectedOsId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const mainRef = useRef<HTMLElement>(null);

  const navigate = useCallback((screen: ScreenId, osId?: string | null) => {
    setActiveScreen(screen);
    if (osId !== undefined) setSelectedOsId(osId);
  }, []);

  const openOS = useCallback((osId: string) => {
    setSelectedOsId(osId);
    setActiveScreen("workspace");
  }, []);

  const acaoEmConstrucao = useCallback((label?: string) => {
    const msg = label ? `${label} — disponível na próxima fase.` : "Ação disponível na próxima fase.";
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeScreen, selectedOsId]);

  const ctx: OperacoesV3ContextValue = useMemo(
    () => ({
      storeId,
      activeScreen,
      selectedOsId,
      navigate,
      openOS,
      ordens,
      loading,
      primeiraCarga,
      error,
      reload,
      acaoEmConstrucao,
    }),
    [storeId, activeScreen, selectedOsId, navigate, openOS, ordens, loading, primeiraCarga, error, reload, acaoEmConstrucao],
  );

  const ActiveScreen = SCREENS[activeScreen];
  const info = navItem(activeScreen);
  const wide = WIDE_SCREENS.has(activeScreen);

  return (
    <OperacoesV3Context.Provider value={ctx}>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background">
        {/* Top chrome */}
        <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <p className="truncate text-sm font-semibold text-foreground">
              Operações <span className="text-primary">V3</span>
            </p>
            <span className="hidden items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex">
              casca isolada · somente leitura
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {info ? <span className="hidden text-xs text-muted-foreground md:inline">{info.label}</span> : null}
            <ButtonV3 variant="ghost" onClick={reload} disabled={!storeId}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
              Atualizar
            </ButtonV3>
          </div>
        </header>

        {/* Layout: nav + conteúdo */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <OperacoesV3Nav active={activeScreen} onNavigate={(id) => navigate(id)} />
          <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
            <div className={cn("mx-auto w-full px-4 py-6 sm:px-6", wide ? "max-w-7xl" : "max-w-6xl")}>
              <ActiveScreen />
            </div>
          </main>
        </div>

        {/* Toasts honestos */}
        {toasts.length > 0 ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="pointer-events-auto max-w-md rounded-lg border border-border bg-card px-4 py-2 text-center text-sm text-foreground shadow-md"
              >
                {t.msg}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </OperacoesV3Context.Provider>
  );
}
