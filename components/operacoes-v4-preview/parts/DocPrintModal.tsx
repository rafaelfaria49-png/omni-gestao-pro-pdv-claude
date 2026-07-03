/**
 * Operações V4 Preview — modal de impressão real (GOAL OPS-V4-DOCS-ASSINATURA-
 * TERMOS-ANEXOS-012).
 *
 * Reaproveita `PrintPreviewV3` (mecanismo de impressão já usado pela V3 — mesmo
 * overlay, mesmo CSS `@media print`, mesmos documentos `montarTermoGarantiaDocV3`/
 * `montarTermoEntregaV3`) em vez de construir um motor de documento novo na V4.
 * Só habilita os dois tipos com contrato de leitura já ligado nesta fase (termo
 * de garantia / termo de entrega); os demais documentos seguem protótipo.
 */
"use client";

import { PrintPreviewV3 } from "@/components/operacoes-v3/components/print/PrintPreviewV3";
import type { V4Vals } from "../use-v4-preview";

const TIPOS_SUPORTADOS = new Set(["termo_garantia", "termo_entrega"]);

export function DocPrintModal({ v }: { v: V4Vals }) {
  const tipo = v.docPrintTipo && TIPOS_SUPORTADOS.has(v.docPrintTipo) ? v.docPrintTipo : null;
  return (
    <PrintPreviewV3
      tipo={tipo}
      os={v.realOS}
      onClose={v.closeDocPrint}
      onPrinted={v.registrarImpressaoDoc}
    />
  );
}
