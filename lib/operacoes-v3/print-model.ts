// ============================================================================
// Operações V3 — Fase 1D · MODELO de impressão da OS (puro, fonte do documento)
// ----------------------------------------------------------------------------
// Monta o documento imprimível da OS (via CLIENTE) a partir do que já existe.
// Módulo PURO (sem I/O, sem React). Regras críticas de privacidade:
//   • item interno (kind="interno") NÃO entra no documento do cliente.
//   • custo interno NUNCA entra no documento do cliente.
//   • observação interna (interna=true) NÃO entra no documento do cliente.
//   • brinde aparece como "Brinde" com valor R$ 0,00.
// ============================================================================

import type { ObservacaoTecnica, OrdemServico } from "@/types/os";
import { statusMetaV3, statusV3FromOS } from "./status-machine";
import {
  computeTotaisV3,
  linhaKind,
  orcamentoRealV3,
  pecaCusto,
  pecaValorCliente,
  servicoCusto,
  servicoValorCliente,
  type PecaV3,
  type ServicoV3,
} from "./orcamento-model";
import {
  lerChecklistEntradaV3,
  lerDiagnosticoV3,
  lerRecepcaoV3,
  lerSenhaAcessoriosV3,
  CHECKLIST_ESTADO_META_V3,
  type ChecklistEstadoV3,
  type DiagnosticoTecnicoV3,
  type RecepcaoV3,
} from "./workspace-model";
import { pagamentoFormaLabelV3, type NovaOSPagamentoFormaV3 } from "./nova-os-model";
import {
  gerarTermoGarantiaV3,
  sugerirGarantiaPorDescricaoV3,
  type GarantiaModeloIdV3,
  type TermoGarantiaV3,
} from "./garantia-textos";
import { lerEntregaV3 } from "./pos-venda-model";
import {
  ACESSORIOS_ENTRADA_V3,
  componenteFisicoLabelV3,
  credenciaisMascaradasV3,
  ESTADO_FISICO_STATUS_META_V3,
  lerProvaEntradaV3,
  provaEntradaCriadaV3,
  resumoEstadoFisicoV3,
  tipoAvariaLabelV3,
  type EstadoFisicoStatusV3,
  type IdentificacaoV3,
} from "./prova-entrada-model";

// ----------------------------------------------------------------------------
// Empresa (cabeçalho) — fallback honesto, centralizado
// ----------------------------------------------------------------------------

export interface EmpresaPrintInputV3 {
  nomeFantasia?: string;
  razaoSocial?: string;
  cnpj?: string;
  endereco?: { rua?: string; numero?: string; bairro?: string; cidade?: string; estado?: string; cep?: string };
  contato?: { telefone?: string; whatsapp?: string; email?: string };
  logoUrl?: string;
  responsavel?: string;
}

export interface EmpresaPrintV3 {
  nome: string;
  cnpj: string;
  endereco: string;
  cidadeUf: string;
  telefone: string;
  email: string;
  logoUrl: string;
  responsavel: string;
  /** true quando há ao menos um dado real de empresa (evita cabeçalho "fantasma"). */
  temDados: boolean;
}

const EMPRESA_FALLBACK_NOME = "Assistência Técnica";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function dadosEmpresaPrintV3(input?: EmpresaPrintInputV3): EmpresaPrintV3 {
  const e = input ?? {};
  const nome = s(e.nomeFantasia) || s(e.razaoSocial) || EMPRESA_FALLBACK_NOME;
  const cnpj = s(e.cnpj);
  const end = e.endereco ?? {};
  const ruaNum = [s(end.rua), s(end.numero)].filter(Boolean).join(", ");
  const endereco = [ruaNum, s(end.bairro)].filter(Boolean).join(" - ");
  const cidadeUf = [s(end.cidade), s(end.estado)].filter(Boolean).join("/") + (s(end.cep) ? ` · CEP ${s(end.cep)}` : "");
  const telefone = s(e.contato?.telefone) || s(e.contato?.whatsapp);
  const email = s(e.contato?.email);
  const temDados = !!(s(e.nomeFantasia) || s(e.razaoSocial) || cnpj || endereco || telefone || email);
  return {
    nome,
    cnpj,
    endereco,
    cidadeUf: cidadeUf.trim().replace(/^[/·\s]+|[/·\s]+$/g, ""),
    telefone,
    email,
    logoUrl: s(e.logoUrl),
    responsavel: s(e.responsavel),
    temDados,
  };
}

// ----------------------------------------------------------------------------
// Itens imprimíveis (oculta interno; nunca expõe custo)
// ----------------------------------------------------------------------------

export interface PrintItemV3 {
  descricao: string;
  categoria: "Serviço" | "Peça";
  qtd: number;
  valorUnitario: number;
  subtotal: number;
  brinde: boolean;
}

function fontePecas(os: OrdemServico): PecaV3[] {
  const orc = orcamentoRealV3(os);
  if (orc?.pecas?.length) return orc.pecas;
  return (os.pecas as PecaV3[] | undefined) ?? [];
}
function fonteServicos(os: OrdemServico): ServicoV3[] {
  const orc = orcamentoRealV3(os);
  return orc?.servicos ?? [];
}

/** Itens que aparecem ao cliente. Exclui kind="interno". Nunca inclui custo. */
export function itensImprimiveisV3(os: OrdemServico): PrintItemV3[] {
  const out: PrintItemV3[] = [];
  for (const sv of fonteServicos(os)) {
    const kind = linhaKind(sv);
    if (kind === "interno") continue;
    const valor = servicoValorCliente(sv); // 0 quando brinde
    out.push({
      descricao: sv.descricao || "Serviço",
      categoria: "Serviço",
      qtd: 1,
      valorUnitario: valor,
      subtotal: valor,
      brinde: kind === "brinde",
    });
  }
  for (const p of fontePecas(os)) {
    const kind = linhaKind(p);
    if (kind === "interno") continue;
    const qtd = Math.max(1, Math.trunc(p.quantidade || 1));
    const subtotal = pecaValorCliente(p); // 0 quando brinde
    out.push({
      descricao: p.nome || "Peça",
      categoria: "Peça",
      qtd,
      valorUnitario: kind === "cobrado" ? p.valorUnitario || 0 : 0,
      subtotal,
      brinde: kind === "brinde",
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Resumo financeiro (apenas previsão já salva — sem recebimento real)
// ----------------------------------------------------------------------------

export interface ResumoFinanceiroPrintV3 {
  subtotal: number;
  desconto: number;
  total: number;
  recebido?: number;
  saldo?: number;
  formaPagamento?: string;
  vencimento?: string;
  observacao?: string;
}

type PagamentoPrevisto = { forma?: unknown; vencimentoPrevisto?: unknown; observacao?: unknown; sinal?: unknown };

function lerPagamentoPrevisto(os: OrdemServico): PagamentoPrevisto {
  const p = (os as { aberturaV3?: { pagamentoPrevisto?: PagamentoPrevisto } }).aberturaV3?.pagamentoPrevisto;
  return p && typeof p === "object" ? p : {};
}

export function resumoFinanceiroImprimivelV3(os: OrdemServico): ResumoFinanceiroPrintV3 {
  const orc = orcamentoRealV3(os);
  const totais = orc
    ? computeTotaisV3({ servicos: orc.servicos, pecas: orc.pecas, desconto: orc.desconto })
    : (() => {
        const itens = itensImprimiveisV3(os);
        const subtotal = itens.reduce((acc, i) => acc + i.subtotal, 0);
        return { subtotal, desconto: 0, total: subtotal, custo: 0, lucro: 0 };
      })();

  const pag = lerPagamentoPrevisto(os);
  const sinal = typeof pag.sinal === "number" && pag.sinal > 0 ? pag.sinal : undefined;
  const forma = s(pag.forma);
  const vencimento = s(pag.vencimentoPrevisto);
  const observacao = s(pag.observacao);

  return {
    subtotal: totais.subtotal,
    desconto: totais.desconto,
    total: totais.total,
    recebido: sinal,
    saldo: sinal !== undefined ? Math.max(0, totais.total - sinal) : undefined,
    formaPagamento: forma ? pagamentoFormaLabelV3(forma as NovaOSPagamentoFormaV3) : undefined,
    vencimento: vencimento || undefined,
    observacao: observacao || undefined,
  };
}

// ----------------------------------------------------------------------------
// Checklist / senha imprimíveis
// ----------------------------------------------------------------------------

export interface ChecklistPrintItemV3 {
  label: string;
  estado: ChecklistEstadoV3;
  estadoLabel: string;
}

export function checklistImprimivelV3(os: OrdemServico): ChecklistPrintItemV3[] {
  return lerChecklistEntradaV3(os).map((i) => ({
    label: i.label,
    estado: i.estado,
    estadoLabel: CHECKLIST_ESTADO_META_V3[i.estado].label,
  }));
}

export interface SenhaPrintV3 {
  tipo: "numerica" | "texto" | "padrao";
  isPadrao: boolean;
  /** Valor textual (vazio quando padrão — o desenho é exibido na grade). */
  valor: string;
  /** Sequência 1..9 do desenho (apenas quando padrão). */
  sequencia: number[];
  temSenha: boolean;
}

export function senhaImprimivelV3(os: OrdemServico): SenhaPrintV3 {
  const sa = lerSenhaAcessoriosV3(os);
  if (sa.senhaTipo === "padrao") {
    const sequencia = sa.senha
      .split("-")
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 9);
    return { tipo: "padrao", isPadrao: true, valor: "", sequencia, temSenha: sequencia.length > 0 };
  }
  return { tipo: sa.senhaTipo, isPadrao: false, valor: sa.senha, sequencia: [], temSenha: !!sa.senha };
}

/** Observações visíveis ao cliente (exclui internas). */
export function observacoesClienteV3(os: OrdemServico): string[] {
  const obs = Array.isArray(os.observacoes) ? (os.observacoes as ObservacaoTecnica[]) : [];
  return obs.filter((o) => o && o.interna !== true).map((o) => s(o.conteudo)).filter(Boolean);
}

/** Termo de garantia da OS, derivado da garantia prevista (Nova OS) ou da garantia efetiva. */
export function termoGarantiaDaOSV3(os: OrdemServico): TermoGarantiaV3 {
  const prevista = (os as { aberturaV3?: { garantiaPrevista?: { modelo?: unknown; prazoDias?: unknown; termo?: unknown } } }).aberturaV3?.garantiaPrevista;
  const modeloId = s(prevista?.modelo) || undefined;
  const prazoDias =
    typeof prevista?.prazoDias === "number" ? prevista.prazoDias : typeof os.garantia?.prazoDias === "number" ? os.garantia.prazoDias : undefined;
  const termoCustom = s(prevista?.termo) || s(os.garantia?.termo) || undefined;
  return gerarTermoGarantiaV3({ modeloId, prazoDias, termoCustom });
}

// ----------------------------------------------------------------------------
// Prova de entrada imprimível (SPRINT_3E.1) — estado físico + acessórios +
// credenciais MASCARADAS. Item 6: nunca expõe o valor real das credenciais.
// ----------------------------------------------------------------------------

export interface ProvaEntradaPrintV3 {
  temDados: boolean;
  identificacao: IdentificacaoV3;
  estadoFisico: { label: string; status: EstadoFisicoStatusV3; statusLabel: string }[];
  resumo: { ok: number; avariado: number; ausente: number; total: number };
  avarias: { tipo: string; local: string; descricao?: string }[];
  acessorios: { label: string; presente: boolean }[];
  credenciais: { rotulo: string; valor: string }[];
  totalFotos: number;
  /** Assinatura digital do cliente (entrada) — data URL, exibida na OS. */
  assinaturaClienteDataUrl?: string;
}

function temIdentificacaoExtraV3(i: IdentificacaoV3): boolean {
  return !!(s(i.serial) || s(i.operadora) || s(i.cor));
}

export function provaEntradaImprimivelV3(os: OrdemServico): ProvaEntradaPrintV3 {
  const p = lerProvaEntradaV3(os);
  const resumo = resumoEstadoFisicoV3(p.estadoFisico);
  const acessoriosLabel = new Map(ACESSORIOS_ENTRADA_V3.map((a) => [a.id, a.label]));
  const assinaturaClienteDataUrl = s(p.assinaturaCliente?.dataUrl).startsWith("data:image/") ? s(p.assinaturaCliente?.dataUrl) : undefined;
  const temDados =
    provaEntradaCriadaV3(os) ||
    resumo.avariado > 0 ||
    resumo.ausente > 0 ||
    p.avarias.length > 0 ||
    p.fotos.length > 0 ||
    credenciaisMascaradasV3(p.credenciais).length > 0 ||
    temIdentificacaoExtraV3(p.identificacao);
  return {
    temDados,
    identificacao: p.identificacao,
    estadoFisico: p.estadoFisico.map((i) => ({
      label: componenteFisicoLabelV3(i.componente),
      status: i.status,
      statusLabel: ESTADO_FISICO_STATUS_META_V3[i.status].label,
    })),
    resumo,
    avarias: p.avarias.map((a) => ({ tipo: tipoAvariaLabelV3(a.tipo), local: a.local, descricao: a.descricao })),
    acessorios: p.acessorios.map((a) => ({ label: acessoriosLabel.get(a.id) ?? a.id, presente: a.presente })),
    credenciais: credenciaisMascaradasV3(p.credenciais),
    totalFotos: p.fotos.length,
    assinaturaClienteDataUrl,
  };
}

// ----------------------------------------------------------------------------
// Documento completo (via cliente)
// ----------------------------------------------------------------------------

export type VariantePrintV3 = "cliente" | "interna";

/** Bloco exclusivo da VIA INTERNA (nunca entregue ao cliente). */
export interface InternoPrintV3 {
  custo: number;
  lucro: number;
  itensInternos: { descricao: string; categoria: "Serviço" | "Peça"; qtd: number; custo: number }[];
  observacoesInternas: string[];
}

export interface ClientePrintV3 {
  nome: string;
  telefone: string;
  documento: string;
  email: string;
}

export interface EquipamentoPrintV3 {
  tipo: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  acessorios: string[];
  condicao: string;
  defeitoRelatado: string;
}

export interface DocumentoOSV3 {
  variante: VariantePrintV3;
  empresa: EmpresaPrintV3;
  numero: string;
  statusLabel: string;
  criadoEm?: string;
  impressoEm: string;
  cliente: ClientePrintV3;
  equipamento: EquipamentoPrintV3;
  senha: SenhaPrintV3;
  recepcao: RecepcaoV3;
  checklist: ChecklistPrintItemV3[];
  diagnostico: DiagnosticoTecnicoV3;
  observacoesCliente: string[];
  itens: PrintItemV3[];
  financeiro: ResumoFinanceiroPrintV3;
  garantia: TermoGarantiaV3;
  /** Prova de entrada (estado físico + acessórios + credenciais mascaradas). */
  provaEntrada: ProvaEntradaPrintV3;
  /** Presente apenas na variante "interna". */
  interno?: InternoPrintV3;
}

/** Bloco interno (custo/lucro/itens internos/observações internas) — apenas via interna. */
export function blocoInternoV3(os: OrdemServico): InternoPrintV3 {
  const orc = orcamentoRealV3(os);
  const servicos = orc?.servicos ?? [];
  const pecas = orc?.pecas ?? (os.pecas as PecaV3[] | undefined) ?? [];
  const totais = orc
    ? computeTotaisV3({ servicos, pecas, desconto: orc.desconto })
    : { subtotal: 0, desconto: 0, total: 0, custo: 0, lucro: 0 };

  const itensInternos: InternoPrintV3["itensInternos"] = [];
  for (const sv of servicos) {
    if (linhaKind(sv) !== "interno") continue;
    itensInternos.push({ descricao: sv.descricao || "Serviço", categoria: "Serviço", qtd: 1, custo: servicoCusto(sv) });
  }
  for (const p of pecas) {
    if (linhaKind(p) !== "interno") continue;
    itensInternos.push({ descricao: p.nome || "Peça", categoria: "Peça", qtd: Math.max(1, Math.trunc(p.quantidade || 1)), custo: pecaCusto(p) });
  }

  const observacoesInternas = (Array.isArray(os.observacoes) ? (os.observacoes as ObservacaoTecnica[]) : [])
    .filter((o) => o && o.interna === true)
    .map((o) => s(o.conteudo))
    .filter(Boolean);

  return { custo: totais.custo, lucro: totais.lucro, itensInternos, observacoesInternas };
}

export function montarDocumentoOSV3(
  os: OrdemServico,
  empresa?: EmpresaPrintInputV3,
  opts?: { variante?: VariantePrintV3; now?: Date },
): DocumentoOSV3 {
  const now = opts?.now ?? new Date();
  const variante: VariantePrintV3 = opts?.variante ?? "cliente";
  const condicao = s((os as { aberturaV3?: { condicaoAparelho?: unknown } }).aberturaV3?.condicaoAparelho);
  const sa = lerSenhaAcessoriosV3(os);

  return {
    variante,
    interno: variante === "interna" ? blocoInternoV3(os) : undefined,
    empresa: dadosEmpresaPrintV3(empresa),
    numero: os.codigo || "—",
    statusLabel: statusMetaV3(statusV3FromOS(os)).label,
    criadoEm: os.criadoEm,
    impressoEm: now.toISOString(),
    cliente: {
      nome: s(os.cliente?.nome),
      telefone: s(os.cliente?.telefone) || s(os.cliente?.whatsapp),
      documento: s(os.cliente?.documento),
      email: s(os.cliente?.email),
    },
    equipamento: {
      tipo: s(os.equipamento?.tipo),
      marca: s(os.equipamento?.marca),
      modelo: s(os.equipamento?.modelo),
      numeroSerie: s(os.equipamento?.numeroSerie),
      acessorios: sa.acessorios,
      condicao,
      defeitoRelatado: s(os.equipamento?.defeitoRelatado),
    },
    senha: senhaImprimivelV3(os),
    recepcao: lerRecepcaoV3(os),
    checklist: checklistImprimivelV3(os),
    diagnostico: lerDiagnosticoV3(os),
    observacoesCliente: observacoesClienteV3(os),
    itens: itensImprimiveisV3(os),
    financeiro: resumoFinanceiroImprimivelV3(os),
    garantia: termoGarantiaDaOSV3(os),
    provaEntrada: provaEntradaImprimivelV3(os),
  };
}

// ----------------------------------------------------------------------------
// Sugestão de garantia a partir dos serviços COBRADOS da OS (item 4)
// ----------------------------------------------------------------------------

export function sugerirGarantiaDaOSV3(os: OrdemServico): GarantiaModeloIdV3 | null {
  for (const sv of fonteServicos(os)) {
    if (linhaKind(sv) === "interno") continue;
    const hit = sugerirGarantiaPorDescricaoV3(sv.descricao);
    if (hit) return hit;
  }
  // tenta também pelo defeito relatado / peças
  const peca = fontePecas(os).find((p) => linhaKind(p) !== "interno" && sugerirGarantiaPorDescricaoV3(p.nome));
  if (peca) return sugerirGarantiaPorDescricaoV3(peca.nome);
  return sugerirGarantiaPorDescricaoV3(os.equipamento?.defeitoRelatado);
}

// ----------------------------------------------------------------------------
// Documento C — Termo de Garantia (dedicado)
// ----------------------------------------------------------------------------

export interface TermoGarantiaDocV3 {
  empresa: EmpresaPrintV3;
  numero: string;
  impressoEm: string;
  cliente: ClientePrintV3;
  equipamento: { marca: string; modelo: string; numeroSerie: string };
  servicoRealizado: string[];
  termo: TermoGarantiaV3;
}

export function montarTermoGarantiaDocV3(
  os: OrdemServico,
  empresa?: EmpresaPrintInputV3,
  opts?: { now?: Date },
): TermoGarantiaDocV3 {
  const now = opts?.now ?? new Date();
  const servicoRealizado = itensImprimiveisV3(os)
    .filter((i) => i.categoria === "Serviço" || !i.brinde)
    .map((i) => i.descricao);
  return {
    empresa: dadosEmpresaPrintV3(empresa),
    numero: os.codigo || "—",
    impressoEm: now.toISOString(),
    cliente: {
      nome: s(os.cliente?.nome),
      telefone: s(os.cliente?.telefone) || s(os.cliente?.whatsapp),
      documento: s(os.cliente?.documento),
      email: s(os.cliente?.email),
    },
    equipamento: {
      marca: s(os.equipamento?.marca),
      modelo: s(os.equipamento?.modelo),
      numeroSerie: s(os.equipamento?.numeroSerie),
    },
    servicoRealizado,
    termo: termoGarantiaDaOSV3(os),
  };
}

// ----------------------------------------------------------------------------
// Documento D — Etiqueta técnica (estrutura inicial)
// ----------------------------------------------------------------------------

export interface EtiquetaV3 {
  numero: string;
  cliente: string;
  equipamento: string;
  statusLabel: string;
  tecnico: string;
  entrada?: string;
}

export function montarEtiquetaV3(os: OrdemServico): EtiquetaV3 {
  const equip = [s(os.equipamento?.marca), s(os.equipamento?.modelo)].filter(Boolean).join(" ") || s(os.equipamento?.tipo);
  return {
    numero: os.codigo || "—",
    cliente: s(os.cliente?.nome) || "—",
    equipamento: equip || "—",
    statusLabel: statusMetaV3(statusV3FromOS(os)).label,
    tecnico: s(os.tecnico?.nome),
    entrada: lerRecepcaoV3(os).dataEntrada,
  };
}

// ----------------------------------------------------------------------------
// Documento E — Termo de Entrega (Fase 3A)
// ----------------------------------------------------------------------------

export interface TermoEntregaDocV3 {
  empresa: EmpresaPrintV3;
  numero: string;
  impressoEm: string;
  cliente: ClientePrintV3;
  equipamento: { tipo: string; marca: string; modelo: string; numeroSerie: string; serial?: string; operadora?: string };
  servicoRealizado: string[];
  dataEntrega?: string;
  recebidoPor?: string;
  observacao?: string;
  /** Assinatura digital de retirada (data URL) — SPRINT_3E.2. */
  assinaturaRetiradaDataUrl?: string;
}

export function montarTermoEntregaV3(os: OrdemServico, empresa?: EmpresaPrintInputV3, opts?: { now?: Date }): TermoEntregaDocV3 {
  const now = opts?.now ?? new Date();
  const entrega = lerEntregaV3(os);
  const ident = lerProvaEntradaV3(os).identificacao;
  const servicoRealizado = itensImprimiveisV3(os)
    .filter((i) => i.categoria === "Serviço" || !i.brinde)
    .map((i) => i.descricao);
  return {
    empresa: dadosEmpresaPrintV3(empresa),
    numero: os.codigo || "—",
    impressoEm: now.toISOString(),
    cliente: {
      nome: s(os.cliente?.nome),
      telefone: s(os.cliente?.telefone) || s(os.cliente?.whatsapp),
      documento: s(os.cliente?.documento),
      email: s(os.cliente?.email),
    },
    equipamento: {
      tipo: s(os.equipamento?.tipo),
      marca: s(os.equipamento?.marca),
      modelo: s(os.equipamento?.modelo),
      numeroSerie: s(ident.imei) || s(os.equipamento?.numeroSerie),
      serial: s(ident.serial) || undefined,
      operadora: s(ident.operadora) || undefined,
    },
    servicoRealizado,
    dataEntrega: entrega.entregueEm,
    recebidoPor: entrega.recebidoPor,
    observacao: entrega.observacao,
    assinaturaRetiradaDataUrl: entrega.assinaturaRetiradaDataUrl,
  };
}
