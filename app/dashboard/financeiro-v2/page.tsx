import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import FinanceiroV2Client from "./FinanceiroV2Client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function FinanceiroSkeleton() {
  return (
    <div className="w-full min-w-0 max-w-full p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FinanceiroV2Page() {
  return (
    <Suspense fallback={<FinanceiroSkeleton />}>
      <FinanceiroV2Client />
    </Suspense>
  );
}
