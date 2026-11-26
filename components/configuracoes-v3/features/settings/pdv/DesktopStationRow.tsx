"use client";

/**
 * Configuração local do COMPUTADOR (OmniGestão Pro para Windows): a impressora térmica deste caixa.
 * Gravada no computador pela ponte do app, nunca no servidor e nunca pela barra de alterações da unidade.
 */
import { Printer, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/configuracoes-v3/components/ui/select";
import { PendingDot, ScopeTag, Segmented } from "./pdv-station-controls";
import type { DesktopStationState } from "./use-desktop-station";

export function DesktopStationRow({ station }: { station: DesktopStationState }) {
  return (
    <div className="cx-row cx-row--stack" data-testid="desktop-print-station">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Mesmo nome que a página /baixar ensina a procurar. */}
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            Impressão direta neste computador
            {station.unsaved ? <PendingDot label="Impressora não salva neste computador" /> : null}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            O cupom vai direto para a impressora do Windows, sem abrir o navegador nem o diálogo de impressão. A escolha vale só para este
            computador.
          </p>
        </div>
        <ScopeTag scope="computador" />
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]">
        <div className="min-w-0">
          <p id="pdv-station-printer-label" className="mb-1.5 text-xs font-medium text-muted-foreground">
            Impressora
          </p>
          <Select value={station.deviceName} onValueChange={station.setDeviceName} disabled={station.busy}>
            <SelectTrigger aria-labelledby="pdv-station-printer-label" className="h-10 w-full">
              <SelectValue placeholder="Escolha a impressora térmica" />
            </SelectTrigger>
            <SelectContent>
              {station.printers.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.displayName}
                  {p.isDefault ? " (padrão do Windows)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <p id="pdv-station-bobina-label" className="mb-1.5 text-xs font-medium text-muted-foreground">
            Bobina do teste
          </p>
          <Segmented
            value={station.bobina}
            onChange={station.setBobina}
            ariaLabelledby="pdv-station-bobina-label"
            disabled={station.busy}
            options={[
              { value: "58mm", label: "58 mm" },
              { value: "80mm", label: "80 mm" },
            ]}
          />
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed" role="status">
        {station.missing ? (
          <>
            <TriangleAlert className="cx-accent-ink mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="text-foreground">
              A impressora salva ({station.saved?.deviceName}) não aparece no Windows agora. Confira cabo e energia ou escolha outra.
            </span>
          </>
        ) : station.saved ? (
          <>
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
            <span className="text-muted-foreground">
              Ativa: <span className="cx-mono text-foreground">{station.saved.deviceName}</span>. As vendas deste computador imprimem direto nela,
              na bobina da unidade.
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Nenhuma impressora escolhida: o cupom usa a impressão do navegador.</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="cx-touch h-9 bg-foreground px-3.5 text-[0.8rem] text-background hover:bg-foreground/90"
          onClick={() => void station.save()}
          disabled={station.busy || !station.deviceName || !station.unsaved}
        >
          Salvar neste computador
        </Button>
        <Button
          type="button"
          variant="outline"
          className="cx-touch h-9 px-3.5 text-[0.8rem]"
          onClick={() => void station.test()}
          disabled={station.busy || !station.saved || station.unsaved}
        >
          <Printer className="h-4 w-4" aria-hidden />
          Imprimir teste (sem venda)
        </Button>
        <Button type="button" variant="ghost" className="cx-touch h-9 px-3 text-[0.8rem]" onClick={() => void station.reload()} disabled={station.busy}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Atualizar lista
        </Button>
      </div>
    </div>
  );
}
