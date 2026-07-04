/**
 * Operações V4 — cluster de ENVIO do orçamento (GOAL OPS-V4-ORC-ENVIO-WA-025).
 *
 * Único arquivo autorizado (junto com `OrcamentoDuplicarButton.tsx`) a chamar
 * `enviarOrcamentoPorCanal` (→ `enviarOrcamentoPorCanalV3`/`registrarEnvioOrcamento`
 * no servidor) — o `OrcamentoRapidoModal` (GOAL 024) continua proibido de enviar
 * nada (guard dedicado em `preview-honesty.test.ts`).
 *
 * A mensagem NASCE da projeção client-safe (`v.orcamentoClienteView`, GOAL 023)
 * via `montarMensagemOrcamentoV4` — nunca lemos payload/orçamento cru aqui.
 * `window.open` (WhatsApp) só acontece no clique síncrono do botão "Abrir
 * WhatsApp" do painel PÓS-envio — nunca encadeado depois de um `await`
 * (popup-safe: navegadores bloqueiam popups abertos fora do gesto do usuário).
 */
"use client";

import { useState } from "react";
import { C, card, cardTitle, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import { NI } from "../../os-adapter";
import { montarLinkWaV4, montarMensagemOrcamentoV4 } from "@/lib/operacoes-v4/orcamento-mensagem";
import type { CanalEnvioOrcamentoV3 } from "@/lib/operacoes-v3/orcamento-model";

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

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function PreviewModal({ mensagem, onAbrirDoc, onClose }: { mensagem: string; onAbrirDoc?: () => void; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(17,19,26,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 480, maxWidth: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", background: C.surface, borderRadius: 12, boxShadow: "0 20px 50px rgba(17,19,26,.35)", overflow: "hidden" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.line2}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Pré-visualizar mensagem</span>
          <button type="button" onClick={onClose} style={{ width: 26, height: 26, border: "none", background: C.muted50, borderRadius: 7, color: C.muted, fontSize: 15, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, color: C.body, lineHeight: 1.55, margin: 0 }}>{mensagem}</pre>
        </div>
        {onAbrirDoc && (
          <div style={{ flex: "none", padding: "10px 16px", borderTop: `1px solid ${C.line2}` }}>
            <button type="button" onClick={onAbrirDoc} style={{ ...btnGhost, width: "100%" }}>📄 Ver documento completo (Orçamento via cliente)</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function OrcamentoEnvioCluster({ v }: { v: V4Vals }) {
  const view = v.orcamentoClienteView;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ultimoResultado, setUltimoResultado] = useState<{ reenvio: boolean; avisoRegistro: boolean } | null>(null);

  // Sem projeção → nada a enviar (deveria ser inalcançável quando o orçamento
  // está materializado, mas o gate fica honesto mesmo assim).
  if (!view) return null;

  const semItens = view.itensFixosVisiveis.length === 0 && view.grupos.length === 0;
  const mensagem = montarMensagemOrcamentoV4(view);
  const telefoneCliente = v.os.telefone && v.os.telefone !== NI ? v.os.telefone : undefined;
  const linkWa = montarLinkWaV4(telefoneCliente, mensagem);
  const jaEnviado = v.orcamento.statusLabel === "Enviado";

  const handleEnviar = async (canal: CanalEnvioOrcamentoV3) => {
    setMenuOpen(false);
    setBusy(true);
    try {
      const res = await v.enviarOrcamentoPorCanal(canal);
      if (res.ok) setUltimoResultado({ reenvio: !!res.reenvio, avisoRegistro: !!res.avisoRegistro });
    } finally {
      setBusy(false);
    }
  };

  const handleCopiarERegistrar = async () => {
    await copiarTexto(mensagem);
    await handleEnviar("outro");
  };

  return (
    <div style={card}>
      <div style={{ ...cardTitle, marginBottom: 10 }}>📨 Enviar orçamento</div>

      {semItens ? (
        <div style={{ fontSize: 12, color: C.subtle, lineHeight: 1.5 }}>Adicione itens ou um grupo de escolha para poder enviar.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <button type="button" onClick={() => setPreviewOpen(true)} style={btnGhost}>👁 Pré-visualizar</button>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                disabled={busy}
                style={{ height: 30, padding: "0 12px", border: "none", background: C.primary, color: C.white, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
              >
                {busy ? "Enviando…" : `${jaEnviado ? "Registrar novo envio" : "Enviar orçamento"} ▾`}
              </button>
              {menuOpen && (
                <>
                  <button type="button" onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40, border: "none", background: "transparent", cursor: "default" }} />
                  <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 50, width: 220, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 10px 28px rgba(17,19,26,.16)", padding: 6 }}>
                    <button
                      type="button"
                      onClick={() => void handleEnviar("whatsapp")}
                      disabled={!linkWa.valido}
                      title={linkWa.valido ? undefined : linkWa.motivo}
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 7, padding: "8px 9px", fontSize: 12.5, color: linkWa.valido ? C.body : C.muted, cursor: linkWa.valido ? "pointer" : "default" }}
                    >
                      💬 WhatsApp{!linkWa.valido ? ` (${linkWa.motivo})` : ""}
                    </button>
                    <button type="button" onClick={() => void handleCopiarERegistrar()} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 7, padding: "8px 9px", fontSize: 12.5, color: C.body, cursor: "pointer" }}>
                      📋 Copiar mensagem
                    </button>
                    <button type="button" onClick={() => void handleEnviar("presencial")} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 7, padding: "8px 9px", fontSize: 12.5, color: C.body, cursor: "pointer" }}>
                      🤝 Entregue em mãos
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {!linkWa.valido && (
            <div style={{ fontSize: 10.5, color: C.warnFg, marginBottom: 8, lineHeight: 1.5 }}>
              ⚠️ WhatsApp indisponível: {linkWa.motivo} Use Copiar mensagem ou Entregue em mãos.
            </div>
          )}
        </>
      )}

      {ultimoResultado && (
        <div style={{ background: ultimoResultado.avisoRegistro ? C.warnBg : C.successBg, border: `1px solid ${ultimoResultado.avisoRegistro ? C.warnBd : C.successBd}`, borderRadius: 9, padding: "10px 12px", marginTop: 8 }}>
          <div style={{ fontSize: 11.5, color: ultimoResultado.avisoRegistro ? C.warnFg : C.successFg, lineHeight: 1.45, marginBottom: 8 }}>
            {ultimoResultado.avisoRegistro
              ? "Orçamento enviado — mas o registro do canal falhou (auditoria incompleta; o status já mudou normalmente)."
              : ultimoResultado.reenvio
                ? "Novo envio registrado."
                : "Orçamento enviado ao cliente."}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {linkWa.valido && (
              <button type="button" onClick={() => window.open(linkWa.url, "_blank")} style={btnGhost}>💬 Abrir WhatsApp</button>
            )}
            <button type="button" onClick={() => void copiarTexto(mensagem)} style={btnGhost}>📋 Copiar mensagem</button>
          </div>
        </div>
      )}

      {previewOpen && (
        <PreviewModal mensagem={mensagem} onAbrirDoc={() => { setPreviewOpen(false); v.openDocPrint("orcamento_cliente"); }} onClose={() => setPreviewOpen(false)} />
      )}

      <div style={{ ...upLabel, marginTop: 12 }}>Validade</div>
      <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 3 }}>
        {view.validade.validoAte ? `Válido até ${new Date(view.validade.validoAte).toLocaleDateString("pt-BR")}` : view.validade.politicaTexto}
      </div>
    </div>
  );
}
