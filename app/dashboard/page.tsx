import { Suspense } from "react"
import DashboardPageClient from "./DashboardPageClient"
import Loading from "./loading"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardPageClient />
    </Suspense>
  )
}
