import { Skeleton } from "@/components/configuracoes-v3/components/ui/skeleton";
import { cn } from "@/components/configuracoes-v3/lib/utils";

export function SettingsCardSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-6 py-5 shadow-sm",
        className,
      )}
      aria-hidden
    >
      <Skeleton className="mb-4 h-5 w-40" />
      <Skeleton className="mb-6 h-4 w-full max-w-md" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
