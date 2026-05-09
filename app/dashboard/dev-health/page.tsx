import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getDevToolsAccessReason, isDevToolsEnabled } from "@/lib/dev-tools/dev-access";
import { DevHealthBlocked } from "./DevHealthBlocked";
import { DevHealthClient } from "./DevHealthClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function DevHealthFallback() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function DevHealthPage() {
  if (!isDevToolsEnabled()) {
    return <DevHealthBlocked reason={getDevToolsAccessReason()} />;
  }

  return (
    <Suspense fallback={<DevHealthFallback />}>
      <DevHealthClient />
    </Suspense>
  );
}
