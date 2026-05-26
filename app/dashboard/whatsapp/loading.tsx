import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-[420px] flex-col gap-3 px-4 pt-4">
      <Skeleton className="h-14 w-full rounded-2xl" />
      <Skeleton className="h-10 w-full max-w-md rounded-xl" />
      <div className="glass-card flex flex-1 overflow-hidden rounded-2xl">
        <div className="flex w-80 shrink-0 flex-col gap-3 border-r border-border p-4">
          <Skeleton className="h-9 w-full" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <Skeleton className="ml-0 h-12 w-56 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-44 rounded-2xl" />
            <Skeleton className="ml-0 h-16 w-64 rounded-2xl" />
          </div>
        </div>
        <div className="hidden w-72 shrink-0 flex-col gap-3 border-l border-border p-4 xl:flex">
          <Skeleton className="h-24 w-full rounded-xl" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
