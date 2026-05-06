"use client";

import dynamic from "next/dynamic";

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
  { ssr: false }
);

export default function OperacoesV2Page() {
  return (
    <div className="-mx-4 min-w-0 sm:-mx-6 lg:-mx-8">
      <OperacoesHubIsolated />
    </div>
  );
}
