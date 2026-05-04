"use client";

import { useState } from "react";
import { AIBadge } from "../AIBadge";
import { AlertTriangle, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

type Row = { channel: string; commission: number; tax: number; freight: number };

const rows: Row[] = [
  { channel: "Mercado Livre Premium", commission: 16, tax: 8, freight: 22 },
  { channel: "Mercado Livre Clássico", commission: 12, tax: 8, freight: 18 },
  { channel: "Shopee", commission: 14, tax: 8, freight: 12 },
  { channel: "Amazon", commission: 15, tax: 8, freight: 20 },
];

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PrecificadorTab() {
  const { toast } = useToast();
  const showPendingToast = () =>
    toast({ title: "Integração pendente", description: PENDING_TOAST_DESCRIPTION });

  const [cost, setCost] = useState(120);
  const [taxPct, setTaxPct] = useState(8);
  const [marginPct, setMarginPct] = useState(25);
  const [auto, setAuto] = useState(true);

  const computed = rows.map((r) => {
    // suggested price: cost / (1 - (commission + tax + margin)/100) + freight
    const totalDeducPct = (r.commission + taxPct + marginPct) / 100;
    const base = cost / Math.max(0.05, 1 - totalDeducPct);
    const price = base + r.freight;
    const profit = price - cost - r.freight - price * (r.commission / 100) - price * (taxPct / 100);
    const lowMargin = profit / price < 0.12;
    return { ...r, price, profit, lowMargin };
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
      {/* Form */}
      <div className="surface-card p-6 space-y-5 h-fit">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-semibold">Parâmetros</h3>
          <AIBadge />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">Custo do produto (R$)</label>
          <input type="number" value={cost} onChange={(e) => setCost(+e.target.value || 0)}
            className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary transition-colors" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Impostos sobre venda (%)</label>
          <input type="number" value={taxPct} onChange={(e) => setTaxPct(+e.target.value || 0)}
            className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary transition-colors" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Margem desejada ({marginPct}%)</label>
          <input type="range" min={5} max={60} value={marginPct} onChange={(e) => setMarginPct(+e.target.value)} className="mt-2 w-full accent-[hsl(var(--primary))]" />
        </div>

        <button
          onClick={showPendingToast}
          title="Integração pendente"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity cursor-not-allowed opacity-80"
        >
          <Check className="h-4 w-4" /> Aplicar preços sugeridos
        </button>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
          <div>
            <p className="text-sm font-semibold">Auto pricing</p>
            <p className="text-xs text-muted-foreground">IA reajusta automaticamente</p>
          </div>
          <button
            onClick={showPendingToast}
            title="Integração pendente"
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors opacity-60 cursor-not-allowed",
              auto ? "bg-primary" : "bg-muted"
            )}
            aria-disabled="true"
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all", auto ? "left-[22px]" : "left-0.5")} />
          </button>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex gap-2">
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground">IA recalculou preços considerando comissão, frete e margem alvo.</p>
        </div>
      </div>

      {/* Table */}
      <div className="surface-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">Sugestão por canal</h3>
          <span className="text-xs text-muted-foreground">Base: {brl(cost)} · margem alvo {marginPct}%</span>
        </div>
        <div className="overflow-x-auto scrollbar-thin -mx-6 px-6">
          <table className="w-full text-sm border-separate border-spacing-y-1.5 min-w-[720px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="font-medium px-3 py-2">Canal</th>
                <th className="font-medium px-3 py-2">Comissão</th>
                <th className="font-medium px-3 py-2">Imposto</th>
                <th className="font-medium px-3 py-2">Frete</th>
                <th className="font-medium px-3 py-2">Lucro líq.</th>
                <th className="font-medium px-3 py-2 text-right">Preço sugerido</th>
              </tr>
            </thead>
            <tbody>
              {computed.map((r) => (
                <tr key={r.channel} className="bg-muted/40 hover:bg-muted/70 transition-colors">
                  <td className="rounded-l-xl px-3 py-3 font-medium">{r.channel}</td>
                  <td className="px-3 py-3 text-muted-foreground">{r.commission}%</td>
                  <td className="px-3 py-3 text-muted-foreground">{taxPct}%</td>
                  <td className="px-3 py-3 text-muted-foreground">{brl(r.freight)}</td>
                  <td className="px-3 py-3">
                    <span className={cn("inline-flex items-center gap-1 font-semibold", r.lowMargin ? "text-warning" : "text-success")}>
                      {r.lowMargin && <AlertTriangle className="h-3.5 w-3.5" />}
                      {brl(r.profit)}
                    </span>
                  </td>
                  <td className="rounded-r-xl px-3 py-3 text-right font-display font-bold">{brl(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
