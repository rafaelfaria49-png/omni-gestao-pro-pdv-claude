import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full min-w-0 gap-0 overflow-hidden">
      {/* sidebar de conversas */}
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

      {/* área de chat */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* header do chat */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>

        {/* mensagens */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex justify-start">
            <Skeleton className="h-12 w-56 rounded-lg" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-44 rounded-lg" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-16 w-64 rounded-lg" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-52 rounded-lg" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-12 w-48 rounded-lg" />
          </div>
        </div>

        {/* input */}
        <div className="flex items-center gap-2 border-t border-border p-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>

      {/* painel direito (abas) */}
      <div className="hidden w-72 shrink-0 flex-col gap-3 border-l border-border p-4 xl:flex">
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
