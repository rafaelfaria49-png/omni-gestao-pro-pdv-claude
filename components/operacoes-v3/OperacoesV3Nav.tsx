"use client";

import { cn } from "@/lib/utils";
import { NAV_BY_ID, NAV_ITEMS } from "./data/navigation";
import type { DataLevel, ScreenId } from "./data/types";

const LEVEL_DOT: Record<DataLevel, string> = {
  real: "bg-[var(--ops-v3-success)]",
  parcial: "bg-[var(--ops-v3-warning)]",
  placeholder: "bg-[var(--ops-v3-faint)]",
};

const RAIL_IDS: ScreenId[] = [
  "dashboard",
  "fila",
  "workspace",
  "bancada",
  "sla",
  "pdv-servico",
  "configuracoes",
];

const TOP_ITEMS = NAV_ITEMS.map((item) => ({
  ...item,
  topLabel:
    item.id === "dashboard"
      ? "Visão geral"
      : item.id === "workspace"
        ? "OS"
        : item.short,
}));

export function OperacoesV3TopTabs({
  active,
  onNavigate,
}: {
  active: ScreenId;
  onNavigate: (id: ScreenId) => void;
}) {
  return (
    <nav className="flex h-[46px] flex-none items-center gap-2 overflow-x-auto border-b border-[var(--ops-v3-line)] bg-[var(--ops-v3-surface)] px-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {TOP_ITEMS.map((item) => {
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
              "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-[12px] font-semibold transition-colors",
              isActive
                ? "border-[var(--ops-v3-primary-bd)] bg-[var(--ops-v3-primary-bg)] text-[var(--ops-v3-primary)] shadow-[var(--ops-v3-shadow-tab-active)]"
                : "border-transparent bg-transparent text-[var(--ops-v3-muted)] hover:border-[var(--ops-v3-line)] hover:bg-[var(--ops-v3-muted-bg)] hover:text-[var(--ops-v3-ink)]",
            )}
          >
            <Icon className="h-[14px] w-[14px]" aria-hidden />
            <span>{item.topLabel}</span>
            {item.dataLevel !== "real" ? (
              <span className={cn("h-1.5 w-1.5 rounded-full", LEVEL_DOT[item.dataLevel])} aria-hidden />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function OperacoesV3MiniRail({
  active,
  onNavigate,
}: {
  active: ScreenId;
  onNavigate: (id: ScreenId) => void;
}) {
  return (
    <nav className="hidden w-[62px] shrink-0 flex-col gap-px border-r border-[var(--ops-v3-line)] bg-[var(--ops-v3-soft-2)] py-[7px] lg:flex">
      {RAIL_IDS.map((id) => {
        const item = NAV_BY_ID[id];
        if (!item) return null;

        const Icon = item.icon;
        const isActive = item.id === active;
        const label = item.id === "dashboard" ? "Visão geral" : item.id === "workspace" ? "OS" : item.short;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            title={item.description}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative mx-[7px] flex min-h-[50px] flex-col items-center gap-[3px] rounded-[10px] px-0.5 pb-1.5 pt-[7px] transition-colors",
              isActive
                ? "bg-[var(--ops-v3-ink)] text-white shadow-[var(--ops-v3-shadow-rail-active)]"
                : "text-[var(--ops-v3-subtle)] hover:bg-[var(--ops-v3-muted-bg)] hover:text-[var(--ops-v3-body)]",
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            <span className="w-full max-w-[50px] text-center text-[9px] font-semibold leading-[10px] tracking-[0.01em]">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
