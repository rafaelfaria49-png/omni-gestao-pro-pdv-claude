"use client";

import { AIBadge } from "../AIBadge";
import { Truck, Package, CheckCircle2, FileText, Tags, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

const stats = [
  { label: "Pedidos pendentes", value: "48", icon: Package, tone: "text-warning bg-warning/10" },
  { label: "Aguardando coleta", value: "23", icon: Truck, tone: "text-info bg-info/10" },
  { label: "Enviados hoje", value: "127", icon: CheckCircle2, tone: "text-success bg-success/10" },
];

const orders = [
  { ch: "ML", id: "#2024-8821", customer: "Marcos A. Silva", nfe: "Emitida", label: "Pronta", total: "R$ 489,90" },
  { ch: "SH", id: "#2024-8820", customer: "Juliana Pereira", nfe: "Pendente", label: "Aguardando", total: "R$ 129,00" },
  { ch: "AZ", id: "#2024-8819", customer: "Rodrigo Lima", nfe: "Emitida", label: "Pronta", total: "R$ 1.249,00" },
  { ch: "NS", id: "#2024-8818", customer: "Carla Mendes", nfe: "Pendente", label: "Aguardando", total: "R$ 342,80" },
  { ch: "ML", id: "#2024-8817", customer: "Felipe Souza", nfe: "Emitida", label: "Pronta", total: "R$ 879,00" },
];

const channelColor: Record<string, string> = {
  ML: "bg-yellow-400 text-zinc-900",
  SH: "bg-orange-500 text-white",
  AZ: "bg-sky-500 text-white",
  NS: "bg-emerald-500 text-white",
};

const tagTone = (s: string) =>
  s === "Emitida" || s === "Pronta" ? "bg-success/10 text-success" : "bg-warning/10 text-warning";

export function ExpedicaoTab() {
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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-display text-lg font-semibold">Pedidos para expedição</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={showPendingToast}
                title="Integração pendente"
                className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-3.5 py-2 text-xs font-semibold hover:opacity-90 transition-opacity cursor-not-allowed opacity-80"
              >
                <FileText className="h-3.5 w-3.5" /> Faturar em lote (NF-e)
              </button>
              <button
                onClick={showPendingToast}
                title="Integração pendente"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:border-primary/40 hover:text-primary transition-colors cursor-not-allowed opacity-80"
              >
                <Tags className="h-3.5 w-3.5" /> Gerar Etiquetas (ZPL/PDF)
              </button>
            </div>
          </div>
          <div className="overflow-x-auto scrollbar-thin -mx-6 px-6">
            <table className="w-full text-sm border-separate border-spacing-y-1.5 min-w-[760px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="font-medium px-3 py-2">Canal</th>
                  <th className="font-medium px-3 py-2">Pedido</th>
                  <th className="font-medium px-3 py-2">Cliente</th>
                  <th className="font-medium px-3 py-2">NF-e</th>
                  <th className="font-medium px-3 py-2">Etiqueta</th>
                  <th className="font-medium px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="bg-muted/40 hover:bg-muted/70 transition-colors">
                    <td className="rounded-l-xl px-3 py-3">
                      <span className={cn("inline-grid h-7 w-7 place-items-center rounded-md text-[10px] font-bold", channelColor[o.ch])}>{o.ch}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{o.id}</td>
                    <td className="px-3 py-3 font-medium">{o.customer}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold", tagTone(o.nfe))}>{o.nfe}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold", tagTone(o.label))}>{o.label}</span>
                    </td>
                    <td className="rounded-r-xl px-3 py-3 text-right font-display font-bold">{o.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface-card surface-card-hover p-6 h-fit relative overflow-hidden">
          <div className="absolute inset-0 -z-0 pointer-events-none" style={{ background: "radial-gradient(80% 60% at 100% 0%, hsl(var(--primary)/0.16), transparent 60%)" }} />
          <div className="relative">
            <AIBadge label="IA · Sugestão automática" />
            <h3 className="mt-3 font-display text-lg font-semibold">IA agrupou pedidos para envio em lote</h3>
            <p className="mt-1 text-sm text-muted-foreground">18 pedidos com mesma região de destino.</p>
            <div className="mt-4 rounded-xl border border-border bg-card/60 p-3 text-sm">
              <p className="font-semibold">Transportadora econômica recomendada</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Economia estimada: <span className="font-semibold text-success">R$ 412,80</span></p>
            </div>
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity cursor-not-allowed opacity-80"
            >
              <Sparkles className="h-4 w-4" /> Aplicar agrupamento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
