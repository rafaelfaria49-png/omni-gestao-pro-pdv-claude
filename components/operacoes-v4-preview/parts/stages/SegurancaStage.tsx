/**
 * Operações V4 Preview — superfície de Segurança/Autorização (PREVIEW).
 *
 * Demonstração 100% visual dos componentes de autorização do gerente: senha,
 * motivo, PIN 4/6, padrão 3×3 (Android) e estados da autorização (autorizado /
 * negado / expirado), além de um registro de auditoria ilustrativo.
 *
 * ⚠️ NÃO autentica nada, NÃO persiste nada e NÃO altera permissões reais. Toda a
 * interação (preencher PIN, desenhar o padrão, alternar estado) serve apenas à
 * demonstração local — espelha o protótipo `design/operacoes-v4/OmniShellOS.dc.html`.
 * Não é uma fase do fluxo da OS: é alcançada a partir da Execução e volta para ela.
 */
import { C, card, cardTitle, upLabel, mono } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import { ChevronLeftIcon } from "../icons";

const previewTag = {
  fontSize: 9,
  fontWeight: 700,
  color: C.subtle,
  background: C.muted50,
  border: `1px solid ${C.line}`,
  borderRadius: 5,
  padding: "1px 6px",
} as const;

export function SegurancaStage({ v }: { v: V4Vals }) {
  const s = v.seg;

  return (
    <div data-testid="v4-seguranca-preview">
      {/* Voltar à Execução + título */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={v.backFromSeguranca}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            border: "none",
            background: "transparent",
            fontSize: 12,
            color: C.muted,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <ChevronLeftIcon />
          Voltar à Execução
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.body, marginLeft: 4 }}>
          Componentes de segurança
        </span>
        <span style={{ ...previewTag, marginLeft: "auto" }}>PREVIEW</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(238px,1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* Autorização do gerente: senha + motivo */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
            <span style={cardTitle}>Autorização do gerente</span>
            <span style={previewTag}>PREVIEW</span>
          </div>
          <div style={{ ...upLabel, marginBottom: 6 }}>Senha do operador</div>
          <input
            value={s.senha}
            onChange={(e) => s.onSenha(e.target.value)}
            type="text"
            placeholder="digite a senha…"
            style={{
              ...mono,
              width: "100%",
              height: 34,
              padding: "0 11px",
              border: `1px solid ${C.inputBd}`,
              borderRadius: 8,
              fontSize: 13,
              color: C.body,
              background: C.surface,
              letterSpacing: ".12em",
              marginBottom: 11,
              outline: "none",
            }}
          />
          <div style={{ ...upLabel, marginBottom: 6 }}>Motivo</div>
          <textarea
            value={s.motivo}
            onChange={(e) => s.onMotivo(e.target.value)}
            placeholder="Descreva o motivo da ação crítica…"
            style={{
              width: "100%",
              border: `1px solid ${C.inputBd}`,
              borderRadius: 8,
              background: C.surface,
              padding: 9,
              fontSize: 12,
              color: C.body,
              minHeight: 54,
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            onClick={s.onAutorizar}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              width: "100%",
              height: 34,
              border: `1px solid ${C.primaryBd}`,
              background: C.surface,
              color: C.primary,
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 11,
            }}
          >
            Autorizar (preview)
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 11.5 }}>
            <span style={{ color: C.muted }}>Resultado:</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700, color: s.authFg }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.authColor }} />
              {s.authLabel}
            </span>
          </div>
        </div>

        {/* PIN 4/6 */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={cardTitle}>PIN de acesso</span>
            <span style={{ fontSize: 10, color: C.subtle }}>toque para preencher</span>
          </div>
          <div style={{ ...upLabel, marginBottom: 7 }}>PIN de 4 dígitos</div>
          <div onClick={s.onPin4} style={{ display: "flex", gap: 8, marginBottom: 14, cursor: "pointer" }}>
            {s.pin4.map((d, i) => (
              <div
                key={i}
                style={{
                  ...mono,
                  flex: 1,
                  height: 40,
                  border: `1px solid ${d.bd}`,
                  borderRadius: 9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: C.body,
                  background: d.bg,
                }}
              >
                {d.v}
              </div>
            ))}
          </div>
          <div style={{ ...upLabel, marginBottom: 7 }}>PIN de 6 dígitos</div>
          <div onClick={s.onPin6} style={{ display: "flex", gap: 6, cursor: "pointer" }}>
            {s.pin6.map((d, i) => (
              <div
                key={i}
                style={{
                  ...mono,
                  flex: 1,
                  height: 38,
                  border: `1px solid ${d.bd}`,
                  borderRadius: 9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                  color: C.body,
                  background: d.bg,
                }}
              >
                {d.v}
              </div>
            ))}
          </div>
        </div>

        {/* Padrão 3×3 */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={cardTitle}>Padrão 3×3 (Android)</span>
            <span style={{ fontSize: 10, color: C.subtle }}>toque os pontos</span>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,36px)",
                gridTemplateRows: "repeat(3,36px)",
                gap: 14,
              }}
            >
              {s.pattern.map((p) => (
                <div
                  key={p.key}
                  onClick={p.onClick}
                  style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: `2px solid ${p.bd}`,
                      background: p.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 9,
                      fontWeight: 700,
                      color: C.white,
                    }}
                  >
                    {p.n}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 10.5, color: C.subtle, marginTop: 10 }}>{s.patternHint}</div>
        </div>

        {/* Estados da autorização */}
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 12 }}>
            Estados da autorização <span style={{ fontSize: 10, fontWeight: 500, color: C.subtle }}>· alterne</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {s.authStates.map((a) => (
              <div
                key={a.key}
                onClick={a.onClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  border: `1px solid ${a.bd}`,
                  background: a.wash,
                  borderRadius: 9,
                  padding: "9px 11px",
                  cursor: "pointer",
                  opacity: a.opacity,
                  boxShadow: a.ring,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: a.color,
                    color: C.white,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    flex: "none",
                  }}
                >
                  {a.glyph}
                </span>
                <span style={{ fontSize: 12.5, color: a.fg, fontWeight: 600, flex: 1 }}>{a.label}</span>
                {a.active && <span style={{ fontSize: 9, fontWeight: 700, color: a.fg }}>● ATIVO</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Registro de auditoria (largura total) */}
        <div style={{ ...card, gridColumn: "1/-1" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={cardTitle}>Registro de auditoria</span>
            <span style={previewTag}>PREVIEW</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {s.audit.map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "9px 0",
                  borderBottom: `1px solid ${C.line3}`,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.dot, flex: "none" }} />
                <span style={{ fontSize: 12.5, color: C.body, flex: 1, minWidth: 0 }}>{a.text}</span>
                <span style={{ ...mono, fontSize: 11, color: C.subtle }}>{a.meta}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
