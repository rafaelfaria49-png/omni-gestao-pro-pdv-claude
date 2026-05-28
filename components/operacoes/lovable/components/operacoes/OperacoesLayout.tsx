import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, BarChart3, Bell, KanbanSquare, LayoutDashboard, PlusCircle, Search, ShieldCheck, Users, Wrench, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeSwitcher, type HubTheme } from "@/components/operacoes/ThemeSwitcher";
import { cn } from "@/lib/utils";

// ── Mapeamento bidirecional de temas ────────────────────────────────────────

const GLOBAL_STORAGE_KEY = "omni-studio-dual-theme";
const GLOBAL_THEME_CLASSES = ["light", "soft-ice", "midnight", "black-edition", "quantum-violet", "coffee-gold", "ruby-black", "neon-ice", "violet-ice", "coffee-cream"] as const;

/** Hub → Global OmniGestão */
const HUB_TO_GLOBAL: Record<HubTheme, string> = {
  light:      "light",
  "soft-ice": "soft-ice",
  midnight:   "midnight",
  black:      "black-edition",
  "quantum-violet": "quantum-violet",
  "coffee-gold": "coffee-gold",
  "ruby-black": "ruby-black",
  "neon-ice": "neon-ice",
  "violet-ice": "violet-ice",
  "coffee-cream": "coffee-cream",
};

/** Global OmniGestão → Hub */
const GLOBAL_TO_HUB: Record<string, HubTheme> = {
  light:            "light",
  "soft-ice":       "soft-ice",
  midnight:         "midnight",
  "black-edition":  "black",
  "quantum-violet": "quantum-violet",
  "coffee-gold":    "coffee-gold",
  "ruby-black":     "ruby-black",
  "neon-ice":       "neon-ice",
  "violet-ice":     "violet-ice",
  "coffee-cream":   "coffee-cream",
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

  const isScrollable =
    pathname !== "/operacoes/os" &&
    pathname !== "/operacoes/historico";

  return (
    <div data-hub-theme={theme} className="w-full h-full min-w-0 bg-background text-foreground transition-smooth flex flex-col overflow-hidden">
      {/* Sub-Header Integrado e Premium */}
      <div className="border-b border-border/60 bg-background pb-3 flex-none px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Central de Operações</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Timeline, Kanbans, técnicos e garantia de ordens de serviço</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild className="h-9 gap-2">
              <Link to="/operacoes/os">
                <PlusCircle className="h-4 w-4" />
                Nova OS
              </Link>
            </Button>
          </div>
        </div>

        {/* Sub-tabs horizontais discretas (estilo Stripe/Vercel) */}
        <nav className="mt-4 flex items-center gap-1 overflow-x-auto pb-1 scroll-elegant">
          {NAV.map((n) => {
            const active =
              pathname === n.to ||
              (n.to !== "/operacoes" && pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-smooth border",
                  active
                    ? "bg-primary/8 border-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground border-transparent",
                )}
              >
                <n.icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <main
        className={cn(
          "w-full min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-6",
          isScrollable
            ? "overflow-y-auto scroll-elegant"
            : "overflow-hidden flex flex-col h-full min-h-0"
        )}
      >
        {children}
      </main>
    </div>
  );
}
