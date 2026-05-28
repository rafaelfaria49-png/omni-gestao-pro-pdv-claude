import Link from "next/link";
import { SETTINGS_SECTIONS, SectionId } from "../sections";
import { cn } from "../../../lib/utils";
import { Sparkles, CreditCard } from "lucide-react";

interface SettingsSidebarProps {
  active: SectionId;
  onChange: (id: SectionId) => void;
}

export function SettingsSidebar({ active, onChange }: SettingsSidebarProps) {
  return (
    <aside className="settings-sidebar-aside border-r border-border bg-sidebarBg lg:w-64 lg:shrink-0 select-none">
      <div className="settings-sidebar-header border-border">
        <div className="settings-sidebar-logo-box bg-gradient-primary shadow-glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight tracking-normal text-foreground">OmniGestão Pro</p>
          <p className="text-xs font-normal tracking-wide text-muted-foreground">Configurações</p>
        </div>
      </div>

      <nav className="settings-sidebar-nav scroll-elegant">
        <ul className="settings-sidebar-list">
          {SETTINGS_SECTIONS.map((s) => {
            const isActive = !s.href && active === s.id;
            const Icon = s.icon;
            const itemClassName = cn(
              "settings-sidebar-item-btn",
              isActive
                ? "bg-sidebarActive font-semibold text-sidebarActive-foreground"
                : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
            );

            return (
              <li key={s.id}>
                {s.href ? (
                  <Link href={s.href} className={itemClassName}>
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    <span className="truncate">{s.label}</span>
                  </Link>
                ) : (
                  <button type="button" onClick={() => onChange(s.id)} className={itemClassName}>
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-sidebarActive-foreground" : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    <span className="truncate">{s.label}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Acabamento inferior premium */}
      <div className="settings-sidebar-footer border-border/40 bg-muted/5">
        <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground/50">
          OmniGestão Pro
        </p>
        <p className="text-[9px] text-muted-foreground/35 tabular-nums">
          v3.12.0 · Enterprise Cloud
        </p>
      </div>
    </aside>
  );
}
