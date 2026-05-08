import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="-mx-4 min-w-0 sm:-mx-6 lg:-mx-8">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    </div>
  );
}
