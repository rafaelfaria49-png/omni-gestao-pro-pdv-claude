import { cn } from "@/lib/utils";
import { LucideIcon, Store } from "lucide-react";

type Item = { id: string; label: string; icon: LucideIcon; active?: boolean; badge?: string };

const items: Item[] = [
  { id: "marketplaces", label: "Marketplace", icon: Store, active: true, badge: "Hub" },
];

export function AppSidebar() {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground font-bold shadow-[var(--shadow-glow)]">
          OG
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold font-display">OmniGestão</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Pro</p>
        </div>
      </div>
      <nav className="px-3 py-2 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.id}
              disabled
              title="Integração pendente"
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all cursor-not-allowed opacity-80",
                it.active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", it.active && "text-primary")} />
              <span className="flex-1 text-left">{it.label}</span>
              {it.badge && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {it.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto p-4">
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs">
          <p className="font-semibold text-sidebar-accent-foreground">Plano Premium</p>
          <p className="mt-0.5 text-muted-foreground">Conexões ilimitadas</p>
        </div>
      </div>
    </aside>
  );
}
