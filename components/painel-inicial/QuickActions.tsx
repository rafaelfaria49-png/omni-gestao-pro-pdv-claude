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
import { useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions";
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions";

type Action = {
  label: string;
  hint: string;
  icon: LucideIcon;
  shortcut: string;
  href?: string;
  visible?: (p: EnterprisePermissions) => boolean;
};

const actions: Action[] = [
  { label: "Nova Venda", hint: "PDV rápido", icon: ShoppingCart, shortcut: "N V", visible: (p) => p.hubs.vendas },
  {
    label: "Nova OS",
    hint: "Abrir ordem",
    icon: Wrench,
    shortcut: "N O",
    visible: (p) => p.hubs.operacoes,
  },
  {
    label: "Orçamento",
    hint: "Criar proposta",
    icon: FileText,
    shortcut: "N P",
    visible: (p) => p.hubs.operacoes || p.hubs.vendas,
  },
  {
    label: "Receber",
    hint: "Contas a receber",
    icon: Receipt,
    shortcut: "N R",
    href: "/dashboard/financeiro/contas-a-receber",
    visible: (p) => p.hubs.financeiro && p.financeiro.view,
  },
  { label: "Cliente", hint: "Cadastrar", icon: UserPlus, shortcut: "N C", visible: (p) => p.hubs.cadastros },
  { label: "Produto", hint: "Adicionar item", icon: Package, shortcut: "N I", visible: (p) => p.hubs.cadastros },
];

export function QuickActions() {
  const router = useRouter();
  const { toast } = useToast();
  const perms = useEnterprisePermissions();

  const filtered = useMemo(() => {
    if (!perms) return actions;
    return actions.filter((a) => (a.visible ? a.visible(perms) : true));
  }, [perms]);

  const handleAction = (label: Action["label"]) => {
    switch (label) {
      case "Nova Venda":
        router.push("/dashboard/vendas");
        return;
      case "Nova OS":
        router.push("/dashboard/operacoes-v2");
        return;
      case "Cliente":
        router.push("/dashboard/clientes");
        return;
      case "Produto":
        router.push("/dashboard/estoque");
        return;
      case "Orçamento":
        router.push("/dashboard/operacoes-v2");
        return;
      case "Receber":
        router.push("/dashboard/financeiro/contas-a-receber");
        return;
      default:
        toast({ title: label, description: "Atalho indisponível." });
        return;
    }
  };

  if (filtered.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-4">
        Nenhum atalho rápido disponível para o seu perfil.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {filtered.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.label}
            type="button"
            onClick={() => handleAction(a.label)}
            className="group rounded-lg border border-border bg-card hover:bg-panel hover:border-foreground/20 transition-all px-3 py-1.5 text-left flex items-center gap-2.5"
          >
            <div className="h-7 w-7 shrink-0 rounded-md bg-muted/60 ring-1 ring-border/40 grid place-items-center group-hover:bg-primary/15 group-hover:ring-primary/30 group-hover:text-primary transition-colors">
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold tracking-tight text-foreground truncate">{a.label}</div>
              <div className="text-[10px] text-muted-foreground truncate">{a.hint}</div>
            </div>
            <kbd className="hidden xl:inline-flex font-mono text-[9px] text-muted-foreground/60 bg-background/60 border border-border/80 rounded px-1">
              {a.shortcut}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
