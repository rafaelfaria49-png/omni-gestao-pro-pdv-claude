/**
 * Operações V4 Preview — etapa Entrega (somente leitura).
 *
 * GOAL OPS-V4-P0-012: lê apenas o que a OS persiste — retirada confirmada,
 * data de entrega, assinatura textual, acessórios reais do aparelho, eventos
 * de entrega/garantia e a garantia real (operacional ou de payload). Nenhum
 * dado fabricado: onde não houver fonte, mostra empty state honesto. Sem
 * formulários/escrita (a V4 Preview é read-only).
 */
import type { ReactNode } from "react";
import { C, card, cardTitle, upLabel, pill } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const col3 = "repeat(auto-fit, minmax(280px, 1fr))";
const col2 = "minmax(0,1fr) minmax(0,1fr)";

type Tone = "success" | "info" | "warn" | "danger" | "neutro";

const TONE_MAP: Record<Tone, { bg: string; fg: string; dot: string }> = {
  success: { bg: C.successBg, fg: C.successFg, dot: C.success },
  info: { bg: C.infoBg, fg: C.infoFg, dot: C.info },
  warn: { bg: C.warnBg, fg: C.warnFg, dot: C.warn },
  danger: { bg: C.dangerBg, fg: C.dangerFg, dot: C.danger },
  neutro: { bg: C.muted100, fg: C.muted, dot: C.subtle },
};

function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  const t = TONE_MAP[tone];
  return (
    <span style={pill(t.bg, t.fg)}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot }} />
      {label}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11.5, color: C.subtle, lineHeight: 1.5 }}>{children}</div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={upLabel}>{label}</div>
      <div style={{ fontSize: 12.5, color: C.body, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

export function EntregaStage({ v }: { v: V4Vals }) {
  const e = v.entrega;
  const g = e.garantia;

  if (!e.temRegistro) {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 18px", textAlign: "center" }}>
        <span style={{ fontSize: 22 }}>📦</span>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.body }}>Esta Ordem de Serviço ainda não foi entregue.</div>
        <div style={{ fontSize: 11.5, color: C.subtle, maxWidth: 360, lineHeight: 1.5 }}>
          O registro de retirada, a assinatura e a garantia aparecem aqui assim que a entrega for concluída.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      {/* Registro de entrega (real) */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={cardTitle}>📦 Registro de entrega</span>
          <StatusBadge label={e.statusLabel} tone={e.statusTone} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: col2, gap: 10 }}>
          <Field label="Retirado por" value={e.retiradoPor} />
          <Field label="Data / hora" value={e.retiradoEm} />
        </div>
        {e.observacao && (
          <div style={{ marginTop: 11 }}>
            <div style={{ ...upLabel, marginBottom: 3 }}>Observação</div>
            <div style={{ fontSize: 12, color: C.bodySoft, lineHeight: 1.5 }}>{e.observacao}</div>
          </div>
        )}

        <div style={{ ...upLabel, margin: "13px 0 5px" }}>Assinatura de retirada</div>
        {e.temAssinatura ? (
          <div style={{ border: `1px solid ${C.line2}`, background: C.surface2, borderRadius: 8, padding: "9px 11px", fontSize: 13, color: C.body, fontStyle: "italic" }}>
            {e.assinatura}
          </div>
        ) : (
          <Empty>Nenhuma assinatura de entrega registrada.</Empty>
        )}

        <div style={{ ...upLabel, margin: "14px 0 6px" }}>Linha do tempo da entrega</div>
        {e.eventos.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {e.eventos.map((ev) => (
              <div key={ev.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: ev.dot, marginTop: 5, flex: "none" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.body }}>{ev.text}</div>
                  <div style={{ fontSize: 10.5, color: C.subtle }}>{ev.meta}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nenhum evento de entrega registrado.</Empty>
        )}
      </div>

      {/* Checklist final + acessórios */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Checklist final de entrega</div>
          <Empty>Nenhum checklist de entrega registrado.</Empty>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Acessórios do aparelho</div>
          {e.acessorios.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: col2, gap: 6 }}>
              {e.acessorios.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.line2}`, background: C.surface, borderRadius: 7, padding: "6px 8px" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.subtle, flex: "none" }} />
                  <span style={{ fontSize: 11.5, color: C.body, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Nenhum acessório registrado para esta OS.</Empty>
          )}
        </div>
      </div>

      {/* Garantia da OS (real) */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span style={cardTitle}>🛡 Garantia da OS</span>
          {g.temGarantia && <StatusBadge label={g.situacao} tone={g.situacaoTone} />}
        </div>
        {g.temGarantia ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: col2, gap: 10, marginBottom: g.observacoes || g.acionamentos ? 11 : 0 }}>
              <Field label="Prazo" value={g.prazo} />
              <Field label="Cobertura" value={g.cobertura} />
              <Field label="Início" value={g.inicio} />
              <Field label="Validade" value={g.fim} />
            </div>
            {g.observacoes && (
              <div style={{ marginBottom: g.acionamentos ? 11 : 0 }}>
                <div style={{ ...upLabel, marginBottom: 3 }}>Condições</div>
                <div style={{ fontSize: 12, color: C.bodySoft, lineHeight: 1.5 }}>{g.observacoes}</div>
              </div>
            )}
            {g.acionamentos && (
              <div style={{ fontSize: 11.5, color: C.warnFg }}>
                Acionamentos registrados: <b>{g.acionamentos}</b>
              </div>
            )}
          </>
        ) : (
          <Empty>Nenhuma garantia registrada para esta OS.</Empty>
        )}
      </div>
    </div>
  );
}
