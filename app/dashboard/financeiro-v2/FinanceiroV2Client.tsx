"use client";

import dynamic from "next/dynamic";

const FinanceiroHubIsolated = dynamic(
  () => import("@/components/financeiro/lovable/FinanceiroHubIsolated").then((m) => m.FinanceiroHubIsolated),
  {
    ssr: false,
    loading: () => (
      <div className="w-full min-w-0 max-w-full overflow-x-hidden p-6 text-sm text-muted-foreground">
        Carregando Financeiro HUB…
      </div>
    ),
  }
);

export default function FinanceiroV2Client() {
  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
      <FinanceiroHubIsolated />
    </div>
  );
}

