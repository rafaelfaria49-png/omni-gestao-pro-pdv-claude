/**
 * Consultas por linguagem natural sobre o motor canônico G005.
 *
 * Regra: todo número exibido vem de um campo do ResumoConsulta devolvido pela
 * PortaConsulta (G005 `consultarFinanceiro`). O motor apenas filtra linhas já
 * devolvidas (ex.: vencimento de amanhã) e soma centavos inteiros dessas linhas.
 * Sem dado → "não encontrei", nunca estimativa.
 */
import { mesAnterior, mesmoDiaMesAnterior } from "./datas"
import { mesmaCategoria } from "./categorias"
import { formatarCentavos, formatarDataCivil } from "./texto"
import type { FiltroConsulta, PlanoConsulta, PortaConsulta, ResumoConsulta } from "./tipos"

export function filtroDoPlano(dataInicio: string, dataFim: string): FiltroConsulta {
  return { base: "CAIXA_REALIZADO", timezone: "America/Sao_Paulo", moeda: "BRL", dataInicio, dataFim }
}

const soma = (valores: string[]) => valores.reduce((s, v) => s + BigInt(v), BigInt(0))

export type ResultadoConsultaTexto = { mensagens: string[]; asOf: string; versaoCalculo: string }

export async function executarConsulta(plano: PlanoConsulta, ctx: unknown, porta: PortaConsulta, hoje: string,
  rotuloPerfil: string): Promise<ResultadoConsultaTexto> {
  // Posição de títulos/contas é "atual no snapshot"; o período só afeta eventos realizados.
  const filtro = ["VENCIMENTOS", "DIVIDAS", "A_RECEBER", "SALDO", "FATURAS", "LIMITES"].includes(plano.tipo)
    ? filtroDoPlano(hoje.slice(0, 7) + "-01", hoje) : filtroDoPlano(plano.dataInicio, plano.dataFim)
  const q = await porta.consultar(ctx, filtro)
  const rodape = `(${rotuloPerfil} · base caixa realizado)`
  const ret = (mensagens: string[]): ResultadoConsultaTexto => ({ mensagens: [...mensagens, rodape], asOf: q.asOf, versaoCalculo: q.versaoCalculo })

  switch (plano.tipo) {
    case "GASTOS": {
      if (plano.categoria) {
        const linha = q.porCategoria.find(c => mesmaCategoria(c.categoria, plano.categoria!))
        if (!linha || BigInt(linha.despesaCentavos) === BigInt(0)) {
          return ret([`Não encontrei gastos em ${plano.categoria} ${plano.rotulo}.`])
        }
        return ret([`Você gastou ${formatarCentavos(linha.despesaCentavos)} em ${linha.categoria} ${plano.rotulo} (${linha.quantidade} lançamento${linha.quantidade === 1 ? "" : "s"}).`])
      }
      if (q.quantidadeRegistros === 0) return ret([`Não encontrei gastos registrados ${plano.rotulo}.`])
      return ret([`Você gastou ${formatarCentavos(q.despesaRealizadaCentavos)} ${plano.rotulo}.`])
    }
    case "POR_CATEGORIA": {
      const linhas = q.porCategoria.filter(c => BigInt(c.despesaCentavos) > BigInt(0))
        .sort((a, b) => (BigInt(b.despesaCentavos) > BigInt(a.despesaCentavos) ? 1 : -1))
      if (!linhas.length) return ret([`Não encontrei gastos registrados ${plano.rotulo}.`])
      return ret([`Gastos por categoria ${plano.rotulo}:`,
        ...linhas.map(c => `• ${c.categoria}: ${formatarCentavos(c.despesaCentavos)}`),
        `Total: ${formatarCentavos(q.despesaRealizadaCentavos)}`])
    }
    case "RECEITAS":
      if (BigInt(q.receitaRealizadaCentavos) === BigInt(0)) return ret([`Não encontrei receitas registradas ${plano.rotulo}.`])
      return ret([`Você recebeu ${formatarCentavos(q.receitaRealizadaCentavos)} ${plano.rotulo}.`])
    case "RECEITAS_DESPESAS":
      return ret([`Resumo ${plano.rotulo}:`, `• Receitas: ${formatarCentavos(q.receitaRealizadaCentavos)}`,
        `• Despesas: ${formatarCentavos(q.despesaRealizadaCentavos)}`, `• Resultado: ${formatarCentavos(q.resultadoCentavos)}`])
    case "SALDO": {
      const contas = q.contas.filter(c => c.ativo && c.tipo !== "credito")
      if (!contas.length) return ret(["Não encontrei contas ativas para calcular o saldo."])
      return ret([`Saldo atual: ${formatarCentavos(q.saldoCentavos)}`, ...contas.map(c => `• ${c.nome}: ${formatarCentavos(c.saldoCentavos)}`)])
    }
    case "DIVIDAS": {
      const abertos = q.pagar.filter(t => !t.cancelado && BigInt(t.restanteCentavos) > BigInt(0))
      if (!abertos.length) return ret(["Você não tem contas a pagar em aberto."])
      return ret([`Você ainda deve ${formatarCentavos(q.pagarAbertoCentavos)} em ${abertos.length} conta${abertos.length === 1 ? "" : "s"} a pagar.`,
        ...abertos.slice(0, 5).map(t => `• ${t.descricao}${t.contraparte ? ` (${t.contraparte})` : ""}: ${formatarCentavos(t.restanteCentavos)} — vence ${formatarDataCivil(t.vencimento)}`),
        ...(abertos.length > 5 ? [`… e mais ${abertos.length - 5}.`] : [])])
    }
    case "A_RECEBER":
      if (BigInt(q.receberAbertoCentavos) === BigInt(0)) return ret(["Você não tem valores a receber em aberto."])
      return ret([`Você tem ${formatarCentavos(q.receberAbertoCentavos)} a receber em aberto.`])
    case "VENCIMENTOS": {
      const linhas = q.pagar.filter(t => !t.cancelado && BigInt(t.restanteCentavos) > BigInt(0)
        && t.vencimento >= plano.dataInicio && t.vencimento <= plano.dataFim)
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
      if (!linhas.length) return ret([`Nenhuma conta a pagar vence ${plano.rotulo}.`])
      return ret([`Contas que vencem ${plano.rotulo}:`,
        ...linhas.map(t => `• ${t.descricao}${t.contraparte ? ` (${t.contraparte})` : ""}: ${formatarCentavos(t.restanteCentavos)} — ${formatarDataCivil(t.vencimento)}`),
        `Total: ${formatarCentavos(soma(linhas.map(t => t.restanteCentavos)))}`])
    }
    case "FATURAS": {
      // G005 `ConsultaFinanceiraDTO.cartoes[].ciclos[]` (#405): total/pago/restante por fatura, sem estimativa.
      if (!q.cartoes) return ret(["A consulta de faturas por cartão não está disponível agora. Nenhum valor foi estimado."])
      const cartoes = q.cartoes.filter(c => c.ativo)
      if (!cartoes.length) return ret(["Não há cartão de crédito cadastrado neste perfil."])
      const linhas: string[] = []
      for (const c of cartoes) {
        const abertas = c.ciclos.filter(x => x.ativo && BigInt(x.restanteCentavos) > BigInt(0))
          .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0))
        if (!abertas.length) { linhas.push(`${c.nome}: nenhuma fatura em aberto.`); continue }
        linhas.push(`${c.nome}:`, ...abertas.map(x => `• Fatura ${x.competencia} — vence ${formatarDataCivil(x.vencimento)}: `
          + `${formatarCentavos(x.restanteCentavos)} em aberto (total ${formatarCentavos(x.totalCentavos)}, pago ${formatarCentavos(x.pagoCentavos)})`))
      }
      return ret(linhas)
    }
    case "LIMITES": {
      // Limite informado no cadastro; utilizado = faturas em aberto (política de comprometimento do G004/G005).
      if (!q.cartoes) return ret(["A consulta de limites dos cartões não está disponível agora. Nenhum valor foi estimado."])
      const cartoes = q.cartoes.filter(c => c.ativo)
      if (!cartoes.length) return ret(["Não há cartão de crédito cadastrado neste perfil."])
      return ret(cartoes.map(c => c.limiteCentavos === null
        ? `${c.nome}: limite não informado no cadastro · utilizado ${formatarCentavos(c.limiteUtilizadoCentavos)}.`
        : `${c.nome}: limite ${formatarCentavos(c.limiteCentavos)} · utilizado ${formatarCentavos(c.limiteUtilizadoCentavos)} · `
          + `disponível ${formatarCentavos(c.limiteDisponivelCentavos ?? "0")}`
          + `${c.limiteExcedidoCentavos && BigInt(c.limiteExcedidoCentavos) > BigInt(0) ? ` · excedido em ${formatarCentavos(c.limiteExcedidoCentavos)}` : ""}.`))
    }
    case "COMPARATIVO": {
      const anterior = await porta.consultar(ctx, filtroDoPlano(mesAnterior(hoje).inicio, mesmoDiaMesAnterior(hoje)))
      const atual = BigInt(q.despesaRealizadaCentavos), antes = BigInt(anterior.despesaRealizadaCentavos)
      const dif = atual - antes
      const direcao = dif > BigInt(0) ? `${formatarCentavos(dif)} a mais` : dif < BigInt(0) ? `${formatarCentavos(-dif)} a menos` : "o mesmo valor"
      return ret([`Gastos até hoje neste mês: ${formatarCentavos(q.despesaRealizadaCentavos)}.`,
        `No mesmo período do mês passado: ${formatarCentavos(anterior.despesaRealizadaCentavos)}.`,
        `Diferença: ${direcao}.`])
    }
  }
}

/** Verificação usada nos testes: todo valor monetário da resposta existe no DTO ou é soma de linhas dele. */
export function valoresDaResposta(mensagens: string[]): string[] {
  return mensagens.flatMap(m => [...m.matchAll(/R\$ ([\d.]+,\d{2})/g)].map(x => x[1].replace(/\./g, "").replace(",", "")))
}

export type { ResumoConsulta }
