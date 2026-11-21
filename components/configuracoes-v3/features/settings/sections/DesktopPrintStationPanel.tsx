"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorCheck, Printer, RefreshCw } from "lucide-react";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/configuracoes-v3/components/ui/select";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import {
  desktopPrintTest,
  getDesktopPrintBridge,
  loadDesktopStation,
  setDesktopStation,
  type DesktopBobina,
  type DesktopPrinterInfo,
} from "@/lib/desktop-print-bridge";

export function useDesktopPrintAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => setAvailable(!!getDesktopPrintBridge()), []);
  return available;
}

/**
 * Impressora DESTA estação (OmniGestão Pro para Windows). Fica gravada no computador, não na loja:
 * cada caixa escolhe a sua térmica uma única vez.
 */
export function DesktopPrintStationPanel() {
  const { toast } = useToast();
  const [printers, setPrinters] = useState<DesktopPrinterInfo[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [bobina, setBobina] = useState<DesktopBobina>("80mm");
  const [saved, setSaved] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const bridge = getDesktopPrintBridge();
    if (!bridge) return;
    const [list, station] = await Promise.all([bridge.listPrinters().catch(() => []), loadDesktopStation(true)]);
    setPrinters(list);
    if (station) {
      setDeviceName(station.deviceName);
      setBobina(station.bobina);
      setSaved(station.deviceName);
    } else {
      setSaved("");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await setDesktopStation({ deviceName, bobina });
      if (res.ok) {
        setSaved(deviceName);
        toast({ title: "Impressora da estação salva", description: `${deviceName} · bobina ${bobina}` });
      } else {
        toast({ title: "Não foi possível salvar", description: res.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await desktopPrintTest();
      if (res.ok) toast({ title: "Teste enviado à fila do Windows", description: `${res.deviceName} — confira o papel impresso.` });
      else toast({ title: "Teste falhou", description: res.error, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const unsaved = !!deviceName && (deviceName !== saved);
  const missing = !!saved && printers.length > 0 && !printers.some((p) => p.name === saved);

  return (
    <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4 min-w-0" data-testid="desktop-print-station">
      <div className="flex items-start gap-3 min-w-0">
        <MonitorCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Impressão direta neste computador</p>
          <p className="text-xs text-muted-foreground">
            O cupom vai direto para a impressora do Windows, sem abrir o navegador nem o diálogo de impressão. A escolha vale só para este computador.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_160px] min-w-0">
        <div className="space-y-2 min-w-0">
          <Label id="desk-printer-label">Impressora desta estação</Label>
          <Select value={deviceName} onValueChange={setDeviceName} disabled={busy}>
            <SelectTrigger aria-labelledby="desk-printer-label">
              <SelectValue placeholder="Escolha a impressora térmica" />
            </SelectTrigger>
            <SelectContent>
              {printers.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.displayName}
                  {p.isDefault ? " (padrão do Windows)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 min-w-0">
          <Label id="desk-bobina-label">Bobina</Label>
          <Select value={bobina} onValueChange={(v) => setBobina(v === "58mm" ? "58mm" : "80mm")} disabled={busy}>
            <SelectTrigger aria-labelledby="desk-bobina-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="80mm">80 mm</SelectItem>
              <SelectItem value="58mm">58 mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground" role="status">
        {missing
          ? `A impressora salva (${saved}) não aparece no Windows agora. Verifique cabo/energia ou escolha outra.`
          : saved
            ? `Ativa: ${saved}. As vendas desta estação imprimem direto nela.`
            : "Nenhuma impressora escolhida: o cupom usa a impressão do navegador."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy || !deviceName || !unsaved}>
          Salvar impressora da estação
        </Button>
        <Button type="button" variant="secondary" onClick={() => void test()} disabled={busy || !saved || unsaved}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir teste (sem venda)
        </Button>
        <Button type="button" variant="ghost" onClick={() => void reload()} disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar lista
        </Button>
      </div>
    </div>
  );
}
