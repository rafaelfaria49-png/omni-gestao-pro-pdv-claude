"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function CadastrosV2Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[cadastros-v2] boundary error:", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Falha ao carregar o Cadastros HUB</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ocorreu um erro ao conectar com o banco de dados. Pode ser um cold start do Supabase — tente novamente em instantes.
        </p>
        {error.digest && (
          <p className="text-[11px] font-mono text-muted-foreground/60">digest: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
      >
        <RefreshCw className="h-4 w-4" />
        Tentar novamente
      </button>
    </div>
  );
}
