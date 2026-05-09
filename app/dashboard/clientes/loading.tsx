import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background p-4 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-36 rounded-md" />
        </div>

        {/* search card */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-2">
                <Skeleton className="h-10 flex-1 rounded-md" />
                <Skeleton className="h-10 w-20 rounded-md" />
                <Skeleton className="h-10 w-20 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-4 w-20" />
          </div>

          {/* table */}
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            {/* thead */}
            <div className="flex gap-4 bg-background/60 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
            {/* rows */}
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-t border-border px-4 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <div className="ml-auto flex gap-2">
                  <Skeleton className="h-9 w-20 rounded-md" />
                  <Skeleton className="h-9 w-20 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
