"use client";

/**
 * Impressora DESTA estação (OmniGestão Pro para Windows). Fica gravada no computador, não na loja:
 * cada caixa escolhe a sua térmica uma única vez. Mesma lógica do antigo `DesktopPrintStationPanel`.
 */
import { useCallback, useEffect, useState } from "react";
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

type Toast = (t: { title: string; description?: string; variant?: "destructive" }) => void;

export function useDesktopStation(enabled: boolean, toast: Toast) {
  const [printers, setPrinters] = useState<DesktopPrinterInfo[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [bobina, setBobina] = useState<DesktopBobina>("80mm");
  const [saved, setSaved] = useState<{ deviceName: string; bobina: DesktopBobina } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const bridge = getDesktopPrintBridge();
    if (!bridge) return;
    const [list, station] = await Promise.all([bridge.listPrinters().catch(() => []), loadDesktopStation(true)]);
    setPrinters(list);
    if (station) {
      setDeviceName(station.deviceName);
      setBobina(station.bobina);
      setSaved({ deviceName: station.deviceName, bobina: station.bobina });
    } else {
      setSaved(null);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await setDesktopStation({ deviceName, bobina });
      if (res.ok) {
        setSaved({ deviceName, bobina });
        toast({ title: "Impressora deste computador salva", description: `${deviceName} · bobina ${bobina}` });
      } else {
        toast({ title: "Não foi possível salvar a impressora", description: res.error, variant: "destructive" });
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
      else toast({ title: "O teste não foi impresso", description: res.error, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const unsaved = !!deviceName && (deviceName !== saved?.deviceName || bobina !== saved?.bobina);
  const missing = !!saved && printers.length > 0 && !printers.some((p) => p.name === saved.deviceName);

  return { printers, deviceName, setDeviceName, bobina, setBobina, saved, busy, unsaved, missing, reload, save, test };
}

export type DesktopStationState = ReturnType<typeof useDesktopStation>;
