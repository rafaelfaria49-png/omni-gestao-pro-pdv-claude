"use client";

import { cn } from "@/components/configuracoes/lovable/lib/utils";
import type { SettingsSectionId, SettingsSectionMeta } from "@/components/configuracoes/lovable/features/settings/sections";
import {
  type LucideIcon,
  CreditCard,
  Palette,
  Settings,
  Shield,
  Sparkles,
  Store,
  Unplug,
  Users,
  Wallet,
  ShoppingCart,
} from "lucide-react";

type Props = {
  sections: SettingsSectionMeta[];
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  className?: string;
};

function sectionIcon(id: SettingsSectionId): LucideIcon {
  switch (id) {
    case "geral":
      return Settings;
    case "usuarios":
      return Users;
    case "seguranca":
      return Shield;
    case "aparencia":
      return Palette;
    case "integracoes":
      return Unplug;
    case "ia":
      return Sparkles;
    case "lojas":
      return Store;
    case "pdv":
      return CreditCard;
    case "vendas":
      return ShoppingCart;
    case "financeiro":
      return Wallet;
    default:
      return Settings;
  }
}

export function SettingsSidebar({ sections, active, onSelect, className }: Props) {
  return (
    <div className={cn("lovable-settings-sidebar", className)}>
      <div className="lovable-settings-sidebar-inner sticky top-6 space-y-8">
        <div className="lovable-settings-sidebar-intro">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Configurações
          </p>
          <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
            Preferências e integrações do workspace.
          </p>
        </div>

        <nav className="lovable-settings-sidebar-nav flex flex-col gap-2" aria-label="Seções de configuração">
          {sections.map((s) => {
            const isActive = s.id === active;
            const Icon = sectionIcon(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg border border-transparent px-4 py-2.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-[hsl(var(--primary)/0.1)] font-medium text-[hsl(var(--primary))]"
                    : "text-muted-foreground hover:bg-muted",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                      : "bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate leading-snug">{s.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
