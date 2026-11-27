import { Skeleton } from "@/components/configuracoes-v3/components/ui/skeleton";
import { cn } from "@/components/configuracoes-v3/lib/utils";

export function SettingsCardSkeleton({
  rows = 3,
  variant = "default",
  label,
  className,
}: {
  rows?: number;
  variant?: "default" | "form" | "resources";
  /** Quando informado, anuncia carregamento acessível com role="status". */
  label?: string;
  className?: string;
}) {
  return (
    <div
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("cfg-card overflow-hidden", className)}
    >
      {label ? <span className="sr-only">{label}</span> : null}

      <div
        className="flex items-center gap-2.5 border-b px-4 py-3.5 sm:px-5"
        style={{ borderColor: "var(--cfg-border)" }}
      >
        <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full max-w-sm" />
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        {variant === "form" ? (
          <div className="grid grid-cols-12 gap-3.5">
            <div className="col-span-12 sm:col-span-7 space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="col-span-12 sm:col-span-5 space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        ) : variant === "resources" ? (
          <div className="space-y-3.5">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
