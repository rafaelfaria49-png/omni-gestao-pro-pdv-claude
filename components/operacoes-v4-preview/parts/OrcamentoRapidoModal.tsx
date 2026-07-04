/**
 * Operações V4 — modal "⚡ Orçamento Rápido" (GOAL OPS-V4-ORC-RAPIDO-024).
 *
 * Entrada leve: cria uma OS mínima (cliente + marca/modelo + defeito) com o
 * orçamento multiopção (itens fixos + 1 grupo de escolha) já materializado em
 * RASCUNHO, reaproveitando o caminho seguro `criarOrcamentoRapidoV3` (V3) —
 * mesmo padrão do `NovaOSModal`/`AtendimentoRapidoModal`: o formulário vive
 * LOCALMENTE aqui, a action faz toda a orquestração + compensação no servidor.
 *
 * NADA de envio/mensagem (GOAL 025), seleção/aprovação (GOAL 026) ou
 * transição de status manual aqui — a OS fica exatamente como a action a
 * devolve. No sucesso, avisa o controlador via `v.onOrcamentoRapidoCriado(osId)`.
 */
"use client";

import { useState } from "react";
import { C, fmt, upLabel } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useClienteSearchV4, type ClienteV4 } from "../use-clientes-v4";
import { criarOrcamentoRapidoV3 } from "@/lib/operacoes-v3/orcamento-rapido-actions";
import {
  adicionarItemFixoV4,
  adicionarVarianteV4,
  buildOrcamentoRapidoInputFromFormV4,
  orcamentoRapidoFormVazioV4,
  previaTotaisOrcamentoRapidoV4,
  removerItemFixoV4,
  removerVarianteV4,
  validarOrcamentoRapidoFormV4,
  type OrcamentoRapidoFormV4,
} from "@/lib/operacoes-v4/orcamento-rapido-form";
import { MAX_LINHAS_POR_GRUPO_V3 } from "@/lib/operacoes-v3/orcamento-model";

const input: React.CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 11px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.body,
};

const inputSm: React.CSSProperties = { ...input, height: 28, fontSize: 12 };

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

export function OrcamentoRapidoModal({ v }: { v: V4Vals }) {
  // Monta o conteúdo só quando aberto → o formulário nasce limpo a cada abertura
  // (estado local descartado ao fechar), sem reset manual.
  if (!v.orcamentoRapidoOpen) return null;
  return <OrcamentoRapidoModalContent v={v} />;
}

function OrcamentoRapidoModalContent({ v }: { v: V4Vals }) {
  const { lojaAtivaId } = useLojaAtiva();
  const sid = (lojaAtivaId ?? "").trim();

  // Prefill de "Duplicar orçamento" (GOAL 025) — quando presente, nasce com os
  // dados da OS original (visão interna, cliente sempre vazio); senão, vazio.
  const [form, setForm] = useState<OrcamentoRapidoFormV4>(() => v.orcamentoRapidoInitialValues ?? orcamentoRapidoFormVazioV4());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const clienteSearch = useClienteSearchV4(form.clienteModo === "existente" ? lojaAtivaId : null);

  const invalido = validarOrcamentoRapidoFormV4(form);
  const podeSalvar = !!sid && !invalido && !busy;
  const totais = previaTotaisOrcamentoRapidoV4(form);
  const clienteExistenteSemTelefone = form.clienteModo === "existente" && !!form.clienteExistente && !form.clienteExistente.telefone?.trim();

  const handleSalvar = async () => {
    setErro(null);
    if (!sid) {
      setErro("Selecione uma loja ativa para criar o orçamento.");
      return;
    }
    const invalidoAgora = validarOrcamentoRapidoFormV4(form);
    if (invalidoAgora) {
      setErro(invalidoAgora);
      return;
    }
    setBusy(true);
    try {
      const resultado = await criarOrcamentoRapidoV3(sid, buildOrcamentoRapidoInputFromFormV4(form));
      v.onOrcamentoRapidoCriado(resultado.osId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o orçamento rápido.");
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    height: 28,
    padding: "0 14px",
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
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>⚡ Orçamento Rápido</div>
            <div style={{ fontSize: 11.5, color: C.subtle }}>OS mínima + orçamento multiopção em rascunho — sem enviar, sem cobrar</div>
          </div>
          <button type="button" onClick={v.closeOrcamentoRapido} disabled={busy} style={{ width: 28, height: 28, border: "none", background: C.muted50, borderRadius: 8, color: C.muted, fontSize: 16, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}>
          {erro && (
            <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 14, fontSize: 11.5, color: C.dangerFg, lineHeight: 1.45 }}>
              {erro}
            </div>
          )}

          <div style={{ ...upLabel, fontSize: 10.5, letterSpacing: ".04em", fontWeight: 700, marginBottom: 8 }}>Cliente</div>
          <div style={{ display: "flex", gap: 3, padding: 3, background: C.muted100, borderRadius: 9, marginBottom: 12, width: "fit-content" }}>
            <button type="button" onClick={() => setForm((f) => ({ ...f, clienteModo: "existente" }))} style={tabBtn(form.clienteModo === "existente")}>Existente</button>
            <button type="button" onClick={() => setForm((f) => ({ ...f, clienteModo: "novo" }))} style={tabBtn(form.clienteModo === "novo")}>Novo</button>
          </div>

          {form.clienteModo === "existente" && (
            <div style={{ marginBottom: 8 }}>
              {form.clienteExistente ? (
                <div style={{ border: `1px solid ${C.primaryBd}`, background: C.primaryBg, borderRadius: 9, padding: "11px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {form.clienteExistente.nome || "Cliente"}
                  </span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, clienteExistente: null }))} style={{ height: 24, padding: "0 10px", border: `1px solid ${C.primaryBd}`, background: C.surface, color: C.primaryHover, borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                    Trocar
                  </button>
                </div>
              ) : (
                <ClienteBuscaExistente search={clienteSearch} onSelect={(c) => setForm((f) => ({ ...f, clienteExistente: c }))} />
              )}
            </div>
          )}
          {clienteExistenteSemTelefone && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.warnBg, border: `1px solid ${C.warnBd}`, borderRadius: 9, padding: "8px 10px", marginBottom: 16, fontSize: 11, color: C.warnFg, lineHeight: 1.45 }}>
              <span style={{ flex: "none" }}>⚠️</span>
              <span>Cliente sem WhatsApp cadastrado — envio digital indisponível até cadastrar um telefone (não impede salvar agora).</span>
            </div>
          )}

          {form.clienteModo === "novo" && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 16 }}>
              <div>
                <div style={{ ...upLabel, marginBottom: 3 }}>Nome *</div>
                <input value={form.clienteNovoNome} onChange={(e) => setForm((f) => ({ ...f, clienteNovoNome: e.target.value }))} maxLength={120} placeholder="Nome do cliente" style={input} autoComplete="off" />
              </div>
              <div>
                <div style={{ ...upLabel, marginBottom: 3 }}>Telefone *</div>
                <input value={form.clienteNovoTelefone} onChange={(e) => setForm((f) => ({ ...f, clienteNovoTelefone: e.target.value }))} maxLength={20} placeholder="(11) 90000-0000" style={input} autoComplete="off" />
              </div>
            </div>
          )}

          <div style={{ ...upLabel, fontSize: 10.5, letterSpacing: ".04em", fontWeight: 700, marginBottom: 8 }}>Aparelho</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 11 }}>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Marca *</div><input value={form.aparelhoMarca} onChange={(e) => setForm((f) => ({ ...f, aparelhoMarca: e.target.value }))} maxLength={40} placeholder="Apple, Samsung…" style={input} autoComplete="off" /></div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Modelo *</div><input value={form.aparelhoModelo} onChange={(e) => setForm((f) => ({ ...f, aparelhoModelo: e.target.value }))} maxLength={60} placeholder="iPhone 13 Pro…" style={input} autoComplete="off" /></div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...upLabel, marginBottom: 3 }}>Defeito relatado *</div>
            <textarea value={form.defeitoRelatado} onChange={(e) => setForm((f) => ({ ...f, defeitoRelatado: e.target.value }))} maxLength={1000} placeholder="Descreva o problema relatado pelo cliente…" style={{ width: "100%", minHeight: 54, padding: "8px 11px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12.5, color: C.body, resize: "vertical", fontFamily: "inherit" }} autoComplete="off" />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ ...upLabel, fontSize: 10.5, letterSpacing: ".04em", fontWeight: 700 }}>Itens fixos (opcional)</div>
            <button type="button" onClick={() => setForm((f) => adicionarItemFixoV4(f))} style={{ height: 24, padding: "0 10px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>+ item</button>
          </div>
          {form.itensFixos.map((it) => (
            <div key={it.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,0.8fr) minmax(0,0.8fr) auto auto", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <input value={it.descricao} onChange={(e) => setForm((f) => ({ ...f, itensFixos: f.itensFixos.map((x) => (x.id === it.id ? { ...x, descricao: e.target.value } : x)) }))} placeholder="Descrição" style={inputSm} maxLength={120} />
              <input type="number" min={0} step="0.01" value={it.valor || ""} onChange={(e) => setForm((f) => ({ ...f, itensFixos: f.itensFixos.map((x) => (x.id === it.id ? { ...x, valor: Math.max(0, Number(e.target.value) || 0) } : x)) }))} placeholder="R$" style={inputSm} disabled={it.cortesia} />
              <input type="number" min={0} step="0.01" value={it.custoV3 || ""} onChange={(e) => setForm((f) => ({ ...f, itensFixos: f.itensFixos.map((x) => (x.id === it.id ? { ...x, custoV3: Math.max(0, Number(e.target.value) || 0) } : x)) }))} placeholder="Custo (interno)" title="Custo interno — nunca aparece ao cliente" style={{ ...inputSm, background: C.muted100, color: C.subtle }} />
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: C.muted, whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={it.cortesia} onChange={(e) => setForm((f) => ({ ...f, itensFixos: f.itensFixos.map((x) => (x.id === it.id ? { ...x, cortesia: e.target.checked, valor: e.target.checked ? 0 : x.valor } : x)) }))} />
                Cortesia
              </label>
              <button type="button" onClick={() => setForm((f) => removerItemFixoV4(f, it.id))} style={{ height: 26, width: 26, border: "none", background: "transparent", color: C.dangerFg, fontSize: 14, cursor: "pointer" }}>×</button>
            </div>
          ))}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 8 }}>
            <div style={{ ...upLabel, fontSize: 10.5, letterSpacing: ".04em", fontWeight: 700 }}>Grupo de escolha</div>
            <button type="button" onClick={() => setForm((f) => adicionarVarianteV4(f))} disabled={form.variantes.length >= MAX_LINHAS_POR_GRUPO_V3} style={{ height: 24, padding: "0 10px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: form.variantes.length >= MAX_LINHAS_POR_GRUPO_V3 ? C.muted : C.body, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: form.variantes.length >= MAX_LINHAS_POR_GRUPO_V3 ? "default" : "pointer" }}>
              + opção ({form.variantes.length}/{MAX_LINHAS_POR_GRUPO_V3})
            </button>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ ...upLabel, marginBottom: 3 }}>Rótulo do grupo *</div>
            <input value={form.grupoRotulo} onChange={(e) => setForm((f) => ({ ...f, grupoRotulo: e.target.value }))} maxLength={80} placeholder="Ex.: Escolha a tela" style={input} autoComplete="off" />
          </div>

          {form.variantes.map((variante, i) => (
            <div key={variante.id} style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.subtle }}>Opção {i + 1}</span>
                <button type="button" onClick={() => setForm((f) => removerVarianteV4(f, variante.id))} disabled={form.variantes.length <= 2} style={{ height: 22, width: 22, border: "none", background: "transparent", color: form.variantes.length <= 2 ? C.muted : C.dangerFg, fontSize: 13, cursor: form.variantes.length <= 2 ? "default" : "pointer" }}>×</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,0.8fr)", gap: 6, marginBottom: 6 }}>
                <input value={variante.rotulo} onChange={(e) => setForm((f) => ({ ...f, variantes: f.variantes.map((x) => (x.id === variante.id ? { ...x, rotulo: e.target.value } : x)) }))} placeholder="Rótulo *" style={inputSm} maxLength={60} />
                <input type="number" min={0} step="0.01" value={variante.valor || ""} onChange={(e) => setForm((f) => ({ ...f, variantes: f.variantes.map((x) => (x.id === variante.id ? { ...x, valor: Math.max(0, Number(e.target.value) || 0) } : x)) }))} placeholder="Preço (R$) *" style={inputSm} />
                <input type="number" min={0} value={variante.garantiaDias || ""} onChange={(e) => setForm((f) => ({ ...f, variantes: f.variantes.map((x) => (x.id === variante.id ? { ...x, garantiaDias: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } : x)) }))} placeholder="Garantia (dias)" style={inputSm} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,0.8fr)", gap: 6 }}>
                <input value={variante.descricaoCurta} onChange={(e) => setForm((f) => ({ ...f, variantes: f.variantes.map((x) => (x.id === variante.id ? { ...x, descricaoCurta: e.target.value } : x)) }))} placeholder="Descrição curta (opcional)" style={inputSm} maxLength={120} />
                <input value={variante.badge} onChange={(e) => setForm((f) => ({ ...f, variantes: f.variantes.map((x) => (x.id === variante.id ? { ...x, badge: e.target.value } : x)) }))} placeholder="Selo (opcional)" style={inputSm} maxLength={24} />
                <input type="number" min={0} step="0.01" value={variante.custoV3 || ""} onChange={(e) => setForm((f) => ({ ...f, variantes: f.variantes.map((x) => (x.id === variante.id ? { ...x, custoV3: Math.max(0, Number(e.target.value) || 0) } : x)) }))} placeholder="Custo (interno)" title="Custo interno — nunca aparece ao cliente" style={{ ...inputSm, background: C.muted100, color: C.subtle }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 9, padding: "14px 18px", borderTop: `1px solid ${C.line2}`, background: C.surface2 }}>
          <span style={{ fontSize: 11, color: C.subtle }}>
            Validade: 7 dias a partir do envio ·{" "}
            {totais.faixa ? (
              <>Total de <strong style={{ color: C.body }}>{fmt(totais.faixa.min)}</strong> a <strong style={{ color: C.body }}>{fmt(totais.faixa.max)}</strong></>
            ) : (
              <>Total <strong style={{ color: C.body }}>{fmt(totais.total)}</strong></>
            )}
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" onClick={v.closeOrcamentoRapido} disabled={busy} style={{ height: 36, padding: "0 16px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>Cancelar</button>
            <button type="button" onClick={() => void handleSalvar()} disabled={!podeSalvar} style={{ height: 36, padding: "0 18px", border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: podeSalvar ? "pointer" : "default", opacity: podeSalvar ? 1 : 0.6 }}>
              {busy ? "Criando…" : "Criar orçamento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Aba "Existente" — busca REAL (somente leitura) na base da loja ativa, mesmo hook do Nova OS/Atendimento Rápido. */
function ClienteBuscaExistente({ search, onSelect }: { search: ReturnType<typeof useClienteSearchV4>; onSelect: (c: ClienteV4) => void }) {
  const boxBase: React.CSSProperties = { border: `1px dashed ${C.inputBd2}`, borderRadius: 9, padding: "16px 12px", textAlign: "center", fontSize: 11.5, color: C.subtle, lineHeight: 1.5 };

  return (
    <div>
      <input value={search.query} onChange={(e) => search.setQuery(e.target.value)} placeholder="Buscar por nome, telefone ou documento…" style={{ ...input, height: 34, marginBottom: 8 }} autoComplete="off" />
      {search.semLoja ? (
        <div style={boxBase}>Selecione uma loja ativa para buscar clientes da base real.</div>
      ) : search.error ? (
        <div style={{ ...boxBase, borderStyle: "solid", color: C.dangerFg, borderColor: C.dangerBd }}>{search.error}</div>
      ) : search.loading ? (
        <div style={boxBase}>Buscando clientes…</div>
      ) : search.termoCurto || (!search.buscou && search.query.trim() === "") ? (
        <div style={boxBase}>Digite ao menos 2 caracteres para buscar na base real da loja.</div>
      ) : search.buscou && search.clientes.length === 0 ? (
        <div style={boxBase}>Nenhum cliente encontrado para “{search.query.trim()}”.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
          {search.clientes.map((c) => (
            <button key={c.id} type="button" onClick={() => onSelect(c)} style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", textAlign: "left", border: `1px solid ${C.line}`, background: C.surface, borderRadius: 9, padding: "9px 11px", cursor: "pointer" }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome || "Cliente sem nome"}</span>
              <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[c.telefone, c.documento, c.cidade].filter(Boolean).join(" · ") || "Sem contato cadastrado"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
