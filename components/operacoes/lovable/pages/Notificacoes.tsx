import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { Bell, Clock } from "lucide-react";

export default function NotificacoesPage() {
  return (
    <OperacoesLayout>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Notificações automáticas</h1>
          <p className="text-sm text-muted-foreground">Alertas por WhatsApp, e-mail e painel interno</p>
        </div>
      </div>

      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background">
          <Clock className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="mt-5 text-base font-semibold text-foreground">Em breve</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          A matriz de eventos × canais (WhatsApp, e-mail, notificação interna) ainda não está conectada ao
          servidor. Nenhuma preferência salva aqui dispara mensagens reais.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Use o WhatsApp HUB para conversas manuais e o fluxo de OS para orçamentos com persistência real.
        </p>
      </div>
    </OperacoesLayout>
  );
}
