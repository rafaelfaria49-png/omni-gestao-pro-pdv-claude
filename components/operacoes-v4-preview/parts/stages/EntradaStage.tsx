/** Operações V4 Preview — etapa Entrada (identificação, estado físico, checklist, fotos, segurança, assinatura, acessórios). */
import { C, card, cardTitle, HATCH, HATCH_SOFT, MONO, upLabel } from "../../tokens";
import { PATTERN_COORDS } from "../../mock-data";
import type { V4Vals } from "../../use-v4-preview";

const col3 = "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";
const col2 = "minmax(0,1fr) minmax(0,1fr)";

function PatternSvg({ pattern }: { pattern: number[] }) {
  if (pattern.length < 2) return null;
  const pts = pattern.map((i) => `${PATTERN_COORDS[i % 3]},${PATTERN_COORDS[Math.floor(i / 3)]}`).join(" ");
  return (
    <svg width={140} height={140} viewBox="0 0 140 140" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <polyline points={pts} fill="none" stroke={C.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={0.5} />
      {pattern.map((i, k) => (
        <circle key={k} cx={PATTERN_COORDS[i % 3]} cy={PATTERN_COORDS[Math.floor(i / 3)]} r={4} fill={C.primary} />
      ))}
    </svg>
  );
}

export function EntradaStage({ v }: { v: V4Vals }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      {/* Coluna 1 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 11 }}>Identificação do aparelho</div>
          <div style={{ display: "grid", gridTemplateColumns: col2, gap: 9 }}>
            <div><div style={upLabel}>IMEI</div><div style={{ fontSize: 12, color: C.body, fontWeight: 500, fontFamily: MONO }}>{v.os.imei}</div></div>
            <div><div style={upLabel}>Serial</div><div style={{ fontSize: 12, color: C.body, fontWeight: 500, fontFamily: MONO }}>{v.os.serial}</div></div>
            <div><div style={upLabel}>Operadora</div><div style={{ fontSize: 12, color: C.body, fontWeight: 500 }}>{v.os.operadora}</div></div>
            <div><div style={upLabel}>Cor</div><div style={{ fontSize: 12, color: C.body, fontWeight: 500 }}>{v.os.cor}</div></div>
          </div>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Estado físico</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {v.estadoFis.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, color: C.body }}>{e.comp}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" onClick={e.onOk} style={{ border: `1px solid ${e.okBd}`, background: e.okBg, color: e.okFg, borderRadius: 6, padding: "2px 8px", fontSize: 10.5, fontWeight: 600, cursor: "pointer" }}>OK</button>
                  <button type="button" onClick={e.onAv} style={{ border: `1px solid ${e.avBd}`, background: e.avBg, color: e.avFg, borderRadius: 6, padding: "2px 8px", fontSize: 10.5, fontWeight: 600, cursor: "pointer" }}>Avaria</button>
                  <button type="button" onClick={e.onAu} style={{ border: `1px solid ${e.auBd}`, background: e.auBg, color: e.auFg, borderRadius: 6, padding: "2px 8px", fontSize: 10.5, fontWeight: 600, cursor: "pointer" }}>Ausente</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...upLabel, margin: "13px 0 6px" }}>Avarias registradas</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            <span style={{ height: 23, padding: "0 9px", display: "inline-flex", alignItems: "center", background: C.dangerBg, color: C.dangerFg, borderRadius: 999, fontSize: 11.5, fontWeight: 500 }}>Trinco · canto sup. dir.</span>
            <span style={{ height: 23, padding: "0 9px", display: "inline-flex", alignItems: "center", background: C.dangerBg, color: C.dangerFg, borderRadius: 999, fontSize: 11.5, fontWeight: 500 }}>Risco · traseira</span>
          </div>
          <button type="button" onClick={v.act.addAvaria} style={{ width: "100%", height: 28, border: `1px dashed ${C.dashed}`, background: C.surface, color: C.muted, borderRadius: 7, fontSize: 11.5, cursor: "pointer" }}>+ Adicionar avaria</button>
        </div>
      </div>

      {/* Coluna 2 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
            <span style={cardTitle}>Checklist do aparelho</span>
            {!v.checklistVazio && (
              <span style={{ fontSize: 11, color: C.muted }}>
                <span style={{ color: C.successFg, fontWeight: 600 }}>{v.check.ok} OK</span> · <span style={{ color: C.dangerFg }}>{v.check.ruim} ruim</span> · {v.check.nt} N/T
              </span>
            )}
          </div>
          {v.checklistVazio ? (
            <div style={{ fontSize: 12, color: C.subtle, padding: "10px 2px" }}>Checklist ainda não registrado.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: col2, gap: 7 }}>
              {v.checklist.map((c) => (
                <div key={c.id} title={c.observacao || undefined} style={{ border: `1px solid ${C.line2}`, borderRadius: 8, padding: "7px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 11.5, color: C.body, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{c.label}</span>
                  <span style={{ flex: "none", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, borderRadius: 5, padding: "2px 7px", fontSize: 9.5, fontWeight: 700 }}>{c.estadoLabel}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Fotos de entrada (5/12)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6 }}>
            {["frontal", "traseira", "IMEI"].map((tag) => (
              <div key={tag} style={{ aspectRatio: "1", borderRadius: 7, background: HATCH, position: "relative" }}>
                <span style={{ position: "absolute", left: 3, top: 3, fontSize: 8, background: "rgba(0,0,0,.55)", color: C.white, padding: "1px 4px", borderRadius: 3 }}>{tag}</span>
              </div>
            ))}
            <div onClick={v.act.addFoto} style={{ aspectRatio: "1", borderRadius: 7, border: `1px dashed ${C.hatch}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.subtle, fontSize: 16, cursor: "pointer" }}>+</div>
          </div>
        </div>
      </div>

      {/* Coluna 3 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>🔐 Segurança / Acesso</div>
          <div style={{ display: "flex", gap: 3, padding: 2, background: C.muted100, borderRadius: 8, marginBottom: 10 }}>
            {v.secTipoBtns.map((s) => (
              <button key={s.label} type="button" onClick={s.onClick} style={{ flex: 1, height: 24, border: "none", background: s.bg, color: s.fg, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{s.label}</button>
            ))}
          </div>
          {v.secPin && <input defaultValue="1 2 8 4" placeholder="PIN numérico" style={{ width: "100%", height: 30, padding: "0 10px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12.5, color: C.body, fontFamily: MONO, letterSpacing: ".18em", marginBottom: 10 }} />}
          {v.secSenha && <input placeholder="Senha em texto" style={{ width: "100%", height: 30, padding: "0 10px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12.5, color: C.body, marginBottom: 10 }} />}
          {v.secPadrao && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 10 }}>
              <div style={{ position: "relative", width: 140, height: 140 }}>
                <PatternSvg pattern={v.pattern} />
                <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", width: 140, height: 140 }}>
                  {v.patternDots.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <button type="button" onClick={d.onClick} style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${d.bd}`, background: d.bg, color: d.fg, fontSize: 9, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>{d.order}</button>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                <span style={{ fontSize: 10.5, color: C.subtle, fontFamily: MONO }}>{v.patternSeq}</span>
                <button type="button" onClick={v.patternClear} style={{ height: 22, padding: "0 9px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.muted, borderRadius: 6, fontSize: 10.5, cursor: "pointer" }}>Limpar</button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 9 }}>
            <button type="button" onClick={v.act.toggleFace} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 28, border: `1px solid ${v.cred.faceBd}`, background: v.cred.faceBg, color: v.cred.faceFg, borderRadius: 7, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>{v.cred.faceMark} Face ID</button>
            <button type="button" onClick={v.act.toggleBio} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 28, border: `1px solid ${v.cred.bioBd}`, background: v.cred.bioBg, color: v.cred.bioFg, borderRadius: 7, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>{v.cred.bioMark} Biometria</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}><span style={{ color: C.subtle }}>Conta Google</span><span style={{ color: C.body, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{v.os.contaGoogle}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}><span style={{ color: C.subtle }}>iCloud / Apple ID</span><span style={{ color: C.body, fontWeight: 500 }}>{v.os.contaApple}</span></div>
          </div>
          <input placeholder="Observação de acesso…" style={{ width: "100%", height: 28, padding: "0 10px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 11.5, color: C.body, marginTop: 8 }} />
          <div style={{ fontSize: 10, color: C.subtle, marginTop: 8, lineHeight: 1.4 }}>🔒 Credenciais são <b>mascaradas</b> na OS impressa entregue ao cliente.</div>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>✍ Assinatura do cliente (entrada)</div>
          <div style={{ height: 60, border: `1px dashed ${C.hatch}`, borderRadius: 8, background: HATCH_SOFT, display: "flex", alignItems: "center", justifyContent: "center", color: C.subtle, fontSize: 11.5, marginBottom: 8 }}>assinatura confirmando a entrada</div>
          <button type="button" onClick={v.act.assinarEntrada} style={{ width: "100%", height: 30, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Capturar assinatura</button>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Acessórios recebidos</div>
          <div style={{ display: "grid", gridTemplateColumns: col2, gap: 6 }}>
            {v.acessorios.map((a, i) => (
              <button key={i} type="button" onClick={a.onToggle} style={{ display: "flex", alignItems: "center", gap: 7, textAlign: "left", border: `1px solid ${C.line2}`, background: C.surface, borderRadius: 7, padding: "6px 8px", cursor: "pointer" }}>
                {a.on
                  ? <span style={{ width: 15, height: 15, borderRadius: 4, background: C.success, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flex: "none" }}>✓</span>
                  : <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${C.dashed}`, flex: "none" }} />}
                <span style={{ fontSize: 11.5, color: C.body }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
