import { Skeleton } from "@/components/ui/skeleton";

export function MasterConsoleSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Carregando Master Console">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[7.5rem] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <Skeleton className="min-h-[320px] rounded-2xl" />
        <Skeleton className="min-h-[320px] rounded-2xl" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}
