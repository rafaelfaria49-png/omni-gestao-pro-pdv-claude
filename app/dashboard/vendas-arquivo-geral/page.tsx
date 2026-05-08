import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { VendasArquivoGeral } from "@/components/dashboard/vendas/vendas-arquivo-geral"

export const dynamic = "force-dynamic"
export const revalidate = 0

function VendasArquivoSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6 w-full min-w-0">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  )
}

export default function VendasArquivoGeralPage() {
  return (
    <Suspense fallback={<VendasArquivoSkeleton />}>
      <VendasArquivoGeral />
    </Suspense>
  )
}
