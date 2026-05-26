"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import type { GarantiaOperacionalModo, OrdemServico } from "@/types/os";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as osApi from "@/api/os";
import { useOS } from "@/store/osStore";
import { dt } from "@/lib/os/format";

const MODOS: { id: GarantiaOperacionalModo; label: string }[] = [
  { id: "catalogo", label: "Catálogo / orçamento" },
  { id: "dias_30", label: "30 dias fixos" },
  { id: "dias_90", label: "90 dias fixos" },
  { id: "personalizada", label: "Personalizada" },
];

export function GarantiaOperacionalCard({ os }: { os: OrdemServico }) {
  const { refresh, storeId } = useOS();
  const [modo, setModo] = useState<GarantiaOperacionalModo>(os.garantiaOperacionalModo ?? "catalogo");
  const [dias, setDias] = useState(String(os.garantiaOperacionalPrazoCustom ?? 60));
  const [manual, setManual] = useState("90");
  const [savingPref, setSavingPref] = useState(false);
  const [savingMan, setSavingMan] = useState(false);

  useEffect(() => {
    setModo(os.garantiaOperacionalModo ?? "catalogo");
    setDias(String(os.garantiaOperacionalPrazoCustom ?? 60));
  }, [os.garantiaOperacionalModo, os.garantiaOperacionalPrazoCustom, os.atualizadoEm, os.id]);

  const salvarPreferencia = async () => {
    setSavingPref(true);
    try {
      const prazoCustom =
        modo === "personalizada" ? Math.min(3650, Math.max(1, Math.trunc(Number(dias) || 0))) : undefined;
      if (modo === "personalizada" && (!prazoCustom || prazoCustom < 1)) {
        toast.error("Informe dias válidos (1–3650).");
        return;
      }
      await osApi.salvarPreferenciaGarantiaOperacional(storeId, os.id, { modo, prazoCustom });
      await refresh();
      toast.success("Preferência de garantia salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSavingPref(false);
    }
  };

  const materializar = async (prazoDias: number) => {
    setSavingMan(true);
    try {
      await osApi.criarGarantiaOperacionalManual(storeId, os.id, { prazoDias });
      await refresh();
      toast.success("Garantia registrada no banco");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar garantia");
    } finally {
      setSavingMan(false);
    }
  };

  const lista = os.garantiasOperacionais ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Shield className="h-4 w-4 text-muted-foreground" />
        Garantia operacional (Prisma)
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Na entrega, a garantia é gerada automaticamente conforme o modo abaixo. Você pode materializar manualmente
        (30 / 90 / valor digitado) com OS pronta ou entregue.
      </p>

      <div className="mt-4 space-y-3">
        <Label>Modo ao entregar</Label>
        <div className="grid gap-2">
          {MODOS.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="gmod" checked={modo === m.id} onChange={() => setModo(m.id)} />
              {m.label}
            </label>
          ))}
        </div>
        {modo === "personalizada" && (
          <div className="space-y-1">
            <Label htmlFor="gdias">Dias</Label>
            <Input id="gdias" value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" />
          </div>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={() => void salvarPreferencia()} disabled={savingPref}>
          {savingPref ? "Salvando…" : "Salvar preferência"}
        </Button>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <div className="text-xs font-medium text-muted-foreground">Materializar agora</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={savingMan} onClick={() => void materializar(30)}>
            30 dias
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={savingMan} onClick={() => void materializar(90)}>
            90 dias
          </Button>
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-20"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="numeric"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingMan}
              onClick={() => {
                const n = Math.trunc(Number(manual) || 0);
                if (n < 1) {
                  toast.error("Informe dias válidos.");
                  return;
                }
                void materializar(n);
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </div>

      {lista.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="text-xs font-medium text-muted-foreground">Histórico no banco</div>
          <ul className="mt-2 space-y-2 text-xs">
            {lista.map((g) => (
              <li key={g.id} className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                <span className="font-medium">{g.status}</span> · {g.prazoDias} dias · até {dt(g.dataFim)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
