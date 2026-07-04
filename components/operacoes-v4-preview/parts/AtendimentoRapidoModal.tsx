/**
 * Operações V4 — modal "Atendimento rápido" (GOAL OPS-V4-ATENDIMENTO-RAPIDO-CONNECT-014).
 *
 * Reaproveita o contrato REAL já existente da V3 — `finalizarAtendimentoRapidoV3`
 * (cria a OS pelo caminho seguro, gera e aprova o orçamento, recebe no caixa e
 * marca como entregue, com compensação automática se algo falhar no meio) — sem
 * motor novo, sem API nova, sem tocar caixa/financeiro/estoque diretamente.
 *
 * O contrato SEMPRE recebe e entrega a OS no mesmo passo (não existe modo "só
 * orçamento, sem cobrança/entrega" hoje) — por isso a tela chama isso de
 * "Atendimento rápido", nunca de "Orçamento rápido" (ver GOAL
 * OPS-V4-ORCAMENTO-RAPIDO-SEM-OS-AUDIT, deixado como auditoria separada).
 *
 * Estado do formulário vive LOCALMENTE aqui (mesma decisão de design do
 * `NovaOSModal`) — não sobe ao `V4State`. Exige caixa aberto (checagem honesta
 * client-side + a própria action valida de novo no servidor). No sucesso, avisa
 * o controlador via `v.onAtendimentoRapidoConcluido(osId)` (fecha o modal,
 * recarrega a lista e abre a OS já finalizada no workspace).
 */
"use client";

import { useEffect, useState } from "react";
import { C, fmt, upLabel } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useClienteSearchV4, type ClienteV4 } from "../use-clientes-v4";
import { finalizarAtendimentoRapidoV3 } from "@/lib/operacoes-v3/atendimento-rapido-actions";
import { validarAtendimentoRapidoV3, SERVICOS_RAPIDOS_V3 } from "@/lib/operacoes-v3/atendimento-rapido-model";
import { getCaixaSessaoAbertaV3 } from "@/lib/operacoes-v3/pdv-servico-actions";
import { FORMAS_RECEBIMENTO_V3, type FormaRecebimentoV3 } from "@/lib/operacoes-v3/payment-model";
import {
  atendimentoRapidoFormVazioV4,
  buildAtendimentoRapidoInputFromFormV4,
  selecionarServicoRapidoV4,
  type AtendimentoRapidoFormV4,
} from "@/lib/operacoes-v4/atendimento-rapido-form";

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

const FORMAS_SUPORTADAS = FORMAS_RECEBIMENTO_V3.filter((f) => f.suportada);

export function AtendimentoRapidoModal({ v }: { v: V4Vals }) {
  // Monta o conteúdo só quando aberto → o formulário nasce limpo a cada abertura
  // (estado local descartado ao fechar), sem reset manual.
  if (!v.atendimentoRapidoOpen) return null;
  return <AtendimentoRapidoModalContent v={v} />;
}

function AtendimentoRapidoModalContent({ v }: { v: V4Vals }) {
  const { lojaAtivaId } = useLojaAtiva();
  const sid = (lojaAtivaId ?? "").trim();

  const [form, setForm] = useState<AtendimentoRapidoFormV4>(() => atendimentoRapidoFormVazioV4());
  const [caixaAberta, setCaixaAberta] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const clienteSearch = useClienteSearchV4(form.clienteModo === "existente" ? lojaAtivaId : null);

  // Caixa precisa estar ABERTO — checagem honesta client-side (mesma trava que
  // `finalizarAtendimentoRapidoV3` aplica de novo no servidor). Nunca abre caixa
  // por aqui — só lê o estado real via `getCaixaSessaoAbertaV3`.
  useEffect(() => {
    if (!sid) {
      setCaixaAberta(null);
      return;
    }
    let vivo = true;
    getCaixaSessaoAbertaV3(sid)
      .then((s) => vivo && setCaixaAberta(!!s.aberta))
      .catch(() => vivo && setCaixaAberta(false));
    return () => {
      vivo = false;
    };
  }, [sid]);

  const clienteOk =
    form.clienteModo === "balcao" ||
    (form.clienteModo === "existente" && !!form.clienteExistente) ||
    (form.clienteModo === "novo" && form.clienteNovoNome.trim().length > 0);
  const podeFinalizar =
    !!sid && caixaAberta === true && clienteOk && form.servicoNome.trim().length > 0 && form.servicoValor > 0 && !busy;

  const handleFinalizar = async () => {
    setErro(null);
    if (!sid) {
      setErro("Selecione uma loja ativa para finalizar o atendimento.");
      return;
    }
    if (caixaAberta !== true) {
      setErro("Abra o caixa no PDV para finalizar o atendimento rápido (o recebimento entra no fechamento).");
      return;
    }
    const inputV3 = buildAtendimentoRapidoInputFromFormV4(form);
    const invalido = validarAtendimentoRapidoV3(inputV3);
    if (invalido) {
      setErro(invalido);
      return;
    }
    setBusy(true);
    try {
      const resultado = await finalizarAtendimentoRapidoV3(sid, inputV3);
      v.onAtendimentoRapidoConcluido(resultado.osId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível finalizar o atendimento.");
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
      <div
        style={{
          width: 640,
          maxWidth: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: C.surface,
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(17,19,26,.3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "15px 18px",
            borderBottom: `1px solid ${C.line2}`,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Atendimento rápido</div>
            <div style={{ fontSize: 11.5, color: C.subtle }}>
              Crie uma OS rápida com orçamento, pagamento e entrega em uma única etapa.
            </div>
          </div>
          <button
            type="button"
            onClick={v.closeAtendimentoRapido}
            disabled={busy}
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: C.muted50,
              borderRadius: 8,
              color: C.muted,
              fontSize: 16,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}>
          {caixaAberta === false && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                background: C.warnBg,
                border: `1px solid ${C.warnBd}`,
                borderRadius: 9,
                padding: "9px 11px",
                marginBottom: 14,
              }}
            >
              <span style={{ fontSize: 13, lineHeight: "16px", flex: "none" }}>🔒</span>
              <span style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.45 }}>
                <strong>Caixa fechado.</strong> Abra o caixa no PDV para finalizar o atendimento rápido — o
                recebimento entra no fechamento do caixa do dia.
              </span>
            </div>
          )}

          {erro && (
            <div
              style={{
                background: C.dangerBg,
                border: `1px solid ${C.dangerBd}`,
                borderRadius: 9,
                padding: "9px 11px",
                marginBottom: 14,
                fontSize: 11.5,
                color: C.dangerFg,
                lineHeight: 1.45,
              }}
            >
              {erro}
            </div>
          )}

          <div style={{ ...upLabel, fontSize: 10.5, letterSpacing: ".04em", fontWeight: 700, marginBottom: 8 }}>Cliente</div>
          <div style={{ display: "flex", gap: 3, padding: 3, background: C.muted100, borderRadius: 9, marginBottom: 12, width: "fit-content" }}>
            <button type="button" onClick={() => setForm((f) => ({ ...f, clienteModo: "balcao" }))} style={tabBtn(form.clienteModo === "balcao")}>
              Cliente balcão
            </button>
            <button type="button" onClick={() => setForm((f) => ({ ...f, clienteModo: "existente" }))} style={tabBtn(form.clienteModo === "existente")}>
              Existente
            </button>
            <button type="button" onClick={() => setForm((f) => ({ ...f, clienteModo: "novo" }))} style={tabBtn(form.clienteModo === "novo")}>
              Novo
            </button>
          </div>

          {form.clienteModo === "balcao" && (
            <div
              style={{
                border: `1px dashed ${C.inputBd2}`,
                borderRadius: 9,
                padding: "10px 12px",
                fontSize: 11.5,
                color: C.subtle,
                lineHeight: 1.5,
                marginBottom: 16,
              }}
            >
              Atendimento sem identificação — será registrado como <strong>Cliente Balcão</strong> (sem exigir
              CPF/telefone, sem duplicar cadastro).
            </div>
          )}

          {form.clienteModo === "existente" && (
            <div style={{ marginBottom: 16 }}>
              {form.clienteExistente ? (
                <div
                  style={{
                    border: `1px solid ${C.primaryBd}`,
                    background: C.primaryBg,
                    borderRadius: 9,
                    padding: "11px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: C.ink,
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {form.clienteExistente.nome || "Cliente"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, clienteExistente: null }))}
                    style={{
                      height: 24,
                      padding: "0 10px",
                      border: `1px solid ${C.primaryBd}`,
                      background: C.surface,
                      color: C.primaryHover,
                      borderRadius: 7,
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <ClienteBuscaExistente search={clienteSearch} onSelect={(c) => setForm((f) => ({ ...f, clienteExistente: c }))} />
              )}
            </div>
          )}

          {form.clienteModo === "novo" && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 16 }}>
              <div>
                <div style={{ ...upLabel, marginBottom: 3 }}>Nome *</div>
                <input
                  value={form.clienteNovoNome}
                  onChange={(e) => setForm((f) => ({ ...f, clienteNovoNome: e.target.value }))}
                  maxLength={120}
                  placeholder="Nome do cliente"
                  style={input}
                  autoComplete="off"
                />
              </div>
              <div>
                <div style={{ ...upLabel, marginBottom: 3 }}>Telefone (opcional)</div>
                <input
                  value={form.clienteNovoTelefone}
                  onChange={(e) => setForm((f) => ({ ...f, clienteNovoTelefone: e.target.value }))}
                  maxLength={20}
                  placeholder="(11) 90000-0000"
                  style={input}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <div style={{ ...upLabel, fontSize: 10.5, letterSpacing: ".04em", fontWeight: 700, marginBottom: 8 }}>Serviço</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {SERVICOS_RAPIDOS_V3.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setForm((f) => selecionarServicoRapidoV4(f, s))}
                style={{
                  height: 28,
                  padding: "0 12px",
                  border: `1px solid ${C.inputBd}`,
                  background: form.servicoNome === s.nome ? C.primaryBg : C.surface,
                  color: form.servicoNome === s.nome ? C.primaryHover : C.body,
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {s.nome}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ ...upLabel, marginBottom: 3 }}>Serviço realizado *</div>
              <input
                value={form.servicoNome}
                onChange={(e) => setForm((f) => ({ ...f, servicoNome: e.target.value }))}
                maxLength={120}
                placeholder="Ex.: Troca de tela"
                style={input}
                autoComplete="off"
              />
            </div>
            <div>
              <div style={{ ...upLabel, marginBottom: 3 }}>Valor (R$) *</div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.servicoValor || ""}
                onChange={(e) => setForm((f) => ({ ...f, servicoValor: Math.max(0, Number(e.target.value) || 0) }))}
                placeholder="0,00"
                style={input}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...upLabel, marginBottom: 3 }}>Observação do serviço (opcional)</div>
            <input
              value={form.servicoDescricao}
              onChange={(e) => setForm((f) => ({ ...f, servicoDescricao: e.target.value }))}
              maxLength={160}
              placeholder="Detalhe rápido"
              style={input}
              autoComplete="off"
            />
          </div>

          <div style={{ ...upLabel, fontSize: 10.5, letterSpacing: ".04em", fontWeight: 700, marginBottom: 8 }}>Aparelho (opcional)</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 16 }}>
            <div>
              <div style={{ ...upLabel, marginBottom: 3 }}>Marca</div>
              <input
                value={form.equipMarca}
                onChange={(e) => setForm((f) => ({ ...f, equipMarca: e.target.value }))}
                maxLength={40}
                placeholder="Ex.: Motorola"
                style={input}
                autoComplete="off"
              />
            </div>
            <div>
              <div style={{ ...upLabel, marginBottom: 3 }}>Modelo</div>
              <input
                value={form.equipModelo}
                onChange={(e) => setForm((f) => ({ ...f, equipModelo: e.target.value }))}
                maxLength={60}
                placeholder="Ex.: G24"
                style={input}
                autoComplete="off"
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 10 }}>
            <div>
              <div style={{ ...upLabel, marginBottom: 3 }}>Forma de pagamento</div>
              <select
                value={form.formaPagamento}
                onChange={(e) => setForm((f) => ({ ...f, formaPagamento: e.target.value as FormaRecebimentoV3 }))}
                style={{ ...input, cursor: "pointer" }}
              >
                {FORMAS_SUPORTADAS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ ...upLabel, marginBottom: 3 }}>Observação geral (opcional)</div>
              <input
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                maxLength={200}
                placeholder="Ex.: cliente vai voltar amanhã"
                style={input}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 9,
            padding: "14px 18px",
            borderTop: `1px solid ${C.line2}`,
            background: C.surface2,
          }}
        >
          <span style={{ fontSize: 11, color: C.subtle }}>
            Total a receber <strong style={{ color: C.body }}>{fmt(form.servicoValor || 0)}</strong> · entra no
            fechamento do caixa.
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button
              type="button"
              onClick={v.closeAtendimentoRapido}
              disabled={busy}
              style={{
                height: 36,
                padding: "0 16px",
                border: `1px solid ${C.inputBd2}`,
                background: C.surface,
                color: C.body,
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 500,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleFinalizar()}
              disabled={!podeFinalizar}
              style={{
                height: 36,
                padding: "0 18px",
                border: "none",
                background: C.primary,
                color: C.white,
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
                cursor: podeFinalizar ? "pointer" : "default",
                opacity: podeFinalizar ? 1 : 0.6,
              }}
            >
              {busy ? "Finalizando…" : "Finalizar atendimento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Aba "Existente" — busca REAL (somente leitura) na base da loja ativa por
 * nome/telefone/documento (mesmo hook `useClienteSearchV4` do Nova OS). Sem
 * fallback de loja; selecionar apenas escolhe o cliente deste atendimento.
 */
function ClienteBuscaExistente({
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

  return (
    <div>
      <input
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        placeholder="Buscar por nome, telefone ou documento…"
        style={{ ...input, height: 34, marginBottom: 8 }}
        autoComplete="off"
      />
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
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                width: "100%",
                textAlign: "left",
                border: `1px solid ${C.line}`,
                background: C.surface,
                borderRadius: 9,
                padding: "9px 11px",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: C.ink,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.nome || "Cliente sem nome"}
              </span>
              <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[c.telefone, c.documento, c.cidade].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
