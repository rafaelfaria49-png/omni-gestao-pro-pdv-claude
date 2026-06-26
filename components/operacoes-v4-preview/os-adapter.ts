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
import type { OrdemServico, OSStatus, EventoTimeline, ChecklistItem } from "@/types/os";
import type { V4Status, V4Stage } from "./types";
import { fmt } from "./tokens";

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

// ---- Histórico / timeline (GOAL OPS-V4-P0-004) -----------------------------

export interface V4HistEvento {
  id: string;
  /** Categoria do filtro da V4: status | financeiro | comunicacao | tecnico. */
  type: "status" | "financeiro" | "comunicacao" | "tecnico";
  text: string;
  meta: string;
}

/** Mapeia o tipo do evento real para a categoria de filtro da V4. */
function eventoCategoria(tipo: string): V4HistEvento["type"] {
  if (tipo.startsWith("financeiro") || tipo.startsWith("faturamento") || tipo.startsWith("operacao_cobranca"))
    return "financeiro";
  if (tipo === "mensagem_cliente" || tipo === "mensagem_interna") return "comunicacao";
  if (tipo === "mudanca_status" || tipo === "criacao" || tipo === "os_cancelada") return "status";
  return "tecnico";
}

export function adaptTimeline(os: OrdemServico): V4HistEvento[] {
  const tl = Array.isArray(os.timeline) ? os.timeline : [];
  return tl
    .slice()
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .map((ev: EventoTimeline) => ({
      id: ev.id,
      type: eventoCategoria(ev.tipo),
      text: txt(ev.titulo) || txt(ev.conteudo) || ev.tipo,
      meta: `${txt(ev.autor) || "Sistema"} · ${fmtDataHora(ev.criadoEm)}`,
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
