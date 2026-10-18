"use client";

import { useState } from "react";
import { C, fmt } from "../../tokens";
import { reaisParaCentavosV4, sugerirPrecoTelaCentavos } from "@/lib/operacoes-v4/precificacao-telas";
import type { OrcamentoRapidoVarianteFormV4 } from "@/lib/operacoes-v4/orcamento-rapido-form";
import { atendInput, atendLabel } from "./field-styles";

export function CommercialOptionEditor({
  index,
  value,
  onChange,
  onRemove,
  canRemove,
  precificacaoTelaHabilitada = false,
  resultadoBrutoCentavos,
  motivoResultado,
  disabled = false,
}: {
  index: number;
  value: OrcamentoRapidoVarianteFormV4;
  onChange: (next: OrcamentoRapidoVarianteFormV4) => void;
  onRemove: () => void;
  canRemove: boolean;
  precificacaoTelaHabilitada?: boolean;
  resultadoBrutoCentavos: number | null;
  motivoResultado?: string;
  disabled?: boolean;
}) {
  const [sugestao, setSugestao] = useState<{ custo: number; preco: number } | null>(null);
  const custoCentavos = reaisParaCentavosV4(value.custoV3);
  const precoSugerido = sugerirPrecoTelaCentavos(custoCentavos);
  const sugestaoAtual = precificacaoTelaHabilitada && sugestao?.custo === custoCentavos ? sugestao : null;
  const recomendada = value.badge.trim().toLowerCase() === "recomendada";

  return (
    <fieldset disabled={disabled} style={{ border: `1px solid ${C.line2}`, borderRadius: 12, padding: 12, margin: "0 0 8px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.subtle }}>Opção {index + 1}</span>
        <button type="button" onClick={onRemove} disabled={!canRemove} aria-label={`Remover opção ${index + 1}`} style={{ height: 22, width: 22, border: "none", background: "transparent", color: canRemove ? C.dangerFg : C.muted, cursor: canRemove ? "pointer" : "default" }}>
          ×
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 8, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={atendLabel}>Rótulo *</div>
          <input aria-label={`Rótulo da opção ${index + 1}`} value={value.rotulo} onChange={(e) => onChange({ ...value, rotulo: e.target.value })} placeholder="Tela Premium" style={atendInput} maxLength={60} autoComplete="off" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={atendLabel}>Venda *</div>
          <input aria-label={`Venda da opção ${index + 1}`} type="number" min={0} step="0.01" value={value.valor || ""} onChange={(e) => onChange({ ...value, valor: Math.max(0, Number(e.target.value) || 0) })} placeholder="R$" style={atendInput} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={atendLabel}>Garantia (dias)</div>
          <input aria-label={`Garantia da opção ${index + 1} (dias)`} type="number" min={0} value={value.garantiaDias || ""} onChange={(e) => onChange({ ...value, garantiaDias: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} placeholder="Não informada" style={atendInput} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 8, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={atendLabel}>Descrição para o cliente</div>
          <input value={value.descricaoCurta} onChange={(e) => onChange({ ...value, descricaoCurta: e.target.value })} placeholder="Ótima qualidade de imagem" style={atendInput} maxLength={120} autoComplete="off" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={atendLabel}>Tempo estimado do serviço</div>
          <input value={value.prazoTexto} onChange={(e) => onChange({ ...value, prazoTexto: e.target.value })} placeholder="2 horas" aria-label="Tempo estimado do serviço" title="Duração do serviço. Não é a previsão de entrega ao cliente." style={atendInput} maxLength={40} autoComplete="off" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={atendLabel}>Selo</div>
          <input value={value.badge} onChange={(e) => onChange({ ...value, badge: e.target.value })} placeholder="Recomendada" style={atendInput} maxLength={24} autoComplete="off" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 8, alignItems: "end" }}>
        <div style={{ minWidth: 0 }}>
          <div style={atendLabel}>Custo interno</div>
          <input aria-label={`Custo interno da opção ${index + 1}`} type="number" min={0} step="0.01" value={value.custoV3 || ""} onChange={(e) => onChange({ ...value, custoV3: Math.max(0, Number(e.target.value) || 0) })} placeholder="Não informado" title="Custo interno — não aparece para o cliente." style={{ ...atendInput, background: C.muted100, color: C.subtle }} />
        </div>
        <div
          style={{
            border: `1px dashed ${C.line2}`,
            background: C.muted100,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            color: C.subtle,
            lineHeight: 1.45,
            minWidth: 0,
          }}
        >
          <div aria-live="polite">
            Resultado bruto estimado: {resultadoBrutoCentavos != null ? fmt(resultadoBrutoCentavos / 100) : "indisponível"}.
          </div>
          {motivoResultado ? <div>{motivoResultado}</div> : null}
          Prévia interna desta alternativa; não realizada.
          {recomendada ? " · recomendada" : ""}
        </div>
      </div>
      {precificacaoTelaHabilitada ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, minWidth: 0, marginTop: 10, fontSize: 12 }}>
          <button
            type="button"
            disabled={precoSugerido == null}
            onClick={() => { if (precoSugerido != null && custoCentavos != null) setSugestao({ custo: custoCentavos, preco: precoSugerido }); }}
            style={{ border: `1px solid ${C.inputBd}`, borderRadius: 7, background: C.surface, color: C.body, padding: "8px 10px", cursor: precoSugerido == null ? "default" : "pointer" }}
          >Sugerir preço</button>
          {precoSugerido == null ? <span style={{ color: C.subtle }}>Informe um custo de tela válido, maior que zero, para sugerir.</span> : null}
          {sugestaoAtual ? (
            <>
              <span role="status" style={{ minWidth: 0, color: C.body }}>Sugestão: {fmt(sugestaoAtual.preco / 100)}. Revise antes de aplicar.</span>
              <button type="button" onClick={() => { onChange({ ...value, valor: sugestaoAtual.preco / 100 }); setSugestao(null); }} style={{ border: `1px solid ${C.primary}`, borderRadius: 7, background: C.primaryBg, color: C.body, padding: "8px 10px", cursor: "pointer" }}>Aplicar sugestão</button>
            </>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
