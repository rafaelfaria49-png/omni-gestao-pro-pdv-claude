// ============================================================================
// Operações V4 — formulário multi-serviço da Nova OS (GOAL OPS-V4-MULTI-SERVICOS-UI-003).
// Lógica PURA (sem I/O, sem React): linhas do editor, validação, totais e
// conversão para o contrato `ServicoAutorizadoV4[]`. O modal (`NovaOSModal`)
// consome estes helpers; o catálogo continua vindo de `useServicosV4`.
// ============================================================================

import type { ServicoAutorizadoV4 } from "./nova-os-draft-from-form";
import { lucroEstimadoV4, margemEstimadaV4 } from "./atendimento-comercial";

/** Mínimo de caracteres para a busca do catálogo exibir resultados. */
export const MIN_QUERY_CATALOGO_V4 = 2;

/** Uma linha do editor de serviços (estado de UI; `confirmada=false` = editor aberto). */
export interface ServicoLinhaFormV4 {
  /** Identificador único da LINHA (nunca o id do catálogo). */
  key: string;
  nome: string;
  valor: number;
  custo: number;
  garantia: number;
  prazo: string;
  /** Origem no catálogo (metadata); null = serviço manual. */
  catalogoServicoId: string | null;
  /** true = card compacto; false = editor aberto. */
  confirmada: boolean;
  /** Erro de validação da linha (somente UI; nunca persiste). */
  erro: string | null;
}

/** Linha em branco (editor aberto), pronta para catálogo ou preenchimento manual. */
export function novaLinhaServicoV4(key: string): ServicoLinhaFormV4 {
  return { key, nome: "", valor: 0, custo: 0, garantia: 0, prazo: "", catalogoServicoId: null, confirmada: false, erro: null };
}

/** Snapshot de um item do catálogo para uma linha (valores seguem editáveis). */
export function linhaServicoDoCatalogoV4(
  key: string,
  s: { id: string; nome: string; preco: number; custo: number; garantia: number; tempo: string },
): ServicoLinhaFormV4 {
  return {
    key,
    nome: s.nome,
    valor: Math.max(0, s.preco),
    custo: Math.max(0, s.custo),
    garantia: Math.max(0, Math.trunc(s.garantia) || 0),
    prazo: s.tempo === "—" ? "" : s.tempo,
    catalogoServicoId: s.id?.trim() ? s.id : null,
    confirmada: false,
    erro: null,
  };
}

/** Regra de validade da linha (mesma do intake singular): descrição + venda > 0. */
export function linhaValidaServicoV4(l: ServicoLinhaFormV4): boolean {
  return l.nome.trim().length > 0 && l.valor > 0;
}

/** Mensagem de erro da linha, ou null quando válida. */
export function erroLinhaServicoV4(l: ServicoLinhaFormV4): string | null {
  if (!l.nome.trim() || !(l.valor > 0)) return "Informe a descrição e o valor de venda do serviço.";
  return null;
}

/** Atualiza uma linha por key (imutável). */
export function atualizarLinhaServicoV4(
  linhas: ServicoLinhaFormV4[],
  key: string,
  patch: Partial<Omit<ServicoLinhaFormV4, "key">>,
): ServicoLinhaFormV4[] {
  return linhas.map((l) => (l.key === key ? { ...l, ...patch } : l));
}

/** Remove uma linha por key (imutável). */
export function removerLinhaServicoV4(linhas: ServicoLinhaFormV4[], key: string): ServicoLinhaFormV4[] {
  return linhas.filter((l) => l.key !== key);
}

/** Somente linhas válidas viram contrato — item fantasma vazio nunca persiste. */
export function paraServicosAutorizadosV4(linhas: ServicoLinhaFormV4[]): ServicoAutorizadoV4[] {
  const clean = (v: string | undefined | null): string | undefined => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length ? s : undefined;
  };
  return linhas
    .filter(linhaValidaServicoV4)
    .map((l) => ({
      id: l.key,
      descricao: l.nome.trim(),
      valor: Math.max(0, l.valor),
      custo: Math.max(0, l.custo),
      garantiaDias: Math.max(0, Math.trunc(l.garantia) || 0),
      ...(clean(l.prazo) ? { prazoTexto: clean(l.prazo) } : {}),
      ...(clean(l.catalogoServicoId) ? { catalogoServicoId: clean(l.catalogoServicoId) } : {}),
    }));
}

export interface TotaisServicosV4 {
  /** Quantidade de linhas válidas. */
  qtd: number;
  /** Soma das vendas (valor comercial). */
  venda: number;
  /** Soma dos custos internos (números presentes nas linhas). */
  custo: number;
  /** venda − custo (mesma matemática do singular). */
  lucro: number;
  /** Margem % sobre a venda, ou null sem venda. */
  margem: number | null;
}

/** Agrega somente linhas válidas (mesmos helpers do singular). */
export function totaisServicosV4(linhas: ServicoLinhaFormV4[]): TotaisServicosV4 {
  const validas = linhas.filter(linhaValidaServicoV4);
  const venda = validas.reduce((acc, l) => acc + Math.max(0, l.valor), 0);
  const custo = validas.reduce((acc, l) => acc + Math.max(0, l.custo), 0);
  return { qtd: validas.length, venda, custo, lucro: lucroEstimadoV4(venda, custo), margem: margemEstimadaV4(venda, custo) };
}
