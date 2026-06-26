/** Operações V4 Preview — coluna de contexto (cliente + aparelho), recolhível. */
import { C, MONO } from "../tokens";
import type { V4Vals } from "../use-v4-preview";

export function ContextColumn({ v }: { v: V4Vals }) {
  if (!v.leftOpen) {
    return (
      <button
        type="button"
        onClick={v.toggleLeft}
        title="Abrir contexto do cliente"
        style={{
          flex: "none",
          width: 32,
          background: C.surface,
          border: "none",
          borderRight: `1px solid ${C.line}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 9,
          paddingTop: 9,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 23,
            height: 23,
            borderRadius: 6,
            background: C.muted50,
            color: C.subtle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
          }}
        >
          ›
        </span>
        <span
          style={{
            writingMode: "vertical-rl",
            fontSize: 10.5,
            fontWeight: 600,
            color: C.subtle,
            letterSpacing: ".04em",
            marginTop: 4,
          }}
        >
          CLIENTE · APARELHO
        </span>
      </button>
    );
  }

  const os = v.os;
  return (
    <aside
      style={{
        flex: "none",
        width: 272,
        background: C.surface,
        borderRight: `1px solid ${C.line}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 36,
          padding: "0 9px 0 12px",
          borderBottom: `1px solid ${C.line3}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            type="button"
            onClick={v.railFila}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 23, padding: "0 7px", border: "none", background: "transparent", color: C.muted, fontSize: 12, cursor: "pointer", borderRadius: 6 }}
          >
            ← Fila
          </button>
          <button
            type="button"
            onClick={v.onTrocar}
            style={{ height: 23, padding: "0 7px", border: "none", background: "transparent", color: C.muted, fontSize: 12, cursor: "pointer", borderRadius: 6 }}
          >
            Trocar OS
          </button>
        </div>
        <button
          type="button"
          onClick={v.toggleLeft}
          title="Recolher contexto"
          style={{ width: 23, height: 23, border: "none", background: C.muted50, borderRadius: 6, color: C.subtle, cursor: "pointer", fontSize: 13 }}
        >
          ‹
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.primaryBg, color: C.primaryHover, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flex: "none" }}>
            {os.avatarInitials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{os.cliente}</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>{os.documento}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.body }}>
            <span style={{ color: C.subtle }}>📞</span>{os.telefone}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ color: C.subtle }}>✉</span>{os.email}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 13 }}>
          <button type="button" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, height: 29, border: `1px solid ${C.inputBd}`, background: C.surface, borderRadius: 8, fontSize: 12, fontWeight: 500, color: C.body, cursor: "pointer" }}>
            💬 WhatsApp
          </button>
          <button type="button" title="Ligar" style={{ flex: "none", width: 34, height: 29, border: `1px solid ${C.inputBd}`, background: C.surface, borderRadius: 8, fontSize: 13, color: C.body, cursor: "pointer" }}>📞</button>
          <button type="button" onClick={v.toHistCliente} title="Histórico do cliente" style={{ flex: "none", width: 34, height: 29, border: `1px solid ${C.inputBd}`, background: C.surface, borderRadius: 8, fontSize: 13, color: C.body, cursor: "pointer" }}>🕑</button>
        </div>

        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em", color: C.subtle, fontWeight: 700, marginBottom: 6 }}>Aparelho</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{os.aparelho}</div>
        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 9 }}>{os.cor} · {os.tipo}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingBottom: 12, borderBottom: `1px solid ${C.line3}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.subtle }}>IMEI / Série</span><span style={{ color: C.body, fontWeight: 500 }}>{os.serieCurta}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}><span style={{ color: C.subtle }}>Senha</span><span style={{ color: C.body, fontWeight: 600, fontFamily: MONO, background: C.muted50, padding: "1px 7px", borderRadius: 5 }}>{os.senha}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.subtle }}>Acessórios</span><span style={{ color: C.body, fontWeight: 500 }}>{os.acessorios}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.subtle }}>Recebido por</span><span style={{ color: C.body, fontWeight: 500 }}>{os.recebidoPor}</span></div>
        </div>

        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em", color: C.warnFg, fontWeight: 700, margin: "12px 0 6px" }}>Defeito relatado</div>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.5, color: C.bodySoft }}>{os.defeito}</p>

        <div style={{ border: `1px solid ${C.line2}`, borderRadius: 10, padding: 10, background: C.surface2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 7 }}>
            <span style={{ color: C.muted }}>Prioridade</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: v.prio.fg, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: v.prio.dot }} />{v.prio.label}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 7 }}><span style={{ color: C.muted }}>Localização</span><span style={{ color: C.body, fontWeight: 600 }}>Bancada 02</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}><span style={{ color: C.muted }}>Garantia</span><span style={{ color: C.body, fontWeight: 600 }}>90 dias</span></div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.subtle, marginTop: 12 }}><span>Entrada</span><span style={{ color: C.muted, fontWeight: 500 }}>{os.entrada}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.subtle, marginTop: 5 }}><span>Previsão / SLA</span><span style={{ color: C.successFg, fontWeight: 600 }}>{os.previsao}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.subtle, marginTop: 5 }}><span>Técnico</span><span style={{ color: C.muted, fontWeight: 500 }}>{os.tecnico}</span></div>
      </div>
    </aside>
  );
}
