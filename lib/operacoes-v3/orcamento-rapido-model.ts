// ============================================================================
// Operações V3 — GOAL OPS-V4-ORC-RAPIDO-024 · MODELO puro (sem I/O, sem React)
// ----------------------------------------------------------------------------
// Tipos de entrada + validação + montagem das linhas do "⚡ Orçamento Rápido".
// Vive num arquivo separado de `orcamento-rapido-actions.ts` porque um módulo
// "use server" só pode exportar funções async — mesma disciplina de
// nova-os-model.ts/nova-os-actions.ts e atendimento-rapido-model.ts/
// atendimento-rapido-actions.ts.
// ============================================================================

import {
  MAX_LINHAS_POR_GRUPO_V3,
  VALIDADE_PADRAO_DIAS,
  type OrcamentoGrupoV3,
  type OrcamentoLinhaKindV3,
  type ServicoV3,
  type VarianteV3,
} from "./orcamento-model";
import {
  diasEntreCivisV3,
  erroFatoFuturoV3,
  fimDoDiaLojaIsoV3,
  hojeNaLojaV3,
  montarDataOperacionalV3,
  somarDiasCivisV3,
  validarDatasPropostaV3,
  validarEntradaDataV3,
  ROTULO_DATA_ENTRADA_V3,
  ROTULO_DATA_ORCAMENTO_V3,
  type CampoDataOperacionalV3,
  type DataOperacionalMetaV3,
  type ErroCampoDataV3,
} from "./datas-operacionais-model";

function uid(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
}

// ----------------------------------------------------------------------------
// Tipos de entrada
// ----------------------------------------------------------------------------

export interface OrcamentoRapidoClienteInputV3 {
  modo: "existente" | "novo";
  /** modo === "existente" (obrigatório nesse modo). */
  clienteId?: string;
  /** modo === "novo" (obrigatório nesse modo); usado como está em "existente". */
  nome?: string;
  telefone?: string;
}

export interface OrcamentoRapidoAparelhoInputV3 {
  marca: string;
  modelo: string;
}

export interface OrcamentoRapidoItemFixoInputV3 {
  descricao: string;
  valor: number;
  /** default "cobrado". */
  kindV3?: OrcamentoLinhaKindV3;
  custoV3?: number;
}

export interface OrcamentoRapidoVarianteInputV3 {
  rotulo: string;
  valor: number;
  descricaoCurta?: string;
  garantiaDias?: number;
  prazoTexto?: string;
  badge?: string;
  custoV3?: number;
}

export interface OrcamentoRapidoGrupoInputV3 {
  rotulo: string;
  variantes: OrcamentoRapidoVarianteInputV3[];
}

/**
 * Datas da PROPOSTA (aditivo). Data do orçamento e validade não são entrada
 * física: a entrada só existe quando o aparelho já está na loja.
 */
export interface OrcamentoRapidoDatasInputV3 {
  /** Data da proposta (fato; pode ser anterior). */
  dataProposta: { iso: string; meta: DataOperacionalMetaV3 };
  /** Último dia de validade (`YYYY-MM-DD`; vale até o fim do dia na loja). */
  validoAteDia: string;
  /** Só quando "Aparelho já está na loja": entrada efetiva do aparelho. */
  entradaAparelho?: { iso: string; meta: DataOperacionalMetaV3 } | null;
}

export interface OrcamentoRapidoInputV3 {
  cliente: OrcamentoRapidoClienteInputV3;
  aparelho: OrcamentoRapidoAparelhoInputV3;
  defeitoRelatado: string;
  itensFixos?: OrcamentoRapidoItemFixoInputV3[];
  grupo: OrcamentoRapidoGrupoInputV3;
  /** Ausente = padrão do servidor (proposta hoje, validade padrão, sem entrada física). */
  datas?: OrcamentoRapidoDatasInputV3;
}

/** Datas da proposta validadas, prontas para gravar. */
export interface DatasOrcamentoRapidoV3 {
  proposta: { iso: string; meta: DataOperacionalMetaV3 };
  validoAteDia: string;
  /** ISO do fim do dia da validade na loja (`orcamento.validoAte`). */
  validoAte: string;
  validadeDias: number;
  entrada: { iso: string; meta: DataOperacionalMetaV3 } | null;
}

/**
 * Valida as datas da proposta ANTES de qualquer efeito (cliente, OS, orçamento).
 * Proposta é fato (nunca futura); validade ≥ proposta e pode já estar vencida
 * (fica vencida — sem prorrogação); entrada só se informada, e nunca futura.
 */
export function normalizarDatasOrcamentoRapidoV3(
  datas: OrcamentoRapidoDatasInputV3,
  agora: Date = new Date(),
): { ok: true; datas: DatasOrcamentoRapidoV3 } | { ok: false; erros: ErroCampoDataV3[] } {
  const erros: ErroCampoDataV3[] = [];
  const p = validarEntradaDataV3(datas?.dataProposta?.iso, datas?.dataProposta?.meta, ROTULO_DATA_ORCAMENTO_V3);
  if (!p.ok || !p.meta) erros.push({ campo: "dataProposta", mensagem: p.ok ? `${ROTULO_DATA_ORCAMENTO_V3}: data inválida.` : p.mensagem });
  const entradaBruta = datas?.entradaAparelho ?? null;
  const e = entradaBruta ? validarEntradaDataV3(entradaBruta.iso, entradaBruta.meta, ROTULO_DATA_ENTRADA_V3) : null;
  if (e && (!e.ok || !e.meta)) erros.push({ campo: "dataEntrada", mensagem: e.ok ? `${ROTULO_DATA_ENTRADA_V3}: data inválida.` : e.mensagem });
  if (erros.length > 0 || !p.ok || !p.meta) return { ok: false, erros };

  const validoAteDia = (datas.validoAteDia ?? "").trim();
  const regras = validarDatasPropostaV3({ proposta: p.data, validoAteDia }, agora);
  if (e && e.ok) {
    const futura = erroFatoFuturoV3("dataEntrada", ROTULO_DATA_ENTRADA_V3, e.data, agora);
    if (futura) regras.push(futura);
  }
  if (regras.length > 0) return { ok: false, erros: regras };
  return {
    ok: true,
    datas: {
      proposta: { iso: p.data.iso, meta: p.meta },
      validoAteDia,
      validoAte: fimDoDiaLojaIsoV3(validoAteDia),
      validadeDias: Math.max(0, diasEntreCivisV3(p.meta.dia, validoAteDia)),
      entrada: e && e.ok && e.meta ? { iso: e.data.iso, meta: e.meta } : null,
    },
  };
}

/** Campos do bloco "Datas e prazos" do formulário de orçamento. */
export interface CamposDatasOrcamentoV3 {
  /** Data do orçamento (só o dia). */
  dataProposta: CampoDataOperacionalV3;
  /** Válido até (`YYYY-MM-DD`). */
  validoAteDia: string;
  /** O operador mexeu na validade (não acompanha mais a data do orçamento). */
  validadeEditada: boolean;
  /** "Aparelho já está na loja" — só então existe entrada física. */
  aparelhoNaLoja: boolean;
  dataEntrada: CampoDataOperacionalV3;
}

/** Validade padrão: data do orçamento + `VALIDADE_PADRAO_DIAS` (mesma regra do envio). */
export function validadePadraoDiaV3(dataPropostaDia: string): string {
  return somarDiasCivisV3(dataPropostaDia, VALIDADE_PADRAO_DIAS);
}

/**
 * Datas do servidor quando o chamador não envia o bloco "Datas e prazos":
 * proposta hoje (só o dia), validade padrão e NENHUMA entrada física — um
 * orçamento nunca fabrica a presença do aparelho na loja.
 */
export function datasOrcamentoRapidoPadraoV3(agora: Date = new Date()): OrcamentoRapidoDatasInputV3 {
  const hoje = hojeNaLojaV3(agora);
  const proposta = montarDataOperacionalV3({ dia: hoje, hora: "" });
  if (!proposta.ok) throw new Error("Não foi possível determinar a data de hoje na loja.");
  return { dataProposta: { iso: proposta.valor.iso, meta: proposta.valor.meta }, validoAteDia: validadePadraoDiaV3(hoje), entradaAparelho: null };
}

/** Troca a data do orçamento; a validade acompanha enquanto não foi editada à mão. */
export function alterarDataPropostaV3(campos: CamposDatasOrcamentoV3, dataProposta: CampoDataOperacionalV3): CamposDatasOrcamentoV3 {
  const novo = { ...campos, dataProposta: { ...dataProposta, hora: "", horaAutomatica: false } };
  if (!campos.validadeEditada && dataProposta.dia) novo.validoAteDia = validadePadraoDiaV3(dataProposta.dia) || campos.validoAteDia;
  return novo;
}

/**
 * Formulário → datas do input + erros por campo (mesma regra do servidor).
 * A data do orçamento vale só pelo dia; a entrada só existe com o aparelho na loja.
 */
export function resolverDatasOrcamentoFormV3(
  campos: CamposDatasOrcamentoV3,
  agora: Date = new Date(),
): { datas: OrcamentoRapidoDatasInputV3 | null; erros: ErroCampoDataV3[] } {
  const erros: ErroCampoDataV3[] = [];
  const p = montarDataOperacionalV3({ dia: campos.dataProposta.dia, hora: "" });
  if (!p.ok) erros.push({ campo: "dataProposta", mensagem: p.mensagem });
  const e = campos.aparelhoNaLoja ? montarDataOperacionalV3(campos.dataEntrada) : null;
  if (e && !e.ok) erros.push({ campo: "dataEntrada", mensagem: e.mensagem });
  if (erros.length > 0 || !p.ok || (e && !e.ok)) return { datas: null, erros };
  const datas: OrcamentoRapidoDatasInputV3 = {
    dataProposta: p.valor,
    validoAteDia: campos.validoAteDia,
    entradaAparelho: e && e.ok ? e.valor : null,
  };
  const r = normalizarDatasOrcamentoRapidoV3(datas, agora);
  return r.ok ? { datas, erros: [] } : { datas: null, erros: r.erros };
}

export interface CriarOrcamentoRapidoResultV3 {
  osId: string;
  codigo?: string;
  clienteNome: string;
}

// ----------------------------------------------------------------------------
// Validação (pura, sem I/O) — mensagens amigáveis, falha ANTES de criar a OS.
// ----------------------------------------------------------------------------

export function validarOrcamentoRapidoInputV3(input: OrcamentoRapidoInputV3): string | null {
  if (input.cliente.modo === "existente" && !input.cliente.clienteId?.trim()) {
    return "Selecione o cliente existente.";
  }
  if (input.cliente.modo === "novo" && !input.cliente.nome?.trim()) {
    return "Informe o nome do cliente.";
  }
  if (!input.aparelho?.marca?.trim() || !input.aparelho?.modelo?.trim()) {
    return "Informe marca e modelo do aparelho.";
  }
  if (!input.defeitoRelatado?.trim()) {
    return "Descreva o defeito relatado pelo cliente.";
  }
  if (!input.grupo?.rotulo?.trim()) {
    return "Informe o rótulo do grupo de escolha.";
  }
  const variantes = Array.isArray(input.grupo.variantes) ? input.grupo.variantes : [];
  if (variantes.length < 2) {
    return "O grupo de escolha precisa de pelo menos 2 opções.";
  }
  if (variantes.length > MAX_LINHAS_POR_GRUPO_V3) {
    return `O grupo de escolha aceita no máximo ${MAX_LINHAS_POR_GRUPO_V3} opções.`;
  }
  for (const v of variantes) {
    if (!v.rotulo?.trim()) return "Toda opção do grupo precisa de um rótulo.";
    const valor = Number(v.valor);
    if (!Number.isFinite(valor) || valor < 0) return `Informe um preço válido para "${v.rotulo}".`;
  }
  const comBadge = variantes.filter((v) => v.badge?.trim()).length;
  if (comBadge > 1) return "Use no máximo 1 selo (badge) por grupo.";
  for (const it of input.itensFixos ?? []) {
    if (!it.descricao?.trim()) return "Há um item fixo sem descrição.";
  }
  return null;
}

// ----------------------------------------------------------------------------
// Montagem (pura, sem I/O) — itens fixos + linhas do grupo como ServicoV3[].
// Orçamento Rápido não tem catálogo/peça: tudo entra como serviço.
// ----------------------------------------------------------------------------

export function montarServicosOrcamentoRapidoV3(input: OrcamentoRapidoInputV3, grupoId: string): ServicoV3[] {
  const fixos: ServicoV3[] = (input.itensFixos ?? []).map((it) => {
    const kind: OrcamentoLinhaKindV3 = it.kindV3 === "brinde" || it.kindV3 === "interno" ? it.kindV3 : "cobrado";
    const custo = Math.max(0, Number(it.custoV3) || 0);
    return {
      id: uid("orcrap-fix"),
      descricao: it.descricao.trim(),
      valor: kind === "cobrado" ? Math.max(0, Number(it.valor) || 0) : 0,
      kindV3: kind,
      ...(custo > 0 ? { custoV3: custo } : {}),
    };
  });

  const variantes: ServicoV3[] = input.grupo.variantes.map((v) => {
    const custo = Math.max(0, Number(v.custoV3) || 0);
    const varianteV3: VarianteV3 = { rotulo: v.rotulo.trim() };
    const descricaoCurta = v.descricaoCurta?.trim();
    if (descricaoCurta) varianteV3.descricaoCurta = descricaoCurta;
    if (typeof v.garantiaDias === "number" && v.garantiaDias > 0) varianteV3.garantiaDias = Math.trunc(v.garantiaDias);
    const prazoTexto = v.prazoTexto?.trim();
    if (prazoTexto) varianteV3.prazoTexto = prazoTexto;
    const badge = v.badge?.trim();
    if (badge) varianteV3.badge = badge;
    return {
      id: uid("orcrap-opt"),
      descricao: v.rotulo.trim(),
      valor: Math.max(0, Number(v.valor) || 0),
      kindV3: "cobrado" as const,
      grupoId,
      varianteV3,
      ...(custo > 0 ? { custoV3: custo } : {}),
    };
  });

  return [...fixos, ...variantes];
}

export function montarGrupoMetaOrcamentoRapidoV3(input: OrcamentoRapidoInputV3, grupoId: string): OrcamentoGrupoV3 {
  return { id: grupoId, rotulo: input.grupo.rotulo.trim(), regra: "escolha_1" };
}

/** Gera um id de grupo (exportado para a action reusar o mesmo gerador). */
export function novoGrupoIdOrcamentoRapidoV3(): string {
  return uid("grp");
}
