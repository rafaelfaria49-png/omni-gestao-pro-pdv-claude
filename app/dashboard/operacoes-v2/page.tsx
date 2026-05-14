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
      <div className="-mx-4 min-w-0 overflow-x-hidden sm:-mx-6 lg:-mx-8">
        <div
          className="mx-4 mb-4 min-w-0 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground sm:mx-6 lg:mx-8"
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
        <OperacoesHubIsolated />
      </div>
    </Suspense>
  );
}
