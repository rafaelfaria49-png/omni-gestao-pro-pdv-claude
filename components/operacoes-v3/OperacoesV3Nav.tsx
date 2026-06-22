"use client";

import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./data/navigation";
import type { DataLevel, ScreenId } from "./data/types";

const LEVEL_DOT: Record<DataLevel, string> = {
  real: "bg-success",
  parcial: "bg-warning",
  placeholder: "bg-muted-foreground/40",
};

export function OperacoesV3Nav({
  active,
  onNavigate,
}: {
  active: ScreenId;
  onNavigate: (id: ScreenId) => void;
}) {
  return (
    <>
      {/* Desktop — rail de ícones com rótulo (62 px) */}
      <nav className="hidden w-[62px] shrink-0 flex-col gap-px overflow-y-auto border-r border-border bg-muted/30 py-[7px] lg:flex">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              title={item.description}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative mx-[7px] flex flex-col items-center gap-[3px] rounded-[10px] px-0.5 pb-1.5 pt-[7px] transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              <span className="w-full truncate text-center text-[9px] font-semibold leading-none tracking-[0.01em]">
                {item.short}
              </span>
              {/* Sinal de maturidade do dado — só destaca telas ainda não 100% reais */}
              {item.dataLevel !== "real" ? (
                <span
                  className={cn(
                    "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full",
                    LEVEL_DOT[item.dataLevel],
                  )}
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
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
