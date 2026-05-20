"use client";

import {
  ShoppingCart,
  Wrench,
  FileText,
  UserPlus,
  Receipt,
  Package,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

type Action = {
  label: string;
  hint: string;
  icon: LucideIcon;
  shortcut: string;
};

const actions: Action[] = [
  { label: "Nova Venda", hint: "PDV rápido", icon: ShoppingCart, shortcut: "N V" },
  { label: "Nova OS", hint: "Abrir ordem", icon: Wrench, shortcut: "N O" },
  { label: "Orçamento", hint: "Criar proposta", icon: FileText, shortcut: "N P" },
  { label: "Receber", hint: "Baixar conta", icon: Receipt, shortcut: "N R" },
  { label: "Cliente", hint: "Cadastrar", icon: UserPlus, shortcut: "N C" },
  { label: "Produto", hint: "Adicionar item", icon: Package, shortcut: "N I" },
];

export function QuickActions() {
  const router = useRouter();
  const { toast } = useToast();

  const handleAction = (label: Action["label"]) => {
    switch (label) {
      case "Nova Venda":
        router.push("/dashboard/vendas");
        return;
      case "Nova OS":
        router.push("/dashboard/os");
        return;
      case "Cliente":
        router.push("/dashboard/clientes");
        return;
      case "Produto":
        router.push("/dashboard/estoque");
        return;
      case "Orçamento":
      case "Receber":
      default:
        toast({ title: label, description: "Em desenvolvimento" });
        return;
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.label}
            type="button"
            onClick={() => handleAction(a.label)}
            className="group rounded-lg border border-border bg-card hover:bg-panel hover:border-foreground/20 transition-all px-3 py-2.5 text-left flex items-center gap-2.5"
          >
            <div className="h-8 w-8 shrink-0 rounded-md bg-muted/60 ring-1 ring-border/40 grid place-items-center group-hover:bg-primary/15 group-hover:ring-primary/30 group-hover:text-primary transition-colors">
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium tracking-tight truncate">
                {a.label}
              </div>
              <div className="text-[10.5px] text-muted-foreground truncate">{a.hint}</div>
            </div>
            <kbd className="hidden xl:inline-flex font-mono text-[9.5px] text-muted-foreground bg-background/60 border border-border rounded px-1 py-0.5">
              {a.shortcut}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
