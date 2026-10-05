// ============================================================================
// Operações V3/V4 — DATAS OPERACIONAIS · módulo PURO compartilhado
// (GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001)
// ----------------------------------------------------------------------------
// Sem I/O, sem React, sem Prisma — importável por cliente e servidor, e pela
// V3 e pela V4 (não depende de nada da interface V4).
//
// Separa os conceitos que antes se confundiam:
//   A. entrada efetiva do aparelho      → aberturaV3.recepcao.dataEntrada
//   B. previsão de entrega combinada    → aberturaV3.recepcao.previsaoEntrega
//   C. entrega/saída efetiva            → entregaV3.entregueEm (+ espelhos)
//   D. data do orçamento / atendimento  → comercialV4.dataProposta /
//                                         atendimentoRapidoV3.concluidoEm
//   E. momento do registro              → criadoEm/registradoEm (SEMPRE servidor)
// A–D são fatos ou previsões informados pelo operador; E nunca vem do formulário.
//
// Precisão: o contrato legado guarda ISO (instante). Quando o operador não sabe
// o horário, a data vale só pelo DIA — a ISO vira uma âncora técnica (12:00 na
// loja) e a metadata aditiva `<campo>Meta = { precisao: "dia", dia }` é a fonte
// autoritativa. A âncora nunca é exibida como horário informado.
//
// Fuso: o da loja. `Store` não tem fuso configurável, então vale a convenção já
// adotada no repositório (`FUSO_LOJA_V3`, America/Sao_Paulo). Nunca o fuso do
// navegador nem um offset fixo (datas históricas tiveram horário de verão).
// ============================================================================

import { FUSO_LOJA_V3, dataCivilValidaV3, formatarVencimentoV3 } from "./recebimento-misto-model";

export { FUSO_LOJA_V3 };

export type PrecisaoDataOperacionalV3 = "dia" | "data_hora";

/** Metadata aditiva gravada ao lado da ISO legada (`dataEntradaMeta`, `entregueEmMeta`...). */
export interface DataOperacionalMetaV3 {
  precisao: PrecisaoDataOperacionalV3;
  /** Dia civil na loja (`YYYY-MM-DD`). Autoritativo quando `precisao === "dia"`. */
  dia: string;
}

/** Data pronta para gravar: ISO no contrato legado + metadata de precisão. */
export interface DataOperacionalV3 {
  iso: string;
  meta: DataOperacionalMetaV3;
}

/**
 * Origem de uma data lida do payload:
 *  - informada: veio deste contrato (tem metadata coerente);
 *  - legado:    ISO gravada antes da metadata (vale como data/hora registrada);
 *  - cadastro:  não há data operacional — só a data de cadastro da OS.
 */
export type OrigemDataOperacionalV3 = "informada" | "legado" | "cadastro";

export interface DataOperacionalLidaV3 {
  iso: string;
  precisao: PrecisaoDataOperacionalV3;
  /** Dia civil na loja (`YYYY-MM-DD`). */
  dia: string;
  origem: OrigemDataOperacionalV3;
}

/** Estado de um campo de data no formulário: dia civil + horário opcional. */
export interface CampoDataOperacionalV3 {
  /** `YYYY-MM-DD` (valor do `<input type="date">`). */
  dia: string;
  /** `HH:mm` ou "" (sem horário = vale só o dia). */
  hora: string;
  /**
   * `true` enquanto o horário é o preenchido automaticamente na abertura do
   * formulário. Trocar o dia descarta esse horário — ele nunca vira hora
   * histórica confirmada.
   */
  horaAutomatica: boolean;
}

/** Âncora técnica (parede da loja) das datas só-dia. Nunca exibida. */
export const HORA_ANCORA_DIA_V3 = "12:00";

/** Folga para relógio de navegador adiantado ao conferir "fato no futuro". */
export const TOLERANCIA_RELOGIO_MS_V3 = 5 * 60_000;

// ----------------------------------------------------------------------------
// Fuso da loja: parede ↔ instante
// ----------------------------------------------------------------------------

interface PartesParedeV3 {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

function partesNaLoja(d: Date, tz: string): PartesParedeV3 {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour), minuto: Number(p.minute) };
}

const dois = (n: number) => String(n).padStart(2, "0");

function fuso(tz?: string): string {
  return (tz ?? "").trim() || FUSO_LOJA_V3;
}

function dataValida(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Dia civil (`YYYY-MM-DD`) de um instante, no fuso da loja. "" quando inválido. */
export function diaNaLojaV3(iso: unknown, tz?: string): string {
  const d = dataValida(iso);
  if (!d) return "";
  const p = partesNaLoja(d, fuso(tz));
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`;
}

/** Horário de parede (`HH:mm`) de um instante, no fuso da loja. "" quando inválido. */
export function horaNaLojaV3(iso: unknown, tz?: string): string {
  const d = dataValida(iso);
  if (!d) return "";
  const p = partesNaLoja(d, fuso(tz));
  return `${dois(p.hora)}:${dois(p.minuto)}`;
}

/** "Hoje" na loja (`YYYY-MM-DD`). */
export function hojeNaLojaV3(agora: Date = new Date(), tz?: string): string {
  return diaNaLojaV3(agora.toISOString(), tz);
}

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `HH:mm` estrito (00:00–23:59). */
export function horaValidaV3(hora: unknown): boolean {
  return typeof hora === "string" && HORA_RE.test(hora.trim());
}

/** Dia civil estrito (rejeita 2026-02-30 e afins — nada de normalização silenciosa). */
export function diaCivilValidoV3(dia: unknown): boolean {
  return typeof dia === "string" && dataCivilValidaV3(dia.trim());
}

/**
 * Parede da loja (`YYYY-MM-DD` + `HH:mm`) → ISO UTC. "" quando o dia/horário é
 * inválido ou não existe no fuso (ex.: lacuna de horário de verão histórico).
 */
export function paredeLojaParaIsoV3(dia: string, hora: string, tz?: string): string {
  const d = (dia ?? "").trim();
  const h = (hora ?? "").trim();
  if (!diaCivilValidoV3(d) || !horaValidaV3(h)) return "";
  const [ano, mes, diaN] = d.split("-").map(Number);
  const [hh, mm] = h.split(":").map(Number);
  const z = fuso(tz);
  const paredeUtc = Date.UTC(ano!, mes! - 1, diaN!, hh!, mm!);
  let utc = paredeUtc;
  for (let i = 0; i < 3; i += 1) {
    const p = partesNaLoja(new Date(utc), z);
    const offset = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto) - utc;
    utc = paredeUtc - offset;
  }
  const out = new Date(utc);
  if (Number.isNaN(out.getTime())) return "";
  // Round-trip: recusa horários inexistentes no fuso (normalizados pelo Date).
  const p = partesNaLoja(out, z);
  if (`${p.ano}-${dois(p.mes)}-${dois(p.dia)}` !== d || `${dois(p.hora)}:${dois(p.minuto)}` !== h) return "";
  return out.toISOString();
}

/** Âncora técnica de uma data só-dia (12:00 na loja). */
export function ancoraDiaIsoV3(dia: string, tz?: string): string {
  return paredeLojaParaIsoV3(dia, HORA_ANCORA_DIA_V3, tz);
}

/** Último instante do dia civil na loja (validade "até o fim do dia"). */
export function fimDoDiaLojaIsoV3(dia: string, tz?: string): string {
  const iso = paredeLojaParaIsoV3(dia, "23:59", tz);
  return iso ? new Date(Date.parse(iso) + 59_999).toISOString() : "";
}

/** Soma `n` dias a um dia civil, sem passar por fuso. */
export function somarDiasCivisV3(dia: string, n: number): string {
  if (!diaCivilValidoV3(dia)) return "";
  const [a, m, d] = dia.split("-").map(Number);
  const t = new Date(Date.UTC(a!, m! - 1, d! + Math.trunc(n)));
  return `${t.getUTCFullYear()}-${dois(t.getUTCMonth() + 1)}-${dois(t.getUTCDate())}`;
}

/** Diferença em dias civis (`b - a`). */
export function diasEntreCivisV3(a: string, b: string): number {
  if (!diaCivilValidoV3(a) || !diaCivilValidoV3(b)) return 0;
  const [a1, a2, a3] = a.split("-").map(Number);
  const [b1, b2, b3] = b.split("-").map(Number);
  return Math.round((Date.UTC(b1!, b2! - 1, b3!) - Date.UTC(a1!, a2! - 1, a3!)) / 86_400_000);
}

// ----------------------------------------------------------------------------
// Formulário → data gravável
// ----------------------------------------------------------------------------

/** Campo inicial "hoje, agora" (horário marcado como automático). */
export function campoAgoraV3(agora: Date = new Date(), tz?: string): CampoDataOperacionalV3 {
  const iso = agora.toISOString();
  return { dia: diaNaLojaV3(iso, tz), hora: horaNaLojaV3(iso, tz), horaAutomatica: true };
}

/** Campo inicial só com o dia de hoje (sem horário). */
export function campoHojeV3(agora: Date = new Date(), tz?: string): CampoDataOperacionalV3 {
  return { dia: hojeNaLojaV3(agora, tz), hora: "", horaAutomatica: false };
}

/** Campo vazio (data opcional ainda não informada). */
export function campoVazioV3(): CampoDataOperacionalV3 {
  return { dia: "", hora: "", horaAutomatica: false };
}

/**
 * Troca o dia do campo. O horário automático (da abertura do formulário) é
 * descartado ao mudar o dia: num dia antigo ele não é hora histórica confirmada.
 */
export function alterarDiaCampoV3(campo: CampoDataOperacionalV3, dia: string): CampoDataOperacionalV3 {
  if (dia === campo.dia) return campo;
  if (campo.horaAutomatica) return { dia, hora: "", horaAutomatica: false };
  return { ...campo, dia };
}

/** Horário digitado pelo operador (deixa de ser automático). */
export function alterarHoraCampoV3(campo: CampoDataOperacionalV3, hora: string): CampoDataOperacionalV3 {
  return { ...campo, hora, horaAutomatica: false };
}

/** Campo semeado a partir de uma data já gravada (edição/correção). */
export function campoDeDataLidaV3(d: DataOperacionalLidaV3 | null | undefined, tz?: string): CampoDataOperacionalV3 {
  if (!d) return campoVazioV3();
  return { dia: d.dia, hora: d.precisao === "dia" ? "" : horaNaLojaV3(d.iso, tz), horaAutomatica: false };
}

export type ResultadoDataOperacionalV3 =
  | { ok: true; valor: DataOperacionalV3 }
  | { ok: false; codigo: "vazia" | "dia_invalido" | "hora_invalida" | "hora_inexistente"; mensagem: string };

/** Converte o campo do formulário em ISO + metadata (fuso da loja). */
export function montarDataOperacionalV3(campo: Pick<CampoDataOperacionalV3, "dia" | "hora">, tz?: string): ResultadoDataOperacionalV3 {
  const dia = (campo?.dia ?? "").trim();
  const hora = (campo?.hora ?? "").trim();
  if (!dia) return { ok: false, codigo: "vazia", mensagem: "Informe a data." };
  if (!diaCivilValidoV3(dia)) return { ok: false, codigo: "dia_invalido", mensagem: "Data inválida. Use um dia real do calendário." };
  if (hora && !horaValidaV3(hora)) return { ok: false, codigo: "hora_invalida", mensagem: "Horário inválido. Use HH:mm." };
  const iso = paredeLojaParaIsoV3(dia, hora || HORA_ANCORA_DIA_V3, tz);
  if (!iso) return { ok: false, codigo: "hora_inexistente", mensagem: "Esse horário não existe no fuso da loja. Ajuste o horário." };
  return { ok: true, valor: { iso, meta: { precisao: hora ? "data_hora" : "dia", dia } } };
}

/** Campo opcional: vazio → `null` (não informado); preenchido → resultado normal. */
export function montarDataOperacionalOpcionalV3(
  campo: Pick<CampoDataOperacionalV3, "dia" | "hora">,
  tz?: string,
): ResultadoDataOperacionalV3 | null {
  if (!(campo?.dia ?? "").trim() && !(campo?.hora ?? "").trim()) return null;
  return montarDataOperacionalV3(campo, tz);
}

// ----------------------------------------------------------------------------
// Leitura (payload → data) e validação estrita de entrada (servidor)
// ----------------------------------------------------------------------------

function metaFormaValida(meta: unknown): meta is DataOperacionalMetaV3 {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  return (m.precisao === "dia" || m.precisao === "data_hora") && diaCivilValidoV3(m.dia);
}

/**
 * Lê uma data gravada (ISO legado + metadata opcional). Tolerante com o legado:
 * ISO válida sem metadata → `origem: "legado"`, precisão data/hora. Metadata
 * incoerente com a ISO é ignorada (nunca inventa precisão). `null` = ausente.
 */
export function lerDataOperacionalV3(iso: unknown, meta?: unknown, tz?: string): DataOperacionalLidaV3 | null {
  const d = dataValida(iso);
  if (!d) return null;
  const instante = d.toISOString();
  const diaIso = diaNaLojaV3(instante, tz);
  if (metaFormaValida(meta)) {
    // Só-dia vale apenas se a ISO for exatamente a âncora desse dia (mesma regra do
    // escritor): ISO alterada por outro caminho sem a metadata → leitura legada.
    if (meta.precisao === "dia") {
      if (ancoraDiaIsoV3(meta.dia, tz) === instante) return { iso: instante, precisao: "dia", dia: meta.dia, origem: "informada" };
    } else if (meta.dia === diaIso) {
      return { iso: instante, precisao: "data_hora", dia: diaIso, origem: "informada" };
    }
  }
  return { iso: instante, precisao: "data_hora", dia: diaIso, origem: "legado" };
}

/**
 * `sla.prazo` espelhado de uma previsão COMBINADA. Só-dia vale até o FIM do dia
 * civil na loja: a âncora técnica (12:00) nunca vira "atrasada" ao meio-dia do
 * próprio dia prometido. Com horário, o próprio instante. "" quando ausente.
 */
export function prazoSlaDaPrevisaoV3(previsao: { iso: string; meta?: DataOperacionalMetaV3 | null } | null | undefined, tz?: string): string {
  const d = dataValida(previsao?.iso);
  if (!d) return "";
  const meta = previsao?.meta;
  if (meta?.precisao === "dia" && diaCivilValidoV3(meta.dia)) return fimDoDiaLojaIsoV3(meta.dia, tz);
  return d.toISOString();
}

/** Regra do prazo interno padrão da Nova OS (sem previsão combinada): cadastro + 2 dias. */
export const PRAZO_INTERNO_PADRAO_DIAS_V3 = 2;

/** Prazo interno padrão a partir do cadastro (ISO). "" quando o cadastro é inválido. */
export function prazoInternoPadraoIsoV3(cadastroIso: unknown): string {
  const d = dataValida(cadastroIso);
  return d ? new Date(d.getTime() + PRAZO_INTERNO_PADRAO_DIAS_V3 * 86_400_000).toISOString() : "";
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** ISO UTC canônica e real (round-trip: recusa 2026-02-30T… normalizado pelo Date). */
export function isoInstanteValidoV3(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!ISO_UTC_RE.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 19) === s.slice(0, 19);
}

export type ResultadoEntradaDataV3 =
  | { ok: true; data: DataOperacionalLidaV3; meta: DataOperacionalMetaV3 | null }
  | { ok: false; mensagem: string };

/**
 * Validação ESTRITA de uma data recebida pelo servidor (ISO + metadata). Sem
 * metadata (chamada antiga) a ISO precisa ser real; com metadata, ISO e dia
 * precisam bater exatamente (só-dia = âncora técnica do dia informado).
 */
export function validarEntradaDataV3(iso: unknown, meta: unknown, rotulo: string, tz?: string): ResultadoEntradaDataV3 {
  if (!isoInstanteValidoV3(iso)) return { ok: false, mensagem: `${rotulo}: data inválida.` };
  const instante = new Date(iso.trim()).toISOString();
  if (meta === undefined || meta === null) {
    return { ok: true, data: { iso: instante, precisao: "data_hora", dia: diaNaLojaV3(instante, tz), origem: "legado" }, meta: null };
  }
  if (!metaFormaValida(meta)) return { ok: false, mensagem: `${rotulo}: data inválida.` };
  if (meta.precisao === "dia") {
    if (ancoraDiaIsoV3(meta.dia, tz) !== instante) return { ok: false, mensagem: `${rotulo}: data inválida.` };
    return { ok: true, data: { iso: instante, precisao: "dia", dia: meta.dia, origem: "informada" }, meta: { precisao: "dia", dia: meta.dia } };
  }
  if (diaNaLojaV3(instante, tz) !== meta.dia) return { ok: false, mensagem: `${rotulo}: data inválida.` };
  return { ok: true, data: { iso: instante, precisao: "data_hora", dia: meta.dia, origem: "informada" }, meta: { precisao: "data_hora", dia: meta.dia } };
}

// ----------------------------------------------------------------------------
// Formatação (sempre no fuso da loja; só-dia nunca mostra horário)
// ----------------------------------------------------------------------------

type DataComparavelV3 = Pick<DataOperacionalLidaV3, "iso" | "precisao" | "dia">;

/** "25/09/2026" (só-dia) ou "25/09/2026 14:30" (data/hora), no fuso da loja. */
export function formatarDataOperacionalV3(d: DataComparavelV3 | null | undefined, tz?: string): string {
  if (!d || !d.dia) return "";
  if (d.precisao === "dia") return formatarVencimentoV3(d.dia);
  const hora = horaNaLojaV3(d.iso, tz);
  return hora ? `${formatarVencimentoV3(d.dia)} ${hora}` : formatarVencimentoV3(d.dia);
}

/** "dd/mm/aaaa" de um instante no fuso da loja (ex.: `validoAte`). "" quando inválido. */
export function formatarDiaDeIsoNaLojaV3(iso: unknown, tz?: string): string {
  const dia = diaNaLojaV3(iso, tz);
  return dia ? formatarVencimentoV3(dia) : "";
}

// ----------------------------------------------------------------------------
// Cronologia respeitando a precisão
// ----------------------------------------------------------------------------

/**
 * Compara duas datas. Se uma delas vale só pelo dia, compara os DIAS (a âncora
 * técnica nunca gera erro falso); com as duas em data/hora, compara instantes.
 */
export function compararDatasOperacionaisV3(a: DataComparavelV3, b: DataComparavelV3): number {
  if (a.precisao === "dia" || b.precisao === "dia") return a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0;
  const ta = Date.parse(a.iso);
  const tb = Date.parse(b.iso);
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/** Fato no futuro? Só-dia: depois de hoje na loja. Data/hora: depois de agora (+ folga). */
export function dataFuturaV3(d: DataComparavelV3, agora: Date = new Date(), tz?: string): boolean {
  if (d.precisao === "dia") return d.dia > hojeNaLojaV3(agora, tz);
  return Date.parse(d.iso) > agora.getTime() + TOLERANCIA_RELOGIO_MS_V3;
}

/**
 * FATO aceito dentro da folga do relógio (até 5 min "à frente", ex.: o minuto
 * atual digitado num navegador adiantado) é GRAVADO no horário do servidor:
 * nenhum fato fica no futuro. Só-dia e fatos no passado ficam como estão.
 */
export function limitarFatoAoAgoraV3<T extends { iso: string; meta: DataOperacionalMetaV3 | null }>(d: T, agora: Date = new Date(), tz?: string): T {
  if (d.meta?.precisao === "dia") return d;
  const t = Date.parse(d.iso);
  if (!Number.isFinite(t) || t <= agora.getTime()) return d;
  const iso = agora.toISOString();
  return { ...d, iso, meta: d.meta ? { precisao: "data_hora", dia: diaNaLojaV3(iso, tz) } : null };
}

/** Previsão já passou? Só-dia: antes de hoje. Data/hora: antes de agora. */
export function previsaoVencidaV3(d: DataComparavelV3 | null | undefined, agora: Date = new Date(), tz?: string): boolean {
  if (!d) return false;
  if (d.precisao === "dia") return d.dia < hojeNaLojaV3(agora, tz);
  return Date.parse(d.iso) < agora.getTime();
}

/**
 * A data efetiva é anterior ao registro? Só-dia: dia antes de hoje. Data/hora:
 * mais de 5 min antes de agora (o "agora" do formulário, truncado ao minuto, não conta).
 */
export function dataRetroativaV3(d: DataComparavelV3 | null | undefined, agora: Date = new Date(), tz?: string): boolean {
  if (!d) return false;
  if (d.precisao === "dia") return d.dia < hojeNaLojaV3(agora, tz);
  return agora.getTime() - Date.parse(d.iso) > TOLERANCIA_RELOGIO_MS_V3;
}

/** Dias civis entre a data e hoje na loja (0 = hoje; positivo = passado). */
export function diasAtrasV3(d: DataComparavelV3 | null | undefined, agora: Date = new Date(), tz?: string): number {
  if (!d?.dia) return 0;
  return diasEntreCivisV3(d.dia, hojeNaLojaV3(agora, tz));
}

// ----------------------------------------------------------------------------
// Regras de validação (mesmas no formulário e no servidor)
// ----------------------------------------------------------------------------

export interface ErroCampoDataV3 {
  /** Chave estável do campo (`dataEntrada`, `previsaoEntrega`, `dataEntrega`…). */
  campo: string;
  mensagem: string;
}

/** Fato (entrada, atendimento, proposta, entrega) não pode estar no futuro. */
export function erroFatoFuturoV3(campo: string, rotulo: string, d: DataComparavelV3 | null, agora: Date, tz?: string): ErroCampoDataV3 | null {
  if (!d || !dataFuturaV3(d, agora, tz)) return null;
  return { campo, mensagem: `${rotulo} não pode ficar no futuro. Use a data em que isso realmente aconteceu.` };
}

/** `depois` não pode ser anterior a `antes` (respeitando a precisão de cada uma). */
export function erroOrdemV3(
  campo: string,
  rotulo: string,
  depois: DataComparavelV3 | null,
  rotuloAntes: string,
  antes: DataComparavelV3 | null,
  tz?: string,
): ErroCampoDataV3 | null {
  if (!depois || !antes) return null;
  if (compararDatasOperacionaisV3(depois, antes) >= 0) return null;
  return { campo, mensagem: `${rotulo} não pode ser anterior à ${rotuloAntes} (${formatarDataOperacionalV3(antes, tz)}).` };
}

export const ROTULO_DATA_ENTRADA_V3 = "Data de entrada do aparelho";
export const ROTULO_PREVISAO_ENTREGA_V3 = "Previsão de entrega";
export const ROTULO_DATA_ENTREGA_V3 = "Data da entrega";
export const ROTULO_DATA_ATENDIMENTO_V3 = "Data do atendimento";
export const ROTULO_DATA_ORCAMENTO_V3 = "Data do orçamento";
export const ROTULO_VALIDO_ATE_V3 = "Válido até";

/** Entrada + previsão (Nova OS, conversão de orçamento, recepção). */
export function validarDatasRecepcaoV3(
  p: { entrada: DataComparavelV3 | null; previsao: DataComparavelV3 | null; entradaObrigatoria: boolean },
  agora: Date = new Date(),
  tz?: string,
): ErroCampoDataV3[] {
  const erros: ErroCampoDataV3[] = [];
  if (!p.entrada && p.entradaObrigatoria) {
    erros.push({ campo: "dataEntrada", mensagem: `Informe a ${ROTULO_DATA_ENTRADA_V3.toLowerCase()}.` });
  }
  const futura = erroFatoFuturoV3("dataEntrada", ROTULO_DATA_ENTRADA_V3, p.entrada, agora, tz);
  if (futura) erros.push(futura);
  const ordem = erroOrdemV3("previsaoEntrega", ROTULO_PREVISAO_ENTREGA_V3, p.previsao, "entrada do aparelho", p.entrada, tz);
  if (ordem) erros.push(ordem);
  return erros;
}

/** Entrada + conclusão do atendimento rápido (ambas fatos; conclusão ≥ entrada). */
export function validarDatasAtendimentoV3(
  p: { entrada: DataComparavelV3 | null; conclusao: DataComparavelV3 | null },
  agora: Date = new Date(),
  tz?: string,
): ErroCampoDataV3[] {
  const erros: ErroCampoDataV3[] = [];
  if (!p.entrada) erros.push({ campo: "dataEntrada", mensagem: "Informe a data de entrada do atendimento." });
  if (!p.conclusao) erros.push({ campo: "dataConclusao", mensagem: "Informe a data de saída do atendimento." });
  const f1 = erroFatoFuturoV3("dataEntrada", "A entrada do atendimento", p.entrada, agora, tz);
  if (f1) erros.push(f1);
  const f2 = erroFatoFuturoV3("dataConclusao", "A saída do atendimento", p.conclusao, agora, tz);
  if (f2) erros.push(f2);
  const ordem = erroOrdemV3("dataConclusao", "A saída do atendimento", p.conclusao, "entrada", p.entrada, tz);
  if (ordem) erros.push(ordem);
  return erros;
}

/** Entrega efetiva: fato, nunca antes da entrada (igual à entrada é válido). */
export function validarDataEntregaV3(
  p: { entrega: DataComparavelV3 | null; entrada: DataComparavelV3 | null },
  agora: Date = new Date(),
  tz?: string,
): ErroCampoDataV3[] {
  const erros: ErroCampoDataV3[] = [];
  if (!p.entrega) {
    erros.push({ campo: "dataEntrega", mensagem: `Informe a ${ROTULO_DATA_ENTREGA_V3.toLowerCase()}.` });
    return erros;
  }
  const futura = erroFatoFuturoV3("dataEntrega", ROTULO_DATA_ENTREGA_V3, p.entrega, agora, tz);
  if (futura) erros.push(futura);
  const ordem = erroOrdemV3("dataEntrega", ROTULO_DATA_ENTREGA_V3, p.entrega, "entrada do aparelho", p.entrada, tz);
  if (ordem) erros.push(ordem);
  return erros;
}

/** Data da proposta (fato) + validade (dia ≥ proposta; vencida é aceita e avisada). */
export function validarDatasPropostaV3(
  p: { proposta: DataComparavelV3 | null; validoAteDia: string },
  agora: Date = new Date(),
  tz?: string,
): ErroCampoDataV3[] {
  const erros: ErroCampoDataV3[] = [];
  if (!p.proposta) erros.push({ campo: "dataProposta", mensagem: `Informe a ${ROTULO_DATA_ORCAMENTO_V3.toLowerCase()}.` });
  const futura = erroFatoFuturoV3("dataProposta", ROTULO_DATA_ORCAMENTO_V3, p.proposta, agora, tz);
  if (futura) erros.push(futura);
  const validade = (p.validoAteDia ?? "").trim();
  if (!validade) {
    erros.push({ campo: "validoAte", mensagem: "Informe até quando a proposta é válida." });
  } else if (!diaCivilValidoV3(validade)) {
    erros.push({ campo: "validoAte", mensagem: "Validade inválida. Use um dia real do calendário." });
  } else if (p.proposta && validade < p.proposta.dia) {
    erros.push({ campo: "validoAte", mensagem: `A validade não pode ser anterior à data do orçamento (${formatarVencimentoV3(p.proposta.dia)}).` });
  }
  return erros;
}

/** Validade já passou? (dia da validade antes de hoje na loja). */
export function validadeVencidaV3(validoAteDia: string, agora: Date = new Date(), tz?: string): boolean {
  return diaCivilValidoV3(validoAteDia) && validoAteDia < hojeNaLojaV3(agora, tz);
}

// ----------------------------------------------------------------------------
// Leitura canônica das datas de uma OS (payload JSONB) — com fallback legado
// ----------------------------------------------------------------------------
//
// Precedência (documentada e testada):
//   entrada  : aberturaV3.recepcao.dataEntrada (+ dataEntradaMeta). Orçamento
//              pré-OS antigo sem metadata NÃO conta como entrada (era preenchido
//              automaticamente). Sem entrada → só o cadastro (`criadoEm`).
//   previsão : aberturaV3.recepcao.previsaoEntrega (+ meta) = combinada.
//              `sla.prazo` sem previsão = prazo INTERNO (automático ou SLA legado).
//   entrega  : entregaV3.entregueEm > entregueEm > retirada.retiradoEm, com a
//              metadata de entregaV3.entregueEmMeta ou atendimentoRapidoV3.concluidoEmMeta.
//   proposta : comercialV4.dataProposta (+ meta). Validade: orcamento.validoAte.

type Solto = Record<string, unknown>;

function obj(v: unknown): Solto | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Solto) : null;
}

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type OrigemPrazoInternoV3 = "automatico" | "sla";

export interface DatasOSV3 {
  /** Entrada efetiva registrada (informada ou legado). `null` = não registrada. */
  entrada: DataOperacionalLidaV3 | null;
  /** Para exibição: a entrada, ou o cadastro marcado como `origem: "cadastro"`. */
  entradaOuCadastro: DataOperacionalLidaV3 | null;
  /** Momento real do cadastro da OS (servidor). */
  cadastroEm: string;
  /** Orçamento sem o aparelho na loja (sem entrada física). */
  semEntradaFisica: boolean;
  /** Previsão de entrega combinada (informada). */
  previsao: DataOperacionalLidaV3 | null;
  /** Prazo interno (nunca exibido como previsão combinada). */
  prazoInterno: { data: DataOperacionalLidaV3; origem: OrigemPrazoInternoV3 } | null;
  /** Entrega/saída efetiva. */
  entrega: DataOperacionalLidaV3 | null;
  /** Momento real em que a entrega foi registrada (servidor), quando conhecido. */
  entregaRegistradaEm: string;
  /** Data do orçamento (proposta). */
  proposta: DataOperacionalLidaV3 | null;
  /** Validade da proposta (`orcamento.validoAte`, ISO) ou "". */
  validoAte: string;
}

export function lerDatasOSV3(os: unknown, tz?: string): DatasOSV3 {
  const o = obj(os) ?? {};
  const abertura = obj(o.aberturaV3);
  const recepcao = obj(abertura?.recepcao) ?? {};
  const comercial = obj(o.comercialV4);
  const preOs = comercial?.tipo === "orcamento_pre_os";
  const cadastroEm = txt(o.criadoEm);

  const entradaBruta = lerDataOperacionalV3(recepcao.dataEntrada, recepcao.dataEntradaMeta, tz);
  // Orçamento pré-OS antigo: a "entrada" era carimbada automaticamente na criação.
  const entrada = entradaBruta && !(preOs && entradaBruta.origem === "legado") ? entradaBruta : null;
  const cadastro = lerDataOperacionalV3(cadastroEm, undefined, tz);
  const entradaOuCadastro = entrada ?? (cadastro ? { ...cadastro, origem: "cadastro" as const } : null);

  const previsao = lerDataOperacionalV3(recepcao.previsaoEntrega, recepcao.previsaoEntregaMeta, tz);
  const sla = obj(o.sla);
  const slaPrazo = lerDataOperacionalV3(sla?.prazo, undefined, tz);
  let prazoInterno: DatasOSV3["prazoInterno"] = null;
  // Espelho da previsão combinada (o próprio instante, ou o fim do dia civil de
  // uma previsão só-dia) não é prazo interno.
  const espelhoDaPrevisao =
    !!previsao && !!slaPrazo && (slaPrazo.iso === previsao.iso || (previsao.precisao === "dia" && slaPrazo.iso === fimDoDiaLojaIsoV3(previsao.dia, tz)));
  if (slaPrazo && !espelhoDaPrevisao) {
    const automatico = sla?.origemV3 === "automatico" || (!previsao && sla?.origemV3 === undefined && abertura?.versao === 1);
    prazoInterno = { data: slaPrazo, origem: automatico ? "automatico" : "sla" };
  }

  const entregaV3 = obj(o.entregaV3);
  const retirada = obj(o.retirada);
  const atendimento = obj(o.atendimentoRapidoV3);
  const entregaIso = txt(entregaV3?.entregueEm) || txt(o.entregueEm) || txt(retirada?.retiradoEm);
  const entregaMeta =
    entregaV3?.entregueEmMeta ?? (atendimento && txt(atendimento.concluidoEm) === entregaIso ? atendimento.concluidoEmMeta : undefined);
  const entrega = lerDataOperacionalV3(entregaIso, entregaMeta, tz);
  const entregaRegistradaEm = txt(entregaV3?.registradoEm) || txt(atendimento?.registradoEm);

  const proposta = comercial ? lerDataOperacionalV3(comercial.dataProposta, comercial.dataPropostaMeta, tz) : null;
  const orcamento = obj(o.orcamento);
  const validoAte = orcamento && orcamento.sintetizado !== true && dataValida(orcamento.validoAte) ? txt(orcamento.validoAte) : "";

  return {
    entrada,
    entradaOuCadastro,
    cadastroEm,
    semEntradaFisica: preOs && !entrada,
    previsao,
    prazoInterno,
    entrega,
    entregaRegistradaEm,
    proposta,
    validoAte,
  };
}

/** Rótulo honesto para a data de entrada exibida ("Entrada" ou "Cadastro"). */
export function rotuloEntradaV3(d: DataOperacionalLidaV3 | null | undefined): string {
  return d?.origem === "cadastro" ? "Cadastro" : "Entrada";
}
