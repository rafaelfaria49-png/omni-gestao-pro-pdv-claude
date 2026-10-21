"use client";

import { useEffect, useRef, useState } from "react";
import { C, card, cardTitle } from "../../tokens";
import type { V4Vals, EnviarOrcamentoPorCanalUiResultV4 } from "../../use-v4-preview";
import { NI } from "../../os-adapter";
import { montarLinkWaV4, montarMensagemOrcamentoV4 } from "@/lib/operacoes-v4/orcamento-mensagem";
import type { CanalEnvioOrcamentoV3 } from "@/lib/operacoes-v3/orcamento-model";

const btn: React.CSSProperties = { minHeight: 32, padding: "5px 12px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, cursor: "pointer" };

/** A chave descarta declarações pendentes quando a loja/OS selecionada muda. */
export function OrcamentoEnvioCluster({ v }: { v: V4Vals }) {
  return <SessaoCompartilhamento key={v.recebimentoContextKey} v={v} />;
}

function SessaoCompartilhamento({ v }: { v: V4Vals }) {
  const [preview, setPreview] = useState(false);
  const [canal, setCanal] = useState<CanalEnvioOrcamentoV3>("whatsapp");
  const [preparado, setPreparado] = useState<{ id: string; canal: CanalEnvioOrcamentoV3 } | null>(null);
  const [declarado, setDeclarado] = useState(false);
  const [busy, setBusy] = useState(false);
  const emCurso = useRef(false);
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState<EnviarOrcamentoPorCanalUiResultV4 | null>(null);
  const [reciboSessao, setReciboSessao] = useState<string | null>(null);
  const chaveRecibo = `omni:orcamento:recibo-api:${v.recebimentoContextKey}`;
  useEffect(() => {
    // Cópia de conferência após falha de persistência. Nunca é aceita pelo servidor como prova.
    try { setReciboSessao(sessionStorage.getItem(chaveRecibo)); } catch { /* Armazenamento indisponível. */ }
  }, [chaveRecibo]);
  const view = v.orcamentoClienteView;
  if (!view) return null;
  // Mensagem exclusivamente da projeção para o cliente: sem custos nem payload cru.
  const mensagem = montarMensagemOrcamentoV4(view);
  const semItens = !view.itensFixosVisiveis.length && !view.grupos.length;
  const linkWa = montarLinkWaV4(v.os.telefone && v.os.telefone !== NI ? v.os.telefone : undefined, mensagem);
  const ultimo = v.orcamentoEnvio?.ultimo;
  const pendente = v.orcamentoEnvio?.pendente ?? (ultimo?.estado === "api_em_andamento" ? ultimo : undefined);
  const tentativa = pendente ? { id: pendente.id, canal: pendente.canal }
    : preparado ?? (ultimo?.estado === "preparado" ? { id: ultimo.id, canal: ultimo.canal } : null);
  const pendenteApi = !!pendente || resultado?.pendente;

  const preparar = async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    setBusy(true);
    try {
      const res = await v.prepararCompartilhamento?.(canal);
      if (res) {
        setPreparado({ id: res.tentativaId, canal });
        setDeclarado(false);
        setResultado(null);
        setNota("Compartilhamento iniciado. Envie pelo canal escolhido e depois registre sua declaração.");
      }
    } finally { emCurso.current = false; setBusy(false); }
  };

  const confirmar = async (modo: "manual" | "api" | "recuperar_api") => {
    if (emCurso.current || !tentativa || (modo === "manual" && !declarado)) return;
    if (modo === "api" && !window.confirm("Enviar agora esta mensagem pela API oficial do WhatsApp da loja?")) return;
    emCurso.current = true;
    setBusy(true);
    try {
      const res = await v.enviarOrcamentoPorCanal(tentativa.canal, { tentativaId: tentativa.id, confirmado: true, modo });
      if (res.aceitoApi && res.wamid) {
        setReciboSessao(res.wamid);
        try { sessionStorage.setItem(chaveRecibo, res.wamid); } catch { /* O identificador continua visível para conferência. */ }
      }
      setResultado(res);
      if (res.ok) { setPreparado(null); setDeclarado(false); }
      setNota(res.aviso ?? (res.aceitoApi ? "Envio aceito pela API oficial. Entrega e leitura não confirmadas."
        : res.ok ? "Envio informado pelo operador. Entrega e leitura não confirmadas." : "A confirmação não foi registrada."));
    } finally { emCurso.current = false; setBusy(false); }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensagem); setNota("Mensagem copiada. O envio deve ser feito no canal escolhido."); }
    catch { setNota("Não foi possível copiar. Use a pré-visualização para selecionar a mensagem."); }
  };
  const abrirWhatsApp = () => {
    if (!linkWa.valido) return;
    // Gesto síncrono do operador: abrir o aplicativo nunca chama confirmação de envio.
    window.open(linkWa.url, "_blank", "noopener,noreferrer");
    setNota("Abertura do WhatsApp solicitada. Após enviar, registre a declaração manual.");
  };

  return <div style={card}>
    <div style={cardTitle}>Compartilhar orçamento</div>
    <p style={{ fontSize: 12, color: C.subtle }} role="status">{v.orcamentoEnvio?.rotulo ?? "Envio não registrado"}</p>
    {semItens ? <p>Adicione itens ou um grupo de escolha para compartilhar.</p> : <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={btn} onClick={() => setPreview(!preview)}>Pré-visualizar mensagem</button>
        <button type="button" style={btn} onClick={() => void copiar()}>Copiar mensagem</button>
        <button type="button" style={btn} disabled={!linkWa.valido} onClick={abrirWhatsApp}>Abrir WhatsApp</button>
      </div>
      {!linkWa.valido && <p style={{ fontSize: 12, color: C.warnFg }}>{linkWa.motivo}</p>}
      {preview && <div>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit", fontSize: 12 }}>{mensagem}</pre>
        <button type="button" style={btn} onClick={() => v.openDocPrint("orcamento_cliente")}>Ver documento completo</button>
      </div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <label style={{ fontSize: 12 }}>Canal de compartilhamento <select aria-label="Canal de compartilhamento" value={canal} disabled={busy} onChange={(e) => setCanal(e.target.value as CanalEnvioOrcamentoV3)}>
          <option value="whatsapp">WhatsApp</option><option value="impresso">Impresso</option><option value="presencial">Presencial</option><option value="outro">Outro</option>
        </select></label>
        <button type="button" style={btn} disabled={busy || !!pendenteApi} onClick={() => void preparar()}>{busy ? "Aguarde…" : "Preparar compartilhamento"}</button>
      </div>
      {tentativa && !resultado?.ok && <div style={{ marginTop: 12, fontSize: 12 }}>
        {pendenteApi ? <button type="button" style={btn} disabled={busy} onClick={() => void confirmar("recuperar_api")}>Recuperar registro da API</button> : <>
          <p>Canal preparado: {tentativa.canal}. Copiar e abrir aplicativos não confirmam o envio.</p>
          <label style={{ display: "block", marginBottom: 8 }}><input type="checkbox" checked={declarado} disabled={busy} onChange={(e) => setDeclarado(e.target.checked)} /> Declaro que já enviei este orçamento pelo canal preparado.</label>
          <button type="button" style={btn} disabled={busy || !declarado} onClick={() => void confirmar("manual")}>Confirmar envio manual</button>
          {tentativa.canal === "whatsapp" && <button type="button" style={{ ...btn, marginLeft: 8 }} disabled={busy || !linkWa.valido} onClick={() => void confirmar("api")}>Enviar pela API oficial</button>}
        </>}
      </div>}
    </>}
    {nota && <p role="status" style={{ fontSize: 12, color: resultado?.pendente || resultado?.avisoRegistro ? C.warnFg : C.body }}>{nota}</p>}
    {(resultado?.wamid || reciboSessao) && <p style={{ fontSize: 11, overflowWrap: "anywhere" }}>Identificador de aceite para conferência: {resultado?.wamid || reciboSessao}</p>}
    <p style={{ fontSize: 12, color: C.subtle }}>{view.validade.validoAte ? `Válido até ${view.validade.validoAteTexto || new Date(view.validade.validoAte).toLocaleDateString("pt-BR")}${view.validade.vencida ? " · vencido" : ""}` : view.validade.politicaTexto}</p>
  </div>;
}
