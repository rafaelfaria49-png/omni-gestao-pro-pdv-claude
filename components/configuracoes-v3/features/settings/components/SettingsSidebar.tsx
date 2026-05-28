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
    <aside className="flex h-full w-full flex-col border-r border-border bg-sidebarBg lg:w-72 lg:shrink-0">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight tracking-normal text-foreground">OmniGestão Pro</p>
          <p className="text-xs font-normal tracking-wide text-muted-foreground">Configurações</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-2">
        <ul className="flex flex-col gap-1">
          {SETTINGS_SECTIONS.map((s) => {
            const isActive = !s.href && active === s.id;
            const Icon = s.icon;
            const itemClassName = cn(
              "group flex w-full items-center gap-3 rounded-lg border border-transparent px-4 py-2 text-left text-sm tracking-wide transition-colors",
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

    </aside>
  );
}
