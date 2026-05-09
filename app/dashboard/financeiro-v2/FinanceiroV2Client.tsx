"use client";

import dynamic from "next/dynamic";
import { FinanceiroV2LoadingFallback } from "./FinanceiroV2LoadingFallback";

const FinanceiroHubIsolated = dynamic(
  () => import("@/components/financeiro/lovable/FinanceiroHubIsolated").then((m) => m.FinanceiroHubIsolated),
  {
    ssr: false,
    loading: () => <FinanceiroV2LoadingFallback />,
  }
);

export default function FinanceiroV2Client() {
  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
      <FinanceiroHubIsolated />
    </div>
  );
}

