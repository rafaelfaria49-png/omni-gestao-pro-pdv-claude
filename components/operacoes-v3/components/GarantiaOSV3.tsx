"use client";
import type { OrdemServico } from "@/types/os";
import type { SalvarGarantiaInputV3 } from "@/lib/operacoes-v3/garantia-actions";
import { GarantiaEditorV3, CoberturasGarantiaResumoV3 } from "./GarantiaEditorV3";
import { ButtonV3 } from "./UiV3";

/** V3 e V4 usam as mesmas coberturas e o mesmo editor auditado. */
export function GarantiaOSV3({ os, storeId, onChanged, onImprimirTermo, salvarGarantia, pending, notificar }: {
  os: OrdemServico; storeId: string | null; onChanged: () => void; onImprimirTermo: () => void;
  salvarGarantia: (input: SalvarGarantiaInputV3) => Promise<boolean>; pending: boolean; notificar: (msg: string) => void;
}) {
  return <section id="garantia" className="space-y-4 rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Garantia da OS</h3><ButtonV3 variant="outline" onClick={onImprimirTermo}>Imprimir termo</ButtonV3></div>
    <CoberturasGarantiaResumoV3 os={os} />
    <details><summary className="cursor-pointer text-sm">Ver condições</summary><div className="mt-3"><CoberturasGarantiaResumoV3 os={os} condicoes /></div></details>
    <GarantiaEditorV3 key={storeId + ":" + os.id} os={os} pending={pending} salvar={async (input) => {
      if (!storeId) { notificar("Selecione uma unidade ativa."); return false; }
      const ok = await salvarGarantia(input); if (ok) onChanged(); return ok;
    }} />
  </section>;
}
