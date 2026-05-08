import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { VendasPageClient } from "./vendas-page-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

function VendasSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6 w-full min-w-0">
      <Skeleton className="h-10 w-52" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-[480px] w-full rounded-2xl" />
    </div>
  )
}

export default function DashboardVendasPage() {
  return (
    <Suspense fallback={<VendasSkeleton />}>
      <VendasPageClient />
    </Suspense>
  )
}
