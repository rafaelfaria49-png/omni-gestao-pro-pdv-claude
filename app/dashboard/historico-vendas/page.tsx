import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { HistoricoVendasClient } from "./HistoricoVendasClient"

export const dynamic = "force-dynamic"
export const revalidate = 0

function HistoricoSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6 w-full min-w-0">
      <Skeleton className="h-10 w-56" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}

export default function HistoricoVendasPage() {
  return (
    <Suspense fallback={<HistoricoSkeleton />}>
      <HistoricoVendasClient />
    </Suspense>
  )
}
