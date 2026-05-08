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
    console.error("[os] erro:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
      <h2 className="text-lg font-semibold text-foreground">Falha ao carregar Ordens de Serviço</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        {error.message ?? "Ocorreu um erro inesperado. Tente novamente."}
      </p>
      <Button onClick={reset} variant="outline">
        Tentar novamente
      </Button>
    </div>
  );
}
