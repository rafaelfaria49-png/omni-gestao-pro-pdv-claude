/**
 * Operações V4 Preview — etapa Entrega.
 *
 * GOAL OPS-V4-P0-012: lê apenas o que a OS persiste — retirada confirmada,
 * data de entrega, assinatura textual, acessórios reais do aparelho, eventos
 * de entrega/garantia e a garantia real (operacional ou de payload). Nenhum
 * dado fabricado: onde não houver fonte, mostra empty state honesto.
 *
 * GOAL OPS-V4-ENTREGA-REAL-E-CTA-QUITADO-008: a etapa ganha UMA ação real —
 * "Confirmar entrega" (`v.confirmarEntrega` → `registrarEntregaV3`) — o cliente
 * orienta a UX, mas a decisão financeira final é sempre refeita no servidor.
 * O restante da etapa segue
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
 *
 * GOAL OPS-V4-FLUXO-CURTO-006: a etapa vira o contexto final da OS — guia de
 * retirada (identidade, serviço, condição financeira honesta, garantia, custódia,
 * fotos), "Receber pagamento" abrindo o MESMO sheet do ReceberPagamentoV4 sem sair
 * daqui (pagar nunca entrega sozinho), "Retirado por" enviado a
 * `registrarEntregaV3` e Termo de Entrega só depois da entrega real.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { C, card, cardTitle, fmt, upLabel, pill, inputBase } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import { SignaturePadV3 } from "@/components/operacoes-v3/components/SignaturePadV3";
import { CATEGORIAS_FOTO_SAIDA_V3, lerEntregaV3, lerGarantiaV3, type CategoriaFotoSaidaV3 } from "@/lib/operacoes-v3/pos-venda-model";
import { FOTO_MAX_V3 } from "@/lib/operacoes-v3/prova-entrada-model";
import { GARANTIA_CATALOGO_V3, garantiaCatalogoV3, normalizarGarantiaPrevistaV3, prazoPadraoGarantiaV3 } from "@/lib/operacoes-v3/garantia-textos";
import type { EntregaSemCobrancaCategoriaV3, EntregaSemCobrancaSolicitacaoV3 } from "@/lib/operacoes-v3/delivery-financial-guard";
import {
  campoAgoraV3,
  dataRetroativaV3,
  formatarDataOperacionalV3,
  hojeNaLojaV3,
  lerDataOperacionalV3,
  lerDatasOSV3,
  montarDataOperacionalV3,
  validarDataEntregaV3,
  type CampoDataOperacionalV3,
} from "@/lib/operacoes-v3/datas-operacionais-model";
import { DataOperacionalCampoV3 } from "@/components/operacoes-v3/components/DataOperacionalCampoV3";
import { atendDataCampo } from "../atendimento/field-styles";
import { RealActionNotice } from "../RealActionNotice";
import { ReceberPagamentoV4 } from "../ReceberPagamentoV4";
import { RETIRANTE_MAX_V4, validarRetiranteV4, type ToneRetiradaV4 } from "@/lib/operacoes-v4/retirada-fluxo-v4";
import styles from "./retirada-v4.module.css";

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

const btnSecundario: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  border: `1px solid ${C.inputBd}`,
  background: C.surface,
  color: C.body,
  borderRadius: 8,
  fontSize: 11.5,
  fontWeight: 500,
  cursor: "pointer",
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
 * "Entregar sem cobrança". Esse caminho coleta categoria + motivo e os envia à
 * action canônica; ator, loja, horário, persistência e decisão final são server-side.
 */
function EntregaAcaoCard({ v }: { v: V4Vals }) {
  const [busy, setBusy] = useState(false);
  const [formSemCobrancaAberto, setFormSemCobrancaAberto] = useState(false);
  const [categoria, setCategoria] = useState<EntregaSemCobrancaCategoriaV3 | "">("");
  const [motivo, setMotivo] = useState("");
  // Data EFETIVA da entrega: começa em "hoje, agora" e pode ser anterior (nunca
  // futura nem antes da entrada). Não dispensa nenhuma regra de entrega.
  const [dataEntrega, setDataEntrega] = useState<CampoDataOperacionalV3>(() => campoAgoraV3());
  const [erroData, setErroData] = useState<string | null>(null);
  const dataRef = useRef<HTMLInputElement>(null);
  // GOAL OPS-V4-FLUXO-CURTO-006: quem retira — começa com o cliente da OS e é
  // editável (portador). Em branco, o servidor registra o cliente da OS.
  const clienteNome = v.retirada?.clienteNome ?? "";
  const [retirante, setRetirante] = useState(clienteNome);
  const [erroRetirante, setErroRetirante] = useState<string | null>(null);
  const retiranteRef = useRef<HTMLInputElement>(null);
  const ea = v.entregaAcoes;
  const osKey = v.realOS?.id ?? "";
  useEffect(() => {
    setFormSemCobrancaAberto(false);
    setCategoria("");
    setMotivo("");
  }, [osKey, ea.semCobrancaLancada]);
  useEffect(() => {
    // Troca de OS: nada da OS anterior (data/erro/retirante) sobrevive.
    setDataEntrega(campoAgoraV3());
    setErroData(null);
    setRetirante(clienteNome);
    setErroRetirante(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osKey]);

  if (!ea.podeConfirmar && !ea.bloqueadaPorSaldo && !ea.semCobrancaLancada && !ea.leituraFinanceiraBloqueada) return null;

  const entradaOS = lerDatasOSV3(v.realOS).entrada;
  const montada = montarDataOperacionalV3(dataEntrega);
  const lida = montada.ok ? lerDataOperacionalV3(montada.valor.iso, montada.valor.meta) : null;
  const retroativa = dataRetroativaV3(lida);
  // O MESMO sheet do Financeiro (ReceberPagamentoV4 + hook V3), aberto aqui.
  const abrirRecebimento = v.openReceberPagamentoAqui ?? v.openReceberPagamento;

  const run = async (semCobranca?: EntregaSemCobrancaSolicitacaoV3) => {
    if (busy) return;
    // Mesma regra do servidor, antes de qualquer confirmação.
    const erro = !montada.ok ? montada.mensagem : validarDataEntregaV3({ entrega: lida, entrada: entradaOS })[0]?.mensagem ?? null;
    if (erro) {
      setErroData(erro);
      requestAnimationFrame(() => dataRef.current?.focus());
      return;
    }
    const quem = validarRetiranteV4(retirante);
    if (!quem.ok) {
      setErroRetirante(quem.mensagem);
      requestAnimationFrame(() => retiranteRef.current?.focus());
      return;
    }
    const quando = retroativa ? ` em ${formatarDataOperacionalV3(lida)}` : "";
    const por = quem.recebidoPor ? `, retirada por ${quem.recebidoPor}` : "";
    const confirmado = window.confirm(
      semCobranca
        ? `A entrega${quando}${por} será registrada sem cobrança, com categoria, motivo e responsável na auditoria. Confirmar?`
        : `Entrega real${quando}${por}: ao confirmar, a OS será marcada como entregue no histórico. Confirmar?`
    );
    if (!confirmado) return;
    // Padrão intacto ("hoje, agora" automático) = horário exato do servidor.
    const informada = !(dataEntrega.horaAutomatica && dataEntrega.dia === hojeNaLojaV3());
    const data = informada && montada.ok ? montada.valor : undefined;
    setBusy(true);
    try {
      // Pagamento e entrega são comandos separados: aqui só a entrega canônica.
      if (quem.recebidoPor) await v.confirmarEntrega(semCobranca, data, quem.recebidoPor);
      else await v.confirmarEntrega(semCobranca, data);
    } finally {
      setBusy(false);
    }
  };

  const campoData = (
    <div style={{ marginBottom: 12 }}>
      <DataOperacionalCampoV3
        ref={dataRef}
        id="entrega-data"
        rotulo="Data da entrega"
        ajuda="Quando o aparelho foi realmente entregue ao cliente."
        obrigatorio
        maxDia={hojeNaLojaV3()}
        minDia={entradaOS?.dia}
        valor={dataEntrega}
        onChange={(c) => {
          setDataEntrega(c);
          setErroData(null);
        }}
        erro={erroData}
        aviso={retroativa ? "Entrega com data anterior. O histórico guarda também o horário real deste registro." : null}
        estilos={atendDataCampo}
      />
    </div>
  );

  const campoRetirante = (
    <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
      <label htmlFor="entrega-retirante" style={{ fontSize: 11.5, fontWeight: 600, color: C.body }}>Retirado por</label>
      <input
        ref={retiranteRef}
        id="entrega-retirante"
        type="text"
        value={retirante}
        maxLength={RETIRANTE_MAX_V4}
        disabled={busy}
        autoComplete="off"
        aria-invalid={erroRetirante ? true : undefined}
        aria-describedby="entrega-retirante-ajuda"
        onChange={(event) => {
          setRetirante(event.target.value);
          setErroRetirante(null);
        }}
        style={{ ...inputBase, height: 34 }}
      />
      <span id="entrega-retirante-ajuda" style={{ fontSize: 10.5, color: erroRetirante ? C.dangerFg : C.subtle, lineHeight: 1.45 }}>
        {erroRetirante ?? "Cliente ou portador que está levando o aparelho. Em branco, o registro usa o cliente da OS."}
      </span>
    </div>
  );

  const botaoReceber = (
    <button type="button" onClick={abrirRecebimento} style={{ ...btnPrimary, background: C.primary, cursor: "pointer" }}>
      Receber pagamento
    </button>
  );

  // Projeção ainda não confirmada para ESTA OS (em leitura ou de outra OS que
  // chegou atrasada): nada se decide — nem receber, nem confirmar (fail-closed).
  if (v.retirada?.financeiro.situacao === "carregando") {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 6 }}>Entrega</div>
        <div style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.5 }}>Confirmando a situação financeira desta OS…</div>
      </div>
    );
  }

  // Total aprovado sem Conta a Receber: o recebimento (ou o saldo a prazo)
  // formaliza o título único da OS — a leitura nunca cria nada.
  if (ea.cobrancaNaoFormalizada && v.retirada?.financeiro.podeReceber) {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 6 }}>Entrega</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.warnFg, marginBottom: 4 }}>Cobrança ainda não formalizada</div>
        <div style={{ fontSize: 11.5, color: C.body, lineHeight: 1.5, marginBottom: 10 }}>
          Receba o pagamento (ou deixe o saldo a prazo) para formalizar a cobrança desta OS. A entrega continua bloqueada até lá.
        </div>
        {botaoReceber}
      </div>
    );
  }

  if (ea.leituraFinanceiraBloqueada) {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 6 }}>Entrega</div>
        <div style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.5 }}>
          {ea.financeiroCarregando
            ? "Confirmando a situação financeira desta OS…"
            : ea.financeiroMotivo ?? "Não foi possível confirmar a situação financeira desta OS. Revise a cobrança antes de entregar."}
        </div>
        {!ea.financeiroCarregando && (v.goFinanceiro || (ea.financeiroErro && v.financial?.reload)) ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {v.goFinanceiro ? (
              <button type="button" onClick={v.goFinanceiro} style={btnSecundario}>
                Revisar no Financeiro
              </button>
            ) : null}
            {ea.financeiroErro && v.financial?.reload ? (
              <button type="button" onClick={v.financial.reload} style={btnSecundario}>
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (ea.bloqueadaPorSaldo) {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 6 }}>Entrega</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.warnFg, marginBottom: 4 }}>
          Pagamento pendente{ea.saldoPendente != null ? `  ${fmt(ea.saldoPendente)}` : ""}
        </div>
        <div style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.5, marginBottom: 10 }}>
          Receba o pagamento (ou lance a prazo) antes de confirmar a entrega. Receber não entrega: a confirmação continua aqui, separada.
        </div>
        {botaoReceber}
      </div>
    );
  }

  if (ea.semCobrancaLancada && !formSemCobrancaAberto) {
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
            onClick={() => setFormSemCobrancaAberto(true)}
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

  if (ea.semCobrancaLancada) {
    const podeEnviar = !!categoria && motivo.trim().length > 0 && !busy;
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 8 }}>Entrega sem cobrança</div>
        <div style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.5, marginBottom: 12 }}>
          A classificação e a justificativa serão validadas e auditadas pelo servidor antes da entrega.
        </div>
        {campoData}
        {campoRetirante}
        <label style={{ display: "grid", gap: 5, marginBottom: 10 }}>
          <span style={upLabel}>Categoria obrigatória</span>
          <select
            value={categoria}
            onChange={(event) => setCategoria(event.target.value as EntregaSemCobrancaCategoriaV3 | "")}
            style={{ ...inputBase, height: 36 }}
          >
            <option value="">Selecione</option>
            <option value="cortesia">Cortesia</option>
            <option value="garantia">Garantia</option>
            <option value="sem_valor">Serviço sem valor</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, marginBottom: 12 }}>
          <span style={upLabel}>Motivo obrigatório</span>
          <textarea
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Explique por que esta OS será entregue sem cobrança"
            style={{ ...inputBase, minHeight: 76, paddingTop: 9, resize: "vertical" }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={!podeEnviar}
            onClick={() => void run({ categoria: categoria as EntregaSemCobrancaCategoriaV3, motivo })}
            style={{ ...btnPrimary, background: C.success, cursor: podeEnviar ? "pointer" : "default", opacity: podeEnviar ? 1 : 0.6 }}
          >
            {busy ? "Confirmando…" : "Confirmar entrega sem cobrança"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setFormSemCobrancaAberto(false)}
            style={{ height: 34, padding: "0 14px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer" }}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ ...cardTitle, marginBottom: 10 }}>Entrega</div>
      {ea.autorizadaAPrazo ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 14 }}>
          <span style={{ fontSize: 13, lineHeight: "16px", flex: "none" }}>ℹ️</span>
          <span style={{ fontSize: 11.5, color: C.infoFg, lineHeight: 1.45 }}>
            <strong>Entrega autorizada a prazo.</strong> O cliente possui conta a receber pendente — esta OS não está quitada.
          </span>
        </div>
      ) : ea.autorizadaSemCobranca ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 14 }}>
          <span style={{ fontSize: 11.5, color: C.infoFg, lineHeight: 1.45 }}><strong>Entrega sem cobrança autorizada.</strong> A classificação persistida será revalidada pelo servidor.</span>
        </div>
      ) : v.retirada?.financeiro.situacao === "quitado" && v.pdvServico?.ultimoRecibo ? (
        // Logo após receber nesta sessão (o estado persistido já aparece na guia).
        <div role="status" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.successBg, border: `1px solid ${C.successBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 14 }}>
          <span style={{ fontSize: 11.5, color: C.successFg, lineHeight: 1.45 }}>
            <strong>Pagamento registrado. Falta confirmar a entrega.</strong> A entrega só acontece quando você confirmar abaixo.
          </span>
        </div>
      ) : (
        <RealActionNotice kind="entrega" />
      )}
      {campoData}
      {campoRetirante}
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        style={{ ...btnPrimary, background: C.success, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
      >
        {busy ? "Confirmando…" : "Confirmar entrega real"}
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

const TOM_RETIRADA: Record<ToneRetiradaV4, { classe: string; icone: string }> = {
  success: { classe: styles.tomSuccess, icone: "✓" },
  info: { classe: styles.tomInfo, icone: "i" },
  warning: { classe: styles.tomWarning, icone: "!" },
  danger: { classe: styles.tomDanger, icone: "!" },
  neutral: { classe: styles.tomNeutral, icone: "…" },
};

/**
 * Guia de retirada (GOAL OPS-V4-FLUXO-CURTO-006): o contexto final da OS em um
 * só lugar, só com dado real — ausente aparece como ausente, nunca como
 * confirmação. A situação financeira vem da projeção server-side da MESMA OS.
 */
function GuiaRetirada({ v }: { v: V4Vals }) {
  const r = v.retirada;
  if (!r || !v.realOS) return null;
  const f = r.financeiro;
  const e = v.entrega;
  const g = e.garantia;
  const tom = TOM_RETIRADA[f.tone];
  const valor = (n: number | null) => (n == null ? "—" : fmt(n));
  const servico = r.servico.itens.length ? r.servico.itens.join(", ") : "não informado";
  return (
    <section className={styles.guia} aria-label="Guia de retirada">
      <div className={styles.canhoto}>
        <span className={styles.canhotoRotulo}>Retirada</span>
        <span className={styles.codigo}>{v.os.codigo}</span>
        <span className={styles.estadoEntrega}>{e.statusLabel}</span>
      </div>
      <div className={styles.corpo}>
        <div>
          <div className={styles.quem}>
            {v.os.cliente}
            <span style={{ fontWeight: 500, color: C.subtle }}>{" — "}{v.os.aparelho}</span>
          </div>
          <div className={styles.servico}>
            {r.servico.aprovado ? "Serviço aprovado" : "Serviço previsto (orçamento não aprovado)"}: {servico}
          </div>
        </div>
        <div className={`${styles.veredito} ${tom.classe}`} role="status" aria-live="polite">
          <span className={styles.vereditoIcone} aria-hidden="true">{tom.icone}</span>
          <div style={{ minWidth: 0 }}>
            <div className={styles.vereditoTitulo}>{f.rotulo}</div>
            <div className={styles.vereditoTexto}>{f.descricao}</div>
          </div>
        </div>
        {f.situacao !== "carregando" && f.situacao !== "indisponivel" ? (
          <div className={styles.valores}>
            <div className={styles.valor}>
              <div className={styles.valorRotulo}>Total</div>
              <div className={styles.valorNumero}>{valor(f.total)}</div>
            </div>
            <div className={styles.valor}>
              <div className={styles.valorRotulo}>Recebido</div>
              <div className={styles.valorNumero}>{valor(f.recebido)}</div>
            </div>
            <div className={styles.valor}>
              <div className={styles.valorRotulo}>{f.situacao === "a_prazo" ? "A prazo" : "Saldo"}</div>
              <div className={styles.valorNumero}>{valor(f.saldo)}</div>
            </div>
          </div>
        ) : null}
        <dl className={styles.fatos}>
          <div className={styles.fato}>
            <dt>Garantia</dt>
            <dd>{g.temGarantia ? <>{g.prazo}<br /><span style={{ color: C.subtle }}>{g.situacao}</span></> : "Não definida"}</dd>
          </div>
          <div className={styles.fato}>
            <dt>Acessórios em custódia</dt>
            <dd>{e.acessorios.length ? e.acessorios.join(", ") : "Nenhum registrado na entrada"}</dd>
          </div>
          <div className={styles.fato}>
            <dt>Fotos de saída</dt>
            <dd>{e.fotosSaida.length ? `${e.fotosSaida.length} registrada${e.fotosSaida.length > 1 ? "s" : ""}` : "Nenhuma registrada"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

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
export function GarantiaFormCard({ v }: { v: V4Vals }) {
  const seed = lerGarantiaV3(v.realOS);
  const seedModeloId = seed.temGarantia ? seed.modeloId : "sem_garantia";
  const seedPrazoDias = seed.temGarantia ? seed.prazoDias : prazoPadraoGarantiaV3("sem_garantia");

  const [modeloId, setModeloId] = useState(seedModeloId);
  const [prazoDias, setPrazoDias] = useState(seedPrazoDias);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const osIdRef = useRef(v.realOS?.id ?? "");
  const semCobertura = garantiaCatalogoV3(modeloId).semCobertura;

  // Reseta o formulário quando a OS/garantia muda (troca de OS ou reload pós-save).
  const seedKey = `${v.realOS?.id ?? ""}:${v.realOS?.atualizadoEm ?? ""}`;
  useEffect(() => {
    const osId = v.realOS?.id ?? "";
    // Uma falha pode recarregar o detalhe; não descarte a edição ainda suja.
    if (dirty && osIdRef.current === osId) return;
    osIdRef.current = osId;
    setModeloId(seedModeloId);
    setPrazoDias(seedPrazoDias);
    setDirty(false);
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const aplicarModelo = (id: string) => {
    const garantia = normalizarGarantiaPrevistaV3({ modeloId: id });
    setModeloId(garantia.modelo.id);
    setPrazoDias(garantia.prazoDias);
    setDirty(true);
    setErro(null);
  };

  const onSalvar = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    setErro(null);
    try {
      const garantia = normalizarGarantiaPrevistaV3({ modeloId, prazoDias });
      const ok = await v.salvarGarantia({ modeloId: garantia.modelo.id, prazoDias: garantia.prazoDias });
      if (ok) setDirty(false);
      else setErro("Não foi possível salvar. Revise a mensagem e tente novamente.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente.");
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
          <div style={{ ...upLabel, marginBottom: 4 }}>{semCobertura ? "Sem cobertura — prazo 0" : "Prazo em dias"}</div>
          <input
            type="number"
            min={semCobertura ? 0 : 1}
            value={prazoDias}
            disabled={semCobertura || busy}
            onChange={(e) => {
              setPrazoDias(Math.max(1, Math.trunc(Number(e.target.value) || 0)));
              setDirty(true);
              setErro(null);
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
      {erro && <div role="alert" style={{ color: C.danger, fontSize: 11, marginTop: 8 }}>{erro}</div>}
      <div style={{ fontSize: 10.5, color: C.subtle, marginTop: 8, lineHeight: 1.5 }}>
        A garantia fica prevista na OS e passa a valer na entrega.
      </div>
    </div>
  );
}

async function comprimirFotoSaida(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Imagem inválida."));
    image.src = dataUrl;
  });
  const scale = Math.min(1, 1024 / Math.max(img.width || 1, img.height || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
  canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.6);
}

function FotosSaidaCard({ v }: { v: V4Vals }) {
  const [categoria, setCategoria] = useState<CategoriaFotoSaidaV3>("reparado");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fotos = v.entrega.fotosSaida;
  const remaining = Math.max(0, FOTO_MAX_V3 - fotos.length);

  const onUpload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const dataUrl = await comprimirFotoSaida(file);
      const ok = await v.adicionarFotoSaida({ categoria, nome: file.name, dataUrl });
      if (!ok) setError("Não foi possível adicionar a foto de saída.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar a foto de saída.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={cardTitle}>Fotos de saída</span>
        <span style={{ fontSize: 11, color: C.subtle }}>{fotos.length} de {FOTO_MAX_V3}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: col2, gap: 10, marginBottom: 10 }}>
        <label>
          <div style={{ ...upLabel, marginBottom: 4 }}>Categoria</div>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaFotoSaidaV3)} style={inputBase}>
            {CATEGORIAS_FOTO_SAIDA_V3.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          <div style={{ ...upLabel, marginBottom: 4 }}>Adicionar foto</div>
          <input
            type="file"
            accept="image/*"
            disabled={busy || remaining <= 0}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void onUpload(file);
            }}
            style={inputBase}
          />
        </label>
      </div>
      {fotos.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
          {fotos.map((foto) => (
            <figure key={foto.id} style={{ margin: 0, border: `1px solid ${C.line2}`, borderRadius: 8, overflow: "hidden", position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.dataUrl} alt={foto.name} style={{ display: "block", width: "100%", height: 72, objectFit: "cover" }} />
              <figcaption style={{ fontSize: 9, fontWeight: 700, padding: "3px 6px", color: C.muted }}>{foto.tag}</figcaption>
              <button type="button" onClick={() => void v.removerFotoSaida(foto.id)} aria-label="Remover foto de saída" style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, border: "none", borderRadius: 6, background: "rgba(0,0,0,.55)", color: C.white, cursor: "pointer", fontSize: 12 }}>×</button>
            </figure>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.subtle }}>Nenhuma foto de saída registrada.</div>
      )}
      {error ? <div style={{ fontSize: 12, color: C.danger, marginTop: 8 }} role="alert">{error}</div> : null}
    </div>
  );
}

export function DocumentosEntregaCard({ v }: { v: V4Vals }) {
  const garantiaDefinida = lerGarantiaV3(v.realOS).temGarantia;
  // GOAL OPS-V4-FLUXO-CURTO-006: o termo declara a retirada — só após a entrega real.
  const entregue = lerEntregaV3(v.realOS).entregue;
  const btn: React.CSSProperties = {
    height: 32,
    padding: "0 12px",
    border: `1px solid ${C.inputBd}`,
    background: C.surface,
    color: C.body,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  };
  return (
    <div style={card}>
      <div style={{ ...cardTitle, marginBottom: 10 }}>Documentos</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={btn} disabled={!garantiaDefinida} onClick={() => v.openDocPrint("termo_garantia")}>Imprimir Termo de Garantia</button>
        <button type="button" style={btn} disabled={!entregue} onClick={() => v.openDocPrint("termo_entrega")}>Imprimir Termo de Entrega</button>
        <button type="button" style={btn} onClick={() => v.openDocPrint("os_cliente")}>Imprimir OS (cliente)</button>
      </div>
      {!garantiaDefinida && <div style={{ fontSize: 11, color: C.subtle, marginTop: 8 }}>Defina a garantia da OS antes de emitir o termo.</div>}
      {!entregue && <div style={{ fontSize: 11, color: C.subtle, marginTop: 8 }}>O Termo de Entrega fica disponível depois da entrega confirmada.</div>}
      <div style={{ fontSize: 10.5, color: C.subtle, marginTop: 8, lineHeight: 1.5 }}>
        Reimpressão abre o mesmo documento. WhatsApp no modal, quando o cliente tiver telefone válido.
      </div>
    </div>
  );
}

export function EntregaStage({ v }: { v: V4Vals }) {
  const e = v.entrega;
  const g = e.garantia;

  // GOAL OPS-V4-FLUXO-CURTO-006: hospedeiro do MESMO sheet de recebimento, em
  // posição estável (o rascunho sobrevive à releitura após recusa).
  const recebimento = <ReceberPagamentoV4 key="recebimento" v={v} somenteSheet />;

  if (!e.temRegistro) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {recebimento}
        <GuiaRetirada v={v} />
        <EntregaAcaoCard v={v} />
        <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "18px 18px", textAlign: "center" }}>
          <span style={{ fontSize: 22 }}>📦</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.body }}>Esta Ordem de Serviço ainda não foi entregue.</div>
          <div style={{ fontSize: 11.5, color: C.subtle, maxWidth: 360, lineHeight: 1.5 }}>
            O registro de retirada, a assinatura e a garantia aparecem aqui assim que a entrega for concluída.
          </div>
        </div>
        <FotosSaidaCard v={v} />
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>🛡 Garantia da OS</div>
          {g.temGarantia ? (
            <div style={{ display: "grid", gridTemplateColumns: col2, gap: 10, marginBottom: 11 }}>
              <Field label="Prazo" value={g.prazo} />
              <Field label="Cobertura" value={g.cobertura} />
              <Field label="Início" value={g.inicio} />
              <Field label="Validade" value={g.fim} />
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Garantia não definida.</div>
          )}
          <GarantiaFormCard v={v} />
        </div>
        <DocumentosEntregaCard v={v} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {recebimento}
      <GuiaRetirada v={v} />
      <EntregaAcaoCard v={v} />
      <DocumentosEntregaCard v={v} />
      <FotosSaidaCard v={v} />
      <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      {/* Registro de entrega (real) */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={cardTitle}>📦 Registro de entrega</span>
          <StatusBadge label={e.statusLabel} tone={e.statusTone} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: col2, gap: 10 }}>
          <Field label="Retirado por" value={e.retiradoPor} />
          <Field label="Data da entrega" value={e.retiradoEm} />
          {e.registradoEm ? <Field label="Registrado no sistema" value={e.registradoEm} /> : null}
        </div>
        {e.entregue ? (
          <button
            type="button"
            onClick={v.openCorrigirDatas}
            style={{ marginTop: 9, padding: 0, border: "none", background: "transparent", color: C.primaryHover, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
          >
            Corrigir datas
          </button>
        ) : null}
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
        {!g.temGarantia && <><div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Garantia não definida.</div><GarantiaFormCard v={v} /></>}
      </div>
      </div>
    </div>
  );
}
