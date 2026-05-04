"use client";

import { cn } from "@/components/configuracoes/lovable/lib/utils";
import type { SettingsSectionId, SettingsSectionMeta } from "../sections";
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
    <aside className={cn("w-full lg:w-56 shrink-0", className)}>
      <div className="sticky top-4 space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Configurações
          </p>
          <p className="mt-1 text-sm text-muted-foreground leading-snug">
            Preferências e integrações do workspace.
          </p>
        </div>

        <nav className="flex flex-col gap-0.5" aria-label="Seções de configuração">
          {sections.map((s) => {
            const isActive = s.id === active;
            const Icon = sectionIcon(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
