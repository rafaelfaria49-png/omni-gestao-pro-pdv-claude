"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PdvSection as PdvSectionV3 } from "@/components/configuracoes-v3/features/settings/sections/PdvSection";

/**
 * Caminho legado Lovable — delega ao PDV real (v3).
 * Log separado para confirmar se algum bundle/rota ainda importa este ficheiro.
 */
export function PdvSection() {
  const pathname = usePathname();

  useEffect(() => {
    console.log("[PDV DEBUG]", {
      component: "components/configuracoes/lovable/.../PdvSection (legacy import path)",
      pathname,
      delegatesTo: "configuracoes-v3/features/settings/sections/PdvSection",
    });
  }, [pathname]);

  return (
    <>
      <p
        role="status"
        className="mb-2 rounded-md border border-warning/50 bg-warning/15 px-2 py-1.5 text-center text-[11px] font-mono font-bold text-foreground"
        data-pdv-trace-component="lovable-PdvSection-import-path"
      >
        COMPONENTE LOVABLE — ficheiro lovable/features/settings/sections/PdvSection.tsx (re-export wrapper →
        delega ao v3)
      </p>
      <PdvSectionV3 />
    </>
  );
}
