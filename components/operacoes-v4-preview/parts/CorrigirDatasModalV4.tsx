/**
 * Operações V4 — "Corrigir datas" (GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001).
 * Mesmo estado/regras da V3 (`useCorrigirDatas`), com a janela e os campos da V4.
 * Grava só datas + auditoria via `corrigirDatasOSV3` — nunca refaz a entrega.
 */
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { OrdemServico } from "@/types/os";
import { C } from "../tokens";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { MOTIVO_MAX_V3 } from "@/lib/operacoes-v3/datas-correcao-model";
import { CorrigirDatasCampos, resumoImpactoGarantia, useCorrigirDatas } from "@/components/operacoes-v3/components/CorrigirDatasV3";
import { AtendimentoModalShell } from "./atendimento/AtendimentoModalShell";
import { atendDataCampo, atendGradeDatas, atendLabel } from "./atendimento/field-styles";

type ContextoFoco = { osId: string | null; storeId: string | null; montado: boolean; restauracao: MutationObserver | null };

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
  // A restauração adiada do Radix só pertence à seleção que abriu esta janela.
  const contextoRef = useRef<ContextoFoco>({ osId: os?.id ?? null, storeId: lojaAtivaId, montado: true, restauracao: null });
  useLayoutEffect(() => {
    contextoRef.current = { osId: os?.id ?? null, storeId: lojaAtivaId, montado: true, restauracao: null };
    return () => {
      const contexto = contextoRef.current;
      contexto.montado = false;
      contexto.restauracao?.disconnect();
      contexto.restauracao = null;
    };
  }, [open, os?.id, lojaAtivaId]);
  if (!open || !os || !lojaAtivaId || (os.storeId && os.storeId !== lojaAtivaId)) return null;
  return <AguardarJanela key={JSON.stringify([lojaAtivaId, os.id])} os={os} storeId={lojaAtivaId} contextoRef={contextoRef} onClose={onClose} onSalvo={onSalvo} />;
}

// Se já há uma janela ativa, o pedido espera seu término. Não instala FocusScope
// ou DismissableLayer por cima dela. O observador só existe enquanto espera.
function AguardarJanela(props: React.ComponentProps<typeof Conteudo>) {
  const [precedente, setPrecedente] = useState(() => janelaExterna());
  useEffect(() => {
    if (!precedente) return;
    const verificar = () => setPrecedente(janelaExterna());
    const observar = new MutationObserver(verificar);
    observar.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "aria-hidden", "hidden"] });
    verificar(); // A janela pode ter fechado no mesmo commit, antes deste efeito.
    return () => observar.disconnect();
  }, [precedente]);
  return precedente ? null : <Conteudo {...props} />;
}

function janelaExterna(propria?: HTMLElement | null): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')).find((el) =>
    el !== propria && !el.contains(propria ?? null) && el.dataset.state !== "closed" && !el.closest('[hidden], [aria-hidden="true"]'),
  ) ?? null;
}

function Conteudo({ os, storeId, contextoRef, onClose, onSalvo }: {
  os: OrdemServico; storeId: string; contextoRef: React.RefObject<ContextoFoco>; onClose: () => void; onSalvo: () => void;
}) {
  // Uma resposta da janela desmontada não fecha nem recarrega a seleção nova.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);
  const estado = useCorrigirDatas({ os, storeId, onSalvo: () => { if (montado.current) onSalvo(); } });
  const impacto = resumoImpactoGarantia(estado.garantia);
  const raizRef = useRef<HTMLDivElement>(null);
  const janelaRef = useRef<HTMLDivElement>(null);
  const origemRef = useRef<{ gatilho: HTMLElement | null; raiz: HTMLElement | null; janela: HTMLElement | null }>({ gatilho: null, raiz: null, janela: null });
  const fechar = () => { if (!estado.busy) onClose(); };
  const restaurarFoco = (event: Event) => {
    event.preventDefault();
    const contexto = contextoRef.current;
    contexto.restauracao?.disconnect();
    contexto.restauracao = null;
    const { gatilho, raiz, janela } = origemRef.current;
    const mesmoContexto = () => contexto.montado && contextoRef.current === contexto && contexto.osId === os.id &&
      contexto.storeId === storeId && raiz?.isConnected && !janelaExterna();
    // Unmount, troca de OS/loja ou outra janela têm prioridade sobre a origem antiga.
    if (!mesmoContexto() || !raiz) return;
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && !janela?.contains(ativo)) return;
    const disponivel = () => gatilho?.isConnected && raiz.contains(gatilho) && !gatilho.matches(":disabled") &&
      !gatilho.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(gatilho).display !== "none" && getComputedStyle(gatilho).visibility !== "hidden";
    if (disponivel()) { gatilho!.focus(); return; }
    raiz.focus();
    // A recarga da mesma Entrada pode desabilitar temporariamente o botão.
    // Observa só este contexto e só retoma se o usuário ainda estiver no fallback.
    if (!gatilho?.isConnected || !gatilho.matches(":disabled")) return;
    const observar = new MutationObserver(() => {
      if (!mesmoContexto() || !gatilho.isConnected || document.activeElement !== raiz) {
        observar.disconnect(); contexto.restauracao = null; return;
      }
      if (gatilho.matches(":disabled")) return;
      observar.disconnect(); contexto.restauracao = null;
      if (disponivel()) gatilho.focus();
    });
    observar.observe(raiz, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    contexto.restauracao = observar;
  };
  useLayoutEffect(() => {
    const janela = janelaRef.current;
    const ativo = document.activeElement;
    // Desabilitar Salvar pode deslocar foco ao body. Só a janela ativa o recupera;
    // FocusScope/DismissableLayer do Radix coordenam Tab e Escape entre overlays.
    if (janela && !janelaExterna(janela) && (!janela.contains(ativo) || (ativo instanceof HTMLElement && ativo.matches(":disabled")))) {
      (janela.querySelector<HTMLElement>(CONTROLES_FOCO) ?? janela).focus();
    }
  }, [estado.busy]);

  const modal = (
    <AtendimentoModalShell
      titulo={`Corrigir datas · ${os.codigo}`}
      subtitulo="Corrige só as datas. Nada é entregue, cobrado ou enviado de novo."
      onClose={fechar}
      dialogProps={{
        ref: janelaRef,
        onOpenAutoFocus: (event) => {
          event.preventDefault();
          const janela = janelaRef.current;
          origemRef.current = {
            gatilho: document.activeElement instanceof HTMLElement ? document.activeElement : null,
            raiz: raizRef.current?.closest<HTMLElement>("[data-og-v4-raiz]") ?? null,
            janela,
          };
          (janela?.querySelector<HTMLElement>("input:enabled") ?? janela)?.focus();
        },
        onCloseAutoFocus: restaurarFoco,
        onEscapeKeyDown: (event) => { if (estado.busy) event.preventDefault(); },
        onInteractOutside: (event) => event.preventDefault(),
      }}
      busy={estado.busy}
      width={640}
      erro={estado.erroGeral}
      footer={
        <>
          <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={fechar} disabled={estado.busy} style={ghost}>
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
  return <div ref={raizRef} data-og-v4-corrigir-datas="" style={{ display: "contents" }}>
    <DialogPrimitive.Root open onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <DialogPrimitive.Portal>{modal}</DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  </div>;
}

const CONTROLES_FOCO = ':is(button, input, textarea, select):enabled:not([tabindex="-1"]):not([type="hidden"])';

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
