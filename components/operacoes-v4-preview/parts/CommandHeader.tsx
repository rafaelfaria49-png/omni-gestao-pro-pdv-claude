/** Operações V4 Preview — header de comando (46px): status, total, ação primária, menus. */
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import styles from "../operacoes-v4-preview.module.css";

export function CommandHeader({ v }: { v: V4Vals }) {
  return (
    <div
      style={{
        flex: "none",
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 11,
        height: 46,
        padding: "0 14px",
        background: C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>{v.os.codigo}</h1>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", background: v.tone.bg, color: v.tone.fg, borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: v.tone.dot }} />{v.statusLabel}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", background: C.warnBg, color: C.warnFg, borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>{v.pag.statusPagamento}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 22, padding: "0 9px", background: C.successBg, color: C.successFg, borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>⏱ SLA {v.os.sla}</span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.05 }}>{v.pag.total}</div>
          <div style={{ fontSize: 10.5, color: C.warnFg }}>saldo {v.pag.saldo}</div>
        </div>
        <span style={{ width: 1, height: 26, background: C.line2 }} />
        <button type="button" onClick={v.togglePrint} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>🖨 Documentos ▾</button>
        {v.hasPrimary && (
          <button type="button" onClick={v.onPrimary} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 33, padding: "0 15px", border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 2px rgba(79,70,229,.3)" }}>
            ✦ {v.primaryLabel}
            {v.showKbd && <kbd style={{ fontSize: 10, background: "rgba(255,255,255,.22)", borderRadius: 4, padding: "1px 5px" }}>↵</kbd>}
          </button>
        )}
        {v.noPrimary && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 33, padding: "0 13px", background: C.successBg2, color: C.successFg, borderRadius: 9, fontSize: 12.5, fontWeight: 600 }}>✓ Fluxo concluído</span>
        )}
        <button type="button" onClick={v.toggleMore} title="Mais ações" style={{ width: 33, height: 33, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.muted, borderRadius: 9, fontSize: 16, cursor: "pointer" }}>⋯</button>
      </div>

      {v.menuPrint && (
        <>
          <button type="button" onClick={v.closeMenus} style={{ position: "fixed", inset: 0, zIndex: 40, border: "none", background: "transparent", cursor: "default" }} />
          <div style={{ position: "absolute", top: 42, right: 118, zIndex: 50, width: 248, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 11, boxShadow: "0 12px 32px rgba(17,19,26,.16)", padding: 6 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: C.subtle, fontWeight: 700, padding: "6px 9px 4px" }}>Imprimir / documentos</div>
            {v.printItems.map((d) => (
              <button key={d.label} type="button" onClick={d.onClick} className={styles.hoverSurface} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 7, padding: "8px 9px", fontSize: 12.5, color: C.body, cursor: "pointer" }}>
                <span style={{ width: 16, textAlign: "center" }}>{d.icon}</span>{d.label}
              </button>
            ))}
          </div>
        </>
      )}

      {v.menuMore && (
        <>
          <button type="button" onClick={v.closeMenus} style={{ position: "fixed", inset: 0, zIndex: 40, border: "none", background: "transparent", cursor: "default" }} />
          <div style={{ position: "absolute", top: 42, right: 14, zIndex: 50, width: 236, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 11, boxShadow: "0 12px 32px rgba(17,19,26,.16)", padding: 6 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: C.subtle, fontWeight: 700, padding: "6px 9px 4px" }}>Ações da OS</div>
            {v.moreItems.map((m) => (
              <button key={m.label} type="button" onClick={m.onClick} className={styles.hoverSurface} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 7, padding: "8px 9px", fontSize: 12.5, color: m.color, cursor: "pointer" }}>
                <span style={{ width: 16, textAlign: "center" }}>{m.icon}</span>{m.label}
              </button>
            ))}
            <div style={{ fontSize: 10.5, color: C.faint2, padding: "6px 9px 3px", borderTop: `1px solid ${C.line3}`, marginTop: 4 }}>Transições validadas pela máquina única do fluxo.</div>
          </div>
        </>
      )}
    </div>
  );
}
