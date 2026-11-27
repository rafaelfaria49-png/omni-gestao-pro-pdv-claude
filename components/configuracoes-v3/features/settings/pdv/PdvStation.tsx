"use client";

/**
 * Configurações → PDV e impressão — “Estação de caixa” (variante B aprovada no Gate 1, 2026-11-26).
 *
 * Configurações à esquerda; à direita, o que está em vigor (“em vigor → novo”) e a prévia do cupom.
 * Este arquivo só compõe a tela. Estado e salvamentos: `use-pdv-station.ts`. Uma responsabilidade por componente:
 * `TelaCaixaSection` (layout e modo inicial), `LeitorSection`, `BalancaSection`, `ImpressaoSection`,
 * `DesktopStationRow` (configuração deste computador), `StationSummary` (resumo e prévia), `PendingDock` (barra).
 */
import { useState } from "react";
import { ArrowLeft, Building2, TriangleAlert } from "lucide-react";
import { TooltipProvider } from "@/components/configuracoes-v3/components/ui/tooltip";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { useConfiguracoesNav } from "@/components/configuracoes-v3/contexts/ConfiguracoesNavContext";
import { UnidadeAtivaRequiredBanner } from "../components/UnidadeAtivaRequiredBanner";
import { buildStationSpecs, type PdvFlowId } from "./pdv-station-model";
import { Row, SectionHead, ShortcutLink } from "./pdv-station-controls";
import { SkeletonSections } from "./pdv-station-visuals";
import { ReceiptPreview } from "./ReceiptPreview";
import { StationPanel, StationStrip } from "./StationSummary";
import { TelaCaixaSection } from "./TelaCaixaSection";
import { LeitorSection } from "./LeitorSection";
import { BalancaSection } from "./BalancaSection";
import { ImpressaoSection } from "./ImpressaoSection";
import { DesktopStationRow } from "./DesktopStationRow";
import { PendingDock } from "./PendingDock";
import { FlowPreviewDialog } from "./FlowPreviewDialog";
import { usePdvStation } from "./use-pdv-station";
import { usePrintActions } from "./use-print-actions";
import { useDesktopPrintAvailable, useDesktopStation } from "./use-desktop-station";
import "./pdv-station.css";

export function PdvStation() {
  return (
    <TooltipProvider delayDuration={250}>
      <PdvStationContent />
    </TooltipProvider>
  );
}

function PdvStationContent() {
  const s = usePdvStation();
  const { navigateToSection } = useConfiguracoesNav();
  const { toast } = useToast();
  const desktop = useDesktopPrintAvailable();
  const station = useDesktopStation(desktop, toast);
  const print = usePrintActions(s.imp, s.receiptStore);
  const [previewId, setPreviewId] = useState<PdvFlowId | null>(null);
  const [dataHora] = useState(() => new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }));

  const specs = buildStationSpecs({
    caixaSaved: s.caixaSaved,
    caixa: s.caixa,
    visor: s.visorState,
    showScale: s.showScale,
    printMode: s.printMode,
    impSaved: s.impSaved,
    imp: s.imp,
    desktop,
    desktopPrinter: station.saved?.deviceName ?? null,
  });
  const receipt = (
    <ReceiptPreview config={s.imp} store={s.receiptStore} receiptFooter={s.receiptFooter} showVias={s.printMode === "platform"} dataHora={dataHora} />
  );

  return (
    <div className="cx-root" data-testid="pdv-station">
      {/* Cabeçalho */}
      <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigateToSection("geral")}
            className="cx-touch group mb-2 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            Voltar para Configurações
          </button>
          <h1 className="font-display text-[1.65rem] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">PDV e impressão</h1>
          <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
            Como o caixa desta unidade abre, reage ao leitor e imprime o comprovante.
          </p>
        </div>
        <span className="inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{s.lojaNome}</span>
        </span>
      </header>

      {s.noLoja ? (
        <div className="mb-8">
          <UnidadeAtivaRequiredBanner hint="Layout e modo do PDV são salvos por unidade neste navegador e na API." />
        </div>
      ) : null}

      {s.loadFailed ? (
        <p role="status" className="mb-8 flex items-start gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground">
          <TriangleAlert className="cx-accent-ink mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Configurações indisponíveis: não foi possível ler os dados desta unidade, e nada pode ser alterado até a leitura funcionar. Recarregue
            a página para tentar novamente.
          </span>
        </p>
      ) : null}

      {/* Resumo compacto (larguras estreitas) */}
      {s.hasData && !s.noLoja ? <StationStrip specs={specs} /> : null}

      <div className="cx-layout">
        <div className="min-w-0" aria-busy={s.loading}>
          {s.initialLoading ? (
            <SkeletonSections />
          ) : s.loadFailed && !s.hasData ? null : (
            <>
              <TelaCaixaSection
                flows={s.visibleFlows}
                caixa={s.caixa}
                caixaSaved={s.caixaSaved}
                setCaixa={s.setCaixa}
                disabled={s.disabled}
                flowPending={s.flowPending}
                modoPending={s.modoPending}
                onUndo={s.undoTela}
                onPreview={setPreviewId}
              />
              <LeitorSection
                scan={s.caixa.scan}
                onChange={(scan) => s.setCaixa((d) => ({ ...d, scan }))}
                disabled={s.disabled}
                pending={s.scanPending}
                onUndo={s.undoLeitor}
                failure={s.failureOf("caixa")}
              />
              {s.showScale ? (
                <BalancaSection
                  visor={s.visorState}
                  dirty={s.visorDirty}
                  manual={s.visorManual}
                  toggleDisabled={s.saving !== null || !s.visorReady}
                  statusMessage={
                    s.noLoja
                      ? "Escolha uma unidade para configurar o visor."
                      : s.businessHydrated
                        ? "Configurações indisponíveis. Recarregue a página para tentar novamente."
                        : "Carregando configurações da unidade…"
                  }
                  savedNote={s.visorSavedNote}
                  onToggle={s.setVisorDraft}
                  onUndo={s.undoVisor}
                  failure={s.failureOf("balanca")}
                />
              ) : null}
              {s.printMode ? (
                <ImpressaoSection
                  printMode={s.printMode}
                  desktop={desktop}
                  imp={s.imp}
                  patchImp={s.patchImp}
                  impPending={s.impPending}
                  dirty={s.impDirty}
                  onUndo={s.undoImp}
                  disabled={s.disabled}
                  hasLogo={s.hasLogo}
                  receiptFooter={s.receiptFooter}
                  receipt={receipt}
                  desktopStation={desktop ? <DesktopStationRow station={station} /> : null}
                  testing={print.testing}
                  onTestNetwork={() => void print.testNetwork()}
                  onBrowserPreview={() => void print.browserPreview()}
                  failure={s.failureOf("impressao")}
                />
              ) : null}
              {s.shortcuts.whatsapp || s.shortcuts.operacoes ? (
                <section id="pdv-atalhos" className="cx-section" aria-labelledby="atalhos-title">
                  <SectionHead id="atalhos" title="Atalhos relacionados" description="Outros caminhos de venda ligados ao PDV." />
                  <div className="cx-rows">
                    {s.shortcuts.whatsapp ? (
                      <Row label="PDV WhatsApp" help="Atendimento e vendas no WhatsApp HUB.">
                        <ShortcutLink href="/dashboard/whatsapp">Abrir WhatsApp HUB</ShortcutLink>
                      </Row>
                    ) : null}
                    {s.shortcuts.operacoes ? (
                      <Row label="OS → Venda" help="Fluxo de ordem de serviço para venda, no módulo Operações.">
                        <ShortcutLink href="/dashboard/operacoes-v3">Abrir Operações</ShortcutLink>
                      </Row>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>

        <StationPanel
          lojaNome={s.lojaNome}
          noLoja={s.noLoja}
          hasData={s.hasData}
          loadFailed={s.loadFailed}
          anyDirty={s.anyDirty}
          pendingCount={s.pendingCount}
          specs={specs}
          printMode={s.printMode}
          desktop={desktop}
          imp={s.imp}
          receipt={receipt}
          onBrowserPreview={() => void print.browserPreview()}
          disabled={s.disabled}
        />
      </div>

      {s.anyDirty || s.failures.length ? (
        <PendingDock
          saving={s.saving}
          failures={s.failures}
          partialSaved={s.partialSaved}
          pendingCount={s.pendingCount}
          dirtyBlocks={s.dirtyBlocks}
          canSave={s.canSave}
          onDiscard={s.discardAll}
          onSave={() => void s.saveAll()}
        />
      ) : null}

      <FlowPreviewDialog
        flowId={previewId}
        onClose={() => setPreviewId(null)}
        selected={previewId !== null && s.caixa.flow === previewId}
        inUse={previewId !== null && s.caixaSaved.flow === previewId}
        disabled={s.disabled}
        onUse={(id) => {
          s.setCaixa((d) => ({ ...d, flow: id }));
          setPreviewId(null);
        }}
      />
    </div>
  );
}
