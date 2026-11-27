"use client";

/**
 * Prévia do cupom: MESMA estrutura e mesmos textos do HTML real (`printPdvSaleReceipt` +
 * `buildPdvNonFiscalNoticeHtml` + `openThermalHtmlPrint`), em escala física 1:1 (CSS mm). A paridade é coberta
 * por teste (`pdv-station.component.test.ts`).
 */
import type { PdvImpressaoConfig } from "@/lib/pdv-impressao-config";
import { resolveCupomRodape } from "@/lib/pdv-impressao-config";
import { PDV_NON_FISCAL_EXPLANATION, PDV_NON_FISCAL_NOTICE } from "@/lib/pdv-non-fiscal-notice";
import { brl, COLS, SAMPLE_SALE } from "./pdv-station-model";

export type ReceiptStore = {
  nomeFantasia: string;
  cnpj: string;
  /** Mesma linha que o PDV imprime (`getEnderecoDocumentos()`). */
  enderecoLinha?: string;
  logoUrl?: string | null;
};

export function ReceiptPreview({
  config,
  store,
  receiptFooter,
  showVias,
  dataHora,
}: {
  config: PdvImpressaoConfig;
  store: ReceiptStore;
  receiptFooter: string | null;
  showVias: boolean;
  dataHora: string;
}) {
  const footer = resolveCupomRodape(config, receiptFooter);
  const bobina = config.bobinaTamanho;
  const vias = showVias ? Math.min(5, Math.max(1, Math.round(config.viasCupom) || 1)) : 1;
  const back = Array.from({ length: Math.min(vias - 1, 3) }, (_, i) => i + 1).reverse();
  return (
    <figure className="m-0 flex flex-col items-center" aria-label="Prévia do cupom com venda de exemplo" data-testid="pdv-receipt-preview">
      <div className="cx-dim cx-mono text-[11px]" data-bobina={bobina} aria-hidden>
        <i />
        <span>
          {bobina === "58mm" ? "58 mm" : "80 mm"} · {COLS[bobina]} col
        </span>
        <i />
      </div>
      <div className="cx-paper-wrap" style={{ marginRight: back.length * 6, marginBottom: back.length * 6 }}>
        {back.map((n) => (
          <div key={n} className="cx-sheet-back" style={{ transform: `translate(${n * 6}px, ${n * 6}px)` }} aria-hidden />
        ))}
        <div className="cx-paper" data-bobina={bobina}>
          {config.logoNoCupom && store.logoUrl ? (
            <div className="cx-logo-slot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={store.logoUrl} alt="" style={{ maxWidth: "90%", maxHeight: 48, objectFit: "contain" }} />
            </div>
          ) : null}
          <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 6 }}>{store.nomeFantasia}</div>
          <div style={{ textAlign: "center", fontSize: 11, marginBottom: 4 }}>CNPJ {store.cnpj}</div>
          {store.enderecoLinha?.trim() ? <div style={{ fontSize: 10, marginBottom: 8 }}>{store.enderecoLinha.trim()}</div> : null}
          <div className="cx-sep" />
          <div style={{ textAlign: "center", margin: "6px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{PDV_NON_FISCAL_NOTICE}</div>
            <div style={{ fontSize: 9 }}>{PDV_NON_FISCAL_EXPLANATION}</div>
          </div>
          <div className="cx-sep" />
          <div style={{ fontSize: 11 }}>
            <div className="cx-row2">
              <span>Venda:</span>
              <span>{SAMPLE_SALE.numeroVenda}</span>
            </div>
            <div className="cx-row2">
              <span>Data:</span>
              <span>{dataHora}</span>
            </div>
            <div className="cx-row2">
              <span>Operador:</span>
              <span>{SAMPLE_SALE.operador}</span>
            </div>
          </div>
          <div className="cx-sep" />
          {config.comprovanteModo === "simplificado" ? (
            <p style={{ textAlign: "center", fontSize: 11 }}>{SAMPLE_SALE.itens.length} item(ns)</p>
          ) : (
            SAMPLE_SALE.itens.map((it) => (
              <p key={it.name}>
                {it.quantity}x {it.name} — {brl(it.lineTotal)}
              </p>
            ))
          )}
          <div className="cx-sep" />
          <p>Subtotal: {brl(SAMPLE_SALE.subtotal)}</p>
          <p style={{ fontWeight: 700 }}>Total: {brl(SAMPLE_SALE.total)}</p>
          <div className="cx-sep" />
          <p style={{ fontSize: 10, fontWeight: 600, margin: "0 0 2px" }}>PAGAMENTO</p>
          {SAMPLE_SALE.pagamentos.map((p) => (
            <div key={p.label} className="cx-row2">
              <span>{p.label}</span>
              <span>{brl(p.valor)}</span>
            </div>
          ))}
          {footer ? <div style={{ fontSize: 10, marginTop: 8, whiteSpace: "pre-wrap" }}>{footer}</div> : null}
        </div>
      </div>
      <figcaption className="sr-only">
        Venda de exemplo, sem valor fiscal. Bobina {bobina}, comprovante {config.comprovanteModo}
        {vias > 1 ? `, ${vias} vias` : ""}.
      </figcaption>
    </figure>
  );
}
