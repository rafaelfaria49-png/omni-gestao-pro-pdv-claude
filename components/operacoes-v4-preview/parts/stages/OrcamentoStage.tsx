/** Operações V4 Preview — etapa Orçamento (somente leitura da OS real).
 *
 * GOAL OPS-V4-P0-010: o editor mock (itens fixos, toggle cobrado/brinde/desconto,
 * custo/lucro ao vivo, card "Disponibilidade de peças") foi removido. O stage lê
 * só o que a OS persiste: serviços, peças, total, desconto e versões reais — ou
 * empty state honesto. Distingue orçamento persistido (status enum real) de
 * prévia sintetizada ("Prévia — não aprovado"). Custo/lucro só quando há custo
 * real (Decisão 2). Nenhuma edição, nenhuma consulta de estoque. */
import { C, card, cardTitle, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import type { V4OrcItemView } from "../../os-adapter";

const col2 = "minmax(0,1.55fr) minmax(0,1fr)";
const emptyText = { fontSize: 12, color: C.subtle, padding: "8px 2px", lineHeight: 1.5 } as const;

const STATUS_BG: Record<string, { bg: string; fg: string }> = {
  success: { bg: C.successBg, fg: C.successFg },
  info: { bg: C.infoBg, fg: C.infoFg },
  warn: { bg: C.warnBg, fg: C.warnFg },
  danger: { bg: C.dangerBg, fg: C.dangerFg },
  neutro: { bg: C.line3, fg: C.muted },
};

function ItemRow({ it }: { it: V4OrcItemView }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "8px 0", borderBottom: `1px solid ${C.line4}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.descricao}</div>
        {it.detalhe && <div style={{ fontSize: 10, color: C.subtle }}>{it.detalhe}</div>}
      </div>
      {it.custo && <span style={{ width: 92, textAlign: "right", fontSize: 11, color: C.subtle }}>custo {it.custo}</span>}
      <span style={{ width: 78, textAlign: "right", fontWeight: 600, color: C.ink }}>{it.valor}</span>
    </div>
  );
}

export function OrcamentoStage({ v }: { v: V4Vals }) {
  const o = v.orcamento;

  if (o.estado === "ausente") {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 6 }}>🔧 Orçamento</div>
        <div style={emptyText}>Nenhum orçamento registrado para esta Ordem de Serviço.</div>
      </div>
    );
  }

  const badge = STATUS_BG[o.statusTone] ?? STATUS_BG.neutro;

  return (
    <div style={{ display: "grid", gridTemplateColumns: col2, gap: 12, alignItems: "start" }}>
      <div style={{ ...card, border: `1px solid ${C.primaryBd2}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11, gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={cardTitle}>🔧 Orçamento</span>
            {o.statusLabel && (
              <span style={{ height: 21, padding: "0 9px", display: "inline-flex", alignItems: "center", background: badge.bg, color: badge.fg, borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{o.statusLabel}</span>
            )}
          </div>
          {o.temVersoes && (
            <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap" }}>🕑 {o.versoesCount} {o.versoesCount === 1 ? "versão" : "versões"}</span>
          )}
        </div>

        <div style={{ ...upLabel, marginBottom: 4 }}>Serviços / mão de obra</div>
        {o.servicos.length === 0 ? (
          <div style={emptyText}>Nenhum serviço no orçamento.</div>
        ) : (
          o.servicos.map((it) => <ItemRow key={it.id} it={it} />)
        )}

        <div style={{ ...upLabel, margin: "13px 0 4px" }}>Peças</div>
        {o.pecas.length === 0 ? (
          <div style={emptyText}>Nenhuma peça no orçamento.</div>
        ) : (
          o.pecas.map((it) => <ItemRow key={it.id} it={it} />)
        )}
      </div>

      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 10 }}>Totais</div>
        {o.desconto && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}><span style={{ color: C.muted }}>Desconto</span><span style={{ color: C.warnFg, fontWeight: 500 }}>– {o.desconto}</span></div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 0 5px", borderTop: `1px solid ${C.line2}`, marginTop: 4 }}><span style={{ fontWeight: 700, color: C.ink }}>Total ao cliente</span><span style={{ fontWeight: 700, color: C.ink }}>{o.total}</span></div>
        {o.custoTotal && o.lucroTotal && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8, borderTop: `1px dashed ${C.inputBd}`, marginTop: 8, paddingTop: 9 }}>
            <div><div style={upLabel}>Custo interno</div><div style={{ fontSize: 13, fontWeight: 600, color: C.body }}>{o.custoTotal}</div></div>
            <div><div style={upLabel}>Lucro</div><div style={{ fontSize: 13, fontWeight: 700, color: C.successFg }}>{o.lucroTotal}</div></div>
          </div>
        )}
        {o.isPrevia && (
          <div style={{ fontSize: 10, color: C.subtle, marginTop: 10, lineHeight: 1.5 }}>
            Prévia derivada dos itens da OS — ainda não há orçamento aprovado registrado.
          </div>
        )}
      </div>
    </div>
  );
}
