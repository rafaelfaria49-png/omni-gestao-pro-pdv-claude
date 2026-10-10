/**
 * Operações V4 — "Formalizar aprovação pendente" (GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002,
 * item D). Ação administrativa EXCEPCIONAL para OS com pagamento vigente sobre orçamento ainda
 * não aprovado: conferência do escopo no servidor → motivo, declaração do responsável,
 * evidência (opcional) e, se vencido, ratificação no momento atual → formalização. Tudo é
 * revalidado no servidor (permissão de administrador, escopo, valores, concorrência); esta tela
 * só mostra o que o servidor conferiu e envia a MESMA assinatura de escopo de volta.
 * Preparar a ferramenta não autoriza usá-la em nenhuma OS real específica.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { C, card, cardTitle, fmt, upLabel } from "../tokens";
import type { ConferenciaFormalizacaoUiV4, V4Vals } from "../use-v4-preview";
import { gerarOperacaoIdV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import {
  MOTIVO_FORMALIZACAO_MIN_V3,
  type EntradaFormalizacaoV3,
  type EscopoFormalizacaoV3,
  type LinhaEscopoFormalizacaoV3,
} from "@/lib/operacoes-v3/formalizacao-aprovacao-model";

const btnPrimary: React.CSSProperties = { height: 32, width: "100%", padding: "0 14px", border: "none", background: C.primary, color: C.white, borderRadius: 8, fontSize: 12.5, fontWeight: 600 };
const btnGhost: React.CSSProperties = { height: 30, width: "100%", padding: "0 12px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" };
const campo: React.CSSProperties = { width: "100%", padding: "7px 9px", border: `1px solid ${C.inputBd}`, borderRadius: 7, fontSize: 12.5, color: C.body, background: C.surface, fontFamily: "inherit" };

type Conferido = Extract<ConferenciaFormalizacaoUiV4, { ok: true }>;

const LANCAMENTO: Record<EscopoFormalizacaoV3["lancamentos"][number]["tipo"], string> = {
  pagamento: "Pagamento",
  liquidacao: "Liquidação",
  estorno_pagamento: "Estorno",
};

const centavos = (c: number | null) => (c == null ? "—" : fmt(c / 100));

/** Linha como o cliente a vê: valor com desconto, cortesia, interna e alternativa não escolhida. */
function textoLinha(l: LinhaEscopoFormalizacaoV3): string {
  const nome = `${l.grupo ? `${l.grupo}: ` : ""}${l.descricao || (l.tipo === "peca" ? "Peça" : "Serviço")}${l.quantidade != null && l.quantidade !== 1 ? ` × ${l.quantidade}` : ""}`;
  if (l.situacao === "cortesia") return `${nome} — cortesia`;
  if (l.situacao === "interna") return `${nome} — interno (não exibido ao cliente)`;
  if (l.situacao === "alternativa_nao_escolhida") return `${nome} — não escolhida (${centavos(l.valorCentavos)})`;
  return `${nome} — ${centavos(l.valorCentavos)}`;
}

export function FormalizarAprovacaoV4({ v }: { v: V4Vals }) {
  const f = v.formalizacao;
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [conferido, setConferido] = useState<Conferido | null>(null);
  const [motivo, setMotivo] = useState("");
  const [evidencia, setEvidencia] = useState("");
  const [declaracao, setDeclaracao] = useState(false);
  const [ratificar, setRatificar] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  // Confirmação ENVIADA e ainda sem resultado definitivo (incerto/não conferido): reenviada
  // byte a byte (mesma chave, mesmo conteúdo) — os campos ficam travados enquanto existir.
  const [pendente, setPendente] = useState<EntradaFormalizacaoV3 | null>(null);
  // Identidade desta conferência: nova a cada conferência.
  const operacaoId = useRef<string | null>(null);
  const envio = useRef(false);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  if (!f?.disponivel && !feito) return null;

  const conferir = async () => {
    if (!f?.conferir || pendente) return;
    setCarregando(true);
    setMensagem(null);
    try {
      const r = await f.conferir();
      if (!ativo.current) return;
      if (r.ok) {
        setConferido(r);
        // Nova conferência = novo ato: declarações e ratificação são pedidas de novo.
        setDeclaracao(false);
        setRatificar(false);
        operacaoId.current = gerarOperacaoIdV3();
      } else if (r.code !== "fora_do_alvo") {
        setConferido(null);
        setMensagem(r.mensagem);
      }
    } finally {
      if (ativo.current) setCarregando(false);
    }
  };

  const abrir = () => {
    setAberto(true);
    setFeito(false);
    void conferir();
  };

  const travado = enviando || !!pendente;
  const motivoOk = motivo.trim().length >= MOTIVO_FORMALIZACAO_MIN_V3;
  const podeFormalizar =
    !!pendente || (!!conferido && !!operacaoId.current && motivoOk && declaracao && (!conferido.vencido || ratificar) && !enviando && !carregando);

  const formalizar = async () => {
    if (!podeFormalizar || envio.current || !f?.formalizar) return;
    const entrada: EntradaFormalizacaoV3 | null =
      pendente ??
      (conferido && operacaoId.current
        ? {
            operacaoId: operacaoId.current,
            motivo,
            declaracaoAceita: declaracao,
            evidencia: evidencia.trim() || null,
            escopo: conferido.escopo,
            ratificarVencido: conferido.vencido ? ratificar : false,
          }
        : null);
    if (!entrada) return;
    envio.current = true;
    setEnviando(true);
    setMensagem(null);
    setPendente(entrada);
    try {
      const r = await f.formalizar(entrada);
      if (!ativo.current) return;
      if (r.ok) {
        setPendente(null);
        setFeito(true);
        setAberto(false);
        setConferido(null);
        setMensagem(r.jaRegistrado ? "Esta formalização já estava registrada — nada foi gravado de novo." : "Aprovação formalizada. Registro auditável gravado.");
        return;
      }
      if (r.code === "fora_do_alvo") return;
      setMensagem(r.mensagem);
      // Recusa CONFERIDA (nada gravado com esta chave) ou chave já usada com outro conteúdo:
      // a próxima tentativa parte de nova conferência, com nova chave e novas declarações.
      if (("naoRegistrada" in r && r.naoRegistrada) || r.code === "idempotencia_conflito") {
        setPendente(null);
        setConferido(null);
        setDeclaracao(false);
        setRatificar(false);
        operacaoId.current = null;
      }
      // Demais (incerto, conflito transitório, sessão/permissão): a MESMA confirmação segue pendente.
    } finally {
      envio.current = false;
      if (ativo.current) setEnviando(false);
    }
  };

  const escopo = conferido?.escopo ?? null;
  return (
    <div style={{ ...card, marginBottom: 12 }} data-testid="formalizar-aprovacao">
      <div style={{ ...cardTitle, marginBottom: 6 }}>Pagamento registrado com aprovação pendente</div>
      {!aberto ? (
        <>
          <div style={{ fontSize: 11.5, color: C.subtle, lineHeight: 1.5, marginBottom: 8 }}>
            {feito
              ? mensagem
              : "Há pagamento vigente sobre um orçamento ainda não aprovado. Só um administrador pode formalizar a aprovação: um ato novo e auditável, que não altera preço, pagamento, garantia nem entrega."}
          </div>
          {!feito && (
            <button type="button" onClick={abrir} style={btnGhost}>
              Formalizar aprovação pendente
            </button>
          )}
        </>
      ) : (
        <div role="group" aria-label="Formalizar aprovação pendente" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11.5, color: C.body }}>
          {carregando && <div>Conferindo orçamento, título e pagamentos…</div>}
          {escopo && (
            <div style={{ border: `1px solid ${C.line2}`, borderRadius: 8, padding: 9, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={upLabel}>Escopo conferido no servidor</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {escopo.orcamento.linhas.map((l, i) => (
                  <li key={`${l.tipo}-${l.id}-${i}`}>{textoLinha(l)}</li>
                ))}
              </ul>
              <div>Total do orçamento: <b>{centavos(escopo.orcamento.totalCentavos)}</b> · revisão {escopo.orcamento.revisao}</div>
              <div>Conta a Receber: <b>{centavos(escopo.titulo.valorCentavos)}</b> ({escopo.titulo.status})</div>
              {escopo.lancamentos.map((l, i) => (
                <div key={i}>{LANCAMENTO[l.tipo]}: {centavos(l.valorCentavos)}</div>
              ))}
              <div>Recebido vigente: <b>{centavos(escopo.recebidoLiquidoCentavos)}</b></div>
            </div>
          )}
          {conferido?.vencido && (
            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", color: C.warnFg }}>
              <input type="checkbox" checked={ratificar} disabled={travado} onChange={(e) => setRatificar(e.target.checked)} />
              <span>O orçamento está vencido. Ratifico neste momento o escopo e o total acima, sem renovar a validade.</span>
            </label>
          )}
          {conferido && (
            <>
              <label>
                <span style={upLabel}>Motivo (obrigatório)</span>
                <textarea
                  aria-label="Motivo da formalização"
                  value={motivo}
                  disabled={travado}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={500}
                  style={{ ...campo, minHeight: 54, resize: "vertical" }}
                />
              </label>
              <label>
                <span style={upLabel}>Referência de evidência (opcional)</span>
                <input aria-label="Referência de evidência" value={evidencia} disabled={travado} onChange={(e) => setEvidencia(e.target.value)} maxLength={300} style={campo} />
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <input type="checkbox" aria-label="Declaração do responsável" checked={declaracao} disabled={travado} onChange={(e) => setDeclaracao(e.target.checked)} />
                <span>{conferido.declaracao}</span>
              </label>
            </>
          )}
          {mensagem && (
            <div role="alert" style={{ color: C.dangerFg }}>
              {mensagem}
            </div>
          )}
          {pendente || conferido ? (
            <button type="button" onClick={() => void formalizar()} disabled={!podeFormalizar || enviando} style={{ ...btnPrimary, opacity: podeFormalizar && !enviando ? 1 : 0.6, cursor: podeFormalizar && !enviando ? "pointer" : "default" }}>
              {enviando ? "Formalizando…" : pendente ? "Reenviar a mesma formalização" : "Formalizar aprovação"}
            </button>
          ) : (
            !carregando && (
              <button type="button" onClick={() => void conferir()} style={btnGhost}>
                Conferir de novo
              </button>
            )
          )}
          <button type="button" onClick={() => { setAberto(false); setMensagem(null); }} disabled={enviando || !!pendente} style={btnGhost}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
