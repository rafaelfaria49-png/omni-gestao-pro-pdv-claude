"use client";

import { StatusPill } from "../StatusPill";
import { Plus, RefreshCw, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

type Account = { name: string; status: "online" | "warning" | "syncing" | "error"; orders: number };
type Channel = { id: string; name: string; initial: string; color: string; accounts: Account[] };

const channels: Channel[] = [
  { id: "ml", name: "Mercado Livre", initial: "ML", color: "bg-yellow-400 text-zinc-900",
    accounts: [
      { name: "Loja Principal", status: "online", orders: 842 },
      { name: "Outlet ML", status: "warning", orders: 117 },
    ]},
  { id: "sh", name: "Shopee", initial: "SH", color: "bg-orange-500 text-white",
    accounts: [
      { name: "Shopee Brasil", status: "online", orders: 524 },
    ]},
  { id: "az", name: "Amazon", initial: "AZ", color: "bg-sky-500 text-white",
    accounts: [
      { name: "Seller Central BR", status: "syncing", orders: 318 },
    ]},
  { id: "ns", name: "Nuvemshop", initial: "NS", color: "bg-emerald-500 text-white",
    accounts: [
      { name: "Loja Oficial", status: "error", orders: 89 },
    ]},
];

export function ConexoesTab() {
  const { toast } = useToast();
  const showPendingToast = () =>
    toast({ title: "Integração pendente", description: PENDING_TOAST_DESCRIPTION });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {channels.map((ch) => (
        <div key={ch.id} className="surface-card surface-card-hover p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("grid h-12 w-12 place-items-center rounded-xl font-bold text-sm shadow-sm", ch.color)}>
                {ch.initial}
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold">{ch.name}</h3>
                <p className="text-xs text-muted-foreground">{ch.accounts.length} {ch.accounts.length === 1 ? "conta conectada" : "contas conectadas"}</p>
              </div>
            </div>
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary transition-colors cursor-not-allowed opacity-80"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar conta
            </button>
          </div>

          <ul className="mt-5 space-y-2.5">
            {ch.accounts.map((a) => (
              <li key={a.name} className="rounded-xl border border-border p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.orders} pedidos · últimos 30 dias</p>
                  </div>
                  <StatusPill status={a.status} label={a.status === "online" ? "Ativa" : a.status === "error" ? "Reautenticar" : a.status === "warning" ? "Reautenticar" : "Sincronizando"} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={showPendingToast}
                    title="Integração pendente"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity cursor-not-allowed opacity-80"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Sincronizar agora
                  </button>
                  <button
                    onClick={showPendingToast}
                    title="Integração pendente"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary/40 hover:text-primary transition-colors cursor-not-allowed opacity-80"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Reautenticar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
