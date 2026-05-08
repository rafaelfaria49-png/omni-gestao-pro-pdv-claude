import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
      {/* page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* summary cards — 4 KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* channel connection cards */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 rounded-xl border border-border p-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* quick action buttons */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-36 rounded-md" />
        ))}
      </div>

      {/* products table */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
        <div className="rounded-xl border border-border">
          {/* thead */}
          <div className="flex gap-4 border-b border-border px-4 py-3">
            {[140, 100, 60, 80, 80, 60].map((w, i) => (
              <Skeleton key={i} className={`h-4 w-${w} shrink-0`} style={{ width: w }} />
            ))}
          </div>
          {/* rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-border px-4 py-3 last:border-0">
              <Skeleton className="h-4 shrink-0" style={{ width: 140 }} />
              <Skeleton className="h-4 shrink-0" style={{ width: 100 }} />
              <Skeleton className="h-4 shrink-0" style={{ width: 60 }} />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 shrink-0" style={{ width: 80 }} />
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* orders table */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-36" />
        <div className="rounded-xl border border-border">
          <div className="flex gap-4 border-b border-border px-4 py-3">
            {[80, 120, 80, 80, 70, 90].map((w, i) => (
              <Skeleton key={i} className="h-4 shrink-0" style={{ width: w }} />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-border px-4 py-3 last:border-0">
              {[80, 120, 80, 80, 70, 90].map((w, j) => (
                <Skeleton key={j} className="h-4 shrink-0" style={{ width: w }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
