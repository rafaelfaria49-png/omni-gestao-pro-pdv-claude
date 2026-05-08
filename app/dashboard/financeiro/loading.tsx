import { Skeleton } from "@/components/ui/skeleton";

export function FinanceiroRouteSkeleton() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-6 p-10">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-32 w-full max-w-md" />
    </div>
  );
}

export default function Loading() {
  return <FinanceiroRouteSkeleton />;
}
