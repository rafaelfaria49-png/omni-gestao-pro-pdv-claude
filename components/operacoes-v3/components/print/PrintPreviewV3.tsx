"use client";

// ============================================================================
// Operações V3 — Fase 1D · Preview de impressão (modal portado para o body).
// ----------------------------------------------------------------------------
// Renderiza o documento A4 num overlay portado para `document.body` (escapa do
// AppShell) + injeta CSS `@media print` que esconde toda a app e imprime só o
// `#og-print-root`. Toolbar (Imprimir/Voltar) tem `data-no-print` e não sai no
// papel. Não cria rota nova; usa a OS já carregada no Workspace.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { montarDocumentoOSV3, type EmpresaPrintInputV3 } from "@/lib/operacoes-v3/print-model";
import { ButtonV3 } from "../UiV3";
import { OSPrintDocumentV3 } from "./OSPrintDocumentV3";

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body * { visibility: hidden !important; }
  [data-og-print-overlay] { position: static !important; inset: auto !important; overflow: visible !important; background: transparent !important; }
  [data-no-print] { display: none !important; }
  #og-print-root, #og-print-root * { visibility: visible !important; }
  #og-print-root { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; margin: 0 !important; box-shadow: none !important; padding-left: 0 !important; padding-right: 0 !important; }
}
`;

export function PrintPreviewV3({
  open,
  os,
  empresa,
  onClose,
}: {
  open: boolean;
  os: OrdemServico | null;
  empresa?: EmpresaPrintInputV3;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Documento montado uma vez por abertura (impressoEm fixa no horário de abrir).
  const doc = useMemo(() => (open && os ? montarDocumentoOSV3(os, empresa, { variante: "cliente" }) : null), [open, os, empresa]);

  // Esc fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted || !doc) return null;

  return createPortal(
    <div data-og-print-overlay className="fixed inset-0 z-[80] overflow-y-auto bg-zinc-700/60">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Toolbar — não imprime */}
      <div data-no-print className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">Impressão da OS · {doc.numero}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">via cliente · A4</span>
        </div>
        <div className="flex items-center gap-2">
          <ButtonV3 variant="ghost" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
          </ButtonV3>
          <ButtonV3 variant="primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir
          </ButtonV3>
        </div>
      </div>

      {/* Folha A4 (preview) */}
      <div className="flex justify-center px-3 py-6">
        <div className="w-full max-w-[820px] rounded-md bg-white shadow-lg">
          <OSPrintDocumentV3 doc={doc} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
