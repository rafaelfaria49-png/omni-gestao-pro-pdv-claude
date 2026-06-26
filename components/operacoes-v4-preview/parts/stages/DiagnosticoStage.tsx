/** Operações V4 Preview — etapa Diagnóstico (somente leitura da OS real).
 *
 * GOAL OPS-V4-P0-009: o laudo/técnico/causa/solução fabricados e o "Histórico do
 * aparelho" inventado (OS-2025-2207, garantia 08/2025) foram removidos. O stage
 * lê só o que a OS persiste — defeito relatado, observações técnicas (parecer),
 * anexos/laudos de diagnóstico e eventos de diagnóstico da timeline — ou exibe
 * empty state honesto. Nada de valor inventado. */
import { C, card, cardTitle, upLabel, HATCH } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const fieldBox = {
  border: `1px solid ${C.line2}`,
  borderRadius: 8,
  background: C.surface2,
  padding: 9,
  fontSize: 12,
  lineHeight: 1.5,
  color: C.body,
} as const;

const emptyText = { fontSize: 12, color: C.subtle, padding: "8px 2px", lineHeight: 1.5 } as const;

export function DiagnosticoStage({ v }: { v: V4Vals }) {
  const d = v.diag;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 12, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 11 }}>🩺 Diagnóstico técnico</div>
          <div style={{ ...upLabel, marginBottom: 4 }}>Defeito relatado</div>
          <div style={{ ...fieldBox, minHeight: 44, color: d.temDefeito ? C.body : C.subtle }}>{d.defeito}</div>

          <div style={{ ...upLabel, margin: "13px 0 6px" }}>Parecer técnico (observações)</div>
          {d.observacoes.length === 0 ? (
            <div style={emptyText}>Nenhuma observação técnica registrada.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {d.observacoes.map((o) => (
                <div key={o.id} style={{ border: `1px solid ${C.line2}`, borderRadius: 8, background: C.surface2, padding: 9 }}>
                  <div style={{ fontSize: 12, color: C.body, lineHeight: 1.5 }}>{o.conteudo}</div>
                  <div style={{ fontSize: 10.5, color: C.subtle, marginTop: 3 }}>{o.autor}{o.interna ? " · interna" : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>
            Anexos de diagnóstico{d.anexos.length > 0 ? ` · ${d.anexos.length}` : ""}
          </div>
          {d.anexos.length === 0 ? (
            <div style={emptyText}>Nenhum anexo de diagnóstico disponível.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
              {d.anexos.map((ax) => (
                <div key={ax.id} style={{ border: `1px solid ${C.line2}`, borderRadius: 9, overflow: "hidden" }}>
                  <div style={{ height: 62, background: HATCH, position: "relative" }}>
                    <span style={{ position: "absolute", left: 5, top: 5, fontSize: 8, background: "rgba(0,0,0,.55)", color: C.white, padding: "1px 5px", borderRadius: 3 }}>{ax.kind}</span>
                  </div>
                  <div style={{ padding: "6px 8px", fontSize: 11, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ax.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 11 }}>Registros de diagnóstico</div>
        {d.eventos.length === 0 ? (
          <div style={emptyText}>Ainda não existe diagnóstico registrado para esta Ordem de Serviço.</div>
        ) : (
          d.eventos.map((ev) => (
            <div key={ev.id} style={{ display: "flex", gap: 10, paddingBottom: 11 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: ev.dot, flex: "none", marginTop: 3 }} />
                <span style={{ flex: 1, width: 2, background: C.line2, marginTop: 3 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.body }}>{ev.text}</div>
                <div style={{ fontSize: 10.5, color: C.subtle }}>{ev.meta}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
