/** Operações V4 Preview — modal Nova OS (buscar/cadastrar cliente + equipamento). */
import { C, MONO, upLabel } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import styles from "../operacoes-v4-preview.module.css";

const input: React.CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 11px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.body,
};

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 70,
  background: "rgba(17,19,26,.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

export function NovaOSModal({ v }: { v: V4Vals }) {
  if (!v.novaOSOpen) return null;
  return (
    <div style={overlay}>
      <div style={{ width: 760, maxWidth: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", background: C.surface, borderRadius: 14, boxShadow: "0 24px 60px rgba(17,19,26,.3)", overflow: "hidden" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: `1px solid ${C.line2}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Nova Ordem de Serviço</div>
            <div style={{ fontSize: 11.5, color: C.subtle }}>Unidade Centro · abertura no balcão</div>
          </div>
          <button type="button" onClick={v.closeNovaOS} style={{ width: 28, height: 28, border: "none", background: C.muted50, borderRadius: 8, color: C.muted, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}>
          <div style={{ display: "flex", gap: 3, padding: 3, background: C.muted100, borderRadius: 9, marginBottom: 14, width: "fit-content" }}>
            <button type="button" onClick={v.setNovaBuscar} style={{ height: 28, padding: "0 16px", border: "none", background: v.buscarBg, color: v.buscarFg, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Buscar cliente</button>
            <button type="button" onClick={v.setNovaNovo} style={{ height: 28, padding: "0 16px", border: "none", background: v.novoBg, color: v.novoFg, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cadastrar novo</button>
          </div>

          {v.novaBuscar && (
            <div style={{ marginBottom: 16 }}>
              <input placeholder="Buscar por nome, CPF, telefone ou IMEI…" style={{ ...input, height: 34, marginBottom: 6 }} />
              <div style={{ fontSize: 10, color: C.subtle, marginBottom: 9 }}>Dados demonstrativos — busca real será ligada à base de clientes na integração final.</div>
              {v.clientesBusca.map((c, i) => (
                <button key={i} type="button" onClick={c.onClick} className={styles.hoverBorder} style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, textAlign: "left", border: `1px solid ${C.line2}`, background: C.surface, borderRadius: 9, padding: "9px 11px", marginBottom: 6, cursor: "pointer" }}>
                  <span style={{ width: 32, height: 32, borderRadius: "50%", background: C.primaryBg, color: C.primaryHover, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flex: "none" }}>{c.ini}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{c.nome}</div><div style={{ fontSize: 11, color: C.subtle }}>{c.doc} · {c.tel}</div></div>
                  <span style={{ fontSize: 11, color: C.muted, flex: "none" }}>{c.os} OS</span>
                </button>
              ))}
            </div>
          )}

          {v.novaNovo && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 16 }}>
              <div><div style={{ ...upLabel, marginBottom: 3 }}>Nome completo</div><input placeholder="Nome do cliente" style={input} /></div>
              <div><div style={{ ...upLabel, marginBottom: 3 }}>Telefone</div><input placeholder="(11) 90000-0000" style={input} /></div>
              <div><div style={{ ...upLabel, marginBottom: 3 }}>Documento (CPF/CNPJ)</div><input placeholder="000.000.000-00" style={input} /></div>
              <div><div style={{ ...upLabel, marginBottom: 3 }}>E-mail</div><input placeholder="cliente@email.com" style={input} /></div>
            </div>
          )}

          <div style={{ ...upLabel, fontSize: 10.5, letterSpacing: ".04em", fontWeight: 700, marginBottom: 8 }}>Equipamento</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
            {v.novaEquipBtns.map((e) => (
              <button key={e.label} type="button" onClick={e.onClick} style={{ height: 30, padding: "0 13px", border: `1px solid ${e.bd}`, background: e.bg, color: e.fg, borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{e.label}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 11 }}>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Marca</div><input placeholder="Apple, Samsung…" style={input} /></div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Modelo</div><input placeholder="iPhone 13 Pro…" style={input} /></div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Cor</div><input placeholder="Grafite…" style={input} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><div style={{ ...upLabel, marginBottom: 3 }}>IMEI / Serial</div><input placeholder="35 000000 000000 0" style={{ ...input, fontFamily: MONO }} /></div>
          <div style={{ marginBottom: 11 }}><div style={{ ...upLabel, marginBottom: 3 }}>Defeito relatado</div><textarea placeholder="Descreva o problema relatado pelo cliente…" style={{ width: "100%", minHeight: 54, padding: "8px 11px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12.5, color: C.body, resize: "vertical", fontFamily: "inherit" }} /></div>
          <div style={{ marginBottom: 14 }}><div style={{ ...upLabel, marginBottom: 3 }}>Observações iniciais</div><textarea placeholder="Observações internas (opcional)…" style={{ width: "100%", minHeight: 44, padding: "8px 11px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12.5, color: C.body, resize: "vertical", fontFamily: "inherit" }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 12, alignItems: "end" }}>
            <div>
              <div style={{ ...upLabel, marginBottom: 6 }}>Origem</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {v.novaOrigemBtns.map((o) => (
                  <button key={o.label} type="button" onClick={o.onClick} style={{ height: 30, padding: "0 13px", border: `1px solid ${o.bd}`, background: o.bg, color: o.fg, borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{o.label}</button>
                ))}
              </div>
            </div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Recebido por</div><input placeholder="Nome do atendente" style={input} /></div>
          </div>
        </div>

        <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9, padding: "14px 18px", borderTop: `1px solid ${C.line2}`, background: C.surface2 }}>
          <button type="button" onClick={v.closeNovaOS} style={{ height: 36, padding: "0 16px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancelar</button>
          <button type="button" onClick={v.abrirOS} style={{ height: 36, padding: "0 18px", border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Abrir OS</button>
        </div>
      </div>
    </div>
  );
}
