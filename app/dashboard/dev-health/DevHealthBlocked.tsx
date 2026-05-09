import { ShieldOff } from "lucide-react";

type Props = {
  reason: string;
};

export function DevHealthBlocked({ reason }: Props) {
  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/50">
        <ShieldOff className="h-7 w-7 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
        Painel técnico indisponível
      </h1>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
        Esta rota é apenas para diagnóstico. Em produção ela permanece oculta até ser liberada de propósito.
      </p>
      <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-left text-sm text-muted-foreground leading-relaxed">
        {reason}
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        Dica: use <span className="font-mono text-foreground">ENABLE_DEV_HEALTH=true</span> na Vercel (Server) durante o diagnóstico; desligue quando terminar.
      </p>
    </div>
  );
}
