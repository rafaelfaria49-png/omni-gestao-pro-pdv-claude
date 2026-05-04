"use client";

import { cn } from "@/lib/utils";
import {
  CreditCard,
  Palette,
  Plug,
  Settings2,
  Shield,
  Sparkles,
  Store,
  Users,
  Wallet,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

export type ConfigV2SectionId =
  | "geral"
  | "usuarios"
  | "aparencia"
  | "lojas"
  | "seguranca"
  | "financeiro"
  | "vendas"
  | "pdv"
  | "ia"
  | "integracoes";

const NAV: { id: ConfigV2SectionId; label: string; icon: LucideIcon }[] = [
  { id: "geral", label: "Geral", icon: Settings2 },
  { id: "usuarios", label: "Usuários", icon: Users },
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "lojas", label: "Lojas", icon: Store },
  { id: "seguranca", label: "Segurança", icon: Shield },
  { id: "financeiro", label: "Financeiro", icon: Wallet },
  { id: "vendas", label: "Vendas", icon: ShoppingCart },
  { id: "pdv", label: "PDV", icon: CreditCard },
  { id: "ia", label: "IA", icon: Sparkles },
  { id: "integracoes", label: "Integrações", icon: Plug },
];

type Props = {
  active: ConfigV2SectionId;
  onSelect: (id: ConfigV2SectionId) => void;
};

export function ConfigSidebar({ active, onSelect }: Props) {
  return (
    <div className="sticky top-6 space-y-6">
      <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">OmniGestão</p>
        <p className="mt-1 text-sm font-semibold text-foreground">Configurações</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Versão de comparação (v2)</p>
      </div>

      <nav className="flex flex-col gap-1.5" aria-label="Secções de configuração">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={cn(
                "config-v2-sidebar-btn flex w-full items-center gap-3 rounded-xl border border-transparent px-3.5 py-2.5 text-left text-sm font-medium transition-colors",
                isActive
                  ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 truncate">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
