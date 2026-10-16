"use client";

// ============================================================================
// Operações V3 — Fase 1D/1E · Preview de impressão (modal portado ao body).
// ----------------------------------------------------------------------------
// Renderiza o documento escolhido (`tipo`) num overlay portado para
// `document.body` (escapa do AppShell) + injeta CSS `@media print` que esconde
// toda a app e imprime só o `#og-print-root`. Toolbar tem `data-no-print`.
// Suporta: OS cliente · Termo de garantia · Via interna · Etiqueta técnica.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { lerVersoesTermoGarantiaV3 } from "@/lib/operacoes-v3/garantia-termos-model";
import { ArrowLeft, Printer, MessageCircle } from "lucide-react";
import type { LinkWaV4 } from "@/lib/operacoes-v4/orcamento-mensagem";
import { montarLinkWaV4 } from "@/lib/operacoes-v4/orcamento-mensagem";
import { montarMensagemDocumentoV4 } from "@/lib/operacoes-v4/documento-mensagem";
import type { OrdemServico } from "@/types/os";
import {
  montarDocumentoOSV3,
  montarEtiquetaV3,
  montarTermoEntregaV3,
  montarTermoGarantiaDocV3,
  type EmpresaPrintInputV3,
} from "@/lib/operacoes-v3/print-model";
import { documentoMetaV3, type DocumentoTipoV3 } from "@/lib/operacoes-v3/documentos";
import { montarOrcamentoClienteViewV4 } from "@/lib/operacoes-v4/orcamento-cliente-view";
import { ButtonV3 } from "../UiV3";
import { OSPrintDocumentV3 } from "./OSPrintDocumentV3";
import { TermoGarantiaDocV3 } from "./TermoGarantiaDocV3";
import { TermoEntregaDocV3 } from "./TermoEntregaDocV3";
import { EtiquetaTecnicaV3 } from "./EtiquetaTecnicaV3";
// GOAL OPS-V4-ORC-VIEWMODEL-DOC-023: novo documento "Orçamento (via cliente)",
// mesmo motor de impressão — consome a projeção client-safe, nunca a OS crua.
import { OrcamentoClienteDocV4 } from "@/components/operacoes-v4-preview/parts/OrcamentoClienteDocV4";

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
  tipo,
  os,
  empresa,
  onClose,
  onPrinted,
  whatsapp,
}: {
  /** Documento a imprimir; null = fechado. */
  tipo: DocumentoTipoV3 | null;
  os: OrdemServico | null;
  empresa?: EmpresaPrintInputV3;
  onClose: () => void;
  onPrinted?: (tipo: DocumentoTipoV3, versao?: number) => void;
  /** Link wa.me já montado (mesmo contrato do orçamento). Só documentos visíveis ao cliente. */
  whatsapp?: LinkWaV4 | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const open = tipo !== null && !!os;
  const alvo = os?.storeId + ":" + os?.id + ":" + tipo;
  const versoes = lerVersoesTermoGarantiaV3(os);
  const [escolha, setEscolha] = useState<{ alvo: string; versao: number } | null>(null);
  const versao = escolha?.alvo === alvo ? escolha.versao : versoes.at(-1)?.versao;
  const retornoFoco = useRef<HTMLElement | null>(null);
  const docGarantia = useMemo(() => os && tipo === "termo_garantia" ? montarTermoGarantiaDocV3(os, empresa, { versao }) : null, [os, tipo, empresa, versao]);
  const whatsappEfetivo = tipo === "termo_garantia" && os
    ? docGarantia?.limitacao ? null : montarLinkWaV4(docGarantia?.cliente.telefone, montarMensagemDocumentoV4(tipo, os, versao))
    : whatsapp;

  const conteudo = useMemo(() => {
    if (!open || !os || !tipo) return null;
    switch (tipo) {
      case "os_cliente":
        return <OSPrintDocumentV3 doc={montarDocumentoOSV3(os, empresa, { variante: "cliente" })} />;
      case "comprovante_interno":
        return <OSPrintDocumentV3 doc={montarDocumentoOSV3(os, empresa, { variante: "interna" })} />;
      case "termo_garantia":
        return <TermoGarantiaDocV3 doc={docGarantia!} />;
      case "termo_entrega":
        return <TermoEntregaDocV3 doc={montarTermoEntregaV3(os, empresa)} />;
      case "etiqueta":
        return <EtiquetaTecnicaV3 etiqueta={montarEtiquetaV3(os)} />;
      case "orcamento_cliente": {
        const view = montarOrcamentoClienteViewV4(os, empresa);
        return view ? <OrcamentoClienteDocV4 doc={view} /> : null;
      }
      default:
        return null;
    }
  }, [open, os, tipo, empresa, docGarantia]);

  if (!open || !mounted || !conteudo || !tipo) return null;

  const meta = documentoMetaV3(tipo);
  const numero = os?.codigo ?? "";

  const imprimir = () => {
    if (docGarantia?.limitacao) return;
    onPrinted?.(tipo, tipo === "termo_garantia" ? versao : undefined);
    window.print();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(value) => { if (!value) onClose(); }}><Dialog.Portal>
    <Dialog.Content data-og-print-overlay aria-describedby={undefined} onOpenAutoFocus={() => { retornoFoco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onEscapeKeyDown={(e) => e.stopPropagation()} onCloseAutoFocus={(e) => { e.preventDefault(); retornoFoco.current?.focus(); }} className="fixed inset-0 z-[80] overflow-y-auto bg-zinc-700/60 outline-none">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div data-no-print className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Dialog.Title className="truncate text-sm font-semibold text-foreground">{meta.label} · {numero}</Dialog.Title>
          {!meta.cliente ? (
            <span className="hidden rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning sm:inline">uso interno</span>
          ) : (
            <span className="hidden text-xs text-muted-foreground sm:inline">A4</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonV3 variant="ghost" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
          </ButtonV3>
          {meta.cliente && whatsappEfetivo && whatsappEfetivo.valido ? (
            <ButtonV3
              variant="outline"
              onClick={() => window.open(whatsappEfetivo.url, "_blank", "noopener,noreferrer")}
            >
              <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
            </ButtonV3>
          ) : null}
          {meta.cliente && whatsappEfetivo && !whatsappEfetivo.valido ? (
            <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground sm:inline" title={whatsappEfetivo.motivo}>
              {whatsappEfetivo.motivo}
            </span>
          ) : null}
          {tipo === "termo_garantia" && versoes.length ? <label className="text-xs">Versão<select aria-label="Versão do termo" className="ml-2 rounded border bg-background p-1" value={versao} onChange={(e) => setEscolha({ alvo, versao: Number(e.target.value) })}>{versoes.map((v) => <option key={v.versao} value={v.versao}>v{v.versao} · {v.tipo === "original" ? "Original" : v.tipo === "aditivo" ? "Aditivo" : v.tipo === "correcao_data" ? "Correção de data" : "Reemissão de legado"}</option>)}</select></label> : null}
          <ButtonV3 variant="primary" disabled={!!docGarantia?.limitacao} onClick={imprimir}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir
          </ButtonV3>
        </div>
      </div>

      <div className="flex justify-center px-3 py-6">
        <div className="w-full max-w-[820px] rounded-md bg-white shadow-lg">
          {conteudo}
        </div>
      </div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  );
}
