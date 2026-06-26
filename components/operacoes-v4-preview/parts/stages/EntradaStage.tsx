/** Operações V4 Preview — etapa Entrada (somente leitura da OS real).
 *
 * GOAL OPS-V4-P0-006: todos os cards exibem dado REAL da OS selecionada ou um
 * empty state honesto. Nenhum valor inventado, nenhum controle de escrita —
 * estado físico, avarias, fotos, segurança, assinatura e acessórios seguem o
 * mesmo princípio de "vazio honesto" dos GOALs 002–005. */
import { C, card, cardTitle, HATCH, MONO, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const col3 = "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";
const col2 = "minmax(0,1fr) minmax(0,1fr)";

/** Texto de empty state honesto, alinhado ao padrão do checklist real. */
const emptyText = { fontSize: 12, color: C.subtle, padding: "10px 2px", lineHeight: 1.5 } as const;

export function EntradaStage({ v }: { v: V4Vals }) {
  const sec = v.entradaSeguranca;
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
          <div style={{ ...cardTitle, marginBottom: 6 }}>Estado físico</div>
          <div style={emptyText}>Estado físico ainda não registrado.</div>
          <div style={{ ...upLabel, margin: "10px 0 2px" }}>Avarias registradas</div>
          <div style={emptyText}>Nenhuma avaria registrada.</div>
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
            <div style={emptyText}>Checklist ainda não registrado.</div>
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
          <div style={{ ...cardTitle, marginBottom: 9 }}>
            Fotos de entrada{v.entradaFotos.length > 0 ? ` · ${v.entradaFotos.length}` : ""}
          </div>
          {v.entradaFotos.length === 0 ? (
            <div style={emptyText}>Nenhuma fotografia anexada.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6 }}>
              {v.entradaFotos.map((f) => (
                <div key={f.id} title={f.name} style={{ aspectRatio: "1", borderRadius: 7, background: HATCH, position: "relative" }}>
                  <span style={{ position: "absolute", left: 3, top: 3, fontSize: 8, background: "rgba(0,0,0,.55)", color: C.white, padding: "1px 4px", borderRadius: 3 }}>{f.tag}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Coluna 3 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>🔐 Segurança / Acesso</div>
          {sec.temCredencial ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: C.subtle }}>Tipo de acesso</span>
                  <span style={{ color: C.body, fontWeight: 500 }}>{sec.tipoLabel}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: C.subtle }}>Credencial</span>
                  <span style={{ color: C.body, fontWeight: 600, fontFamily: MONO, background: C.muted50, padding: "1px 7px", borderRadius: 5, maxWidth: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sec.valor}</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: C.subtle, marginTop: 10, lineHeight: 1.4 }}>🔒 Credenciais são <b>mascaradas</b> na OS impressa entregue ao cliente.</div>
            </>
          ) : (
            <div style={emptyText}>Nenhuma credencial de acesso registrada.</div>
          )}
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>✍ Assinatura do cliente (entrada)</div>
          <div style={emptyText}>Nenhuma assinatura de entrada registrada.</div>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Acessórios recebidos</div>
          {v.entradaAcessorios.length === 0 ? (
            <div style={emptyText}>Nenhum acessório informado.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: col2, gap: 6 }}>
              {v.entradaAcessorios.map((label, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.line2}`, background: C.surface, borderRadius: 7, padding: "6px 8px", minWidth: 0 }}>
                  <span style={{ width: 15, height: 15, borderRadius: 4, background: C.success, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flex: "none" }}>✓</span>
                  <span style={{ fontSize: 11.5, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
