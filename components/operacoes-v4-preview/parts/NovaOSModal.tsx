/**
 * Operações V4 — modal "Nova OS".
 *
 * OPS-V4-NOVA-OS-REAL-001 (slice 1): este modal deixou de ser preview/no-op e CRIA
 * uma Ordem de Serviço REAL na loja ativa, reaproveitando o caminho seguro da V3:
 *   • busca real de cliente (somente leitura) → seleciona um cliente existente, ou
 *   • cadastra um cliente novo (nome + dados básicos);
 *   • coleta equipamento (tipo/marca/modelo/IMEI), defeito, observações, recebido por
 *     e origem;
 *   • mapeia o formulário → `NovaOSDraftV3` (helper puro `buildNovaOSDraftFromFormV4`);
 *   • valida com `validarNovaOSDraftV3` e persiste com `criarOSEnterpriseV3(storeId, draft)`.
 *
 * O estado do formulário vive LOCALMENTE aqui (decisão de design A) — não sobe ao
 * `V4State`. No sucesso, avisamos o controlador via `v.onOSCriada(osId)` (fecha o
 * modal, recarrega a lista e abre a OS criada no workspace). NÃO toca estoque, caixa,
 * financeiro, PDV, WhatsApp nem fiscal — `criarOSEnterpriseV3` só abre a OS (pagamento
 * é apenas previsto). As DEMAIS ações da V4 ainda podem estar em preview.
 */
"use client";

import { useState } from "react";
import { C, MONO, upLabel } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useClienteSearchV4, type ClienteV4 } from "../use-clientes-v4";
import { criarOSEnterpriseV3 } from "@/lib/operacoes-v3/nova-os-actions";
import { validarNovaOSDraftV3 } from "@/lib/operacoes-v3/nova-os-model";
import {
  buildNovaOSDraftFromFormV4,
  type NovaOSEquipV4,
  type NovaOSOrigemV4,
} from "@/lib/operacoes-v4/nova-os-draft-from-form";

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

const EQUIP_OPTS: Array<{ key: NovaOSEquipV4; label: string }> = [
  { key: "celular", label: "Celular" },
  { key: "tablet", label: "Tablet" },
  { key: "notebook", label: "Notebook" },
  { key: "videogame", label: "Videogame" },
  { key: "outro", label: "Outro" },
];

const ORIGEM_OPTS: Array<{ key: NovaOSOrigemV4; label: string }> = [
  { key: "balcao", label: "Balcão" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "retorno", label: "Retorno" },
  { key: "garantia", label: "Garantia" },
];

export function NovaOSModal({ v }: { v: V4Vals }) {
  // Monta o conteúdo só quando aberto → o formulário nasce limpo a cada abertura
  // (estado local descartado ao fechar), sem reset manual.
  if (!v.novaOSOpen) return null;
  return <NovaOSModalContent v={v} />;
}

function NovaOSModalContent({ v }: { v: V4Vals }) {
  const { lojaAtivaId } = useLojaAtiva();

  const [tab, setTab] = useState<"buscar" | "novo">("buscar");
  const [clienteExistente, setClienteExistente] = useState<ClienteV4 | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");

  const [equipamentoTipo, setEquipamentoTipo] = useState<NovaOSEquipV4>("celular");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [imei, setImei] = useState("");
  const [defeito, setDefeito] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [recebidoPor, setRecebidoPor] = useState("");
  const [origem, setOrigem] = useState<NovaOSOrigemV4>("balcao");

  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleCriar = async () => {
    setErro(null);
    const sid = (lojaAtivaId ?? "").trim();
    if (!sid) {
      setErro("Selecione uma loja ativa para abrir a OS.");
      return;
    }
    const draft = buildNovaOSDraftFromFormV4({
      // Só usa o cliente da busca quando a aba "Buscar cliente" está ativa.
      clienteExistente: tab === "buscar" ? clienteExistente : null,
      clienteNovo: { nome, telefone, documento, email },
      equipamentoTipo,
      marca,
      modelo,
      imei,
      defeitoRelatado: defeito,
      observacoes,
      recebidoPor,
      origem,
    });
    const invalido = validarNovaOSDraftV3(draft);
    if (invalido) {
      setErro(invalido);
      return;
    }
    setBusy(true);
    try {
      const { os } = await criarOSEnterpriseV3(sid, draft);
      v.onOSCriada(os.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a OS.");
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    height: 28,
    padding: "0 16px",
    border: "none",
    background: active ? C.surface : "transparent",
    color: active ? C.primaryHover : C.muted,
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <div style={overlay}>
      <div style={{ width: 760, maxWidth: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", background: C.surface, borderRadius: 14, boxShadow: "0 24px 60px rgba(17,19,26,.3)", overflow: "hidden" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: `1px solid ${C.line2}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Nova Ordem de Serviço</div>
            <div style={{ fontSize: 11.5, color: C.subtle }}>Nova OS real · salva na loja ativa</div>
          </div>
          <button type="button" onClick={v.closeNovaOS} disabled={busy} style={{ width: 28, height: 28, border: "none", background: C.muted50, borderRadius: 8, color: C.muted, fontSize: 16, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 14 }}>
            <span style={{ fontSize: 13, lineHeight: "16px", flex: "none" }}>ℹ️</span>
            <span style={{ fontSize: 11.5, color: C.infoFg, lineHeight: 1.45 }}>
              <strong>Nova OS real.</strong> A criação será salva na loja ativa. A busca de
              clientes é da base real e, ao confirmar, a Ordem de Serviço é criada de verdade
              (o pagamento aqui é apenas previsto). As demais ações da Operações V4 ainda podem
              estar em preview.
            </span>
          </div>

          {erro && (
            <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 14, fontSize: 11.5, color: C.dangerFg, lineHeight: 1.45 }}>
              {erro}
            </div>
          )}

          <div style={{ display: "flex", gap: 3, padding: 3, background: C.muted100, borderRadius: 9, marginBottom: 14, width: "fit-content" }}>
            <button type="button" onClick={() => setTab("buscar")} style={tabBtn(tab === "buscar")}>Buscar cliente</button>
            <button type="button" onClick={() => setTab("novo")} style={tabBtn(tab === "novo")}>Cadastrar novo</button>
          </div>

          {tab === "buscar" && (
            <ClienteBuscaPanel
              storeId={lojaAtivaId}
              selecionado={clienteExistente}
              onSelect={setClienteExistente}
              onClear={() => setClienteExistente(null)}
            />
          )}

          {tab === "novo" && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 16 }}>
              <div><div style={{ ...upLabel, marginBottom: 3 }}>Nome completo</div><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Nome do cliente" style={input} /></div>
              <div><div style={{ ...upLabel, marginBottom: 3 }}>Telefone</div><input value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={20} placeholder="(11) 90000-0000" style={input} /></div>
              <div><div style={{ ...upLabel, marginBottom: 3 }}>Documento (CPF/CNPJ)</div><input value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={20} placeholder="000.000.000-00" style={input} /></div>
              <div><div style={{ ...upLabel, marginBottom: 3 }}>E-mail</div><input value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="cliente@email.com" style={input} /></div>
            </div>
          )}

          <div style={{ ...upLabel, fontSize: 10.5, letterSpacing: ".04em", fontWeight: 700, marginBottom: 8 }}>Equipamento</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
            {EQUIP_OPTS.map((o) => {
              const sel = equipamentoTipo === o.key;
              return (
                <button key={o.key} type="button" onClick={() => setEquipamentoTipo(o.key)} style={{ height: 30, padding: "0 13px", border: `1px solid ${sel ? C.black : C.inputBd}`, background: sel ? C.black : C.surface, color: sel ? C.white : C.muted, borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{o.label}</button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 11 }}>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Marca</div><input value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={40} placeholder="Apple, Samsung…" style={input} /></div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Modelo</div><input value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={60} placeholder="iPhone 13 Pro…" style={input} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><div style={{ ...upLabel, marginBottom: 3 }}>IMEI / Serial</div><input value={imei} onChange={(e) => setImei(e.target.value)} maxLength={40} placeholder="35 000000 000000 0" style={{ ...input, fontFamily: MONO }} /></div>
          <div style={{ marginBottom: 11 }}><div style={{ ...upLabel, marginBottom: 3 }}>Defeito relatado</div><textarea value={defeito} onChange={(e) => setDefeito(e.target.value)} maxLength={1000} placeholder="Descreva o problema relatado pelo cliente…" style={{ width: "100%", minHeight: 54, padding: "8px 11px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12.5, color: C.body, resize: "vertical", fontFamily: "inherit" }} /></div>
          <div style={{ marginBottom: 14 }}><div style={{ ...upLabel, marginBottom: 3 }}>Observações iniciais</div><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} placeholder="Observações internas (opcional)…" style={{ width: "100%", minHeight: 44, padding: "8px 11px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12.5, color: C.body, resize: "vertical", fontFamily: "inherit" }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 12, alignItems: "end" }}>
            <div>
              <div style={{ ...upLabel, marginBottom: 6 }}>Origem</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ORIGEM_OPTS.map((o) => {
                  const sel = origem === o.key;
                  return (
                    <button key={o.key} type="button" onClick={() => setOrigem(o.key)} style={{ height: 30, padding: "0 13px", border: `1px solid ${sel ? C.primaryBd : C.inputBd}`, background: sel ? C.primaryBg : C.surface, color: sel ? C.primaryHover : C.muted, borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{o.label}</button>
                  );
                })}
              </div>
            </div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Recebido por</div><input value={recebidoPor} onChange={(e) => setRecebidoPor(e.target.value)} maxLength={80} placeholder="Nome do atendente" style={input} /></div>
          </div>
        </div>

        <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9, padding: "14px 18px", borderTop: `1px solid ${C.line2}`, background: C.surface2 }}>
          <button type="button" onClick={v.closeNovaOS} disabled={busy} style={{ height: 36, padding: "0 16px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>Cancelar</button>
          <button type="button" onClick={handleCriar} disabled={busy} style={{ height: 36, padding: "0 18px", border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>{busy ? "Abrindo…" : "Abrir OS"}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Aba "Buscar cliente" — busca REAL (somente leitura) na base da loja ativa por
 * nome / telefone / documento. A seleção é controlada pelo modal (sobe via `onSelect`):
 * selecionar apenas escolhe o cliente desta OS — a criação acontece no botão "Abrir OS".
 * Sem fallback de loja.
 */
function ClienteBuscaPanel({
  storeId,
  selecionado,
  onSelect,
  onClear,
}: {
  storeId: string | null;
  selecionado: ClienteV4 | null;
  onSelect: (c: ClienteV4) => void;
  onClear: () => void;
}) {
  const search = useClienteSearchV4(storeId);

  return (
    <div style={{ marginBottom: 16 }}>
      <input
        value={search.query}
        onChange={(e) => {
          if (selecionado) onClear();
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
              onClick={onClear}
              style={{ height: 24, padding: "0 10px", border: `1px solid ${C.primaryBd}`, background: C.surface, color: C.primaryHover, borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
            >
              Trocar
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: C.bodySoft, marginTop: 3 }}>
            {[selecionado.telefone, selecionado.documento, selecionado.cidade].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
          </div>
          <div style={{ fontSize: 11, color: C.primaryHover, marginTop: 6, lineHeight: 1.45 }}>
            Cliente selecionado para esta OS.
          </div>
        </div>
      ) : (
        <ResultadoBusca search={search} onSelect={onSelect} />
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
