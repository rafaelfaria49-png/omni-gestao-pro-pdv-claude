import { Skeleton } from "@/components/ui/skeleton"

export function FinanceiroV2LoadingFallback() {
  return (
    <div className="w-full min-w-0 space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[380px] w-full rounded-xl" />
    </div>
  )
}
