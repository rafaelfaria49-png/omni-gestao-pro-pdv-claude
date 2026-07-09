/**
 * Operações V4 Preview — etapa Entrega.
 *
 * GOAL OPS-V4-P0-012: lê apenas o que a OS persiste — retirada confirmada,
 * data de entrega, assinatura textual, acessórios reais do aparelho, eventos
 * de entrega/garantia e a garantia real (operacional ou de payload). Nenhum
 * dado fabricado: onde não houver fonte, mostra empty state honesto.
 *
 * GOAL OPS-V4-ENTREGA-REAL-E-CTA-QUITADO-008: a etapa ganha UMA ação real —
 * "Confirmar entrega" (`v.confirmarEntrega`, reuso de `aplicarTransicaoStatusV3`
 * via `use-v4-preview`) — habilitada só quando `v.entregaAcoes.podeConfirmar`
 * (status "pronta" e saldo confirmado <= 0). O restante da etapa segue
 * read-only (checklist final de entrega continua sem action V3 segura).
 *
 * GOAL OPS-V4-DOCS-ASSINATURA-TERMOS-ANEXOS-012: a assinatura de retirada passa
 * a ser a imagem digital REAL (`entregaV3.assinaturaRetirada`, mesma fonte do
 * Termo de Entrega impresso) em vez do antigo texto fabricado. Quando a OS já
 * foi entregue e ainda não há assinatura capturada, reaproveita o MESMO canvas
 * (`SignaturePadV3`) já usado pela Prova de Entrada/Entrega da V3 — sem motor
 * de captura novo — persistindo via `salvarAssinaturaRetiradaV3`.
 *
 * GOAL OPS-V4-GARANTIA-EDITOR-IMPL-014: o card "Garantia da OS" ganha o lado de
 * escrita — definir/editar modelo + prazo — reusando o MESMO catálogo/contrato
 * da V3 (`GARANTIA_CATALOGO_V3`/`prazoPadraoGarantiaV3` de `garantia-textos.ts`,
 * `salvarGarantiaOSV3` via `v.salvarGarantia`). Paridade com `GarantiaOSV3.tsx`
 * da V3: só modelo + prazo (sem termo customizado nesta etapa).
 */
import { useEffect, useState, type ReactNode } from "react";
import { C, card, cardTitle, upLabel, pill, inputBase } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import { SignaturePadV3 } from "@/components/operacoes-v3/components/SignaturePadV3";
import { lerGarantiaV3 } from "@/lib/operacoes-v3/pos-venda-model";
import { GARANTIA_CATALOGO_V3, prazoPadraoGarantiaV3 } from "@/lib/operacoes-v3/garantia-textos";
import { RealActionNotice } from "../RealActionNotice";

const col3 = "repeat(auto-fit, minmax(280px, 1fr))";
const col2 = "minmax(0,1fr) minmax(0,1fr)";

const btnPrimary: React.CSSProperties = {
  height: 34,
  padding: "0 16px",
  border: "none",
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 600,
  color: C.white,
};

/**
 * Ação real de confirmação de entrega (slice OPS-V4-ENTREGA-REAL-E-CTA-QUITADO-008).
 * Só aparece quando há algo a decidir (`podeConfirmar`, `bloqueadaPorSaldo` ou
 * `semCobrancaLancada`); busy-lock local evita duplo clique — toast e reload
 * pós-sucesso vêm do próprio handler (`runWrite`, em `use-v4-preview`), não daqui.
 *
 * GOAL OPS-V4-ENTREGA-GUARD-SEM-COBRANCA-002: uma OS com total R$ 0 (sem cobrança
 * lançada) NÃO pode ser entregue em silêncio. Nesse caso o card mostra um alerta
 * forte e dois caminhos explícitos — "Ir para Orçamento" (lançar a cobrança) ou
 * "Entregar sem cobrança" (assumir cortesia). Só depois do "sim" explícito de
 * cortesia (`confirmarSemCobranca`, estado LOCAL desta interação — nada persiste)
 * é que o botão real de confirmação aparece.
 */
function EntregaAcaoCard({ v }: { v: V4Vals }) {
  const [busy, setBusy] = useState(false);
  // Confirmação de cortesia (só nesta interação; nada é salvo). Enquanto false, a
  // OS sem cobrança lançada NÃO pode ser entregue.
  const [confirmarSemCobranca, setConfirmarSemCobranca] = useState(false);
  const ea = v.entregaAcoes;
  // Reseta o "sim" de cortesia ao trocar de OS ou quando a OS deixa de estar sem
  // cobrança (ex.: orçamento lançado depois) — nunca herda o consentimento de uma
  // OS para outra (o componente é reaproveitado entre seleções, sem remount).
  const osKey = v.realOS?.id ?? "";
  useEffect(() => {
    setConfirmarSemCobranca(false);
  }, [osKey, ea.semCobrancaLancada]);

  if (!ea.podeConfirmar && !ea.bloqueadaPorSaldo && !ea.semCobrancaLancada) return null;

  const run = async () => {
    if (busy) return;
    const confirmado = window.confirm(
      "Entrega real: ao confirmar, a OS será marcada como entregue no histórico. Confirmar?"
    );
    if (!confirmado) return;
    setBusy(true);
    try {
      await v.confirmarEntrega();
    } finally {
      setBusy(false);
    }
  };

  if (ea.bloqueadaPorSaldo) {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 6 }}>Entrega</div>
        <div style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.5, marginBottom: 10 }}>
          Há saldo em aberto. Receba o pagamento (ou lance a prazo) na aba Financeiro antes de confirmar a entrega.
        </div>
        <button
          type="button"
          onClick={v.goFinanceiro}
          style={{ height: 30, padding: "0 12px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}
        >
          Ir para Financeiro →
        </button>
      </div>
    );
  }

  // OS sem cobrança lançada (total R$ 0): não pode ser entregue em silêncio.
  // Alerta forte + escolha explícita (lançar cobrança OU assumir cortesia).
  if (ea.semCobrancaLancada && !confirmarSemCobranca) {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 8 }}>Entrega</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.warnBg, border: `1px solid ${C.warnBd}`, borderRadius: 9, padding: "10px 12px", marginBottom: 12 }}>
          <span style={{ fontSize: 14, lineHeight: "18px", flex: "none" }}>⚠️</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.warnFg, marginBottom: 3 }}>OS sem cobrança lançada</div>
            <div style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.5 }}>
              Esta OS está com total <strong>R$ 0</strong>. Se houve serviço cobrado, lance o orçamento ou recebimento antes de entregar.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
          <button
            type="button"
            onClick={v.goOrcamento}
            style={{ ...btnPrimary, background: C.primary, cursor: "pointer" }}
          >
            Ir para Orçamento
          </button>
          <button
            type="button"
            onClick={() => setConfirmarSemCobranca(true)}
            style={{ height: 34, padding: "0 14px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Entregar sem cobrança
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: C.subtle, lineHeight: 1.5 }}>
          Use entrega sem cobrança apenas para cortesia, garantia ou serviço realmente sem valor.
        </div>
      </div>
    );
  }

  // Caminho de confirmação real: quitada de verdade / autorizada a prazo / cortesia
  // já assumida explicitamente acima.
  return (
    <div style={card}>
      <div style={{ ...cardTitle, marginBottom: 10 }}>Entrega</div>
      {ea.semCobrancaLancada ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.warnBg, border: `1px solid ${C.warnBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, lineHeight: "16px", flex: "none" }}>⚠️</span>
          <span style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.45 }}>
            <strong>Entrega sem cobrança (cortesia).</strong> Esta OS será entregue com total R$ 0 — nenhum valor será cobrado.
          </span>
        </div>
      ) : ea.autorizadaAPrazo ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, lineHeight: "16px", flex: "none" }}>ℹ️</span>
          <span style={{ fontSize: 11.5, color: C.infoFg, lineHeight: 1.45 }}>
            <strong>Entrega autorizada a prazo.</strong> O cliente possui conta a receber pendente — esta OS não está quitada.
          </span>
        </div>
      ) : (
        <RealActionNotice kind="entrega" />
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        style={{ ...btnPrimary, background: C.success, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
      >
        {busy ? "Confirmando…" : ea.semCobrancaLancada ? "Confirmar entrega sem cobrança" : "Confirmar entrega real"}
      </button>
    </div>
  );
}

type Tone = "success" | "info" | "warn" | "danger" | "neutro";

const TONE_MAP: Record<Tone, { bg: string; fg: string; dot: string }> = {
  success: { bg: C.successBg, fg: C.successFg, dot: C.success },
  info: { bg: C.infoBg, fg: C.infoFg, dot: C.info },
  warn: { bg: C.warnBg, fg: C.warnFg, dot: C.warn },
  danger: { bg: C.dangerBg, fg: C.dangerFg, dot: C.danger },
  neutro: { bg: C.muted100, fg: C.muted, dot: C.subtle },
};

function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  const t = TONE_MAP[tone];
  return (
    <span style={pill(t.bg, t.fg)}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot }} />
      {label}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11.5, color: C.subtle, lineHeight: 1.5 }}>{children}</div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={upLabel}>{label}</div>
      <div style={{ fontSize: 12.5, color: C.body, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

/**
 * Captura da assinatura de retirada (só aparece após a entrega, quando ainda não
 * há assinatura salva). Reaproveita `SignaturePadV3` (canvas já usado pela V3) e
 * `v.salvarAssinaturaRetirada` (reuso de `salvarAssinaturaRetiradaV3`).
 */
function AssinaturaRetiradaCard({ v }: { v: V4Vals }) {
  const [salvando, setSalvando] = useState(false);
  const onSave = async (dataUrl: string) => {
    setSalvando(true);
    try {
      await v.salvarAssinaturaRetirada(dataUrl);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <SignaturePadV3
      onSave={onSave}
      salvando={salvando}
      height={110}
      label="Salvar assinatura"
      hint="Colete a assinatura de quem retirou o equipamento."
    />
  );
}

/**
 * Definir/editar a garantia da OS (GOAL OPS-V4-GARANTIA-EDITOR-IMPL-014). Seed
 * vem de `lerGarantiaV3(v.realOS)` — mesmo leitor puro que `os-adapter` usa —
 * só para ler o `modeloId` bruto (não exposto em `V4GarantiaView`, que já
 * resolve o texto pronto para exibição). Salva via `v.salvarGarantia`, reuso
 * direto de `salvarGarantiaOSV3` (mesmo contrato/payload que a V3 grava).
 */
function GarantiaFormCard({ v }: { v: V4Vals }) {
  const seed = lerGarantiaV3(v.realOS);
  const seedModeloId = seed.temGarantia ? seed.modeloId : "sem_garantia";
  const seedPrazoDias = seed.temGarantia ? seed.prazoDias : prazoPadraoGarantiaV3("sem_garantia");

  const [modeloId, setModeloId] = useState(seedModeloId);
  const [prazoDias, setPrazoDias] = useState(seedPrazoDias);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reseta o formulário quando a OS/garantia muda (troca de OS ou reload pós-save).
  const seedKey = `${v.realOS?.id ?? ""}:${v.realOS?.atualizadoEm ?? ""}`;
  useEffect(() => {
    setModeloId(seedModeloId);
    setPrazoDias(seedPrazoDias);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const aplicarModelo = (id: string) => {
    setModeloId(id);
    setPrazoDias(prazoPadraoGarantiaV3(id));
    setDirty(true);
  };

  const onSalvar = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    try {
      const ok = await v.salvarGarantia({ modeloId, prazoDias });
      if (ok) setDirty(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ ...upLabel, marginBottom: 8 }}>{seed.temGarantia ? "Editar garantia" : "Definir garantia"}</div>
      <div style={{ display: "grid", gridTemplateColumns: col2, gap: 10, marginBottom: 10 }}>
        <label>
          <div style={{ ...upLabel, marginBottom: 4 }}>Modelo de garantia</div>
          <select value={modeloId} onChange={(e) => aplicarModelo(e.target.value)} style={inputBase}>
            {GARANTIA_CATALOGO_V3.map((m) => (
              <option key={m.id} value={m.id}>{m.titulo}</option>
            ))}
          </select>
        </label>
        <label>
          <div style={{ ...upLabel, marginBottom: 4 }}>Prazo em dias</div>
          <input
            type="number"
            min={0}
            value={prazoDias}
            onChange={(e) => {
              setPrazoDias(Math.max(0, Math.trunc(Number(e.target.value) || 0)));
              setDirty(true);
            }}
            style={inputBase}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !dirty}
        onClick={() => void onSalvar()}
        style={{
          ...btnPrimary,
          background: C.primary,
          cursor: busy || !dirty ? "default" : "pointer",
          opacity: busy || !dirty ? 0.6 : 1,
        }}
      >
        {busy ? "Salvando…" : "Salvar garantia"}
      </button>
      <div style={{ fontSize: 10.5, color: C.subtle, marginTop: 8, lineHeight: 1.5 }}>
        A garantia fica prevista na OS e passa a valer na entrega.
      </div>
    </div>
  );
}

export function EntregaStage({ v }: { v: V4Vals }) {
  const e = v.entrega;
  const g = e.garantia;

  if (!e.temRegistro) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <EntregaAcaoCard v={v} />
        <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 18px", textAlign: "center" }}>
          <span style={{ fontSize: 22 }}>📦</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.body }}>Esta Ordem de Serviço ainda não foi entregue.</div>
          <div style={{ fontSize: 11.5, color: C.subtle, maxWidth: 360, lineHeight: 1.5 }}>
            O registro de retirada, a assinatura e a garantia aparecem aqui assim que a entrega for concluída.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <EntregaAcaoCard v={v} />
      <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      {/* Registro de entrega (real) */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={cardTitle}>📦 Registro de entrega</span>
          <StatusBadge label={e.statusLabel} tone={e.statusTone} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: col2, gap: 10 }}>
          <Field label="Retirado por" value={e.retiradoPor} />
          <Field label="Data / hora" value={e.retiradoEm} />
        </div>
        {e.observacao && (
          <div style={{ marginTop: 11 }}>
            <div style={{ ...upLabel, marginBottom: 3 }}>Observação</div>
            <div style={{ fontSize: 12, color: C.bodySoft, lineHeight: 1.5 }}>{e.observacao}</div>
          </div>
        )}

        <div style={{ ...upLabel, margin: "13px 0 5px" }}>Assinatura de retirada</div>
        {e.temAssinatura ? (
          <div style={{ border: `1px solid ${C.line2}`, background: C.surface2, borderRadius: 8, padding: 8, display: "flex", justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.assinaturaDataUrl} alt="Assinatura de retirada" style={{ maxHeight: 90, objectFit: "contain" }} />
          </div>
        ) : e.entregue ? (
          <AssinaturaRetiradaCard v={v} />
        ) : (
          <Empty>Nenhuma assinatura de entrega registrada.</Empty>
        )}

        <div style={{ ...upLabel, margin: "14px 0 6px" }}>Linha do tempo da entrega</div>
        {e.eventos.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {e.eventos.map((ev) => (
              <div key={ev.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: ev.dot, marginTop: 5, flex: "none" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.body }}>{ev.text}</div>
                  <div style={{ fontSize: 10.5, color: C.subtle }}>{ev.meta}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nenhum evento de entrega registrado.</Empty>
        )}
      </div>

      {/* Checklist final + acessórios */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Checklist final de entrega</div>
          <Empty>Nenhum checklist de entrega registrado.</Empty>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Acessórios do aparelho</div>
          {e.acessorios.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: col2, gap: 6 }}>
              {e.acessorios.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.line2}`, background: C.surface, borderRadius: 7, padding: "6px 8px" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.subtle, flex: "none" }} />
                  <span style={{ fontSize: 11.5, color: C.body, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Nenhum acessório registrado para esta OS.</Empty>
          )}
        </div>
      </div>

      {/* Garantia da OS (real) */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span style={cardTitle}>🛡 Garantia da OS</span>
          {g.temGarantia && <StatusBadge label={g.situacao} tone={g.situacaoTone} />}
        </div>
        {g.temGarantia && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: col2, gap: 10, marginBottom: 11 }}>
              <Field label="Prazo" value={g.prazo} />
              <Field label="Cobertura" value={g.cobertura} />
              <Field label="Início" value={g.inicio} />
              <Field label="Validade" value={g.fim} />
            </div>
            {g.observacoes && (
              <div style={{ marginBottom: 11 }}>
                <div style={{ ...upLabel, marginBottom: 3 }}>Condições</div>
                <div style={{ fontSize: 12, color: C.bodySoft, lineHeight: 1.5 }}>{g.observacoes}</div>
              </div>
            )}
            {g.acionamentos && (
              <div style={{ fontSize: 11.5, color: C.warnFg, marginBottom: 11 }}>
                Acionamentos registrados: <b>{g.acionamentos}</b>
              </div>
            )}
            <div style={{ borderTop: `1px solid ${C.line2}`, paddingTop: 11 }}>
              <GarantiaFormCard v={v} />
            </div>
          </>
        )}
        {!g.temGarantia && <GarantiaFormCard v={v} />}
      </div>
      </div>
    </div>
  );
}
