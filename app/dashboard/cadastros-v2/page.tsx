import { Suspense } from "react";
import CadastrosV2Client from "./CadastrosV2Client";
import { CadastrosV2RouteSkeleton } from "./loading";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CadastrosV2Page() {
  return (
    <Suspense fallback={<CadastrosV2RouteSkeleton />}>
      <CadastrosV2Client />
    </Suspense>
  );
}
