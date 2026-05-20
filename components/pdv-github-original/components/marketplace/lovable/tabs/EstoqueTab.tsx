"use client";

import { AIBadge } from "../AIBadge";
import { Boxes, AlertTriangle, XCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

const stats = [
  { label: "SKUs sincronizados", value: "1.284", icon: Boxes, tone: "text-info bg-info/10" },
  { label: "Estoque baixo", value: "32", icon: AlertTriangle, tone: "text-warning bg-warning/10" },
  { label: "Esgotados", value: "7", icon: XCircle, tone: "text-destructive bg-destructive/10" },
];

const products = [
  { sku: "CG-PRO-001", name: "Cadeira Gamer Pro Preta", channels: ["ML", "SH", "AZ"], stock: 42 },
  { sku: "CG-PRO-002", name: "Cadeira Gamer Pro Vermelha", channels: ["ML", "SH"], stock: 8 },
  { sku: "MS-RGB-010", name: "Mesa Setup RGB 1.40m", channels: ["ML", "NS"], stock: 0 },
  { sku: "HD-XPR-020", name: "Headset XPro Wireless", channels: ["ML", "SH", "AZ", "NS"], stock: 124 },
  { sku: "TC-MEC-099", name: "Teclado Mecânico TKL", channels: ["ML", "AZ"], stock: 17 },
];

const stockTone = (n: number) =>
  n === 0 ? "text-destructive" : n < 15 ? "text-warning" : "text-success";

export function EstoqueTab() {
  const { toast } = useToast();
  const showPendingToast = () =>
    toast({ title: "Integração pendente", description: PENDING_TOAST_DESCRIPTION });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="surface-card surface-card-hover p-5">
              <div className={cn("inline-grid h-10 w-10 place-items-center rounded-xl", s.tone)}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">Produtos</h3>
            <span className="text-xs text-muted-foreground">Atualizado há 4 min</span>
          </div>
          <div className="overflow-x-auto scrollbar-thin -mx-6 px-6">
            <table className="w-full text-sm border-separate border-spacing-y-1.5 min-w-[680px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="font-medium px-3 py-2">SKU</th>
                  <th className="font-medium px-3 py-2">Produto</th>
                  <th className="font-medium px-3 py-2">Sincronizado em</th>
                  <th className="font-medium px-3 py-2 text-right">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.sku} className="bg-muted/40 hover:bg-muted/70 transition-colors">
                    <td className="rounded-l-xl px-3 py-3 font-mono text-xs">{p.sku}</td>
                    <td className="px-3 py-3 font-medium">{p.name}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.channels.map((c) => (
                          <span key={c} className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td className={cn("rounded-r-xl px-3 py-3 text-right font-display font-bold", stockTone(p.stock))}>
                      {p.stock} un.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface-card surface-card-hover p-6 h-fit relative overflow-hidden">
          <div className="absolute inset-0 -z-0 pointer-events-none" style={{ background: "radial-gradient(80% 60% at 100% 0%, hsl(var(--primary)/0.16), transparent 60%)" }} />
          <div className="relative">
            <AIBadge label="IA · Risco detectado" />
            <h3 className="mt-3 font-display text-lg font-semibold">Produtos com risco de ruptura</h3>
            <p className="mt-1 text-sm text-muted-foreground">Baseado na velocidade de venda dos últimos 14 dias.</p>
            <ul className="mt-4 space-y-2">
              {[
                { sku: "MS-RGB-010", days: 0 },
                { sku: "CG-PRO-002", days: 3 },
                { sku: "TC-MEC-099", days: 6 },
              ].map((it) => (
                <li key={it.sku} className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2.5">
                  <span className="text-sm font-medium">{it.sku}</span>
                  <span className="text-xs font-semibold text-warning">{it.days === 0 ? "Esgotado" : `${it.days} dias restantes`}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity cursor-not-allowed opacity-80"
            >
              <Sparkles className="h-4 w-4" /> Repor estoque recomendado
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
