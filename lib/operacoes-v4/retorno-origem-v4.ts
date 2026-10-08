// ============================================================================
// Operações V4 — origem do RETORNO / GARANTIA (GOAL OPS-V4-FLUXO-CURTO-007).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Resume a OS original para o
// seletor de retorno — dados herdados, garantia e enquadramento — a partir dos
// MESMOS leitores V3 que `abrirRetornoV3` usa para decidir (lerEntregaV3,
// lerGarantiaV3, lerRetornosV3). Nunca expõe senha/credencial. A autoridade
// continua sendo a action: este resumo só orienta a tela.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import {
  lerEntregaV3,
  lerGarantiaV3,
  lerRetornosV3,
  retornoEmAberturaV3,
  type GarantiaSituacaoV3,
  type RetornoV3,
} from "@/lib/operacoes-v3/pos-venda-model";
import { statusV3FromOS } from "@/lib/operacoes-v3/status-machine";

export type EnquadramentoRetornoIdV4 =
  | "garantia_ativa"
  | "fora_cobertura"
  | "garantia_nao_informada"
  | "nao_entregue"
  | "cancelada"
  | "retorno_em_andamento"
  | "abertura_em_processamento"
  | "retorno_sem_atendimento"
  | "dados_incompletos";

/** O que a tela oferece para a OS selecionada. Só `abrir_retorno` chama `abrirRetornoV3`. */
export type AcaoRetornoV4 = "abrir_retorno" | "registrar_ocorrencia" | "continuar_atendimento" | "aguardar" | "nenhuma";

export type ToneRetornoV4 = "success" | "info" | "warn" | "danger" | "neutro";

export interface EnquadramentoRetornoV4 {
  id: EnquadramentoRetornoIdV4;
  label: string;
  descricao: string;
  tone: ToneRetornoV4;
  acao: AcaoRetornoV4;
}

export interface RetornoAnteriorResumoV4 {
  id: string;
  status: "aberto" | "finalizado";
  motivo: string;
  observacao?: string;
  criadoEm: string;
  finalizadoEm?: string;
  osRetornoId?: string;
  osRetornoCodigo?: string;
  /** Reserva viva: o atendimento ainda está sendo criado pelo servidor. */
  emAbertura: boolean;
  /** Identidade da operação que abriu o retorno (o cliente reconhece a própria operação já concluída). */
  operacaoId?: string;
  garantiaAtivaNaAbertura?: boolean;
}

export interface GarantiaOrigemResumoV4 {
  situacao: GarantiaSituacaoV3;
  label: string;
  prazoDias: number;
  inicio?: string;
  vencimento?: string;
  diasRestantes?: number;
  porDia?: boolean;
}

export interface OrigemRetornoResumoV4 {
  osId: string;
  codigo: string;
  cliente: { id?: string; nome: string; telefone?: string };
  aparelho: { tipo: string; marca: string; modelo: string; identificacao?: string; descricao: string };
  defeitoOriginal?: string;
  /** Serviços da OS original (descrições), na ordem gravada. */
  servicoExecutado: string[];
  entregueEm?: string;
  garantia: GarantiaOrigemResumoV4;
  /** Mais recentes primeiro. */
  retornos: RetornoAnteriorResumoV4[];
  retornoAberto?: RetornoAnteriorResumoV4;
  /** Uma reserva anterior expirou sem atendimento: o servidor a descarta ao abrir. */
  aberturaInterrompida: boolean;
  /** Acessórios da ENTRADA original — só sugestão, nunca fato do novo atendimento. */
  acessoriosOriginais: string[];
  enquadramento: EnquadramentoRetornoV4;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resumoRetorno(retorno: RetornoV3, now: Date): RetornoAnteriorResumoV4 {
  return {
    id: retorno.id,
    status: retorno.status,
    motivo: retorno.motivo,
    ...(retorno.observacao ? { observacao: retorno.observacao } : {}),
    criadoEm: retorno.criadoEm,
    ...(retorno.finalizadoEm ? { finalizadoEm: retorno.finalizadoEm } : {}),
    ...(retorno.osRetornoId ? { osRetornoId: retorno.osRetornoId } : {}),
    ...(retorno.osRetornoCodigo ? { osRetornoCodigo: retorno.osRetornoCodigo } : {}),
    emAbertura: retornoEmAberturaV3(retorno, now),
    ...(retorno.operacaoId ? { operacaoId: retorno.operacaoId } : {}),
    ...(typeof retorno.garantiaAtivaNaAbertura === "boolean" ? { garantiaAtivaNaAbertura: retorno.garantiaAtivaNaAbertura } : {}),
  };
}

function servicosDe(os: OrdemServico): string[] {
  const catalogo = Array.isArray(os.servicosCatalogo) ? os.servicosCatalogo : [];
  const doCatalogo = catalogo.map((s) => text(s?.descricao)).filter(Boolean);
  if (doCatalogo.length > 0) return doCatalogo;
  const orcamento = (os as { orcamento?: { servicos?: Array<{ descricao?: unknown }> } }).orcamento;
  return (Array.isArray(orcamento?.servicos) ? orcamento!.servicos : []).map((s) => text(s?.descricao)).filter(Boolean);
}

/** Retorno legado: aberto sem atendimento e sem identidade de operação (gravado antes do GOAL 007). */
export function retornoLegadoSemAtendimentoV4(retorno: RetornoV3 | undefined): boolean {
  return !!retorno && retorno.status === "aberto" && !retorno.osRetornoId && !retorno.operacaoId;
}

const ENQ: Record<EnquadramentoRetornoIdV4, Omit<EnquadramentoRetornoV4, "id">> = {
  garantia_ativa: {
    label: "Garantia vigente",
    descricao: "A garantia da OS original está vigente. Isso não confirma que o novo defeito está coberto: a avaliação acontece no atendimento.",
    tone: "success",
    acao: "abrir_retorno",
  },
  fora_cobertura: {
    label: "Sem cobertura confirmada",
    descricao: "Garantia vencida ou sem cobertura. O retorno é registrado, mas qualquer serviço cobrável exige decisão comercial própria no atendimento.",
    tone: "warn",
    acao: "abrir_retorno",
  },
  garantia_nao_informada: {
    label: "Garantia não informada",
    descricao: "A OS original não tem garantia registrada. Nenhuma cobertura é presumida.",
    tone: "neutro",
    acao: "abrir_retorno",
  },
  nao_entregue: {
    label: "OS ainda não entregue",
    descricao: "O aparelho não foi retirado: não é pós-venda. Registre a ocorrência como observação interna desta OS.",
    tone: "info",
    acao: "registrar_ocorrencia",
  },
  cancelada: {
    label: "OS cancelada",
    descricao: "OS cancelada não admite retorno. Para um novo problema, abra uma Nova OS.",
    tone: "danger",
    acao: "nenhuma",
  },
  retorno_em_andamento: {
    label: "Retorno em andamento",
    descricao: "Esta OS já tem um atendimento de retorno aberto. Continue nele em vez de abrir outro.",
    tone: "warn",
    acao: "continuar_atendimento",
  },
  abertura_em_processamento: {
    label: "Abertura em processamento",
    descricao: "Um atendimento de retorno está sendo criado para esta OS. Verifique novamente em instantes.",
    tone: "info",
    acao: "aguardar",
  },
  retorno_sem_atendimento: {
    label: "Retorno registrado sem atendimento",
    descricao: "Existe um retorno em aberto registrado antes, sem atendimento. Ao confirmar, o atendimento é aberto com o relato já registrado.",
    tone: "warn",
    acao: "abrir_retorno",
  },
  dados_incompletos: {
    label: "Dados da OS original incompletos",
    descricao: "A OS original não tem cliente cadastrado vinculado ou marca/modelo do aparelho. Complete a OS original antes de abrir o retorno.",
    tone: "danger",
    acao: "nenhuma",
  },
};

function enq(id: EnquadramentoRetornoIdV4): EnquadramentoRetornoV4 {
  return { id, ...ENQ[id] };
}

/** Mesma ordem de decisão de `abrirRetornoV3` (o servidor revalida tudo sob a trava). */
export function enquadrarOrigemRetornoV4(os: OrdemServico, now: Date = new Date()): EnquadramentoRetornoV4 {
  if (statusV3FromOS(os) === "cancelada") return enq("cancelada");
  if (!lerEntregaV3(os).entregue) return enq("nao_entregue");
  const aberto = lerRetornosV3(os).find((retorno) => retorno.status === "aberto");
  if (aberto?.osRetornoId) return enq("retorno_em_andamento");
  if (aberto && retornoEmAberturaV3(aberto, now)) return enq("abertura_em_processamento");
  const clienteId = text(os.clienteId) || text(os.cliente?.id);
  if (!clienteId || !text(os.equipamento?.marca) || !text(os.equipamento?.modelo)) return enq("dados_incompletos");
  if (retornoLegadoSemAtendimentoV4(aberto)) return enq("retorno_sem_atendimento");
  const garantia = lerGarantiaV3(os, now);
  if (garantia.situacao === "ativa") return enq("garantia_ativa");
  if (garantia.situacao === "vencida" || garantia.situacao === "sem_garantia") return enq("fora_cobertura");
  return enq("garantia_nao_informada");
}

export function resumirOrigemRetornoV4(os: OrdemServico, now: Date = new Date()): OrigemRetornoResumoV4 {
  const garantia = lerGarantiaV3(os, now);
  const retornos = lerRetornosV3(os);
  const aberto = retornos.find((retorno) => retorno.status === "aberto");
  const marca = text(os.equipamento?.marca);
  const modelo = text(os.equipamento?.modelo);
  const tipo = text(os.equipamento?.tipo) || "Equipamento";
  const identificacao = text(os.equipamento?.numeroSerie) || undefined;
  const acessorios = Array.isArray(os.equipamento?.acessorios) ? os.equipamento.acessorios.map(text).filter(Boolean) : [];
  const resumoAberto = aberto ? resumoRetorno(aberto, now) : undefined;
  return {
    osId: os.id,
    codigo: text(os.codigo) || os.id,
    cliente: {
      ...(text(os.clienteId) || text(os.cliente?.id) ? { id: text(os.clienteId) || text(os.cliente?.id) } : {}),
      nome: text(os.cliente?.nome) || "Cliente não identificado",
      ...(text(os.cliente?.telefone) || text(os.cliente?.whatsapp) ? { telefone: text(os.cliente?.telefone) || text(os.cliente?.whatsapp) } : {}),
    },
    aparelho: {
      tipo,
      marca,
      modelo,
      ...(identificacao ? { identificacao } : {}),
      descricao: [marca, modelo].filter(Boolean).join(" ") || tipo,
    },
    ...(text(os.equipamento?.defeitoRelatado) ? { defeitoOriginal: text(os.equipamento?.defeitoRelatado) } : {}),
    servicoExecutado: servicosDe(os),
    ...(lerEntregaV3(os).entregueEm ? { entregueEm: lerEntregaV3(os).entregueEm } : {}),
    garantia: {
      situacao: garantia.situacao,
      label: garantia.label,
      prazoDias: garantia.prazoDias,
      ...(garantia.inicio ? { inicio: garantia.inicio } : {}),
      ...(garantia.vencimento ? { vencimento: garantia.vencimento } : {}),
      ...(typeof garantia.diasRestantes === "number" ? { diasRestantes: garantia.diasRestantes } : {}),
      ...(garantia.porDia ? { porDia: true } : {}),
    },
    retornos: retornos.map((retorno) => resumoRetorno(retorno, now)),
    ...(resumoAberto ? { retornoAberto: resumoAberto } : {}),
    aberturaInterrompida: !!aberto && !aberto.osRetornoId && !!aberto.reserva && !retornoEmAberturaV3(aberto, now),
    acessoriosOriginais: normalizarAcessoriosRetornoV4(acessorios),
    enquadramento: enquadrarOrigemRetornoV4(os, now),
  };
}

// ----------------------------------------------------------------------------
// Ocorrência antes da entrega (observação interna da própria OS)
// ----------------------------------------------------------------------------

/** Teto do conteúdo final aceito por `adicionarObservacaoInternaV3` (producao-actions.ts, após trim). */
export const LIMITE_OBSERVACAO_INTERNA_V3 = 2000;
/** Prefixo que a interface acrescenta ao relato antes de enviá-lo como observação interna. */
export const PREFIXO_OCORRENCIA_PRE_ENTREGA_V4 = "Ocorrência antes da entrega: ";
/** Espaço que sobra para o relato do operador (o prefixo também conta no limite do servidor). */
export const LIMITE_OCORRENCIA_PRE_ENTREGA_V4 = LIMITE_OBSERVACAO_INTERNA_V3 - PREFIXO_OCORRENCIA_PRE_ENTREGA_V4.length;

export type OcorrenciaPreEntregaV4 =
  | { ok: true; conteudo: string; tamanho: number }
  | { ok: false; motivo: "vazia" | "excede"; tamanho: number };

/**
 * Regra ÚNICA de contador, validação e envio da ocorrência: o relato é aparado, recebe o
 * prefixo e o conteúdo final é medido como o servidor mede (UTF-16, após trim). Acima do
 * limite nada é enviado nem truncado — quem chama mantém o texto do operador intacto.
 */
export function ocorrenciaPreEntregaV4(relato: string): OcorrenciaPreEntregaV4 {
  const texto = (relato ?? "").trim();
  if (!texto) return { ok: false, motivo: "vazia", tamanho: 0 };
  const conteudo = `${PREFIXO_OCORRENCIA_PRE_ENTREGA_V4}${texto}`;
  if (conteudo.trim().length > LIMITE_OBSERVACAO_INTERNA_V3) return { ok: false, motivo: "excede", tamanho: texto.length };
  return { ok: true, conteudo, tamanho: texto.length };
}

// ----------------------------------------------------------------------------
// Relato do retorno (cliente): normalização e identidade da operação
// ----------------------------------------------------------------------------

export const LIMITE_TEXTO_RETORNO_V4 = 1000;
export const LIMITE_ACESSORIOS_RETORNO_V4 = 20;

/** Acessórios entregues AGORA: aparados, sem vazios/duplicados, no máximo 20 × 60. */
export function normalizarAcessoriosRetornoV4(lista: readonly unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const item of lista ?? []) {
    const valor = text(item).slice(0, 60);
    if (valor && !out.some((x) => x.toLocaleLowerCase("pt-BR") === valor.toLocaleLowerCase("pt-BR"))) out.push(valor);
    if (out.length >= LIMITE_ACESSORIOS_RETORNO_V4) break;
  }
  return out;
}

export interface RelatoRetornoV4 {
  motivo: string;
  observacao?: string;
  acessorios: string[];
}

/**
 * Chave do relato (motivo + observação + acessórios; NUNCA a senha). Mesma chave
 * = mesmo comando lógico → o cliente reusa o `operacaoId` no retry. Relato
 * editado depois de uma tentativa = comando novo (id novo).
 */
export function chaveRelatoRetornoV4(relato: RelatoRetornoV4): string {
  return JSON.stringify([
    text(relato.motivo),
    text(relato.observacao),
    normalizarAcessoriosRetornoV4(relato.acessorios).map((a) => a.toLocaleLowerCase("pt-BR")).sort(),
  ]);
}

// ----------------------------------------------------------------------------
// Contrato do fluxo no cliente (seletor ↔ orquestrador)
// ----------------------------------------------------------------------------

export type SenhaTipoRetornoV4 = "numerica" | "texto" | "padrao";

/** Comando enviado ao motor: só o NOVO relato e a recepção NOVA. */
export interface ComandoRetornoV4 extends RelatoRetornoV4 {
  /** Opcional e nunca guardado em rascunho: vai direto ao atendimento novo. */
  senha?: string;
  senhaTipo?: SenhaTipoRetornoV4;
  operacaoId: string;
}

export type ResultadoRetornoV4 =
  | { ok: true; atendimentoId: string; atendimentoCodigo: string; situacao: "criado" | "recuperado"; navegou: boolean }
  | { ok: false; mensagem: string };

export interface RespostaOrigensRetornoV4 {
  lojaId: string;
  termo: string;
  itens: OrigemRetornoResumoV4[];
}

export interface RespostaOrigemRetornoV4 {
  lojaId: string;
  osId: string;
  item: OrigemRetornoResumoV4 | null;
}

/** Rascunho do relato por loja+OS (memória da sessão; a senha nunca entra aqui). */
export interface RascunhoRetornoV4 extends RelatoRetornoV4 {
  /** Última operação tentada e a chave do relato que ela carregou. */
  operacao?: { id: string; chave: string };
}

export function gerarOperacaoRetornoIdV4(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `rtv4-${c.randomUUID()}`;
  return `rtv4-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Identidade da operação para ESTE relato: reusa a da tentativa anterior se o
 * relato é o mesmo (retry/resposta perdida); relato editado = operação nova.
 */
export function operacaoDoRelatoV4(
  anterior: RascunhoRetornoV4["operacao"] | undefined,
  relato: RelatoRetornoV4,
  gerar: () => string = gerarOperacaoRetornoIdV4,
): { id: string; chave: string } {
  const chave = chaveRelatoRetornoV4(relato);
  if (anterior && anterior.chave === chave) return anterior;
  return { id: gerar(), chave };
}

/**
 * A operação `operacaoId` foi concluída no servidor (retorno vinculado). Encerra a identidade
 * dela no rascunho SEM perder texto editado depois da tentativa:
 * - `undefined`: nada a fazer (sem rascunho ou a operação do rascunho é outra);
 * - `null`: o rascunho é exatamente o relato dessa operação — descartar;
 * - rascunho sem `operacao`: o relato foi editado depois — mantém o texto (comando novo).
 */
export function encerrarOperacaoNoRascunhoV4(
  rascunho: RascunhoRetornoV4 | null | undefined,
  operacaoId: string,
): RascunhoRetornoV4 | null | undefined {
  if (!rascunho?.operacao || rascunho.operacao.id !== operacaoId) return undefined;
  if (chaveRelatoRetornoV4(rascunho) === rascunho.operacao.chave) return null;
  const { operacao: _consumida, ...texto } = rascunho;
  void _consumida;
  return texto;
}
