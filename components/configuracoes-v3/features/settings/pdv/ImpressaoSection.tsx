"use client";

/**
 * Impressão (preferências da UNIDADE): cupom, impressora (rede ESC/POS ou navegador), automação e outros documentos.
 * A impressora do app Windows é do COMPUTADOR e entra pelo slot `desktopStation`.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, Eye, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import type { PdvImpressaoConfig } from "@/lib/pdv-impressao-config";
import type { PdvFailure } from "./pdv-station-model";
import { BlockAlert, Eyebrow, PendingDot, Row, SectionHead, Segmented, Stepper, Toggle, UndoButton } from "./pdv-station-controls";

export function ImpressaoSection({
  printMode,
  desktop,
  imp,
  patchImp,
  impPending,
  dirty,
  onUndo,
  disabled,
  hasLogo,
  receiptFooter,
  receipt,
  desktopStation,
  testing,
  onTestNetwork,
  onBrowserPreview,
  failure,
}: {
  printMode: "platform" | "browser";
  desktop: boolean;
  imp: PdvImpressaoConfig;
  patchImp: <K extends keyof PdvImpressaoConfig>(key: K, value: PdvImpressaoConfig[K]) => void;
  impPending: (k: keyof PdvImpressaoConfig) => boolean;
  dirty: boolean;
  onUndo: () => void;
  disabled: boolean;
  hasLogo: boolean;
  receiptFooter: string | null;
  /** Prévia do cupom (a mesma do painel), aberta em linha nas larguras estreitas. */
  receipt: ReactNode;
  desktopStation: ReactNode;
  testing: boolean;
  onTestNetwork: () => void;
  onBrowserPreview: () => void;
  failure?: PdvFailure;
}) {
  const [inlinePreviewOpen, setInlinePreviewOpen] = useState(false);
  return (
    <section id="pdv-impressao" className="cx-section" aria-labelledby="impressao-title">
      <SectionHead
        id="impressao"
        title={printMode === "platform" ? "Impressão operacional" : "Impressão do cupom"}
        description={
          printMode === "platform"
            ? "Cupom, impressora e documentos impressos pelo PDV, pela OS e pelo crediário."
            : "O cupom sai pela impressão do navegador do computador do caixa. Estas preferências valem para esta unidade."
        }
        scope="unidade"
        pending={dirty}
        extra={dirty ? <UndoButton label="Impressão" onClick={onUndo} /> : null}
      />

      <Eyebrow>Cupom</Eyebrow>
      <div className="cx-rows">
        <Row
          label="Bobina"
          labelId="pdv-bobina-label"
          help="Largura do papel. Define o cupom das vendas em todos os caminhos de impressão."
          pending={impPending("bobinaTamanho")}
        >
          <Segmented
            value={imp.bobinaTamanho}
            onChange={(v) => patchImp("bobinaTamanho", v)}
            ariaLabelledby="pdv-bobina-label"
            disabled={disabled}
            options={[
              { value: "58mm", label: "58 mm", sub: "32 colunas" },
              { value: "80mm", label: "80 mm", sub: "48 colunas" },
            ]}
          />
        </Row>
        <Row label="Comprovante" labelId="pdv-comprovante-label" help="O que entra no corpo do cupom." pending={impPending("comprovanteModo")}>
          <Segmented
            value={imp.comprovanteModo}
            onChange={(v) => patchImp("comprovanteModo", v)}
            ariaLabelledby="pdv-comprovante-label"
            disabled={disabled}
            options={[
              { value: "completo", label: "Completo", sub: "itens detalhados" },
              { value: "simplificado", label: "Simplificado", sub: "só o resumo" },
            ]}
          />
        </Row>
        <Row
          label="Exibir logo no cupom"
          labelId="pdv-logo-label"
          pending={impPending("logoNoCupom")}
          help={hasLogo ? "Usa a logo cadastrada da unidade no topo do cupom." : "A unidade ainda não tem logo cadastrada: o cupom sai sem logo."}
        >
          <Toggle checked={imp.logoNoCupom} onChange={(v) => patchImp("logoNoCupom", v)} labelledBy="pdv-logo-label" disabled={disabled} />
        </Row>
        <Row
          stack
          label={<label htmlFor="pdv-rodape">Rodapé do cupom</label>}
          pending={impPending("rodapeCupom")}
          help={
            receiptFooter
              ? `Se ficar vazio, o cupom usa o rodapé geral da unidade: “${receiptFooter}”.`
              : "Opcional. Aparece no fim do cupom, quebrando linha como você digitar."
          }
        >
          <Input
            id="pdv-rodape"
            value={imp.rodapeCupom}
            onChange={(e) => patchImp("rodapeCupom", e.target.value)}
            placeholder="Ex.: Troca em até 7 dias com este comprovante."
            className="h-10 w-full"
            disabled={disabled}
          />
        </Row>
        {printMode === "platform" ? (
          <Row label="Vias por venda" labelId="pdv-vias-label" help="Cópias impressas a cada venda, de 1 a 5." pending={impPending("viasCupom")}>
            <Stepper value={imp.viasCupom} min={1} max={5} onChange={(v) => patchImp("viasCupom", v)} labelledBy="pdv-vias-label" disabled={disabled} />
          </Row>
        ) : null}
      </div>

      {/* Prévia em linha (larguras estreitas) */}
      <div className="cx-inline-preview mt-4">
        <button
          type="button"
          onClick={() => setInlinePreviewOpen((o) => !o)}
          aria-expanded={inlinePreviewOpen}
          aria-controls="pdv-inline-receipt"
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Prévia do cupom</span>
            <span className="block text-xs text-muted-foreground">Venda de exemplo, sem valor fiscal. Acompanha as escolhas acima.</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${inlinePreviewOpen ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {inlinePreviewOpen ? (
          <div id="pdv-inline-receipt" className="cx-stage mt-2 overflow-x-auto rounded-lg">
            {receipt}
          </div>
        ) : null}
      </div>

      <Eyebrow>Impressora</Eyebrow>
      <div className="cx-rows">
        {desktopStation}

        {printMode === "platform" ? (
          <div className="cx-row cx-row--stack">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                Impressora de rede (ESC/POS)
                {impPending("impressoraHost") || impPending("impressoraPorta") ? <PendingDot /> : null}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Com host preenchido, o caixa envia o cupom direto para esta térmica. Vazio: usa o THERMAL_PRINT_HOST do servidor.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-[1_1_220px]">
                <label htmlFor="pdv-host" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Impressora de comprovante (host/IP)
                </label>
                <Input
                  id="pdv-host"
                  className="cx-mono h-10 w-full"
                  placeholder="192.168.0.50"
                  value={imp.impressoraHost}
                  onChange={(e) => patchImp("impressoraHost", e.target.value)}
                  disabled={disabled}
                  autoComplete="off"
                />
              </div>
              <div className="w-[104px] shrink-0">
                <label htmlFor="pdv-port" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Porta TCP
                </label>
                <Input
                  id="pdv-port"
                  className="cx-mono h-10 w-full"
                  type="number"
                  min={1}
                  max={65535}
                  value={imp.impressoraPorta}
                  onChange={(e) => patchImp("impressoraPorta", Number(e.target.value) || 9100)}
                  disabled={disabled}
                />
              </div>
              <Button type="button" variant="outline" className="cx-touch h-10 px-3.5 text-[0.8rem]" onClick={onTestNetwork} disabled={disabled || testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Printer className="h-4 w-4" aria-hidden />}
                {testing ? "Testando…" : "Testar impressão"}
              </Button>
            </div>
          </div>
        ) : null}

        {printMode === "browser" ? (
          <Row label="Impressão pelo navegador" help="Abre o mesmo cupom na impressão do navegador, sem registrar venda.">
            <Button type="button" variant="outline" className="cx-touch h-9 px-3.5 text-[0.8rem]" onClick={onBrowserPreview} disabled={disabled}>
              <Eye className="h-4 w-4" aria-hidden />
              Prévia no navegador
            </Button>
          </Row>
        ) : null}
      </div>

      {printMode === "platform" || desktop ? (
        <>
          <Eyebrow>Automação</Eyebrow>
          <div className="cx-rows">
            <Row
              label="Imprimir cupom automaticamente"
              labelId="pdv-auto-label"
              help={printMode === "platform" ? "Logo após confirmar o pagamento no PDV." : "Após confirmar a venda, direto na impressora deste computador."}
              pending={impPending("imprimirAutomatico")}
            >
              <Toggle checked={imp.imprimirAutomatico} onChange={(v) => patchImp("imprimirAutomatico", v)} labelledBy="pdv-auto-label" disabled={disabled} />
            </Row>
            {printMode === "platform" ? (
              <Row label="Abrir gaveta após imprimir" labelId="pdv-gaveta-label" help="Envia o pulso ESC/POS para a gaveta de dinheiro." pending={impPending("abrirGaveta")}>
                <Toggle checked={imp.abrirGaveta} onChange={(v) => patchImp("abrirGaveta", v)} labelledBy="pdv-gaveta-label" disabled={disabled} />
              </Row>
            ) : null}
          </div>
        </>
      ) : null}

      {printMode === "platform" ? (
        <>
          <Eyebrow>Outros documentos</Eyebrow>
          <div className="cx-rows">
            <Row label="Permitir impressão térmica de OS" labelId="pdv-os-label" help="Ordens de serviço no módulo Operações." pending={impPending("imprimirOs")}>
              <Toggle checked={imp.imprimirOs} onChange={(v) => patchImp("imprimirOs", v)} labelledBy="pdv-os-label" disabled={disabled} />
            </Row>
            <Row label="Permitir recibo de crediário" labelId="pdv-cred-label" help="Baixas em Contas a Receber." pending={impPending("imprimirCrediario")}>
              <Toggle checked={imp.imprimirCrediario} onChange={(v) => patchImp("imprimirCrediario", v)} labelledBy="pdv-cred-label" disabled={disabled} />
            </Row>
          </div>
        </>
      ) : null}

      {printMode === "browser" && !desktop ? (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Impressão automática após a venda, impressora térmica conectada direto (rede ou USB), vias automáticas e gaveta de dinheiro dependem de
          equipamento homologado e não são configuradas nesta tela.
        </p>
      ) : null}
      <BlockAlert failure={failure} />
    </section>
  );
}
