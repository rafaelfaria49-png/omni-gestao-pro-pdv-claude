import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Bem-vindo ao OmniGestão Pro</h1>
      <p className="text-muted-foreground mb-8">Acesse seus módulos abaixo.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <MessageCircle className="h-5 w-5" />
            </div>
            <h2 className="font-semibold">WhatsApp Automação HUB</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Atendimento, automações e fluxos via WhatsApp.
          </p>
          <Button asChild size="sm" variant="secondary">
            <Link to="/whatsapp">Abrir <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}
