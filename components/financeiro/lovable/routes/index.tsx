import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Wallet className="h-6 w-6" />
        </div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          OmniGestão Pro
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Financeiro HUB
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Hub financeiro completo: visão geral, contas a pagar e receber, fluxo de caixa, carteiras e relatórios.
        </p>
        <div className="mt-6">
          <Button asChild size="lg" className="gap-2">
            <Link to="/financeiro">
              Abrir Financeiro <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
