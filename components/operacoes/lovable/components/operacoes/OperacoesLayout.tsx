import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, BarChart3, Bell, KanbanSquare, LayoutDashboard, PlusCircle, Search, ShieldCheck, Users, Wrench, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeSwitcher, type HubTheme } from "@/components/operacoes/ThemeSwitcher";
import { cn } from "@/lib/utils";

// ── Mapeamento bidirecional de temas ────────────────────────────────────────

const GLOBAL_STORAGE_KEY = "omni-studio-dual-theme";
const GLOBAL_THEME_CLASSES = ["light", "soft-ice", "midnight", "black-edition", "quantum-violet", "coffee-gold"] as const;

/** Hub → Global OmniGestão */
const HUB_TO_GLOBAL: Record<HubTheme, string> = {
  light:      "light",
  "soft-ice": "soft-ice",
  midnight:   "midnight",
  black:      "black-edition",
  "quantum-violet": "quantum-violet",
  "coffee-gold": "coffee-gold",
};

/** Global OmniGestão → Hub */
const GLOBAL_TO_HUB: Record<string, HubTheme> = {
  light:            "light",
  "soft-ice":       "soft-ice",
  midnight:         "midnight",
  "black-edition":  "black",
  "quantum-violet": "quantum-violet",
  "coffee-gold":    "coffee-gold",
};

/** Lê o tema global salvo e retorna o equivalente para o Hub. */
function readGlobalTheme(): HubTheme {
  if (typeof window === "undefined") return "soft-ice";
  const stored = localStorage.getItem(GLOBAL_STORAGE_KEY) ?? "soft-ice";
  return GLOBAL_TO_HUB[stored] ?? "soft-ice";
}

/** Aplica o tema no documento e persiste no localStorage global. */
function applyGlobalTheme(hubTheme: HubTheme) {
  const globalTheme = HUB_TO_GLOBAL[hubTheme];
  const el = document.documentElement;

  el.setAttribute("data-studio-theme", globalTheme);
  GLOBAL_THEME_CLASSES.forEach((c) => el.classList.remove(c));
  el.classList.add(globalTheme);

  localStorage.setItem(GLOBAL_STORAGE_KEY, globalTheme);
}

// ── Navegação ────────────────────────────────────────────────────────────────

const NAV = [
  { to: "/operacoes",              label: "Hub",       icon: LayoutDashboard },
  { to: "/operacoes/dashboard",    label: "Painel",    icon: BarChart3       },
  { to: "/operacoes/os",           label: "Kanban",    icon: KanbanSquare    },
  { to: "/operacoes/tecnicos",     label: "Técnicos",  icon: Users           },
  { to: "/operacoes/historico",    label: "Histórico", icon: History         },
  { to: "/operacoes/garantias",    label: "Garantias", icon: ShieldCheck     },
  { to: "/operacoes/servicos",     label: "Serviços",  icon: Wrench          },
  { to: "/operacoes/notificacoes", label: "Notif.",    icon: Bell            },
];

// ── Componente ───────────────────────────────────────────────────────────────

export function OperacoesLayout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<HubTheme>("soft-ice");
  const { pathname } = useLocation();

  // Inicializa tema a partir do tema global salvo.
  useEffect(() => {
    setTheme(readGlobalTheme());
  }, []);

  const handleThemeChange = (t: HubTheme) => {
    setTheme(t);
    applyGlobalTheme(t);
  };

  return (
    <div data-hub-theme={theme} className="w-full min-w-0 bg-background text-foreground">
      <header className="z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex w-full items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/operacoes" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold leading-none">Operações HUB</div>
              <div className="text-[11px] text-muted-foreground">OmniGestão Pro</div>
            </div>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active =
                pathname === n.to ||
                (n.to !== "/operacoes" && pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar OS, cliente, técnico..." className="w-64 pl-9" />
            </div>
            <ThemeSwitcher value={theme} onChange={handleThemeChange} />
            <Button variant="outline" size="icon" aria-label="Notificações">
              <Bell className="h-4 w-4" />
            </Button>
            <Button asChild className="gap-2">
              <Link to="/operacoes/os">
                <PlusCircle className="h-4 w-4" />
                Nova OS
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
