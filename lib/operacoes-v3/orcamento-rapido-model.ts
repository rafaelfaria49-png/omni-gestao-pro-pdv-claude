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
  type OrcamentoGrupoV3,
  type OrcamentoLinhaKindV3,
  type ServicoV3,
  type VarianteV3,
} from "./orcamento-model";

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

export interface OrcamentoRapidoInputV3 {
  cliente: OrcamentoRapidoClienteInputV3;
  aparelho: OrcamentoRapidoAparelhoInputV3;
  defeitoRelatado: string;
  itensFixos?: OrcamentoRapidoItemFixoInputV3[];
  grupo: OrcamentoRapidoGrupoInputV3;
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
