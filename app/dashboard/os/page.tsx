import { Suspense } from "react";
import OsPageClient from "./OsPageClient";
import Loading from "./loading";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <OsPageClient />
    </Suspense>
  );
}
