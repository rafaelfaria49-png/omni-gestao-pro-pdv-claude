"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { OperacoesV2LoadingFallback } from "./OperacoesV2LoadingFallback";

/**
 * Rota de validação visual do Operações HUB Lovable.
 *
 * -mx cancela somente o padding lateral do AppShell (px-4/6/8).
 * -my foi removido: o hub não pode sobrepor o header global do OmniGestão.
 * O padding vertical (py-6) do AppShell é mantido intencionalmente.
 */
const OperacoesHubIsolated = dynamic(
  () =>
    import(
      "@/components/operacoes/lovable/OperacoesHubIsolated"
    ).then((m) => m.OperacoesHubIsolated),
  {
    ssr: false,
    loading: () => <OperacoesV2LoadingFallback />,
  }
);

export default function OperacoesV2Page() {
  return (
    <Suspense fallback={<OperacoesV2LoadingFallback />}>
      <div className="w-full h-full min-w-0 flex flex-col overflow-hidden gap-4">
        <div
          className="min-w-0 flex-none rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge className="shrink-0">Fluxo oficial de OS</Badge>
            <span className="text-foreground font-medium">Nova central operacional</span>
          </span>
          <p className="mt-2 leading-relaxed">
            Abertura, diagnóstico, orçamento, aprovação, peças, cobrança, entrega, timeline e garantia — tudo neste Operações HUB.
          </p>
        </div>
        <div className="flex-1 min-h-0 w-full">
          <OperacoesHubIsolated />
        </div>
      </div>
    </Suspense>
  );
}
