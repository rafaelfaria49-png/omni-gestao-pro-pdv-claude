import { SETTINGS_SECTIONS, SectionId } from "../sections";
import { cn } from "../../../lib/utils";
import { Sparkles } from "lucide-react";

interface SettingsSidebarProps {
  active: SectionId;
  onChange: (id: SectionId) => void;
}

export function SettingsSidebar({ active, onChange }: SettingsSidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-sidebarBg lg:w-72 lg:shrink-0">
      <div className="flex items-center gap-3 border-b border-border px-5 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight tracking-normal text-foreground">OmniGestão Pro</p>
          <p className="text-xs font-normal tracking-wide text-muted-foreground">Configurações</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="flex flex-col gap-2">
          {SETTINGS_SECTIONS.map((s) => {
            const isActive = active === s.id;
            const Icon = s.icon;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onChange(s.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg border border-transparent px-4 py-2.5 text-left text-sm tracking-wide transition-colors",
                    isActive
                      ? "bg-sidebarActive font-semibold text-sidebarActive-foreground"
                      : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-sidebarActive-foreground" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-4">
        <div className="rounded-lg bg-gradient-primary p-3 text-primary-foreground shadow-glow">
          <p className="text-xs font-semibold">Plano Pro</p>
          <p className="mt-0.5 text-[11px] opacity-90">Até 5 lojas e IA ilimitada</p>
        </div>
      </div>
    </aside>
  );
}
