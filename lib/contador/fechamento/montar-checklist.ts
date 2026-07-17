/**
 * Contador HUB · montagem pura do checklist de fechamento (GOAL 007).
 *
 * Prefere o DTO já carregado pelo GOAL 006 — zero reconsulta Prisma/readers.
 * Sinais sem evidência suficiente → `nao_disponivel` (nunca inventados).
 * Fechamento real com snapshot permanece fora de escopo (GOAL 012).
 */
import type { Competencia } from "@/lib/contador/competencia"
import type {
  ContadorDadosReais,
  DadoMonetario,
  DadoNumerico,
} from "@/lib/contador/readers/tipos"
import type {
  ChecklistFechamento,
  ChecklistItemFechamento,
  ContagemChecklist,
  EstadoChecklistItem,
} from "./tipos"

const DISCLAIMER =
  "Checklist derivado de sinais reais da competência — somente leitura. " +
  "Não constitui fechamento oficial, snapshot nem trava de competência. " +
  "O fechamento real com snapshot será implementado em fase posterior (GOAL 012)."

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export type MontarChecklistFechamentoInput = Readonly<{
  /** DTO do GOAL 006. `null` = escopo/leitura indisponível (todos os sinais sem evidência). */
  dados: ContadorDadosReais | null
  competencia: Competencia
  /** Instante de montagem (injetável para testes). */
  agora?: Date
  /** Motivo honesto quando `dados` é null (escopo, cookie, ACL, falha). */
  motivoIndisponivel?: string | null
}>

function fmtMoney(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—"
  return BRL.format(valor)
}

function contagemDe(itens: readonly ChecklistItemFechamento[]): ContagemChecklist {
  const c = { ok: 0, atencao: 0, pendente: 0, nao_disponivel: 0, total: itens.length }
  for (const it of itens) {
    c[it.estado] += 1
  }
  return Object.freeze(c)
}

function item(
  partial: Omit<ChecklistItemFechamento, "estado"> & { estado: EstadoChecklistItem },
): ChecklistItemFechamento {
  return Object.freeze({ ...partial })
}

function dispDe(d: DadoMonetario | DadoNumerico): "real" | "parcial" | "indisponivel" {
  return d.disponibilidade
}

/**
 * Monta o checklist de fechamento a partir do DTO já carregado.
 * Puro e determinístico para o mesmo `dados` + `agora`.
 */
export function montarChecklistFechamento(
  input: MontarChecklistFechamentoInput,
): ChecklistFechamento {
  const { dados, competencia, motivoIndisponivel } = input
  const agora = input.agora ?? new Date()
  const geradoEm = agora.toISOString()

  if (!dados) {
    const motivo =
      motivoIndisponivel?.trim() ||
      "Dados reais da competência não estão disponíveis (escopo ou leitura)."
    const itens = SINAIS_BASE.map((s) =>
      item({
        id: s.id,
        titulo: s.titulo,
        estado: s.id === "fechamento_oficial" ? "pendente" : "nao_disponivel",
        origem: s.id === "fechamento_oficial" ? "GOAL 012 (não implementado)" : "ContadorDadosReais (ausente)",
        explicacao:
          s.id === "fechamento_oficial"
            ? "Fechamento real com snapshot ainda não existe. O botão permanece desabilitado."
            : motivo,
        evidencia: s.id === "fechamento_oficial" ? "sem snapshot" : "sem DTO",
      }),
    )
    return Object.freeze({
      competencia: Object.freeze({ ano: competencia.ano, mes: competencia.mes }),
      itens: Object.freeze(itens),
      contagem: contagemDe(itens),
      disclaimer: DISCLAIMER,
      geradoEm,
    })
  }

  const itens: ChecklistItemFechamento[] = [
    derivarVendas(dados),
    derivarDevolucoes(dados),
    derivarLiquido(dados),
    derivarFormasPagamento(dados),
    derivarMovimentacoes(dados),
    derivarTitulosReceber(dados),
    derivarTitulosPagar(dados),
    derivarSessoesCaixa(dados),
    derivarDiferencasCaixa(dados),
    derivarFiscal(dados),
    derivarFechamentoOficial(),
  ]

  return Object.freeze({
    competencia: Object.freeze({
      ano: dados.competencia.ano,
      mes: dados.competencia.mes,
    }),
    itens: Object.freeze(itens),
    contagem: contagemDe(itens),
    disclaimer: DISCLAIMER,
    geradoEm,
  })
}

/* ─────────────────────────── sinais ─────────────────────────── */

const SINAIS_BASE = [
  { id: "vendas", titulo: "Vendas da competência" },
  { id: "devolucoes", titulo: "Devoluções da competência" },
  { id: "liquido", titulo: "Líquido da competência" },
  { id: "formas_pagamento", titulo: "Formas de pagamento das vendas" },
  { id: "movimentacoes", titulo: "Movimentações financeiras" },
  { id: "titulos_receber", titulo: "Títulos a receber em aberto" },
  { id: "titulos_pagar", titulo: "Títulos a pagar em aberto" },
  { id: "sessoes_caixa", titulo: "Sessões de caixa da competência" },
  { id: "diferencas_caixa", titulo: "Diferenças de conferência de caixa" },
  { id: "fiscal", titulo: "Notas fiscais da competência" },
  { id: "fechamento_oficial", titulo: "Fechamento oficial com snapshot" },
] as const

function derivarVendas(dados: ContadorDadosReais): ChecklistItemFechamento {
  const { quantidade, total } = dados.vendas
  const origem = total.fonte
  if (dispDe(total) === "indisponivel" || dispDe(quantidade) === "indisponivel") {
    return item({
      id: "vendas",
      titulo: "Vendas da competência",
      estado: "nao_disponivel",
      origem,
      explicacao: total.observacao ?? "Fonte de vendas indisponível; não há evidência segura.",
      evidencia: "—",
    })
  }
  const qtd = quantidade.valor ?? 0
  const valor = total.valor ?? 0
  return item({
    id: "vendas",
    titulo: "Vendas da competência",
    estado: "ok",
    origem,
    explicacao:
      qtd === 0
        ? "Nenhuma venda não-cancelada na competência (leitura real)."
        : `${qtd} venda(s) não-cancelada(s) lidas de Venda.total (exclui canceladas).`,
    evidencia: `${qtd} · ${fmtMoney(valor)}`,
  })
}

function derivarDevolucoes(dados: ContadorDadosReais): ChecklistItemFechamento {
  const { quantidade, total } = dados.devolucoes
  const origem = total.fonte
  if (dispDe(total) === "indisponivel") {
    return item({
      id: "devolucoes",
      titulo: "Devoluções da competência",
      estado: "nao_disponivel",
      origem,
      explicacao: total.observacao ?? "Fonte de devoluções indisponível.",
      evidencia: "—",
    })
  }
  const qtd = quantidade.valor ?? 0
  const valor = total.valor ?? 0
  return item({
    id: "devolucoes",
    titulo: "Devoluções da competência",
    estado: "ok",
    origem,
    explicacao:
      qtd === 0
        ? "Nenhuma devolução na competência (leitura real)."
        : `${qtd} devolução(ões) reduzem o líquido da competência em que ocorreram.`,
    evidencia: `${qtd} · ${fmtMoney(valor)}`,
  })
}

function derivarLiquido(dados: ContadorDadosReais): ChecklistItemFechamento {
  const liq = dados.liquidoCompetencia
  if (dispDe(liq) === "indisponivel") {
    return item({
      id: "liquido",
      titulo: "Líquido da competência",
      estado: "nao_disponivel",
      origem: liq.fonte,
      explicacao: liq.observacao ?? "Líquido não calculável sem vendas e devoluções.",
      evidencia: "—",
    })
  }
  return item({
    id: "liquido",
    titulo: "Líquido da competência",
    estado: "ok",
    origem: liq.fonte,
    explicacao: liq.observacao ?? "Vendas − devoluções (subtração única).",
    evidencia: fmtMoney(liq.valor),
  })
}

function derivarFormasPagamento(dados: ContadorDadosReais): ChecklistItemFechamento {
  const v = dados.vendas
  const origem = "Venda.payload.paymentBreakdown"
  if (v.formaPagamentoDisponibilidade === "indisponivel" || dispDe(v.total) === "indisponivel") {
    return item({
      id: "formas_pagamento",
      titulo: "Formas de pagamento das vendas",
      estado: "nao_disponivel",
      origem,
      explicacao: "Fonte de vendas/breakdown indisponível; não há evidência de formas de pagamento.",
      evidencia: "—",
    })
  }

  const rec = v.reconciliacaoPagamento
  const residual = rec?.residualNaoIdentificado ?? 0
  const excedente = rec?.excedenteBreakdown ?? 0
  const naoId = v.naoIdentificadoQuantidade.valor ?? 0

  if (residual > 0 || excedente > 0 || naoId > 0 || v.formaPagamentoDisponibilidade === "parcial") {
    const partes: string[] = []
    if (residual > 0) partes.push(`residual ${fmtMoney(residual)}`)
    if (excedente > 0) partes.push(`excedente ${fmtMoney(excedente)}`)
    if (naoId > 0) partes.push(`${naoId} venda(s) sem forma completa`)
    if (v.formaPagamentoDisponibilidade === "parcial" && partes.length === 0) {
      partes.push("cobertura parcial do breakdown")
    }
    return item({
      id: "formas_pagamento",
      titulo: "Formas de pagamento das vendas",
      estado: "atencao",
      origem,
      explicacao: `Breakdown com ressalva: ${partes.join("; ")}. O total autoritativo continua sendo Venda.total.`,
      evidencia: rec
        ? `reconciliado=${rec.reconciliado ? "sim" : "não"} · divergência ${fmtMoney(rec.divergenciaAbsoluta)}`
        : "parcial",
    })
  }

  return item({
    id: "formas_pagamento",
    titulo: "Formas de pagamento das vendas",
    estado: "ok",
    origem,
    explicacao: "Breakdown reconciliado com Venda.total (sem residual/excedente reportado).",
    evidencia: rec ? `total breakdown ${fmtMoney(rec.totalBreakdown)}` : "ok",
  })
}

function derivarMovimentacoes(dados: ContadorDadosReais): ChecklistItemFechamento {
  const f = dados.financeiro
  const origem = f.entradasRealizadas.fonte
  if (
    dispDe(f.entradasRealizadas) === "indisponivel" ||
    dispDe(f.saidasRealizadas) === "indisponivel"
  ) {
    return item({
      id: "movimentacoes",
      titulo: "Movimentações financeiras",
      estado: "nao_disponivel",
      origem,
      explicacao:
        f.entradasRealizadas.observacao ??
        "Fonte MovimentacaoFinanceira indisponível.",
      evidencia: "—",
    })
  }

  const naoClass = f.naoClassificadosQuantidade.valor ?? 0
  if (naoClass > 0) {
    return item({
      id: "movimentacoes",
      titulo: "Movimentações financeiras",
      estado: "atencao",
      origem,
      explicacao: `${naoClass} movimento(s) com origem não classificada ficaram fora de entradas/saídas.`,
      evidencia: `entradas ${fmtMoney(f.entradasRealizadas.valor)} · saídas ${fmtMoney(f.saidasRealizadas.valor)} · não class. ${fmtMoney(f.naoClassificados.valor)}`,
    })
  }

  return item({
    id: "movimentacoes",
    titulo: "Movimentações financeiras",
    estado: "ok",
    origem,
    explicacao: "Entradas e saídas realizadas lidas de MovimentacaoFinanceira (sem origens órfãs).",
    evidencia: `entradas ${fmtMoney(f.entradasRealizadas.valor)} · saídas ${fmtMoney(f.saidasRealizadas.valor)}`,
  })
}

function derivarTitulosReceber(dados: ContadorDadosReais): ChecklistItemFechamento {
  const mon = dados.financeiro.titulosReceberAberto
  const qtd = dados.financeiro.titulosReceberQuantidade
  const origem = mon.fonte
  if (dispDe(mon) === "indisponivel") {
    return item({
      id: "titulos_receber",
      titulo: "Títulos a receber em aberto",
      estado: "nao_disponivel",
      origem,
      explicacao: mon.observacao ?? "Fonte ContaReceberTitulo indisponível.",
      evidencia: "—",
    })
  }
  const n = qtd.valor ?? 0
  if (dispDe(mon) === "parcial" || n > 0) {
    return item({
      id: "titulos_receber",
      titulo: "Títulos a receber em aberto",
      estado: "atencao",
      origem,
      explicacao:
        dispDe(mon) === "parcial"
          ? (mon.observacao ?? "Cobertura parcial de vencimentos; posição incompleta.")
          : `${n} título(s) em aberto com vencimento na competência (posição, não realizado).`,
      evidencia: `${n} · ${fmtMoney(mon.valor)}`,
    })
  }
  return item({
    id: "titulos_receber",
    titulo: "Títulos a receber em aberto",
    estado: "ok",
    origem,
    explicacao: "Nenhum título a receber em aberto com vencimento na competência.",
    evidencia: `0 · ${fmtMoney(0)}`,
  })
}

function derivarTitulosPagar(dados: ContadorDadosReais): ChecklistItemFechamento {
  const mon = dados.financeiro.titulosPagarAberto
  const qtd = dados.financeiro.titulosPagarQuantidade
  const origem = mon.fonte
  if (dispDe(mon) === "indisponivel") {
    return item({
      id: "titulos_pagar",
      titulo: "Títulos a pagar em aberto",
      estado: "nao_disponivel",
      origem,
      explicacao: mon.observacao ?? "Fonte ContaPagarTitulo indisponível.",
      evidencia: "—",
    })
  }
  const n = qtd.valor ?? 0
  if (dispDe(mon) === "parcial" || n > 0) {
    return item({
      id: "titulos_pagar",
      titulo: "Títulos a pagar em aberto",
      estado: "atencao",
      origem,
      explicacao:
        dispDe(mon) === "parcial"
          ? (mon.observacao ?? "Cobertura parcial de vencimentos; posição incompleta.")
          : `${n} título(s) a pagar em aberto com vencimento na competência (posição, não realizado).`,
      evidencia: `${n} · ${fmtMoney(mon.valor)}`,
    })
  }
  return item({
    id: "titulos_pagar",
    titulo: "Títulos a pagar em aberto",
    estado: "ok",
    origem,
    explicacao: "Nenhum título a pagar em aberto com vencimento na competência.",
    evidencia: `0 · ${fmtMoney(0)}`,
  })
}

function derivarSessoesCaixa(dados: ContadorDadosReais): ChecklistItemFechamento {
  const sessoes = dados.caixa.sessoes
  const abertas = dados.caixa.sessoesAbertas
  const origem = sessoes.fonte
  if (dispDe(sessoes) === "indisponivel") {
    return item({
      id: "sessoes_caixa",
      titulo: "Sessões de caixa da competência",
      estado: "nao_disponivel",
      origem,
      explicacao: sessoes.observacao ?? "Fonte SessaoCaixa indisponível.",
      evidencia: "—",
    })
  }
  const total = sessoes.valor ?? 0
  const nAbertas = abertas.valor ?? 0
  if (nAbertas > 0) {
    return item({
      id: "sessoes_caixa",
      titulo: "Sessões de caixa da competência",
      estado: "atencao",
      origem,
      explicacao: `${nAbertas} sessão(ões) ainda aberta(s) na competência (caixa físico ≠ contábil).`,
      evidencia: `${total} sessão(ões) · ${nAbertas} aberta(s)`,
    })
  }
  return item({
    id: "sessoes_caixa",
    titulo: "Sessões de caixa da competência",
    estado: "ok",
    origem,
    explicacao:
      total === 0
        ? "Nenhuma sessão de caixa aberta no período da competência."
        : `${total} sessão(ões) no período; nenhuma permanece aberta.`,
    evidencia: `${total} sessão(ões) · 0 aberta(s)`,
  })
}

function derivarDiferencasCaixa(dados: ContadorDadosReais): ChecklistItemFechamento {
  const d = dados.caixa.diferencas
  const origem = d.fonte
  if (dispDe(d) === "indisponivel") {
    return item({
      id: "diferencas_caixa",
      titulo: "Diferenças de conferência de caixa",
      estado: "nao_disponivel",
      origem,
      explicacao: d.observacao ?? "Sem sessões fechadas com conferência de saldo.",
      evidencia: "—",
    })
  }
  const valor = d.valor ?? 0
  if (valor !== 0 || dispDe(d) === "parcial") {
    return item({
      id: "diferencas_caixa",
      titulo: "Diferenças de conferência de caixa",
      estado: "atencao",
      origem,
      explicacao:
        dispDe(d) === "parcial"
          ? (d.observacao ?? "Conferência parcial entre sessões fechadas.")
          : `Há diferença de conferência (Σ saldoContado − saldoFinal = ${fmtMoney(valor)}).`,
      evidencia: fmtMoney(valor),
    })
  }
  return item({
    id: "diferencas_caixa",
    titulo: "Diferenças de conferência de caixa",
    estado: "ok",
    origem,
    explicacao: "Sessões conferidas sem diferença (Σ saldoContado − saldoFinal = 0).",
    evidencia: fmtMoney(0),
  })
}

function derivarFiscal(dados: ContadorDadosReais): ChecklistItemFechamento {
  const f = dados.fiscal
  return item({
    id: "fiscal",
    titulo: "Notas fiscais da competência",
    estado: "nao_disponivel",
    origem: f.fonte,
    explicacao:
      f.observacao ??
      "Fonte fiscal permanece atrás de CONTADOR_FISCAL_READER e não é consultada neste módulo.",
    evidencia: "não consultado",
  })
}

function derivarFechamentoOficial(): ChecklistItemFechamento {
  return item({
    id: "fechamento_oficial",
    titulo: "Fechamento oficial com snapshot",
    estado: "pendente",
    origem: "GOAL 012 (não implementado)",
    explicacao:
      "Não há fechamento real, snapshot nem trava de competência. O botão «Fechar competência» permanece desabilitado até o GOAL 012.",
    evidencia: "sem snapshot",
  })
}
