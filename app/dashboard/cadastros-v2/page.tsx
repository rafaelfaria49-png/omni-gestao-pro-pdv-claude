import { Suspense } from "react";
import CadastrosV2Client from "./CadastrosV2Client";
import { CadastrosV2LoadingFallback } from "./CadastrosV2LoadingFallback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CadastrosV2Page() {
  return (
    <Suspense fallback={<CadastrosV2LoadingFallback />}>
      <CadastrosV2Client />
    </Suspense>
  );
}
