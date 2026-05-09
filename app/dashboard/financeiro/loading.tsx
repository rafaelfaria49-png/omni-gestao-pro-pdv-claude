import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-6 p-6">
      <Skeleton className="mx-auto h-8 w-64" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="mx-auto h-4 w-48" />
    </div>
  );
}
