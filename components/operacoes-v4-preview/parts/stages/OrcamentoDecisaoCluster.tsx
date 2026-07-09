/**
 * Operações V4 — cluster de DECISÃO do orçamento (GOAL OPS-V4-ORC-APROVACAO-
 * SELECAO-026): seleção de variante por grupo + Aprovar/Recusar/Pedir
 * alteração. Único arquivo (junto com `OrcamentoDuplicarButton.tsx`/
 * `OrcamentoEnvioCluster.tsx`) autorizado a chamar `aprovarOrcamentoV3`/
 * `recusarOrcamentoV3`/`selecionarVarianteOrcamento` — o `OrcamentoRapidoModal`
 * (GOAL 024) e o cluster de envio (GOAL 025) continuam proibidos de decidir.
 *
 * Seleção: cada grupo mostra suas variantes como rádio; marcar grava
 * IMEDIATAMENTE via `v.selecionarVarianteOrcamento` (estado sempre do
 * servidor — nunca uma seleção pendente local). Aprovar fica desabilitado,
 * com motivo claro, enquanto houver grupo sem seleção (mesma validação que o
 * servidor aplica — `aprovarOrcamentoV3` rejeitaria de qualquer forma).
 *
 * "Pediu alteração" NÃO chama nenhuma action — a OS já está na etapa de
 * edição (rascunho/enviado); é só uma nota que lembra o operador de ajustar
 * e reenviar (aba Enviar, GOAL 025). Nenhuma transição nova, nenhum contrato novo.
 */
"use client";

import { useState } from "react";
import { C, card, cardTitle, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import { MOTIVO_RECUSA_LABEL_V3, statusEfetivoOrcamentoV3, type MotivoRecusaOrcamentoV3 } from "@/lib/operacoes-v3/orcamento-model";

const MOTIVOS: MotivoRecusaOrcamentoV3[] = ["preco", "prazo", "desistiu", "concorrencia", "outro"];

const inputSm: React.CSSProperties = {
  width: "100%",
  height: 30,
  padding: "0 9px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 7,
  fontSize: 12.5,
  color: C.body,
  background: C.surface,
};

const btnGhost: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  border: `1px solid ${C.inputBd2}`,
  background: C.surface,
  color: C.body,
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

/**
 * GOAL OPS-V4-ORCAMENTO-READBACK-EDIT-002: guarda opcional vinda do editor. Quando
 * presente, "Aprovar" NUNCA aprova o orçamento do servidor ignorando o que o usuário
 * digitou: primeiro salva o editor (com validação) e só então aprova. Também bloqueia
 * aprovar um orçamento com total R$ 0. `total` é o total ao vivo do editor.
 */
export interface OrcamentoDecisaoGuardV4 {
  total: number;
  /** Valida + persiste o editor atual; `false` bloqueia a aprovação (inválido/falhou). */
  salvarEditor: () => Promise<boolean>;
}

export function OrcamentoDecisaoCluster({ v, guard }: { v: V4Vals; guard?: OrcamentoDecisaoGuardV4 }) {
  const grupos = v.orcamento.grupos;
  const temGrupos = v.orcamento.temGrupos;
  const todosResolvidos = grupos.every((g) => g.resolvido);
  const totalZero = !!guard && guard.total <= 0;
  const podeAprovar = (!temGrupos || todosResolvidos) && !totalZero;

  const [busySelecao, setBusySelecao] = useState<string | null>(null);
  const [busyDecisao, setBusyDecisao] = useState(false);
  const [modoRecusa, setModoRecusa] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRecusaOrcamentoV3>("preco");
  const [observacao, setObservacao] = useState("");
  const [notaAlteracao, setNotaAlteracao] = useState(false);

  const selecionar = async (grupoId: string, itemId: string) => {
    setBusySelecao(grupoId);
    try {
      await v.selecionarVarianteOrcamento(grupoId, itemId);
    } finally {
      setBusySelecao(null);
    }
  };

  const aprovar = async () => {
    setBusyDecisao(true);
    try {
      // Nunca aprova ignorando o editor: salva (com validação) e só então aprova.
      if (guard) {
        const ok = await guard.salvarEditor();
        if (!ok) return;
      }
      await v.aprovarOrcamento();
    } finally {
      setBusyDecisao(false);
    }
  };

  const recusar = async () => {
    setBusyDecisao(true);
    try {
      await v.recusarOrcamento({ motivo, observacao: observacao.trim() || undefined });
      setModoRecusa(false);
    } finally {
      setBusyDecisao(false);
    }
  };

  // Status efetivo (expirado é derivado, nunca persistido) — leitura pura da
  // OS real, sem tocar a projeção client-safe do GOAL 023 (só consumo aqui).
  const orcRaw = (v.realOS as { orcamento?: { status: "rascunho" | "enviado" | "aprovado" | "recusado"; validoAte?: string } } | null)
    ?.orcamento;
  const statusEfetivo = orcRaw ? statusEfetivoOrcamentoV3(orcRaw) : undefined;
  const mostrarOfertaCancelamento = v.orcamento.statusLabel === "Recusado" || statusEfetivo === "expirado";

  return (
    <div style={card}>
      {temGrupos && (
        <>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Grupos de escolha</div>
          {grupos.map((g) => (
            <div key={g.id} style={{ marginBottom: 12 }}>
              <div style={{ ...upLabel, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                {g.rotulo}
                {!g.resolvido && <span style={{ color: C.warnFg, fontWeight: 700 }}>— selecione uma opção</span>}
              </div>
              {g.itens.map((item) => (
                <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: busySelecao ? "default" : "pointer" }}>
                  <input
                    type="radio"
                    name={`grupo-${g.id}`}
                    checked={item.selecionada}
                    disabled={busySelecao !== null}
                    onChange={() => void selecionar(g.id, item.id)}
                  />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.descricao}
                    {item.variante?.badge ? ` ⭐ ${item.variante.badge}` : ""}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, flex: "none" }}>{item.valor}</span>
                </label>
              ))}
            </div>
          ))}
        </>
      )}

      <div style={{ ...cardTitle, marginTop: temGrupos ? 4 : 0, marginBottom: 10 }}>Decisão</div>

      {totalZero && (
        <div style={{ fontSize: 11, color: C.warnFg, marginBottom: 8, lineHeight: 1.5 }}>
          ⚠️ Orçamento total R$ 0. Lance um valor ou marque como sem cobrança em etapa própria.
        </div>
      )}
      {!totalZero && !podeAprovar && (
        <div style={{ fontSize: 11, color: C.warnFg, marginBottom: 8, lineHeight: 1.5 }}>
          ⚠️ Selecione uma opção em cada grupo antes de aprovar.
        </div>
      )}

      {!modoRecusa ? (
        <>
          <button
            type="button"
            onClick={() => void aprovar()}
            disabled={busyDecisao || !podeAprovar}
            title={totalZero ? "Orçamento total R$ 0 — lance um valor antes de aprovar." : !podeAprovar ? "Selecione uma opção em cada grupo antes de aprovar." : undefined}
            style={{ height: 34, width: "100%", padding: "0 16px", border: "none", background: C.success, color: C.white, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: busyDecisao || !podeAprovar ? "default" : "pointer", opacity: busyDecisao || !podeAprovar ? 0.6 : 1, marginBottom: 8 }}
          >
            {busyDecisao ? "Processando…" : guard ? "Salvar e aprovar orçamento" : "Aprovar orçamento"}
          </button>
          <button type="button" onClick={() => setModoRecusa(true)} disabled={busyDecisao} style={{ ...btnGhost, width: "100%", borderColor: C.dangerBd, color: C.dangerFg, marginBottom: 8 }}>
            Recusar orçamento
          </button>
          <button type="button" onClick={() => setNotaAlteracao((o) => !o)} disabled={busyDecisao} style={{ ...btnGhost, width: "100%" }}>
            Pediu alteração
          </button>
          {notaAlteracao && (
            <div style={{ fontSize: 11, color: C.subtle, marginTop: 8, lineHeight: 1.5 }}>
              A OS já está aberta para edição — ajuste os itens/opções acima e envie novamente ao cliente (aba Enviar orçamento).
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ ...upLabel, marginBottom: 4 }}>Motivo da recusa</div>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoRecusaOrcamentoV3)} style={{ ...inputSm, marginBottom: 8, cursor: "pointer" }}>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_RECUSA_LABEL_V3[m]}
              </option>
            ))}
          </select>
          <div style={{ ...upLabel, marginBottom: 4 }}>Observação (opcional)</div>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={300}
            placeholder="Detalhe opcional…"
            style={{ width: "100%", minHeight: 54, padding: "8px 9px", border: `1px solid ${C.inputBd}`, borderRadius: 7, fontSize: 12.5, color: C.body, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }}
          />
          <button type="button" onClick={() => void recusar()} disabled={busyDecisao} style={{ height: 32, width: "100%", padding: "0 16px", border: `1px solid ${C.dangerBd}`, background: C.surface, color: C.dangerFg, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: busyDecisao ? "default" : "pointer", opacity: busyDecisao ? 0.7 : 1, marginBottom: 6 }}>
            {busyDecisao ? "Processando…" : "Confirmar recusa"}
          </button>
          <button type="button" onClick={() => setModoRecusa(false)} disabled={busyDecisao} style={{ ...btnGhost, width: "100%" }}>
            Cancelar
          </button>
        </>
      )}

      {mostrarOfertaCancelamento && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${C.inputBd}` }}>
          <div style={{ fontSize: 11, color: C.subtle, marginBottom: 6, lineHeight: 1.5 }}>
            {v.orcamento.statusLabel === "Recusado" ? "Orçamento recusado." : "Orçamento expirado."} Se o atendimento não vai continuar, você pode cancelar esta OS.
          </div>
          <button
            type="button"
            onClick={() => v.abrirCancelamentoComMotivo(v.orcamento.statusLabel === "Recusado" ? "Orçamento recusado pelo cliente." : "Orçamento expirado sem resposta do cliente.")}
            style={{ ...btnGhost, width: "100%" }}
          >
            Cancelar esta OS
          </button>
        </div>
      )}
    </div>
  );
}
