import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import ThemeSwitcher from "../features/vendas/ThemeSwitcher";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: Replace this placeholder. For sites with multiple pages (About, Services, Contact, etc.),
// create separate route files (about.tsx, services.tsx, contact.tsx) — don't put all pages in this file.
function Index() {
  return (
    <div className="relative min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-6">
      <div className="absolute top-6 right-6">
        <ThemeSwitcher />
      </div>
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center max-w-lg">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium mb-5"
            style={{
              backgroundColor: "hsl(var(--primary) / 0.12)",
              color: "hsl(var(--primary))",
            }}
          >
            OmniGestão Pro
          </span>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">Bem-vindo</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-10">
            Acesso temporário para testes de módulos.
          </p>
          <Link
            to="/vendas"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-7 py-3.5 text-base font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            Abrir Vendas HUB
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
