/** Operações V4 Preview — modal Nova OS (buscar/cadastrar cliente + equipamento). */
"use client";

import { useState } from "react";
import { C, MONO, upLabel } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useClienteSearchV4, type ClienteV4 } from "../use-clientes-v4";

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
            <div style={{ fontSize: 11.5, color: C.subtle }}>Pré-visualização — não cria OS real</div>
          </div>
          <button type="button" onClick={v.closeNovaOS} style={{ width: 28, height: 28, border: "none", background: C.muted50, borderRadius: 8, color: C.muted, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 14 }}>
            <span style={{ fontSize: 13, lineHeight: "16px", flex: "none" }}>ℹ️</span>
            <span style={{ fontSize: 11.5, color: C.infoFg, lineHeight: 1.45 }}>
              Pré-visualização — a busca de clientes é real (somente leitura da loja ativa), mas esta
              tela não cria Ordem de Serviço nem salva cliente. A abertura real de OS acontece no
              módulo Operações. “Abrir OS” não abre nenhuma OS existente.
            </span>
          </div>
          <div style={{ display: "flex", gap: 3, padding: 3, background: C.muted100, borderRadius: 9, marginBottom: 14, width: "fit-content" }}>
            <button type="button" onClick={v.setNovaBuscar} style={{ height: 28, padding: "0 16px", border: "none", background: v.buscarBg, color: v.buscarFg, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Buscar cliente</button>
            <button type="button" onClick={v.setNovaNovo} style={{ height: 28, padding: "0 16px", border: "none", background: v.novoBg, color: v.novoFg, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cadastrar novo</button>
          </div>

          {v.novaBuscar && <ClienteBuscaPanel />}

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

/**
 * Aba "Buscar cliente" — busca REAL (somente leitura) na base da loja ativa por
 * nome / telefone / documento. Selecionar um cliente apenas o preenche visualmente:
 * NÃO cria OS e NÃO salva nada (a Preview é read-only). Sem fallback de loja.
 */
function ClienteBuscaPanel() {
  const { lojaAtivaId } = useLojaAtiva();
  const search = useClienteSearchV4(lojaAtivaId);
  const [selecionado, setSelecionado] = useState<ClienteV4 | null>(null);

  return (
    <div style={{ marginBottom: 16 }}>
      <input
        value={search.query}
        onChange={(e) => {
          if (selecionado) setSelecionado(null);
          search.setQuery(e.target.value);
        }}
        placeholder="Buscar por nome, telefone ou documento…"
        style={{ ...input, height: 34, marginBottom: 8 }}
      />

      {selecionado ? (
        <div style={{ border: `1px solid ${C.primaryBd}`, background: C.primaryBg, borderRadius: 9, padding: "11px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selecionado.nome || "Cliente"}
            </span>
            <button
              type="button"
              onClick={() => setSelecionado(null)}
              style={{ height: 24, padding: "0 10px", border: `1px solid ${C.primaryBd}`, background: C.surface, color: C.primaryHover, borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
            >
              Trocar
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: C.bodySoft, marginTop: 3 }}>
            {[selecionado.telefone, selecionado.documento, selecionado.cidade].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
          </div>
          <div style={{ fontSize: 11, color: C.primaryHover, marginTop: 6, lineHeight: 1.45 }}>
            Cliente selecionado para a pré-visualização — nenhuma OS foi criada e nada foi salvo.
          </div>
        </div>
      ) : (
        <ResultadoBusca search={search} onSelect={setSelecionado} />
      )}
    </div>
  );
}

function ResultadoBusca({
  search,
  onSelect,
}: {
  search: ReturnType<typeof useClienteSearchV4>;
  onSelect: (c: ClienteV4) => void;
}) {
  const boxBase: React.CSSProperties = {
    border: `1px dashed ${C.inputBd2}`,
    borderRadius: 9,
    padding: "16px 12px",
    textAlign: "center",
    fontSize: 11.5,
    color: C.subtle,
    lineHeight: 1.5,
  };

  if (search.semLoja) {
    return <div style={boxBase}>Selecione uma loja ativa para buscar clientes da base real.</div>;
  }
  if (search.error) {
    return <div style={{ ...boxBase, borderStyle: "solid", color: C.dangerFg, borderColor: C.dangerBd }}>{search.error}</div>;
  }
  if (search.loading) {
    return <div style={boxBase}>Buscando clientes…</div>;
  }
  if (search.termoCurto || (!search.buscou && search.query.trim() === "")) {
    return <div style={boxBase}>Digite ao menos 2 caracteres para buscar na base real da loja.</div>;
  }
  if (search.buscou && search.clientes.length === 0) {
    return <div style={boxBase}>Nenhum cliente encontrado para “{search.query.trim()}”.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
      {search.clientes.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c)}
          style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", textAlign: "left", border: `1px solid ${C.line}`, background: C.surface, borderRadius: 9, padding: "9px 11px", cursor: "pointer" }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.nome || "Cliente sem nome"}
          </span>
          <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[c.telefone, c.documento, c.cidade].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
          </span>
        </button>
      ))}
    </div>
  );
}
