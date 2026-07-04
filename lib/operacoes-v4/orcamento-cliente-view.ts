// ============================================================================
// Operações V4 — GOAL OPS-V4-ORC-VIEWMODEL-DOC-023
// ----------------------------------------------------------------------------
// Projeção CLIENT-SAFE do orçamento real da OS, para o documento "Orçamento
// (via cliente)". Módulo PURO (sem I/O, sem React). O builder COPIA campo a
// campo o que é seguro mostrar ao cliente — nunca repassa um objeto de linha,
// de orçamento ou de OS inteiro. Reusa exclusivamente leitores/cálculos já
// existentes (`orcamento-model.ts`) — nenhuma aritmética nova aqui.
//
// O que esta projeção contém (whitelist estrita, ver `OrcamentoClienteViewV4`):
// identidade da loja (nome/documento/contato), número da OS, data de criação
// do orçamento, validade, nome do cliente, marca/modelo do aparelho, defeito
// relatado, linhas fixas visíveis (com marcação de cortesia), grupos de
// escolha com suas variantes (rótulo/descrição curta/garantia/prazo/selo/
// valor/"total com esta opção"/seleção), totais (exato ou faixa) e uma
// observação geral opcional (a do PRÓPRIO orçamento, nunca a lista de
// observações técnicas da OS). Linha classificada como não-visível ao cliente
// nunca chega a esta projeção — ver `KIND_META_V3` em `orcamento-model.ts`.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import {
  computeTotaisV3,
  linhaKind,
  orcamentoRealV3,
  pecaValorCliente,
  servicoValorCliente,
  VALIDADE_PADRAO_DIAS,
  type OrcamentoLinhaKindV3,
  type PecaV3,
  type ServicoV3,
} from "@/lib/operacoes-v3/orcamento-model";
import { dadosEmpresaPrintV3, type EmpresaPrintInputV3 } from "@/lib/operacoes-v3/print-model";

export interface OrcamentoClienteLojaV4 {
  nome: string;
  documento: string;
  contato: string;
}

export interface OrcamentoClienteClienteV4 {
  nome: string;
}

export interface OrcamentoClienteAparelhoV4 {
  marca: string;
  modelo: string;
}

export interface OrcamentoClienteValidadeV4 {
  /** Presente quando o orçamento já foi enviado (data real gravada). */
  validoAte?: string;
  /** Presente quando ainda não foi enviado — texto de política, nunca uma data inventada. */
  politicaTexto?: string;
}

export interface OrcamentoClienteItemFixoV4 {
  descricao: string;
  quantidade: number;
  valorCliente: number;
  /** true quando a linha é cortesia (sem custo ao cliente, ainda assim visível). */
  cortesia?: boolean;
}

export interface OrcamentoClienteVarianteV4 {
  rotulo: string;
  descricaoCurta?: string;
  garantiaDias?: number;
  prazoTexto?: string;
  badge?: string;
  /** Valor ao cliente só desta linha (0 quando a variante é cortesia). */
  valorVariante: number;
  /** Total do orçamento inteiro SE esta variante for a escolhida do grupo. */
  totalComOpcao: number;
  selecionada: boolean;
}

export interface OrcamentoClienteGrupoV4 {
  rotulo: string;
  variantes: OrcamentoClienteVarianteV4[];
}

export interface OrcamentoClienteTotaisV4 {
  /** Presente quando não há grupo pendente de escolha (valor fechado). */
  exato?: number;
  /** Presente quando ≥1 grupo ainda não tem variante selecionada. */
  faixa?: { min: number; max: number };
}

export interface OrcamentoClienteViewV4 {
  loja: OrcamentoClienteLojaV4;
  osNumero: string;
  dataCriacao: string;
  validade: OrcamentoClienteValidadeV4;
  cliente: OrcamentoClienteClienteV4;
  aparelho: OrcamentoClienteAparelhoV4;
  defeitoRelatado: string;
  itensFixosVisiveis: OrcamentoClienteItemFixoV4[];
  grupos: OrcamentoClienteGrupoV4[];
  totais: OrcamentoClienteTotaisV4;
  observacoesAoCliente?: string;
}

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

type LinhaComGrupoV4 = { id: string; grupoId?: string; selecionadaV3?: boolean };

/** Cópia das linhas com `selecionadaV3` recalculado SÓ para o grupo `grupoId` (demais grupos preservados como estão). */
function marcarSelecaoV4<T extends LinhaComGrupoV4>(linhas: T[], grupoId: string, linhaSelecionadaId: string): T[] {
  return linhas.map((l) => ((l.grupoId ?? "").trim() === grupoId ? { ...l, selecionadaV3: l.id === linhaSelecionadaId } : l));
}

/**
 * Monta a projeção client-safe do orçamento REAL da OS. Retorna `null` quando
 * não há orçamento materializado (prévia/ausente) — nada a mostrar, sem
 * inventar um documento vazio.
 */
export function montarOrcamentoClienteViewV4(os: OrdemServico, empresa?: EmpresaPrintInputV3): OrcamentoClienteViewV4 | null {
  const orc = orcamentoRealV3(os);
  if (!orc) return null;

  const pecas = Array.isArray(orc.pecas) ? orc.pecas : [];
  const servicos = Array.isArray(orc.servicos) ? orc.servicos : [];

  const empresaDados = dadosEmpresaPrintV3(empresa);
  const loja: OrcamentoClienteLojaV4 = {
    nome: empresaDados.nome,
    documento: empresaDados.cnpj,
    contato: [empresaDados.telefone, empresaDados.email].filter(Boolean).join(" · "),
  };

  // Linhas fixas (sem grupoId), nunca "interno" (KIND_META_V3.interno.visivelCliente === false).
  const itensFixosVisiveis: OrcamentoClienteItemFixoV4[] = [];
  for (const p of pecas) {
    if (txt(p.grupoId)) continue;
    const kind = linhaKind(p);
    if (kind === "interno") continue;
    itensFixosVisiveis.push({
      descricao: txt(p.nome) || "Peça",
      quantidade: Math.max(1, Math.trunc(p.quantidade || 1)),
      valorCliente: pecaValorCliente(p),
      ...(kind === "brinde" ? { cortesia: true as const } : {}),
    });
  }
  for (const sv of servicos) {
    if (txt(sv.grupoId)) continue;
    const kind = linhaKind(sv);
    if (kind === "interno") continue;
    itensFixosVisiveis.push({
      descricao: txt(sv.descricao) || "Serviço",
      quantidade: 1,
      valorCliente: servicoValorCliente(sv),
      ...(kind === "brinde" ? { cortesia: true as const } : {}),
    });
  }

  // Grupos de escolha (rótulo real de `gruposV3`; fallback honesto quando ausente).
  const rotuloPorGrupo = new Map<string, string>();
  for (const g of orc.gruposV3 ?? []) {
    const id = txt(g.id);
    const rotulo = txt(g.rotulo);
    if (id && rotulo) rotuloPorGrupo.set(id, rotulo);
  }

  type MembroGrupoV4 = { tipo: "peca" | "servico"; linha: PecaV3 | ServicoV3; kind: OrcamentoLinhaKindV3 };
  const ordemGrupos: string[] = [];
  const membrosPorGrupo = new Map<string, MembroGrupoV4[]>();
  const registrarMembro = (gid: string, membro: MembroGrupoV4) => {
    if (!membrosPorGrupo.has(gid)) {
      membrosPorGrupo.set(gid, []);
      ordemGrupos.push(gid);
    }
    membrosPorGrupo.get(gid)!.push(membro);
  };
  for (const p of pecas) {
    const gid = txt(p.grupoId);
    const kind = linhaKind(p);
    if (!gid || kind === "interno") continue;
    registrarMembro(gid, { tipo: "peca", linha: p, kind });
  }
  for (const sv of servicos) {
    const gid = txt(sv.grupoId);
    const kind = linhaKind(sv);
    if (!gid || kind === "interno") continue;
    registrarMembro(gid, { tipo: "servico", linha: sv, kind });
  }

  const grupos: OrcamentoClienteGrupoV4[] = ordemGrupos.map((gid, idx) => {
    const membros = membrosPorGrupo.get(gid) ?? [];
    const variantes: OrcamentoClienteVarianteV4[] = membros.map((m) => {
      const variante = m.linha.varianteV3;
      const rotuloVariante =
        txt(variante?.rotulo) || (m.tipo === "peca" ? txt((m.linha as PecaV3).nome) : txt((m.linha as ServicoV3).descricao)) || "Opção";
      const valorVariante = m.tipo === "peca" ? pecaValorCliente(m.linha as PecaV3) : servicoValorCliente(m.linha as ServicoV3);
      const pecasComSelecao = marcarSelecaoV4(pecas, gid, m.linha.id);
      const servicosComSelecao = marcarSelecaoV4(servicos, gid, m.linha.id);
      const totalComOpcao = computeTotaisV3({ pecas: pecasComSelecao, servicos: servicosComSelecao, desconto: orc.desconto }).total;
      return {
        rotulo: rotuloVariante,
        descricaoCurta: txt(variante?.descricaoCurta) || undefined,
        garantiaDias: typeof variante?.garantiaDias === "number" && variante.garantiaDias > 0 ? variante.garantiaDias : undefined,
        prazoTexto: txt(variante?.prazoTexto) || undefined,
        badge: txt(variante?.badge) || undefined,
        valorVariante,
        totalComOpcao,
        selecionada: m.linha.selecionadaV3 === true,
      };
    });
    return { rotulo: rotuloPorGrupo.get(gid) || `Opções ${idx + 1}`, variantes };
  });

  const totaisGerais = computeTotaisV3({ pecas, servicos, desconto: orc.desconto });
  const totais: OrcamentoClienteTotaisV4 = totaisGerais.faixa
    ? { faixa: { min: totaisGerais.faixa.min, max: totaisGerais.faixa.max } }
    : { exato: totaisGerais.total };

  const validade: OrcamentoClienteValidadeV4 = orc.validoAte
    ? { validoAte: orc.validoAte }
    : { politicaTexto: `Validade de ${VALIDADE_PADRAO_DIAS} dias a partir do envio ao cliente.` };

  const observacaoOrcamento = txt(orc.observacao);

  return {
    loja,
    osNumero: txt(os.codigo) || "—",
    dataCriacao: txt(orc.criadoEm),
    validade,
    cliente: { nome: txt(os.cliente?.nome) },
    aparelho: { marca: txt(os.equipamento?.marca), modelo: txt(os.equipamento?.modelo) },
    defeitoRelatado: txt(os.equipamento?.defeitoRelatado),
    itensFixosVisiveis,
    grupos,
    totais,
    observacoesAoCliente: observacaoOrcamento || undefined,
  };
}
