"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

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
    loading: () => (
      <div className="w-full min-w-0 max-w-full p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    ),
  }
);

export default function OperacoesV2Page() {
  return (
    <div className="-mx-4 min-w-0 sm:-mx-6 lg:-mx-8">
      <OperacoesHubIsolated />
    </div>
  );
}
