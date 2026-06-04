"use client";

// ============================================================================
// Operações V3 — Fase 2B · Comprovante de Recebimento (preview + impressão)
// ----------------------------------------------------------------------------
// Recibo SIMPLES do recebimento real de uma OS — número da OS, cliente,
// equipamento, formas de pagamento, valor pago, saldo restante, data/hora e
// operador. Modal portado ao `body` com `@media print` (mesma técnica do preview
// da OS), mas é um COMPONENTE SEPARADO: não toca a impressão principal da OS.
//
// Exceção de tokens (documentada, igual ao documento da OS): este é um papel
// impresso (não UI da app) → usa cores fixas branco/preto/cinza confinadas aqui.
// ============================================================================

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer } from "lucide-react";
import type { ComprovanteReciboV3 } from "@/lib/operacoes-v3/payment-model";
import { ButtonV3 } from "../UiV3";
import { formatBRL, formatDataHora } from "../../lib/format";

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body * { visibility: hidden !important; }
  [data-og-recibo-overlay] { position: static !important; inset: auto !important; overflow: visible !important; background: transparent !important; }
  [data-no-print] { display: none !important; }
  #og-recibo-root, #og-recibo-root * { visibility: visible !important; }
  #og-recibo-root { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; margin: 0 !important; box-shadow: none !important; }
}
`;

export function ReciboPreviewV3({ recibo, onClose }: { recibo: ComprovanteReciboV3 | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const open = recibo !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted || !recibo) return null;

  return createPortal(
    <div data-og-recibo-overlay className="fixed inset-0 z-[80] overflow-y-auto bg-zinc-700/60">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div data-no-print className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5 shadow-sm">
        <span className="truncate text-sm font-semibold text-foreground">Comprovante de Recebimento · OS {recibo.numeroOS}</span>
        <div className="flex items-center gap-2">
          <ButtonV3 variant="ghost" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
          </ButtonV3>
          <ButtonV3 variant="primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir
          </ButtonV3>
        </div>
      </div>

      <div className="flex justify-center px-3 py-6">
        <div id="og-recibo-root" className="w-full max-w-[520px] rounded-md bg-white p-6 text-black shadow-lg">
          <div className="border-b border-zinc-300 pb-3 text-center">
            <h1 className="text-base font-bold uppercase tracking-wide">Comprovante de Recebimento</h1>
            <p className="mt-0.5 text-xs text-zinc-500">{recibo.intencaoLabel} · {formatDataHora(recibo.dataHora)}</p>
          </div>

          <dl className="mt-3 space-y-1.5 text-sm">
            <Linha rotulo="Ordem de serviço" valor={recibo.numeroOS} />
            <Linha rotulo="Cliente" valor={recibo.cliente} />
            <Linha rotulo="Equipamento" valor={recibo.equipamento} />
          </dl>

          <div className="mt-4 rounded border border-zinc-300">
            <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase text-zinc-600">
              Formas de pagamento
            </div>
            <table className="w-full text-sm">
              <tbody>
                {recibo.formas.map((f, i) => (
                  <tr key={`${f.forma}-${i}`} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-1.5">{f.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(f.valor)}</td>
                  </tr>
                ))}
                <tr className="bg-zinc-50 font-semibold">
                  <td className="px-3 py-1.5">Valor pago</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(recibo.valorPago)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <dl className="mt-4 space-y-1.5 text-sm">
            <Linha rotulo="Total da OS" valor={formatBRL(recibo.totalOS)} />
            <Linha rotulo="Recebido acumulado" valor={formatBRL(recibo.recebidoAcumulado)} />
            <Linha rotulo="Saldo restante" valor={formatBRL(recibo.saldoRestante)} forte />
            <Linha rotulo="Situação" valor={recibo.statusLabel} />
          </dl>

          {recibo.observacao ? (
            <p className="mt-3 border-t border-zinc-200 pt-2 text-xs text-zinc-600">Obs.: {recibo.observacao}</p>
          ) : null}

          <div className="mt-6 flex items-end justify-between text-xs text-zinc-600">
            <div>
              <p>Operador</p>
              <p className="mt-0.5 font-medium text-black">{recibo.operador}</p>
            </div>
            <div className="text-right">
              <div className="mb-1 w-40 border-t border-zinc-400" />
              <p>Assinatura do cliente</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{rotulo}</dt>
      <dd className={`truncate text-right ${forte ? "text-base font-bold" : "font-medium"}`}>{valor}</dd>
    </div>
  );
}
