/**
 * Operações V4 — "Corrigir datas" (GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001).
 * Mesmo estado/regras da V3 (`useCorrigirDatas`), com a janela e os campos da V4.
 * Grava só datas + auditoria via `corrigirDatasOSV3` — nunca refaz a entrega.
 */
"use client";

import { useEffect, useRef } from "react";
import type { OrdemServico } from "@/types/os";
import { C } from "../tokens";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { MOTIVO_MAX_V3 } from "@/lib/operacoes-v3/datas-correcao-model";
import { CorrigirDatasCampos, resumoImpactoGarantia, useCorrigirDatas } from "@/components/operacoes-v3/components/CorrigirDatasV3";
import { AtendimentoModalShell } from "./atendimento/AtendimentoModalShell";
import { atendDataCampo, atendGradeDatas, atendLabel } from "./atendimento/field-styles";

export function CorrigirDatasModalV4({
  open,
  os,
  onClose,
  onSalvo,
}: {
  open: boolean;
  os: OrdemServico | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const { lojaAtivaId } = useLojaAtiva();
  if (!open || !os || !lojaAtivaId || (os.storeId && os.storeId !== lojaAtivaId)) return null;
  return <Conteudo key={JSON.stringify([lojaAtivaId, os.id])} os={os} storeId={lojaAtivaId} onClose={onClose} onSalvo={onSalvo} />;
}

function Conteudo({ os, storeId, onClose, onSalvo }: { os: OrdemServico; storeId: string; onClose: () => void; onSalvo: () => void }) {
  // Uma resposta da janela desmontada não fecha nem recarrega a seleção nova.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);
  const estado = useCorrigirDatas({ os, storeId, onSalvo: () => { if (montado.current) onSalvo(); } });
  const impacto = resumoImpactoGarantia(estado.garantia);
  // Tab permanece no editor para não alterar o rascunho atrás da janela.
  const raizRef = useRef<HTMLDivElement>(null);
  const janelaRef = useRef({ onClose, busy: estado.busy });
  useEffect(() => { janelaRef.current = { onClose, busy: estado.busy }; }, [onClose, estado.busy]);
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const anterior = document.activeElement as HTMLElement | null;
    raiz.querySelector<HTMLInputElement>("input")?.focus();
    const teclado = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!janelaRef.current.busy) janelaRef.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controles = raiz.querySelectorAll<HTMLElement>(":is(button, input, textarea, select):enabled");
      const primeiro = controles[0];
      const ultimo = controles[controles.length - 1];
      if (!primeiro || !ultimo) return;
      const fora = !raiz.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === primeiro || fora)) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && (document.activeElement === ultimo || fora)) {
        event.preventDefault();
        primeiro.focus();
      }
    };
    raiz.addEventListener("keydown", teclado);
    return () => {
      raiz.removeEventListener("keydown", teclado);
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);

  const modal = (
    <AtendimentoModalShell
      titulo={`Corrigir datas · ${os.codigo}`}
      subtitulo="Corrige só as datas. Nada é entregue, cobrado ou enviado de novo."
      onClose={onClose}
      busy={estado.busy}
      width={640}
      erro={estado.erroGeral}
      footer={
        <>
          <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={estado.busy} style={ghost}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void estado.salvar()}
              disabled={estado.busy || estado.alterados.length === 0}
              style={{ ...primary, opacity: estado.busy || estado.alterados.length === 0 ? 0.6 : 1 }}
            >
              {estado.busy ? "Salvando…" : "Salvar correção"}
            </button>
          </div>
        </>
      }
    >
      <p style={{ margin: "0 0 12px", fontSize: 12, lineHeight: 1.5, color: C.bodySoft }}>
        A correção de datas operacionais não altera automaticamente pagamento, Caixa ou fechamento financeiro.
      </p>
      <div style={atendGradeDatas}>
        <CorrigirDatasCampos
          estado={estado}
          idPrefixo="corrigir-v4"
          estilosCampo={atendDataCampo}
          renderAtual={(t) => <p style={{ margin: "4px 0 0", fontSize: 11, color: C.subtle }}>{t}</p>}
        />
      </div>

      {impacto.length > 0 ? (
        <section aria-label="Impacto na garantia" style={{ marginTop: 14, background: C.warnBg, border: `1px solid ${C.warnBd}`, borderRadius: 9, padding: "10px 12px", fontSize: 12, color: C.body }}>
          <div style={{ fontWeight: 700, color: C.warnFg, marginBottom: 4 }}>A garantia muda junto com a entrega</div>
          <ul style={{ margin: 0, paddingLeft: 16, color: C.bodySoft, lineHeight: 1.5 }}>
            {impacto.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <label style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 8, lineHeight: 1.4 }}>
            <input
              ref={estado.refs.confirmarGarantia as React.RefObject<HTMLInputElement>}
              type="checkbox"
              checked={estado.confirmarGarantia}
              onChange={(e) => estado.setConfirmarGarantia(e.target.checked)}
            />
            <span>Confirmo que a garantia passa a contar da nova data de entrega.</span>
          </label>
        </section>
      ) : null}

      <label style={{ display: "block", marginTop: 14 }}>
        <span style={{ ...atendLabel, display: "block" }}>Motivo da correção *</span>
        <textarea
          ref={estado.refs.motivo as React.RefObject<HTMLTextAreaElement>}
          value={estado.motivo}
          onChange={(e) => estado.setMotivo(e.target.value)}
          maxLength={MOTIVO_MAX_V3}
          placeholder="Ex.: o aparelho foi entregue na sexta e só registrei hoje."
          aria-invalid={estado.erros.motivo ? true : undefined}
          aria-describedby={estado.erros.motivo ? "corrigir-v4-motivo-erro" : undefined}
          style={{
            width: "100%",
            minHeight: 58,
            padding: "8px 11px",
            border: `1px solid ${estado.erros.motivo ? C.dangerFg : C.inputBd}`,
            borderRadius: 8,
            fontSize: 12.5,
            color: C.body,
            background: C.surface,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
        {estado.erros.motivo ? (
          <span id="corrigir-v4-motivo-erro" role="alert" style={{ display: "block", marginTop: 4, fontSize: 11.5, fontWeight: 600, color: C.dangerFg }}>
            {estado.erros.motivo}
          </span>
        ) : null}
      </label>
      <p style={{ margin: "10px 0 0", fontSize: 11.5, color: C.subtle, lineHeight: 1.5 }}>
        Fica no histórico com seu usuário, o horário de agora e o motivo.
      </p>
    </AtendimentoModalShell>
  );
  return <div ref={raizRef} style={{ display: "contents" }}>{modal}</div>;
}

const ghost: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  border: `1px solid ${C.inputBd}`,
  background: C.surface,
  color: C.body,
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const primary: React.CSSProperties = {
  height: 36,
  padding: "0 16px",
  border: "none",
  background: C.primary,
  color: C.white,
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
