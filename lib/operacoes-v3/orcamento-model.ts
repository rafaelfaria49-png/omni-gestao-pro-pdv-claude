// ============================================================================
// Operações V3 — Fase 1C · MODELO de orçamento (puro, fonte de verdade)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React) — importável por cliente e servidor.
// Enriquece o `Orcamento` do V2 SEM tocar `@/types/os`: os campos extras da V3
// (kind de linha, custo de serviço, histórico de versões) vivem como
// propriedades adicionais dentro do `payload` (JSONB) e sobrevivem à hidratação
// pelo spread do payload — mesma disciplina do `operacaoStatusV3` (Fase 1B).
//
// Brindes (item cobrado / brinde / interno):
//   • cobrado → impacta custo E valor ao cliente.
//   • brinde  → impacta custo, NÃO impacta valor ao cliente (exibido ao cliente).
//   • interno → impacta custo, NÃO impacta valor ao cliente (uso interno/oculto).
// O total ao cliente NUNCA inclui brinde/interno. Custo e lucro incluem todos.
// ============================================================================

import type { Orcamento, OrcamentoStatus, PecaUsada, Servico } from "@/types/os";

export type OrcamentoLinhaKindV3 = "cobrado" | "brinde" | "interno";

// ----------------------------------------------------------------------------
// Grupos de escolha + variantes (GOAL OPS-V4-ORC-MULTIOPCAO-MODEL-021)
// ----------------------------------------------------------------------------
// Um "grupo de escolha" agrupa 2+ linhas alternativas (ex.: "Tela genérica" vs
// "Tela original") das quais o cliente escolhe UMA. Vive 100% dentro do payload
// (campos opcionais nas linhas + metadados do grupo no orçamento) — orçamento
// sem grupos mantém o comportamento V3 anterior byte a byte.

/** Única regra suportada nesta fase: exatamente uma linha selecionada por grupo. */
export type OrcamentoGrupoRegraV3 = "escolha_1";

export interface OrcamentoGrupoV3 {
  id: string;
  rotulo: string;
  regra: OrcamentoGrupoRegraV3;
}

/** Metadados de exibição de uma alternativa dentro de um grupo (não afeta cálculo). */
export interface VarianteV3 {
  rotulo: string;
  descricaoCurta?: string;
  garantiaDias?: number;
  prazoTexto?: string;
  badge?: string;
}

/** Máximo de linhas alternativas por grupo de escolha. */
export const MAX_LINHAS_POR_GRUPO_V3 = 4;

/** Linhas com a extensão V3 (campos extras persistidos no JSONB). */
export type PecaV3 = PecaUsada & {
  kindV3?: OrcamentoLinhaKindV3;
  /** Id do grupo de escolha ao qual esta linha pertence (ausente = linha fixa). */
  grupoId?: string;
  varianteV3?: VarianteV3;
  /** true quando esta é a linha escolhida do grupo (no máx. uma por grupo). */
  selecionadaV3?: boolean;
};
export type ServicoV3 = Servico & {
  kindV3?: OrcamentoLinhaKindV3;
  custoV3?: number;
  grupoId?: string;
  varianteV3?: VarianteV3;
  selecionadaV3?: boolean;
};

/** Orçamento na visão V3 (mesmo objeto persistido, com as linhas tipadas em V3). */
export type OrcamentoV3 = Omit<Orcamento, "pecas" | "servicos"> & {
  pecas: PecaV3[];
  servicos: ServicoV3[];
  /** Metadados dos grupos de escolha referenciados pelas linhas (rótulo + regra). */
  gruposV3?: OrcamentoGrupoV3[];
};

export interface OrcamentoVersaoV3 {
  versao: number;
  status: OrcamentoStatus;
  total: number;
  desconto: number;
  registradoEm: string;
  registradoPor: string;
  /** Cópia do orçamento ANTES desta alteração (para visualizar versões anteriores). */
  snapshot: OrcamentoV3;
}

/** Entrada de edição do orçamento (usada pela action `salvarOrcamentoV3` e pelo hook). */
export interface SalvarOrcamentoV3Input {
  servicos: ServicoV3[];
  pecas: PecaV3[];
  desconto: number;
  observacao?: string;
}

export interface TotaisOrcamentoV3 {
  /** Soma do valor ao cliente das linhas cobradas (antes do desconto geral). */
  subtotal: number;
  /** Desconto geral do orçamento (R$). */
  desconto: number;
  /** Total final ao cliente = subtotal − desconto (≥ 0). Quando há grupo sem
   *  seleção, é o total MÍNIMO (conservador) — ver `faixa` para o máximo. */
  total: number;
  /** Custo interno = soma dos custos das linhas fixas + linhas de grupo JÁ
   *  selecionadas (inclui brindes/internos). Grupos sem seleção não somam custo. */
  custo: number;
  /** Lucro estimado = total − custo (pode ser negativo). */
  lucro: number;
  /** Presente somente quando há ≥1 grupo de escolha sem linha selecionada:
   *  faixa de total possível conforme a opção do grupo que vier a ser escolhida. */
  faixa?: { min: number; max: number };
}

// ----------------------------------------------------------------------------
// Kind helpers
// ----------------------------------------------------------------------------

export function linhaKind(l: { kindV3?: OrcamentoLinhaKindV3 } | null | undefined): OrcamentoLinhaKindV3 {
  const k = l?.kindV3;
  return k === "brinde" || k === "interno" ? k : "cobrado";
}

export const KIND_META_V3: Record<OrcamentoLinhaKindV3, { label: string; cobravel: boolean; visivelCliente: boolean }> = {
  cobrado: { label: "Cobrado", cobravel: true, visivelCliente: true },
  brinde: { label: "Brinde", cobravel: false, visivelCliente: true },
  interno: { label: "Interno", cobravel: false, visivelCliente: false },
};

// ----------------------------------------------------------------------------
// Valor ao cliente × custo por linha
// ----------------------------------------------------------------------------

export function pecaValorCliente(p: PecaV3): number {
  if (linhaKind(p) !== "cobrado") return 0;
  return Math.max(0, (p.quantidade || 0) * (p.valorUnitario || 0) - (p.desconto ?? 0));
}

export function pecaCusto(p: PecaV3): number {
  return Math.max(0, (p.quantidade || 0) * (p.custoUnitario ?? 0));
}

export function servicoValorCliente(s: ServicoV3): number {
  if (linhaKind(s) !== "cobrado") return 0;
  return Math.max(0, (s.valor || 0) - (s.desconto ?? 0));
}

export function servicoCusto(s: ServicoV3): number {
  return Math.max(0, s.custoV3 ?? 0);
}

// ----------------------------------------------------------------------------
// Totais
// ----------------------------------------------------------------------------

interface LinhaGrupoInfoV3 {
  valorCliente: number;
  custo: number;
  selecionada: boolean;
}

/** Agrupa as linhas (peças + serviços) que têm `grupoId`, por grupo. */
function coletarLinhasPorGrupoV3(pecas: PecaV3[], servicos: ServicoV3[]): Map<string, LinhaGrupoInfoV3[]> {
  const map = new Map<string, LinhaGrupoInfoV3[]>();
  const add = (grupoId: string | undefined, info: LinhaGrupoInfoV3) => {
    const gid = (grupoId ?? "").trim();
    if (!gid) return;
    const arr = map.get(gid) ?? [];
    arr.push(info);
    map.set(gid, arr);
  };
  for (const p of pecas) add(p.grupoId, { valorCliente: pecaValorCliente(p), custo: pecaCusto(p), selecionada: p.selecionadaV3 === true });
  for (const s of servicos) add(s.grupoId, { valorCliente: servicoValorCliente(s), custo: servicoCusto(s), selecionada: s.selecionadaV3 === true });
  return map;
}

export function computeTotaisV3(orc: Pick<OrcamentoV3, "pecas" | "servicos" | "desconto">): TotaisOrcamentoV3 {
  const pecas = Array.isArray(orc.pecas) ? orc.pecas : [];
  const servicos = Array.isArray(orc.servicos) ? orc.servicos : [];

  // Linhas fixas (sem grupoId) somam sempre, exatamente como antes dos grupos.
  const pecasFixas = pecas.filter((p) => !(p.grupoId ?? "").trim());
  const servicosFixos = servicos.filter((s) => !(s.grupoId ?? "").trim());
  const subtotalFixo =
    pecasFixas.reduce((acc, p) => acc + pecaValorCliente(p), 0) +
    servicosFixos.reduce((acc, s) => acc + servicoValorCliente(s), 0);
  const custoFixo =
    pecasFixas.reduce((acc, p) => acc + pecaCusto(p), 0) +
    servicosFixos.reduce((acc, s) => acc + servicoCusto(s), 0);

  // Grupos de escolha: com seleção soma só a escolhida; sem seleção vira faixa.
  const grupos = coletarLinhasPorGrupoV3(pecas, servicos);
  let subtotalGrupos = 0;
  let custoGrupos = 0;
  let faixaMinExtra = 0;
  let faixaMaxExtra = 0;
  let temGrupoNaoResolvido = false;

  for (const linhas of grupos.values()) {
    const escolhida = linhas.find((l) => l.selecionada);
    if (escolhida) {
      subtotalGrupos += escolhida.valorCliente;
      custoGrupos += escolhida.custo;
      continue;
    }
    temGrupoNaoResolvido = true;
    const valores = linhas.map((l) => l.valorCliente);
    faixaMinExtra += Math.min(...valores);
    faixaMaxExtra += Math.max(...valores);
    // Custo de opções ainda não escolhidas não é somado (nada foi decidido/gasto).
  }

  const subtotal = subtotalFixo + subtotalGrupos + faixaMinExtra;
  const desconto = Math.max(0, orc.desconto ?? 0);
  const total = Math.max(0, subtotal - desconto);
  const custo = custoFixo + custoGrupos;
  const lucro = total - custo;
  const faixa = temGrupoNaoResolvido
    ? { min: total, max: Math.max(0, subtotalFixo + subtotalGrupos + faixaMaxExtra - desconto) }
    : undefined;

  return { subtotal, desconto, total, custo, lucro, faixa };
}

/**
 * Valida o limite de linhas alternativas por grupo de escolha (payload puro,
 * sem I/O). Retorna a lista de mensagens de erro; vazia quando tudo é válido.
 * NÃO é chamada automaticamente por `salvarOrcamentoV3` nesta fase — fica
 * pronta para o GOAL que ligar a edição de grupos na V4.
 */
export function validarGruposOrcamentoV3(orc: Pick<OrcamentoV3, "pecas" | "servicos">): string[] {
  const contagem = new Map<string, number>();
  const contar = (grupoId: string | undefined) => {
    const gid = (grupoId ?? "").trim();
    if (!gid) return;
    contagem.set(gid, (contagem.get(gid) ?? 0) + 1);
  };
  for (const p of orc.pecas ?? []) contar(p.grupoId);
  for (const s of orc.servicos ?? []) contar(s.grupoId);

  const erros: string[] = [];
  for (const [grupoId, count] of contagem) {
    if (count > MAX_LINHAS_POR_GRUPO_V3) {
      erros.push(`Grupo "${grupoId}" tem ${count} linhas — máximo permitido é ${MAX_LINHAS_POR_GRUPO_V3}.`);
    }
  }
  return erros;
}

/** Recalcula e fixa o campo `total` do orçamento de forma consistente com a regra de brindes. */
export function recalcOrcamentoV3(orc: OrcamentoV3): OrcamentoV3 {
  const { total } = computeTotaisV3(orc);
  return { ...orc, total };
}

// ----------------------------------------------------------------------------
// Registro de envio (canal) — molde = `registrarImpressaoDocumentoV3`
// ----------------------------------------------------------------------------

export type CanalEnvioOrcamentoV3 = "whatsapp" | "impresso" | "presencial" | "outro";

export const CANAL_ENVIO_LABEL_V3: Record<CanalEnvioOrcamentoV3, string> = {
  whatsapp: "WhatsApp",
  impresso: "impresso",
  presencial: "presencial",
  outro: "outro canal",
};

export interface EnvioOrcamentoEventoV3 {
  tipo: "orcamento_enviado";
  conteudo: string;
  metadata: { canal: CanalEnvioOrcamentoV3; totalSnapshot: number };
}

/** Monta (puro) o conteúdo/metadata do evento de registro de envio por canal. */
export function montarEventoEnvioOrcamentoV3(canal: CanalEnvioOrcamentoV3, totalSnapshot: number): EnvioOrcamentoEventoV3 {
  return {
    tipo: "orcamento_enviado",
    conteudo: `Orçamento enviado ao cliente via ${CANAL_ENVIO_LABEL_V3[canal]}.`,
    metadata: { canal, totalSnapshot: Number.isFinite(totalSnapshot) ? Math.max(0, totalSnapshot) : 0 },
  };
}

// ----------------------------------------------------------------------------
// Estados do orçamento (badge + status efetivo com EXPIRADO derivado por data)
// ----------------------------------------------------------------------------

/**
 * Dias de validade padrão aplicados ao enviar um orçamento (`enviarOrcamentoV3`)
 * e usados como texto de política antes do primeiro envio (documento "Orçamento
 * via cliente", GOAL 023). Fonte única — mova daqui, não duplique o valor.
 */
export const VALIDADE_PADRAO_DIAS = 7;

export type ToneOrcV3 = "neutral" | "info" | "warning" | "success" | "danger";

export const ORCAMENTO_STATUS_META_V3: Record<OrcamentoStatus, { label: string; tone: ToneOrcV3 }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  enviado: { label: "Enviado", tone: "info" },
  aprovado: { label: "Aprovado", tone: "success" },
  recusado: { label: "Recusado", tone: "danger" },
  expirado: { label: "Expirado", tone: "warning" },
};

/**
 * Status efetivo para exibição: um orçamento "enviado" cujo `validoAte` já passou
 * é mostrado como "expirado" (sem reescrever o persistido).
 */
export function statusEfetivoOrcamentoV3(orc: Pick<Orcamento, "status" | "validoAte">, now = Date.now()): OrcamentoStatus {
  if (orc.status === "enviado" && orc.validoAte) {
    const t = Date.parse(orc.validoAte);
    if (Number.isFinite(t) && t < now) return "expirado";
  }
  return orc.status;
}

// ----------------------------------------------------------------------------
// Leitura de campos extras V3 no payload da OS
// ----------------------------------------------------------------------------

type OSOrcamentoSource = {
  orcamento?: unknown;
  orcamentoVersoesV3?: unknown;
};

/** Orçamento real (não sintetizado) na visão V3, ou null. */
export function orcamentoRealV3(os: OSOrcamentoSource | null | undefined): OrcamentoV3 | null {
  const orc = os?.orcamento as (Orcamento & { sintetizado?: boolean }) | undefined;
  if (!orc || typeof orc !== "object") return null;
  if (orc.sintetizado === true) return null;
  return orc as unknown as OrcamentoV3;
}

export function lerVersoesV3(os: OSOrcamentoSource | null | undefined): OrcamentoVersaoV3[] {
  const v = os?.orcamentoVersoesV3;
  return Array.isArray(v) ? (v as OrcamentoVersaoV3[]) : [];
}

// ----------------------------------------------------------------------------
// Métricas para o Dashboard (item 12) — conta orçamentos REAIS por status efetivo.
// ----------------------------------------------------------------------------

export function contarOrcamentosPorStatusV3(
  ordens: OSOrcamentoSource[],
  now = Date.now(),
): Record<OrcamentoStatus, number> {
  const acc: Record<OrcamentoStatus, number> = {
    rascunho: 0,
    enviado: 0,
    aprovado: 0,
    recusado: 0,
    expirado: 0,
  };
  for (const os of ordens) {
    const orc = orcamentoRealV3(os);
    if (!orc) continue;
    acc[statusEfetivoOrcamentoV3(orc, now)] += 1;
  }
  return acc;
}
