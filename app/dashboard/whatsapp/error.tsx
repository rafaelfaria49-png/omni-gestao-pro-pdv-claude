"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[whatsapp] erro:", error);
  }, [error]);

  return (
    <div className="glass-card mx-auto flex max-w-md flex-col items-center justify-center gap-4 rounded-2xl p-10 text-center">
      <h2 className="text-lg font-semibold text-foreground">Falha ao carregar WhatsApp HUB</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error.message ?? "Ocorreu um erro inesperado. Tente novamente."}
      </p>
      <Button onClick={reset} variant="outline">
        Tentar novamente
      </Button>
    </div>
  );
}
