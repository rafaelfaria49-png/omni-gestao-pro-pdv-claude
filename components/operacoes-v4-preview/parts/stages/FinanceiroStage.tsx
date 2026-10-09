/** Operações V4 — caixa da OS: resumo, ações e histórico. */
import { C, fmt } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import { ReceberPagamentoV4 } from "../ReceberPagamentoV4";
import styles from "../financeiro-stage.module.css";
import {
  explicacaoConferenciaV4,
  formaRegistradaV4,
  pagamentoComPendenciaComercialV4,
  pagamentoEmConferenciaV4,
  situacaoAtendimentoDe,
} from "@/lib/operacoes-v4/situacao-atendimento-v4";

const emptyText = { fontSize: 12, color: C.subtle, padding: "8px 2px", lineHeight: 1.5 } as const;

function amount(value: number | null): string {
  return value == null ? "Indisponível" : fmt(value);
}

function dateTime(value: string | null): string {
  if (!value) return "Data não registrada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
}

export function FinanceiroStage({ v }: { v: V4Vals }) {
  const financial = v.financial;
  const projection = financial.projection;
  const resumo = v.financeiroResumo;

  if (financial.loading) {
    // A mesma posição/chave mantém o rascunho vivo na recarga após uma recusa.
    return <div className={styles.panel}><section className={styles.tape}>
      <div className={styles.tapeHead}><span className={styles.tapeEyebrow}>Financeiro</span></div>
      <div style={{ ...emptyText, padding: 14 }}>Carregando a projeção financeira desta OS…</div>
      <div key="recebimento" hidden><ReceberPagamentoV4 v={v} /></div>
    </section></div>;
  }
  if (financial.error || !projection) {
    return (
      <div className={styles.panel}><section className={styles.tape}>
        <div className={styles.tapeHead}><span className={styles.tapeEyebrow}>Financeiro indisponível</span></div>
        <div style={{ ...emptyText, color: C.dangerFg, padding: 14 }}>{financial.error ?? "Não foi possível determinar a situação financeira desta OS."}</div>
        <div style={{ padding: "0 14px 14px" }}>
          <button type="button" onClick={financial.reload} style={{ height: 32, padding: "0 12px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>Tentar novamente</button>
        </div>
        <div key="recebimento" hidden><ReceberPagamentoV4 v={v} /></div>
      </section></div>
    );
  }

  // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001: com a pendência COMERCIAL e o título
  // verificado, os valores são os FATOS do título (rótulos próprios) e o aviso é um só,
  // com a ação que resolve. Decisões de receber/entregar continuam as da projeção.
  const s = situacaoAtendimentoDe(v);
  const fatosDoTitulo = pagamentoComPendenciaComercialV4(s);
  const pendenciaComercial = s.estado === "pronta" && s.comercial.pendente;
  const inconsistent = !pendenciaComercial && (projection.consistencyStatus === "INCONSISTENT" || projection.consistencyStatus === "UNKNOWN");
  // Fatos do título rejeitados pela leitura estrita (qualquer status legado): nada de
  // quitação verde nem valores do título; a decisão legada segue como está.
  const emConferencia = !inconsistent && pagamentoEmConferenciaV4(s);
  const statusColors = inconsistent
    ? { bg: C.dangerBg, fg: C.dangerFg }
    : pendenciaComercial || emConferencia
      ? { bg: C.warnBg, fg: C.warnFg }
      : projection.financialStatus === "PAID" || projection.canDeliver
        ? { bg: C.successBg, fg: C.successFg }
        : { bg: C.warnBg, fg: C.warnFg };
  const stamp = pendenciaComercial ? "Aprovação pendente" : emConferencia ? "Em conferência" : resumo.situacaoLabel;
  const recebidoConhecido = projection.receivedTotal ?? (s.pagamento.verificavel ? s.pagamento.recebidoLiquido : null);
  const historico = projection.historico;
  const valorFato = (n: number | null) => (n == null ? "Em conferência" : fmt(n));
  const formaExibida = formaRegistradaV4(projection, financial.paymentMethodSummary);

  return (
    <div className={styles.panel}>
      <section className={styles.tape}>
        <div className={styles.tapeHead}>
          <div style={{ minWidth: 0 }}>
            <span className={styles.tapeEyebrow}>Financeiro da OS</span>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {v.os.codigo}{v.os.cliente ? `  ${v.os.cliente}` : ""}
            </div>
          </div>
          <span className={styles.stamp} style={{ background: statusColors.bg, color: statusColors.fg }}>{stamp}</span>
        </div>

        {fatosDoTitulo || emConferencia ? (
          <div className={styles.strip} aria-label="Fatos da Conta a Receber">
            <div className={styles.cell}>
              <div className={styles.cellLabel}>Valor do título</div>
              <div className={styles.cellValue}>{valorFato(s.pagamento.valorTitulo)}</div>
            </div>
            <div className={styles.cell}>
              <div className={styles.cellLabel}>Recebido</div>
              <div className={styles.cellValue}>{valorFato(s.pagamento.recebidoLiquido)}</div>
            </div>
            <div className={styles.cell}>
              <div className={styles.cellLabel}>Saldo do título</div>
              <div className={styles.cellValue} style={{ color: (s.pagamento.saldoTitulo ?? 0) > 0 ? C.warnFg : C.ink }}>{valorFato(s.pagamento.saldoTitulo)}</div>
            </div>
          </div>
        ) : (
          <div className={styles.strip}>
            <div className={styles.cell}>
              <div className={styles.cellLabel}>Total</div>
              <div className={styles.cellValue}>{amount(resumo.total ?? projection.expectedTotal)}</div>
            </div>
            <div className={styles.cell}>
              <div className={styles.cellLabel}>Recebido</div>
              <div className={styles.cellValue}>{amount(resumo.recebido ?? projection.receivedTotal)}</div>
            </div>
            <div className={styles.cell}>
              <div className={styles.cellLabel}>Saldo</div>
              <div className={styles.cellValue} style={{ color: (resumo.saldo ?? 0) > 0 ? C.warnFg : C.ink }}>{amount(resumo.saldo ?? projection.balance)}</div>
            </div>
          </div>
        )}

        {pendenciaComercial && s.impedimento ? (
          <div className={styles.issue} style={{ border: `1px solid ${C.warnBd}`, background: C.warnBg, color: C.warnFg, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ minWidth: 0 }}>
              <strong>{s.comercial.rotulo}</strong>
              {s.comercial.detalhe ? <span> · {s.comercial.detalhe}</span> : null}
            </span>
            <button type="button" onClick={() => v.irParaImpedimento?.()} style={{ height: 30, padding: "0 12px", border: `1px solid ${C.warnBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", flex: "none" }}>
              {s.impedimento.acao}
            </button>
          </div>
        ) : emConferencia ? (
          <div className={styles.issue} style={{ border: `1px solid ${C.warnBd}`, background: C.warnBg, color: C.warnFg }}>
            <strong>Há registro de pagamento; conferência pendente.</strong> {explicacaoConferenciaV4(projection)}
          </div>
        ) : projection.consistencyIssues.length > 0 ? (
          <div className={styles.issue} style={{ border: `1px solid ${inconsistent ? C.dangerBd : C.warnBd}`, background: inconsistent ? C.dangerBg : C.warnBg, color: inconsistent ? C.dangerFg : C.warnFg }}>
            {projection.consistencyIssues.join(" ")}
          </div>
        ) : null}

        <div className={styles.meta}>
          <div className={styles.metaRow}><span className={styles.metaLabel}>Conta a Receber</span><span className={styles.metaValue}>{projection.receivableFound ? projection.receivableStatus ?? "Encontrada" : "Não criada"}</span></div>
          <div className={styles.metaRow}><span className={styles.metaLabel}>Forma de pagamento</span><span className={styles.metaValue}>{formaExibida}</span></div>
          {projection.collectionMode ? <div className={styles.metaRow}><span className={styles.metaLabel}>Cobrança</span><span className={styles.metaValue}>{projection.collectionMode}</span></div> : null}
          {projection.authorizedNoCharge && <div className={styles.metaRow}><span className={styles.metaLabel}>Sem cobrança</span><span className={styles.metaValue}>{projection.noChargeCategory ?? "Autorizada"}</span></div>}
          {projection.installments.length > 0 && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Vencimento</span>
              <span className={styles.metaValue}>{projection.installments[0]?.dueAt ?? "sem vencimento"}{projection.installments[0]?.amount != null ? ` · ${amount(projection.installments[0].amount)}` : ""}</span>
            </div>
          )}
        </div>

        {recebidoConhecido != null && recebidoConhecido > 0 && (
          <div className={styles.actions}>
            <button type="button" onClick={v.openRecibo} style={{ height: 34, padding: "0 12px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>Imprimir comprovante</button>
            <button type="button" onClick={v.openEstornoRecebimento} disabled={!v.estorno.podeEstornar} style={{ height: 34, padding: "0 12px", border: `1px solid ${C.dangerBd}`, background: C.surface, color: C.dangerFg, borderRadius: 8, fontSize: 12, cursor: v.estorno.podeEstornar ? "pointer" : "default", opacity: v.estorno.podeEstornar ? 1 : 0.55 }}>Estornar</button>
          </div>
        )}

        <div key="recebimento" style={{ padding: "0 12px 12px" }}>
          <ReceberPagamentoV4 v={v} />
        </div>
      </section>

      <section className={styles.history}>
        <div className={styles.historyTitle}>Histórico de recebimentos</div>
        {historico ? (historico.length === 0 ? <div className={styles.empty}>Nenhum recebimento registrado nesta OS.</div> : historico.map((item) => (
          // A mesma operação comprovada nas duas fontes (baixa do título + recibo da OS)
          // aparece uma vez; o resto aparece com a fonte, sem somar nada.
          <div key={item.id} className={styles.historyItem}>
            <span className={styles.dot} style={{ background: item.estorno ? C.danger : C.success }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.body }}>
                {item.descricao}
                {item.valor != null ? ` · ${fmt(item.valor)}` : ""}
                {item.meio && !item.descricao.includes(item.meio) ? ` · ${item.meio}` : ""}
              </div>
              <div style={{ fontSize: 10.5, color: C.subtle }}>
                {dateTime(item.ocorridoEm)}
                {item.autor ? ` · ${item.autor}` : ""}
                {item.fontes.length > 1 ? " · Conta a Receber + registro da OS" : item.fontes[0] === "RECEIVABLE" ? " · Conta a Receber" : " · Registro da OS"}
                {item.estorno ? " · Estornado" : ""}
              </div>
            </div>
          </div>
        ))) : projection.financialEvents.length === 0 ? <div className={styles.empty}>Nenhum recebimento registrado nesta OS.</div> : projection.financialEvents.map((event) => (
          <div key={event.eventId} className={styles.historyItem}>
            <span className={styles.dot} style={{ background: event.type.includes("estorno") ? C.danger : C.success }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.body }}>
                {event.description}
                {event.amount != null ? ` · ${fmt(event.amount)}` : ""}
                {event.paymentMethod ? ` · ${event.paymentMethod}` : ""}
              </div>
              <div style={{ fontSize: 10.5, color: C.subtle }}>
                {dateTime(event.occurredAt)}
                {event.actor ? ` · ${event.actor}` : ""}
                {event.type.includes("estorno") ? " · Estornado" : ""}
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
