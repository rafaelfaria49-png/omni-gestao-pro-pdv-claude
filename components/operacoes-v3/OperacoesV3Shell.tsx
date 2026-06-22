"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { cn } from "@/lib/utils";
import { aplicarTransicaoStatusV3 } from "@/lib/operacoes-v3/status-actions";
import { statusMetaV3, type OperacaoStatusV3 } from "@/lib/operacoes-v3/status-machine";
import { OperacoesV3Context, type OperacoesV3ContextValue } from "./context/OperacoesV3Context";
import { NovaOSEnterpriseModalV3 } from "./components/NovaOSEnterpriseModalV3";
import { OSContextRailV3 } from "./components/OSContextRailV3";
import { OperacoesV3Nav } from "./OperacoesV3Nav";
import { OSModeToggleV3, type ModoOperacoesV3 } from "./components/OSModeToggleV3";
import { OSClienteColV3 } from "./components/OSClienteColV3";
import { useOrdensV3 } from "./hooks/use-ordens-v3";
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

/** Modo Bancada desativa ambas as laterais; Recepção abre ambas; Auditoria só a direita. */
const MODO_COLS: Record<ModoOperacoesV3, { left: boolean; right: boolean }> = {
  recepcao: { left: true, right: true },
  bancada: { left: false, right: false },
  auditoria: { left: false, right: true },
};

interface ToastItem {
  id: number;
  msg: string;
}

export function OperacoesV3Shell() {
  const { lojaAtivaId, empresaDocumentos } = useLojaAtiva();
  const storeId = (lojaAtivaId ?? "").trim() || null;
  const { ordens, loading, primeiraCarga, error, reload } = useOrdensV3(storeId);

  const [activeScreen, setActiveScreen] = useState<ScreenId>("dashboard");
  const [selectedOsId, setSelectedOsId] = useState<string | null>(null);
  const [novaOSOpen, setNovaOSOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Cockpit layout state — puro UI, sem I/O.
  const [modo, setModo] = useState<ModoOperacoesV3>("recepcao");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const mainRef = useRef<HTMLElement>(null);

  const handleModo = useCallback((m: ModoOperacoesV3) => {
    setModo(m);
    setLeftOpen(MODO_COLS[m].left);
    setRightOpen(MODO_COLS[m].right);
  }, []);

  const navigate = useCallback((screen: ScreenId, osId?: string | null) => {
    setActiveScreen(screen);
    if (osId !== undefined) setSelectedOsId(osId);
  }, []);

  const openOS = useCallback((osId: string) => {
    setSelectedOsId(osId);
    setActiveScreen("workspace");
  }, []);

  const notificar = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const abrirNovaOS = useCallback(() => {
    if (!storeId) {
      notificar("Selecione uma unidade ativa para abrir uma OS.");
      return;
    }
    setNovaOSOpen(true);
  }, [storeId, notificar]);

  const onOSCriada = useCallback(
    (osId: string) => {
      setNovaOSOpen(false);
      reload();
      notificar("OS criada com sucesso.");
      openOS(osId);
    },
    [reload, notificar, openOS],
  );

  const acaoEmConstrucao = useCallback(
    (label?: string) => {
      notificar(label ? `${label} — disponível na próxima fase.` : "Ação disponível na próxima fase.");
    },
    [notificar],
  );

  const mudarStatus = useCallback(
    async (osId: string, to: OperacaoStatusV3): Promise<boolean> => {
      if (!storeId) {
        notificar("Selecione uma unidade ativa para alterar o status.");
        return false;
      }
      try {
        await aplicarTransicaoStatusV3(storeId, osId, to);
        reload();
        notificar(`Status atualizado para "${statusMetaV3(to).label}".`);
        return true;
      } catch (e) {
        notificar(e instanceof Error ? e.message : "Não foi possível alterar o status.");
        return false;
      }
    },
    [storeId, reload, notificar],
  );

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
      mudarStatus,
      abrirNovaOS,
      notificar,
      acaoEmConstrucao,
    }),
    [storeId, activeScreen, selectedOsId, navigate, openOS, ordens, loading, primeiraCarga, error, reload, mudarStatus, abrirNovaOS, notificar, acaoEmConstrucao],
  );

  const ActiveScreen = SCREENS[activeScreen];

  // Colunas laterais do cockpit: só no workspace com uma OS aberta.
  const selectedOs = activeScreen === "workspace" && selectedOsId
    ? (ordens.find((o) => o.id === selectedOsId) ?? null)
    : null;
  const showCols = selectedOs !== null;

  const unidade = empresaDocumentos?.nomeFantasia?.trim() || storeId || null;

  return (
    <OperacoesV3Context.Provider value={ctx}>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background">

        {/* ── Top bar (40 px) ────────────────────────────────────────────── */}
        <header className="flex h-10 flex-none items-center gap-2 border-b border-border bg-card px-3">
          {/* Identidade */}
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="hidden text-sm font-semibold text-foreground sm:inline">
            Operações <span className="text-primary">V3</span>
          </span>

          {/* Modo de uso */}
          <div className="ml-3">
            <OSModeToggleV3 value={modo} onChange={handleModo} />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Unidade */}
          {unidade ? (
            <span className="hidden truncate text-xs text-muted-foreground lg:inline" title={unidade}>
              {unidade}
            </span>
          ) : null}

          {/* Ações */}
          <ButtonV3 variant="ghost" onClick={reload} disabled={!storeId} className="h-7 px-2 text-xs">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            <span className="hidden sm:inline">Atualizar</span>
          </ButtonV3>
          <ButtonV3 variant="primary" onClick={abrirNovaOS} disabled={!storeId} className="h-7 px-2.5 text-xs">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Nova OS</span>
          </ButtonV3>
        </header>

        {/* ── Cockpit body ────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Rail de ícones */}
          <OperacoesV3Nav active={activeScreen} onNavigate={(id) => navigate(id)} />

          {/* Coluna de cliente (esquerda) — somente no workspace com OS */}
          {showCols && (
            <OSClienteColV3
              os={selectedOs}
              open={leftOpen}
              onToggle={() => setLeftOpen((v) => !v)}
            />
          )}

          {/* Centro: conteúdo principal */}
          <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
            <div className="w-full px-4 py-4 sm:px-6">
              <ActiveScreen />
            </div>
          </main>

          {/* Coluna de atividade (direita) — somente no workspace com OS */}
          {showCols && (
            <div
              className={cn(
                "relative flex-none border-l border-border bg-card/40 transition-[width] duration-200",
                rightOpen ? "w-72" : "w-8",
              )}
            >
              {/* Botão de colapso */}
              <button
                type="button"
                onClick={() => setRightOpen((v) => !v)}
                title={rightOpen ? "Recolher atividade" : "Expandir atividade"}
                aria-label={rightOpen ? "Recolher coluna de atividade" : "Expandir coluna de atividade"}
                className="absolute -left-3 top-4 z-20 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
              >
                {rightOpen ? (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>

              {rightOpen && (
                <div className="h-full overflow-y-auto p-3 pt-4">
                  <OSContextRailV3
                    os={selectedOs}
                    onAbrirHistorico={() => navigate("historico")}
                    onAcao={acaoEmConstrucao}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Toasts ──────────────────────────────────────────────────────── */}
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

        <NovaOSEnterpriseModalV3
          open={novaOSOpen}
          storeId={storeId}
          onClose={() => setNovaOSOpen(false)}
          onCreated={onOSCriada}
        />
      </div>
    </OperacoesV3Context.Provider>
  );
}
