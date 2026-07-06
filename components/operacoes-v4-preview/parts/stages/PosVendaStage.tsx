/**
 * Operações V4 Preview — etapa Pós-venda (somente leitura).
 *
 * GOAL OPS-V4-P0-013: lê apenas o que a OS persiste — garantia real, retornos
 * em garantia (eventos `garantia_acionada`) e eventos reais de pós-venda
 * (garantia / entrega / retirada). O modelo de dados NÃO tem NPS, satisfação
 * nem follow-up → empty state honesto. Sem formulários/escrita (a V4 Preview é
 * read-only); nenhum dado fabricado.
 */
import type { ReactNode } from "react";
import { C, card, cardTitle, upLabel, pill } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const col3 = "repeat(auto-fit, minmax(280px, 1fr))";

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
  return (
    <div style={{ border: `1px dashed ${C.inputBd}`, borderRadius: 9, padding: 16, textAlign: "center", color: C.subtle, fontSize: 11.5, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
      <span style={{ color: C.subtle }}>{label}</span>
      <span style={{ color: C.body, fontWeight: 500, textAlign: "right", minWidth: 0 }}>{value}</span>
    </div>
  );
}

function Timeline({ eventos }: { eventos: V4Vals["posVenda"]["eventos"] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {eventos.map((ev) => (
        <div key={ev.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: ev.dot, flex: "none", marginTop: 4 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.body }}>{ev.text}</div>
            <div style={{ fontSize: 10.5, color: C.subtle }}>{ev.meta}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PosVendaStage({ v }: { v: V4Vals }) {
  const p = v.posVenda;
  const g = p.garantia;

  if (!p.temRegistro) {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 18px", textAlign: "center" }}>
        <span style={{ fontSize: 22 }}>🛡</span>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.body }}>Nenhum pós-venda registrado para esta OS.</div>
        <div style={{ fontSize: 11.5, color: C.subtle, maxWidth: 360, lineHeight: 1.5 }}>
          A garantia, os retornos e os eventos de pós-venda aparecem aqui assim que forem registrados na OS.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      {/* Situação da garantia (real) */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span style={cardTitle}>🛡 Situação da garantia</span>
          {g.temGarantia && <StatusBadge label={g.situacao} tone={g.situacaoTone} />}
        </div>
        {g.temGarantia ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <Row label="Prazo" value={g.prazo} />
            <Row label="Cobertura" value={g.cobertura} />
            <Row label="Início" value={g.inicio} />
            <Row label="Vencimento" value={g.fim} />
            {g.acionamentos && <Row label="Acionamentos" value={g.acionamentos} />}
            {g.observacoes && (
              <div style={{ marginTop: 4 }}>
                <div style={{ ...upLabel, marginBottom: 3 }}>Condições</div>
                <div style={{ fontSize: 12, color: C.bodySoft, lineHeight: 1.5 }}>{g.observacoes}</div>
              </div>
            )}
          </div>
        ) : (
          <Empty>Nenhuma garantia vinculada.</Empty>
        )}
      </div>

      {/* Retornos em garantia (real) */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span style={cardTitle}>Retornos em garantia</span>
          <span style={{ fontSize: 11, color: p.retornosCount > 0 ? C.warnFg : C.subtle, fontWeight: 600 }}>
            {p.retornosCount} retorno(s)
          </span>
        </div>
        {p.retornos.length > 0 ? (
          <Timeline eventos={p.retornos} />
        ) : (
          <Empty>Nenhum retorno registrado.</Empty>
        )}
        <div style={{ fontSize: 10.5, color: C.subtle, lineHeight: 1.5, marginTop: 11 }}>
          Retornos em garantia são acionamentos registrados na OS. Esta aba de Pós-venda é somente leitura nesta versão.
        </div>
      </div>

      {/* Eventos de pós-venda (real) */}
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 11 }}>Eventos de pós-venda</div>
        {p.eventos.length > 0 ? (
          <Timeline eventos={p.eventos} />
        ) : (
          <Empty>Nenhum contato de pós-venda registrado.</Empty>
        )}
      </div>
    </div>
  );
}
