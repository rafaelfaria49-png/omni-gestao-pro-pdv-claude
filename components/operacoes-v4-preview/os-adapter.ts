/**
 * Operações V4 Preview — adaptador READ-ONLY de OS real → view-models da V4.
 *
 * Recebe uma `OrdemServico` real (de `@/types/os`, carregada por `getOrdem` /
 * `listOrdens`) e produz os objetos que os componentes da V4 já consomem
 * (`os`, `pag`, eventos de histórico, checklist). Puro, sem efeitos colaterais.
 *
 * Princípio (GOAL OPS-V4-P0-002..005): **vazio honesto**. Onde não há dado real,
 * mostramos `NI` ("Não informado") em vez de inventar valor. Nada de mock novo.
 */
import type {
  OrdemServico,
  OSStatus,
  EventoTimeline,
  EventoTipo,
  ChecklistItem,
  Anexo,
  AnexoTipo,
  ObservacaoTecnica,
  Orcamento,
  PecaUsada,
  Servico,
  OrcamentoStatus,
} from "@/types/os";
import type { V4Status, V4Stage } from "./types";
import { C, fmt } from "./tokens";

export const NI = "Não informado";

const ORIGEM_LABEL: Record<string, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  site: "Site",
  telefone: "Telefone",
  email: "E-mail",
  balcao: "Balcão",
};

const SENHA_TIPO_LABEL: Record<string, string> = {
  numerica: "PIN",
  texto: "senha",
  padrao: "padrão",
};

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Data/hora curta "dd/mm HH:MM" a partir de ISO; vazio honesto se inválida. */
function fmtDataHora(iso?: string | null): string {
  const s = txt(iso);
  if (!s) return NI;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return NI;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

/** Data curta "dd/mm/aaaa". */
export function fmtData(iso?: string | null): string {
  const s = txt(iso);
  if (!s) return NI;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return NI;
  return d.toLocaleDateString("pt-BR");
}

/** Iniciais do nome para o avatar (até 2 letras). */
export function iniciais(nome: string): string {
  const parts = txt(nome).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Status real (OSStatus) → V4Status. Os conjuntos coincidem 1:1; guard defensivo. */
export function realStatusToV4(status: OSStatus | string | undefined): V4Status {
  const valid: V4Status[] = [
    "aberta",
    "diagnostico",
    "aguardando_aprovacao",
    "aprovado",
    "aguardando_peca",
    "em_execucao",
    "pronta",
    "entregue",
    "cancelada",
  ];
  return valid.includes(status as V4Status) ? (status as V4Status) : "aberta";
}

/** Estágio inicial do pipeline V4 sugerido a partir do status real da OS. */
export function stageForStatus(status: OSStatus | string | undefined): V4Stage {
  switch (status) {
    case "aberta":
      return "entrada";
    case "diagnostico":
      return "diagnostico";
    case "aguardando_aprovacao":
    case "aprovado":
      return "orcamento";
    case "em_execucao":
    case "aguardando_peca":
      return "execucao";
    case "pronta":
    case "entregue":
      return "entrega";
    case "cancelada":
      return "historico";
    default:
      return "entrada";
  }
}

/** Prioridade real (baixa|media|alta|critica) → prioridade da V4 (baixa|normal|alta|urgente). */
export function realPrioridadeToV4(p: string | undefined): "baixa" | "normal" | "alta" | "urgente" {
  switch (p) {
    case "baixa":
      return "baixa";
    case "media":
      return "normal";
    case "alta":
      return "alta";
    case "critica":
      return "urgente";
    default:
      return "normal";
  }
}

/** Label curto de aparelho: "Marca Modelo" (ou tipo, ou NI). */
export function aparelhoLabel(os: OrdemServico): string {
  const eq = os.equipamento;
  if (!eq) return NI;
  const marcaModelo = [txt(eq.marca), txt(eq.modelo)].filter(Boolean).join(" ");
  return marcaModelo || txt(eq.tipo) || NI;
}

export interface V4OsView {
  codigo: string;
  cliente: string;
  avatarInitials: string;
  documento: string;
  telefone: string;
  email: string;
  aparelho: string;
  tipo: string;
  cor: string;
  serieCurta: string;
  imei: string;
  serial: string;
  operadora: string;
  senha: string;
  senhaTipo: string;
  acessorios: string;
  origem: string;
  recebidoPor: string;
  contaGoogle: string;
  contaApple: string;
  defeito: string;
  entrada: string;
  previsao: string;
  tecnico: string;
  sla: string;
  localizacao: string;
  garantiaPrazo: string;
}

const SLA_LABEL: Record<string, string> = {
  ok: "No prazo",
  atencao: "Atenção",
  estourado: "Estourado",
};

/** Total real da OS, na melhor fonte disponível. */
export function osTotalNumero(os: OrdemServico): number {
  const cand = [os.orcamento?.total, os.faturamentoTotal, os.prismaValorTotal];
  for (const v of cand) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

export function adaptOsHeader(os: OrdemServico): V4OsView {
  const eq = os.equipamento;
  const acessorios = Array.isArray(eq?.acessorios) ? eq!.acessorios.filter(Boolean) : [];
  const imei = txt(eq?.numeroSerie);
  const senha = txt(os.senhaEquipamento);
  const senhaTipo = txt(os.senhaEquipamentoTipo);
  const prazoGar =
    os.garantiasOperacionais?.[0]?.prazoDias ?? (os.garantia?.ativa ? os.garantia?.prazoDias : undefined);

  return {
    codigo: txt(os.codigo) || NI,
    cliente: txt(os.cliente?.nome) || NI,
    avatarInitials: iniciais(os.cliente?.nome ?? ""),
    documento: txt(os.cliente?.documento) || NI,
    telefone: txt(os.cliente?.telefone) || txt(os.cliente?.whatsapp) || NI,
    email: txt(os.cliente?.email) || NI,
    aparelho: aparelhoLabel(os),
    tipo: txt(eq?.tipo) || NI,
    cor: NI,
    serieCurta: imei || NI,
    imei: imei || NI,
    serial: NI,
    operadora: NI,
    senha: senha ? (senhaTipo ? `${senha} (${SENHA_TIPO_LABEL[senhaTipo] ?? senhaTipo})` : senha) : NI,
    senhaTipo,
    acessorios: acessorios.length ? acessorios.join(", ") : NI,
    origem: ORIGEM_LABEL[txt(os.origem)] ?? (txt(os.origem) || NI),
    recebidoPor: NI,
    contaGoogle: NI,
    contaApple: NI,
    defeito: txt(eq?.defeitoRelatado) || txt(os.observacaoCliente) || NI,
    entrada: fmtDataHora(os.criadoEm),
    previsao: os.sla?.prazo ? fmtDataHora(os.sla.prazo) : NI,
    tecnico: txt(os.tecnico?.nome) || NI,
    sla: os.sla?.status ? (SLA_LABEL[os.sla.status] ?? os.sla.status) : NI,
    localizacao: NI,
    garantiaPrazo: typeof prazoGar === "number" && prazoGar > 0 ? `${prazoGar} dias` : NI,
  };
}

export interface V4PagView {
  total: string;
  recebido: string;
  saldo: string;
  statusPagamento: string;
  ultimaForma: string;
  previsto: string;
}

export function adaptPag(os: OrdemServico): V4PagView {
  const total = osTotalNumero(os);
  const statusPag =
    os.faturamentoStatus === "cancelado"
      ? "Faturamento cancelado"
      : os.faturamentoPendente
        ? "Faturamento pendente"
        : NI;
  return {
    total: total > 0 ? fmt(total) : NI,
    recebido: NI,
    saldo: NI,
    statusPagamento: statusPag,
    ultimaForma: txt(os.faturamentoFormaPagamento) || NI,
    previsto: NI,
  };
}

/** View de identidade vazia (nenhuma OS selecionada) — tudo honesto. */
export const EMPTY_OS_VIEW: V4OsView = {
  codigo: NI,
  cliente: NI,
  avatarInitials: "—",
  documento: NI,
  telefone: NI,
  email: NI,
  aparelho: NI,
  tipo: NI,
  cor: NI,
  serieCurta: NI,
  imei: NI,
  serial: NI,
  operadora: NI,
  senha: NI,
  senhaTipo: "",
  acessorios: NI,
  origem: NI,
  recebidoPor: NI,
  contaGoogle: NI,
  contaApple: NI,
  defeito: NI,
  entrada: NI,
  previsao: NI,
  tecnico: NI,
  sla: NI,
  localizacao: NI,
  garantiaPrazo: NI,
};

export const EMPTY_PAG_VIEW: V4PagView = {
  total: NI,
  recebido: NI,
  saldo: NI,
  statusPagamento: NI,
  ultimaForma: NI,
  previsto: NI,
};

// ---- Financeiro da OS (GOAL OPS-V4-P0-008) ---------------------------------
// A V4 Preview NÃO lê a baixa real (PDV / Caixa / Conta a Receber). Só expõe o
// que a própria OS carrega: total, status do faturamento, forma/modo de cobrança
// e o plano de parcelas. "Recebido"/"saldo pago" não têm fonte na OS → vazio
// honesto. Nada de valor inventado.

const MODO_COBRANCA_LABEL: Record<string, string> = {
  avista: "À vista",
  parcelado: "Parcelado",
  carteira: "Carteira / crediário",
  dinheiro_pix_cartao: "Dinheiro / PIX / cartão",
};

export interface V4ParcelaView {
  numero: string;
  valor: string;
  vencimento: string;
}

export interface V4FinanceiroView {
  /** true quando existe qualquer informação financeira real na OS. */
  temDados: boolean;
  temTotal: boolean;
  total: string;
  /** "Faturamento pendente" / "Faturamento cancelado" / "Não informado". */
  statusFaturamento: string;
  statusTone: "pendente" | "cancelado" | "neutro";
  formaPagamento: string;
  modoCobranca: string;
  parcelas: V4ParcelaView[];
}

export const EMPTY_FINANCEIRO_VIEW: V4FinanceiroView = {
  temDados: false,
  temTotal: false,
  total: NI,
  statusFaturamento: NI,
  statusTone: "neutro",
  formaPagamento: NI,
  modoCobranca: NI,
  parcelas: [],
};

export function adaptFinanceiro(os: OrdemServico): V4FinanceiroView {
  const totalNum = osTotalNumero(os);
  const temTotal = totalNum > 0;
  const forma = txt(os.faturamentoFormaPagamento);
  const modo = txt(os.faturamentoModoCobranca);
  const parcelasRaw = Array.isArray(os.faturamentoParcelas) ? os.faturamentoParcelas : [];
  const parcelas = parcelasRaw
    .filter((p) => p && typeof p.valor === "number")
    .map((p) => ({
      numero: `${p.numero}ª`,
      valor: fmt(p.valor),
      vencimento: fmtData(p.vencimentoIso),
    }));
  const statusTone: V4FinanceiroView["statusTone"] =
    os.faturamentoStatus === "cancelado"
      ? "cancelado"
      : os.faturamentoPendente || os.faturamentoStatus === "pendente"
        ? "pendente"
        : "neutro";
  const statusFaturamento =
    statusTone === "cancelado"
      ? "Faturamento cancelado"
      : statusTone === "pendente"
        ? "Faturamento pendente"
        : NI;
  return {
    temDados: temTotal || !!forma || !!modo || parcelas.length > 0 || statusTone !== "neutro",
    temTotal,
    total: temTotal ? fmt(totalNum) : NI,
    statusFaturamento,
    statusTone,
    formaPagamento: forma || NI,
    modoCobranca: modo ? (MODO_COBRANCA_LABEL[modo] ?? modo) : NI,
    parcelas,
  };
}

// ---- Histórico / timeline (GOAL OPS-V4-P0-004) -----------------------------

export interface V4HistEvento {
  id: string;
  /** Categoria do filtro da V4: status | financeiro | comunicacao | tecnico. */
  type: "status" | "financeiro" | "comunicacao" | "tecnico";
  text: string;
  meta: string;
  /** Cor do marcador na timeline (derivada da categoria). */
  dot: string;
}

/** Mapeia o tipo do evento real para a categoria de filtro da V4. */
function eventoCategoria(tipo: string): V4HistEvento["type"] {
  if (tipo.startsWith("financeiro") || tipo.startsWith("faturamento") || tipo.startsWith("operacao_cobranca"))
    return "financeiro";
  if (tipo === "mensagem_cliente" || tipo === "mensagem_interna") return "comunicacao";
  if (tipo === "mudanca_status" || tipo === "criacao" || tipo === "os_cancelada") return "status";
  return "tecnico";
}

const CATEGORIA_DOT: Record<V4HistEvento["type"], string> = {
  status: C.primary,
  financeiro: C.success,
  comunicacao: C.warn,
  tecnico: C.info,
};

export function adaptTimeline(os: OrdemServico): V4HistEvento[] {
  const tl = Array.isArray(os.timeline) ? os.timeline : [];
  return tl
    .slice()
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .map((ev: EventoTimeline) => {
      const type = eventoCategoria(ev.tipo);
      return {
        id: ev.id,
        type,
        text: txt(ev.titulo) || txt(ev.conteudo) || ev.tipo,
        meta: `${txt(ev.autor) || "Sistema"} · ${fmtDataHora(ev.criadoEm)}`,
        dot: CATEGORIA_DOT[type],
      };
    });
}

const ANEXO_KIND_LABEL: Record<string, string> = {
  foto_antes: "ANTES",
  foto_depois: "DEPOIS",
  foto_defeito: "DEFEITO",
  video: "VÍDEO",
  audio: "ÁUDIO",
  laudo: "LAUDO",
  nota: "NOTA",
  comprovante: "COMPROV.",
  documento_tecnico: "DOC",
  outro: "ANEXO",
};

export interface V4Anexo {
  id: string;
  kind: string;
  name: string;
}

export function adaptAnexos(os: OrdemServico): V4Anexo[] {
  const lista = Array.isArray(os.anexos) ? os.anexos : [];
  return lista.map((a: Anexo) => ({
    id: a.id,
    kind: ANEXO_KIND_LABEL[a.tipo] ?? "ANEXO",
    name: txt(a.nome) || "Anexo",
  }));
}

export interface V4Observacao {
  id: string;
  autor: string;
  conteudo: string;
  interna: boolean;
}

export function adaptObservacoes(os: OrdemServico): V4Observacao[] {
  const lista = Array.isArray(os.observacoes) ? os.observacoes : [];
  return lista.map((o: ObservacaoTecnica) => ({
    id: o.id,
    autor: txt(o.autor) || "—",
    conteudo: txt(o.conteudo),
    interna: !!o.interna,
  }));
}

// ---- Checklist de entrada (GOAL OPS-V4-P0-005) -----------------------------

export interface V4ChecklistItem {
  id: string;
  label: string;
  /** Estado real do checklist da OS. */
  estado: "ok" | "ruim" | "nao_testado";
  observacao: string;
}

export function adaptChecklist(os: OrdemServico): V4ChecklistItem[] {
  const cl = Array.isArray(os.checklist) ? os.checklist : [];
  return cl.map((it: ChecklistItem) => ({
    id: it.id,
    label: txt(it.label),
    estado: it.estado,
    observacao: txt(it.observacao),
  }));
}

// ---- Entrada: acessórios / fotos / segurança (GOAL OPS-V4-P0-006) ----------

/** Acessórios recebidos (limpos) do equipamento da OS; lista vazia = honesto. */
export function adaptAcessoriosEntrada(os: OrdemServico): string[] {
  const lista = Array.isArray(os.equipamento?.acessorios) ? os.equipamento!.acessorios! : [];
  return lista.map((a) => txt(a)).filter(Boolean);
}

/** Anexos considerados "fotos de entrada" (registrados na recepção do aparelho). */
const FOTO_ENTRADA_TIPOS: AnexoTipo[] = ["foto_antes", "foto_defeito"];

export interface V4FotoEntrada {
  id: string;
  /** Etiqueta curta derivada do tipo do anexo (ANTES / DEFEITO). */
  tag: string;
  name: string;
}

/** Fotos de entrada reais (anexos antes/defeito da OS); lista vazia = honesto. */
export function adaptFotosEntrada(os: OrdemServico): V4FotoEntrada[] {
  const lista = Array.isArray(os.anexos) ? os.anexos : [];
  return lista
    .filter((a: Anexo) => FOTO_ENTRADA_TIPOS.includes(a.tipo))
    .map((a: Anexo) => ({
      id: a.id,
      tag: ANEXO_KIND_LABEL[a.tipo] ?? "FOTO",
      name: txt(a.nome) || "Foto",
    }));
}

export interface V4SegurancaEntrada {
  /** true quando há credencial real registrada na OS. */
  temCredencial: boolean;
  /** PIN / senha / padrão (ou "Não informado"). */
  tipoLabel: string;
  /** Valor real da credencial (vazio quando ausente). */
  valor: string;
}

export const EMPTY_SEGURANCA_ENTRADA: V4SegurancaEntrada = {
  temCredencial: false,
  tipoLabel: NI,
  valor: "",
};

/** Segurança / acesso real: senha do equipamento + tipo; vazio honesto. */
export function adaptSegurancaEntrada(os: OrdemServico): V4SegurancaEntrada {
  const valor = txt(os.senhaEquipamento);
  const tipo = txt(os.senhaEquipamentoTipo);
  return {
    temCredencial: !!valor,
    tipoLabel: tipo ? (SENHA_TIPO_LABEL[tipo] ?? tipo) : NI,
    valor,
  };
}

// ---- Diagnóstico (GOAL OPS-V4-P0-009) --------------------------------------
// Read-only: o stage Diagnóstico passa a ler só o que a OS persiste — defeito
// relatado, observações técnicas (parecer), anexos/laudos de diagnóstico e
// eventos de diagnóstico na timeline. Sem laudo/técnico/data fabricados.

/** Eventos da timeline considerados "registro de diagnóstico". */
const DIAG_EVENTO_TIPOS = new Set<string>(["diagnostico_registrado"]);
/** Tipos de anexo considerados de diagnóstico (laudo / foto do defeito). */
const DIAG_ANEXO_TIPOS = new Set<AnexoTipo>(["laudo", "foto_defeito"]);

export interface V4DiagnosticoView {
  defeito: string;
  temDefeito: boolean;
  observacoes: V4Observacao[];
  anexos: V4Anexo[];
  eventos: V4HistEvento[];
  /** true quando há QUALQUER trabalho de diagnóstico real (parecer/anexo/evento). */
  temDiagnostico: boolean;
}

export const EMPTY_DIAGNOSTICO_VIEW: V4DiagnosticoView = {
  defeito: NI,
  temDefeito: false,
  observacoes: [],
  anexos: [],
  eventos: [],
  temDiagnostico: false,
};

export function adaptDiagnostico(os: OrdemServico): V4DiagnosticoView {
  const defeito = txt(os.equipamento?.defeitoRelatado) || txt(os.observacaoCliente);
  const observacoes = adaptObservacoes(os);

  const anexosLista = Array.isArray(os.anexos) ? os.anexos : [];
  const anexos = anexosLista
    .filter((a: Anexo) => a.categoria === "diagnostico" || DIAG_ANEXO_TIPOS.has(a.tipo))
    .map((a: Anexo) => ({
      id: a.id,
      kind: ANEXO_KIND_LABEL[a.tipo] ?? "ANEXO",
      name: txt(a.nome) || "Anexo",
    }));

  const tl = Array.isArray(os.timeline) ? os.timeline : [];
  const eventos = tl
    .filter((ev: EventoTimeline) => DIAG_EVENTO_TIPOS.has(ev.tipo))
    .slice()
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .map((ev: EventoTimeline): V4HistEvento => ({
      id: ev.id,
      type: "tecnico",
      text: txt(ev.titulo) || txt(ev.conteudo) || ev.tipo,
      meta: `${txt(ev.autor) || "Sistema"} · ${fmtDataHora(ev.criadoEm)}`,
      dot: C.info,
    }));

  return {
    defeito: defeito || NI,
    temDefeito: !!defeito,
    observacoes,
    anexos,
    eventos,
    temDiagnostico: observacoes.length > 0 || anexos.length > 0 || eventos.length > 0,
  };
}

// ---- Orçamento (GOAL OPS-V4-P0-010) ----------------------------------------
// Read-only sobre a OS já carregada. O orçamento NÃO tem model Prisma próprio:
// chega em `os.orcamento` (payload), `itensPersistidos` (OrdemServicoItem) e
// `prismaValorTotal`. Três estados (Decisão 1): persistido (status enum real),
// previa (`sintetizado: true`, badge fixo "Prévia — não aprovado"), ausente.
// Custo/lucro só quando `custoUnitario` real existir (Decisão 2) — `Servico`
// não tem custo, logo só orçamentos 100% de peças com custo exibem o agregado.

export type V4OrcamentoEstado = "persistido" | "previa" | "ausente";

const ORC_STATUS_LABEL: Record<OrcamentoStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
};

const ORC_STATUS_TONE: Record<OrcamentoStatus, V4OrcamentoView["statusTone"]> = {
  rascunho: "neutro",
  enviado: "info",
  aprovado: "success",
  recusado: "danger",
  expirado: "warn",
};

export interface V4OrcItemView {
  id: string;
  descricao: string;
  /** Detalhe real curto (qtd × · garantia Nd); vazio quando não houver. */
  detalhe: string;
  /** Total da linha (qtd × unitário − desconto), formatado. */
  valor: string;
  /** Custo da linha — somente quando `custoUnitario` real existir; senão null. */
  custo: string | null;
}

export interface V4OrcamentoView {
  estado: V4OrcamentoEstado;
  isPrevia: boolean;
  statusLabel: string;
  statusTone: "success" | "info" | "warn" | "danger" | "neutro";
  servicos: V4OrcItemView[];
  pecas: V4OrcItemView[];
  /** Total ao cliente (fonte autoritativa: orcamento.total). */
  total: string;
  /** Soma de descontos de linha (R$); null quando 0. */
  desconto: string | null;
  /** Agregado de custo — só quando TODAS as linhas têm custo real; senão null. */
  custoTotal: string | null;
  /** Lucro = total − custoTotal; só quando custoTotal existir; senão null. */
  lucroTotal: string | null;
  /** Versões reais (revisões registradas na OS). */
  versoesCount: number;
  temVersoes: boolean;
}

export const EMPTY_ORCAMENTO_VIEW: V4OrcamentoView = {
  estado: "ausente",
  isPrevia: false,
  statusLabel: "",
  statusTone: "neutro",
  servicos: [],
  pecas: [],
  total: NI,
  desconto: null,
  custoTotal: null,
  lucroTotal: null,
  versoesCount: 0,
  temVersoes: false,
};

function servicoLineTotal(s: Servico): number {
  return Math.max(0, (s.valor || 0) - (s.desconto ?? 0));
}

function pecaLineTotal(p: PecaUsada): number {
  return Math.max(0, (p.quantidade || 0) * (p.valorUnitario || 0) - (p.desconto ?? 0));
}

export function adaptOrcamento(os: OrdemServico): V4OrcamentoView {
  const orc: Orcamento | undefined = os.orcamento;
  const servicosRaw = Array.isArray(orc?.servicos) ? orc!.servicos : [];
  const pecasRaw = Array.isArray(orc?.pecas) ? orc!.pecas : [];
  const declaredTotal = typeof orc?.total === "number" ? orc!.total : 0;
  const hasLines = servicosRaw.length > 0 || pecasRaw.length > 0;

  // Ausente: nenhum orçamento real nem prévia derivada com conteúdo.
  if (!orc || (!hasLines && declaredTotal <= 0)) {
    return EMPTY_ORCAMENTO_VIEW;
  }

  const isPrevia = orc.sintetizado === true;
  const estado: V4OrcamentoEstado = isPrevia ? "previa" : "persistido";

  const servicos: V4OrcItemView[] = servicosRaw.map((s, i) => ({
    id: txt(s.id) || `svc_${i}`,
    descricao: txt(s.descricao) || "Serviço",
    detalhe: typeof s.prazoGarantiaDias === "number" && s.prazoGarantiaDias > 0 ? `garantia ${s.prazoGarantiaDias}d` : "",
    valor: fmt(servicoLineTotal(s)),
    // Servico não tem custo no modelo → nunca exibe margem por linha.
    custo: null,
  }));

  const pecas: V4OrcItemView[] = pecasRaw.map((p, i) => {
    const det: string[] = [`${p.quantidade || 0}×`];
    if (typeof p.prazoGarantiaDias === "number" && p.prazoGarantiaDias > 0) det.push(`garantia ${p.prazoGarantiaDias}d`);
    const temCusto = typeof p.custoUnitario === "number";
    return {
      id: txt(p.id) || `peca_${i}`,
      descricao: txt(p.nome) || "Peça",
      detalhe: det.join(" · "),
      valor: fmt(pecaLineTotal(p)),
      custo: temCusto ? fmt((p.custoUnitario as number) * (p.quantidade || 0)) : null,
    };
  });

  // Desconto agregado (somente linhas com desconto real).
  const descNum =
    servicosRaw.reduce((a, s) => a + (s.desconto ?? 0), 0) +
    pecasRaw.reduce((a, p) => a + (p.desconto ?? 0), 0);

  // Total autoritativo: orcamento.total; cai para soma das linhas se ausente.
  const lineSum =
    servicosRaw.reduce((a, s) => a + servicoLineTotal(s), 0) +
    pecasRaw.reduce((a, p) => a + pecaLineTotal(p), 0);
  const totalNum = declaredTotal > 0 ? declaredTotal : lineSum;

  // Custo/lucro agregado: SÓ quando todas as linhas têm custo real (Decisão 2).
  // Como Servico não tem custo, basta haver 1 serviço para suprimir o agregado.
  const todasComCusto =
    hasLines && servicosRaw.length === 0 && pecasRaw.every((p) => typeof p.custoUnitario === "number");
  const custoNum = todasComCusto
    ? pecasRaw.reduce((a, p) => a + (p.custoUnitario as number) * (p.quantidade || 0), 0)
    : null;

  const versoesCount = Array.isArray(os.orcamentoHistorico) ? os.orcamentoHistorico.length : 0;

  return {
    estado,
    isPrevia,
    statusLabel: isPrevia ? "Prévia — não aprovado" : (ORC_STATUS_LABEL[orc.status] ?? orc.status ?? ""),
    statusTone: isPrevia ? "info" : (ORC_STATUS_TONE[orc.status] ?? "neutro"),
    servicos,
    pecas,
    total: totalNum > 0 ? fmt(totalNum) : NI,
    desconto: descNum > 0 ? fmt(descNum) : null,
    custoTotal: custoNum != null ? fmt(custoNum) : null,
    lucroTotal: custoNum != null ? fmt(totalNum - custoNum) : null,
    versoesCount,
    temVersoes: versoesCount > 0,
  };
}

// ---- Execução (GOAL OPS-V4-P0-011) -----------------------------------------
// Read-only sobre a OS já carregada. O stage Execução passa a ler só o que a OS
// persiste: técnico responsável, checklist técnico (pós-reparo, `checklistTecnico`),
// apontamentos reais (eventos de execução da timeline), peças consumidas
// (`estoqueMovimentos`) e anexos de bancada. Sem técnico/timer/apontamentos/
// bancada fabricados. Nada de valor inventado.

/** Eventos da timeline considerados "apontamento de execução / bancada". */
const EXEC_EVENTO_TIPOS = new Set<EventoTipo>([
  "servico_iniciado",
  "servico_concluido",
  "atribuicao_tecnico",
  "peca_adicionada",
  "estoque_consumido",
  "estoque_item_consumido",
  "estoque_restaurado",
  "checklist_finalizado",
]);

export interface V4ExecChecklistItem {
  id: string;
  label: string;
  ok: boolean;
}

export interface V4ExecEstoqueItem {
  id: string;
  nome: string;
  /** "2×" quando houver quantidade; vazio honesto caso contrário. */
  quantidade: string;
  /** "12 → 10" quando o saldo antes/depois existir; vazio honesto caso contrário. */
  saldo: string;
}

export interface V4ExecucaoView {
  /** true quando há QUALQUER sinal real de execução (técnico/checklist/apontamento/estoque/anexo). */
  temExecucao: boolean;
  tecnico: string;
  temTecnico: boolean;
  checklist: V4ExecChecklistItem[];
  checklistOk: number;
  apontamentos: V4HistEvento[];
  estoque: V4ExecEstoqueItem[];
  estoqueConsumido: boolean;
  /** Data/hora da baixa, "dd/mm HH:MM"; vazio quando ausente. */
  estoqueConsumidoEm: string;
  anexos: V4Anexo[];
}

export const EMPTY_EXECUCAO_VIEW: V4ExecucaoView = {
  temExecucao: false,
  tecnico: NI,
  temTecnico: false,
  checklist: [],
  checklistOk: 0,
  apontamentos: [],
  estoque: [],
  estoqueConsumido: false,
  estoqueConsumidoEm: "",
  anexos: [],
};

export function adaptExecucao(os: OrdemServico): V4ExecucaoView {
  const tecnicoNome = txt(os.tecnico?.nome);

  const checklistRaw = Array.isArray(os.checklistTecnico) ? os.checklistTecnico : [];
  const checklist: V4ExecChecklistItem[] = checklistRaw.map((it, i) => ({
    id: txt(it.id) || `chk_${i}`,
    label: txt(it.label),
    ok: !!it.ok,
  }));

  const tl = Array.isArray(os.timeline) ? os.timeline : [];
  const apontamentos = tl
    .filter((ev: EventoTimeline) => EXEC_EVENTO_TIPOS.has(ev.tipo))
    .slice()
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .map((ev: EventoTimeline): V4HistEvento => ({
      id: ev.id,
      type: "tecnico",
      text: txt(ev.titulo) || txt(ev.conteudo) || ev.tipo,
      meta: `${txt(ev.autor) || "Sistema"} · ${fmtDataHora(ev.criadoEm)}`,
      dot: C.info,
    }));

  const movRaw = Array.isArray(os.estoqueMovimentos) ? os.estoqueMovimentos : [];
  const estoque: V4ExecEstoqueItem[] = movRaw.map((m, i) => {
    const temSaldo = typeof m.estoqueAnterior === "number" && typeof m.estoqueDepois === "number";
    return {
      id: txt(m.id) || txt(m.produtoId) || `mov_${i}`,
      nome: txt(m.nome) || "Item",
      quantidade: typeof m.quantidade === "number" ? `${m.quantidade}×` : "",
      saldo: temSaldo ? `${m.estoqueAnterior} → ${m.estoqueDepois}` : "",
    };
  });

  const anexosLista = Array.isArray(os.anexos) ? os.anexos : [];
  const anexos: V4Anexo[] = anexosLista
    .filter((a: Anexo) => a.categoria === "bancada")
    .map((a: Anexo) => ({
      id: a.id,
      kind: ANEXO_KIND_LABEL[a.tipo] ?? "ANEXO",
      name: txt(a.nome) || "Anexo",
    }));

  return {
    temExecucao:
      !!tecnicoNome ||
      checklist.length > 0 ||
      apontamentos.length > 0 ||
      estoque.length > 0 ||
      anexos.length > 0,
    tecnico: tecnicoNome || NI,
    temTecnico: !!tecnicoNome,
    checklist,
    checklistOk: checklist.filter((c) => c.ok).length,
    apontamentos,
    estoque,
    estoqueConsumido: !!os.estoqueConsumido,
    estoqueConsumidoEm: os.estoqueConsumidoEm ? fmtDataHora(os.estoqueConsumidoEm) : "",
    anexos,
  };
}

// ---- Busca da lista de OS (GOAL OPS-V4-P0-002) -----------------------------

function norm(s: string): string {
  // Remove acentos (combining marks U+0300–U+036F) para busca tolerante.
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Casa a OS contra um termo de busca: Nº OS, Cliente, Aparelho, IMEI. */
export function osMatchesQuery(os: OrdemServico, query: string): boolean {
  const q = norm(query.trim());
  if (!q) return true;
  const campos = [
    txt(os.codigo),
    txt(os.cliente?.nome),
    txt(os.cliente?.documento),
    txt(os.cliente?.telefone),
    aparelhoLabel(os),
    txt(os.equipamento?.tipo),
    txt(os.equipamento?.numeroSerie), // IMEI / série
  ];
  return campos.some((c) => c && norm(c).includes(q));
}
