"use client";

import { cn } from "@/lib/utils";
import { NAV_GROUPS, NAV_ITEMS } from "./data/navigation";
import type { DataLevel, NavItem, ScreenId } from "./data/types";

const LEVEL_DOT: Record<DataLevel, string> = {
  real: "bg-success",
  parcial: "bg-warning",
  placeholder: "bg-muted-foreground/40",
};

const LEVEL_LABEL: Record<DataLevel, string> = {
  real: "Dados reais",
  parcial: "Parcial",
  placeholder: "Em construção",
};

function DesktopItem({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (id: ScreenId) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      title={item.description}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", LEVEL_DOT[item.dataLevel])}
        title={LEVEL_LABEL[item.dataLevel]}
        aria-hidden
      />
    </button>
  );
}

export function OperacoesV3Nav({
  active,
  onNavigate,
}: {
  active: ScreenId;
  onNavigate: (id: ScreenId) => void;
}) {
  return (
    <>
      {/* Desktop — sidebar vertical agrupada */}
      <nav className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card/40 p-3 lg:flex">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-3">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((n) => n.group === group.id).map((item) => (
                <DesktopItem key={item.id} item={item} active={item.id === active} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 pt-3 text-[11px] text-muted-foreground">
          {(["real", "parcial", "placeholder"] as DataLevel[]).map((lvl) => (
            <span key={lvl} className="inline-flex items-center gap-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", LEVEL_DOT[lvl])} aria-hidden />
              {LEVEL_LABEL[lvl]}
            </span>
          ))}
        </div>
      </nav>

      {/* Mobile — faixa horizontal de chips */}
      <div className="lg:hidden">
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-card/40 px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {item.short}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
