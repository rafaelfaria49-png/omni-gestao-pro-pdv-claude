/**
 * Contador HUB · Pacote do Contador — arquivos de conteúdo (puro, sem IO/DB/ZIP).
 *
 * GOAL 008. Deriva CSVs, resumo, avisos e placeholders honestos EXCLUSIVAMENTE do
 * DTO público do GOAL 006 (`ContadorDadosReais`) e do checklist read-only do GOAL 007
 * (`ChecklistFechamento`). Nunca toca linhas cruas (payload/PII) — por isso o volume é
 * pequeno e previsível, independentemente do número de vendas da competência.
 *
 * Regra de honestidade preservada: valor `indisponível` vira célula VAZIA (nunca 0);
 * cada métrica carrega disponibilidade, fonte e observação.
 */
import {
  formatCompetencia,
  labelCompetencia,
  type Competencia,
} from "@/lib/contador/competencia"
import type {
  ContadorDadosReais,
  DadoMonetario,
  DadoNumerico,
} from "@/lib/contador/readers/tipos"
import type { ChecklistFechamento } from "@/lib/contador/fechamento"
import { montarCsv, numero, texto, type CelulaCsv } from "./csv"
import type { ArquivoPacote } from "./tipos"

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const CABECALHO_METRICA = ["campo", "valor", "disponibilidade", "fonte", "observacao"] as const

function dispLabel(d: "real" | "parcial" | "indisponivel"): string {
  return d === "indisponivel" ? "indisponível" : d
}

function fmtBRL(valor: number | null): string {
  return valor === null ? "—" : BRL.format(valor)
}

function fmtNum(dado: DadoNumerico): string {
  return dado.valor === null ? "—" : String(dado.valor)
}

function seloDisp(d: "real" | "parcial" | "indisponivel"): string {
  return d === "real" ? "" : ` (${dispLabel(d)})`
}

/** Uma linha de métrica: valor nulo → célula vazia (honestidade preservada). */
function linhaMetrica(campo: string, dado: DadoMonetario | DadoNumerico): CelulaCsv[] {
  return [
    texto(campo),
    numero(dado.valor),
    texto(dispLabel(dado.disponibilidade)),
    texto(dado.fonte),
    texto(dado.observacao ?? ""),
  ]
}

export type EntradaConteudo = Readonly<{
  dados: ContadorDadosReais
  checklist: ChecklistFechamento
  competencia: Competencia
  agora: Date
}>

/* ─────────────────────────── CSVs ─────────────────────────── */

function csvResumoCompetencia(dados: ContadorDadosReais): string {
  return montarCsv(CABECALHO_METRICA, [
    linhaMetrica("liquido_competencia", dados.liquidoCompetencia),
    linhaMetrica("fiscal_nfe", dados.fiscal),
  ])
}

function csvVendas(dados: ContadorDadosReais): string {
  const v = dados.vendas
  const linhas: CelulaCsv[][] = [
    linhaMetrica("quantidade", v.quantidade),
    linhaMetrica("total", v.total),
    linhaMetrica("canceladas_quantidade", v.canceladasQuantidade),
    linhaMetrica("canceladas_total", v.canceladasTotal),
    linhaMetrica("desconto_total", v.descontoTotal),
    linhaMetrica("desconto_cobertura_quantidade", v.descontoCoberturaQuantidade),
    linhaMetrica("nao_identificado_quantidade", v.naoIdentificadoQuantidade),
    linhaMetrica("nao_identificado_valor", v.naoIdentificadoValor),
    linhaMetrica("divergencia_pagamento_quantidade", v.divergenciaPagamentoQuantidade),
  ]
  const rec = v.reconciliacaoPagamento
  if (rec) {
    const fonte = "Venda.payload.paymentBreakdown"
    linhas.push(
      [texto("reconciliacao_total_vendas"), numero(rec.totalVendas), texto("real"), texto(fonte), texto("")],
      [texto("reconciliacao_total_breakdown"), numero(rec.totalBreakdown), texto("real"), texto(fonte), texto("")],
      [texto("reconciliacao_residual_nao_identificado"), numero(rec.residualNaoIdentificado), texto("real"), texto(fonte), texto("")],
      [texto("reconciliacao_excedente_breakdown"), numero(rec.excedenteBreakdown), texto("real"), texto(fonte), texto("")],
      [texto("reconciliacao_divergencia_absoluta"), numero(rec.divergenciaAbsoluta), texto("real"), texto(fonte), texto("")],
      [texto("reconciliacao_reconciliado"), texto(rec.reconciliado ? "sim" : "não"), texto("real"), texto(fonte), texto("")],
    )
  }
  return montarCsv(CABECALHO_METRICA, linhas)
}

function csvVendasFormasPagamento(dados: ContadorDadosReais): string {
  const v = dados.vendas
  const linhas: CelulaCsv[][] = v.formasPagamento.map((f) => [
    texto(f.label),
    texto(f.chave),
    numero(f.valor),
  ])
  return montarCsv(["forma_pagamento", "chave", "valor"], linhas)
}

function csvDevolucoes(dados: ContadorDadosReais): string {
  return montarCsv(CABECALHO_METRICA, [
    linhaMetrica("quantidade", dados.devolucoes.quantidade),
    linhaMetrica("total", dados.devolucoes.total),
  ])
}

function csvFinanceiro(dados: ContadorDadosReais): string {
  const f = dados.financeiro
  return montarCsv(CABECALHO_METRICA, [
    linhaMetrica("entradas_realizadas", f.entradasRealizadas),
    linhaMetrica("saidas_realizadas", f.saidasRealizadas),
    linhaMetrica("estornos", f.estornos),
    linhaMetrica("transferencias", f.transferencias),
    linhaMetrica("transferencias_quantidade", f.transferenciasQuantidade),
    linhaMetrica("nao_classificados", f.naoClassificados),
    linhaMetrica("nao_classificados_quantidade", f.naoClassificadosQuantidade),
    linhaMetrica("titulos_receber_aberto", f.titulosReceberAberto),
    linhaMetrica("titulos_receber_quantidade", f.titulosReceberQuantidade),
    linhaMetrica("titulos_pagar_aberto", f.titulosPagarAberto),
    linhaMetrica("titulos_pagar_quantidade", f.titulosPagarQuantidade),
  ])
}

function csvCaixa(dados: ContadorDadosReais): string {
  const c = dados.caixa
  return montarCsv(CABECALHO_METRICA, [
    linhaMetrica("sessoes", c.sessoes),
    linhaMetrica("sessoes_abertas", c.sessoesAbertas),
    linhaMetrica("sangrias_total", c.sangriasTotal),
    linhaMetrica("sangrias_quantidade", c.sangriasQuantidade),
    linhaMetrica("suprimentos_total", c.suprimentosTotal),
    linhaMetrica("suprimentos_quantidade", c.suprimentosQuantidade),
    linhaMetrica("diferencas_conferencia", c.diferencas),
  ])
}

function csvAlertas(dados: ContadorDadosReais): string {
  const linhas: CelulaCsv[][] = dados.alertas.map((a) => [
    texto(a.nivel === "atencao" ? "atenção" : a.nivel),
    texto(a.titulo),
    texto(a.detalhe),
  ])
  return montarCsv(["nivel", "titulo", "detalhe"], linhas)
}

function csvFechamentoChecklist(checklist: ChecklistFechamento): string {
  const linhas: CelulaCsv[][] = checklist.itens.map((it) => [
    texto(it.id),
    texto(it.titulo),
    texto(it.estado),
    texto(it.origem),
    texto(it.explicacao),
    texto(it.evidencia ?? ""),
  ])
  return montarCsv(["id", "titulo", "estado", "origem", "explicacao", "evidencia"], linhas)
}

/* ─────────────────────────── Markdown / placeholders ─────────────────────────── */

/** Avisos honestos consolidados — reaproveitados no manifesto e no AVISOS-E-PENDENCIAS.md. */
export function montarAvisos(
  dados: ContadorDadosReais,
  checklist: ChecklistFechamento,
): string[] {
  const avisos: string[] = [
    "Este pacote é gerado sob demanda e não fica armazenado; reflete os dados vivos da competência no momento do download.",
    "Não é fechamento oficial, snapshot nem apuração contábil/fiscal.",
    "Notas fiscais (XML) não são incluídas nesta fase — a fonte fiscal permanece atrás de CONTADOR_FISCAL_READER.",
    "Documentos anexos ainda não têm domínio real e não são incluídos.",
  ]
  const naoOk = checklist.itens.filter((it) => it.estado !== "ok").length
  if (naoOk > 0) {
    avisos.push(`${naoOk} item(ns) do checklist de fechamento requerem atenção, estão pendentes ou indisponíveis.`)
  }
  if (dados.alertas.length > 0) {
    avisos.push(`${dados.alertas.length} alerta(s) de qualidade dos dados — ver AVISOS-E-PENDENCIAS.md.`)
  }
  return avisos
}

function resumoMd(entrada: EntradaConteudo): string {
  const { dados, checklist, competencia, agora } = entrada
  const v = dados.vendas
  const f = dados.financeiro
  const c = dados.caixa
  const cont = checklist.contagem
  const linhas = [
    `# Pacote do Contador — ${labelCompetencia(competencia)}`,
    "",
    `- Competência: \`${formatCompetencia(competencia)}\``,
    `- Gerado em: ${agora.toISOString()}`,
    `- Aplicação: OmniGestão Pro`,
    "",
    "> Este pacote reúne uma leitura dos dados vivos da competência. **Não é fechamento",
    "> oficial**, não substitui a apuração contábil/fiscal e **não inclui XML** nesta fase.",
    "> Valores são gerenciais; a apuração oficial é responsabilidade do seu contador.",
    "",
    "## Resumo da competência",
    "",
    `- Líquido da competência: ${fmtBRL(dados.liquidoCompetencia.valor)}${seloDisp(dados.liquidoCompetencia.disponibilidade)}`,
    `- Vendas: ${fmtNum(v.quantidade)} · ${fmtBRL(v.total.valor)}${seloDisp(v.total.disponibilidade)}`,
    `- Vendas canceladas (informativo): ${fmtNum(v.canceladasQuantidade)} · ${fmtBRL(v.canceladasTotal.valor)}`,
    `- Devoluções: ${fmtNum(dados.devolucoes.quantidade)} · ${fmtBRL(dados.devolucoes.total.valor)}${seloDisp(dados.devolucoes.total.disponibilidade)}`,
    `- Entradas realizadas: ${fmtBRL(f.entradasRealizadas.valor)} · Saídas realizadas: ${fmtBRL(f.saidasRealizadas.valor)}`,
    `- Títulos a receber em aberto (competência): ${fmtBRL(f.titulosReceberAberto.valor)}${seloDisp(f.titulosReceberAberto.disponibilidade)}`,
    `- Títulos a pagar em aberto (competência): ${fmtBRL(f.titulosPagarAberto.valor)}${seloDisp(f.titulosPagarAberto.disponibilidade)}`,
    `- Sessões de caixa: ${fmtNum(c.sessoes)} (${fmtNum(c.sessoesAbertas)} aberta(s))`,
    `- Diferenças de conferência de caixa: ${fmtBRL(c.diferencas.valor)}${seloDisp(c.diferencas.disponibilidade)}`,
    `- Fiscal (NF-e): não incluído nesta fase (CONTADOR_FISCAL_READER).`,
    "",
    "## Checklist de fechamento (somente leitura)",
    "",
    `- ${cont.ok} ok · ${cont.atencao} atenção · ${cont.pendente} pendente · ${cont.nao_disponivel} não disponível · ${cont.total} sinais.`,
    "- Detalhes em `csv/fechamento-checklist.csv` e `AVISOS-E-PENDENCIAS.md`.",
    "",
    "## Conteúdo do pacote",
    "",
    "Veja `INDICE.md` para a lista completa de arquivos com tamanho e hash (sha256).",
    "O `manifest.json` é a raiz de integridade (versão 1).",
    "",
  ]
  return linhas.join("\n")
}

function avisosMd(entrada: EntradaConteudo): string {
  const { dados, checklist, competencia } = entrada
  const linhas: string[] = [
    `# Avisos e pendências — ${labelCompetencia(competencia)}`,
    "",
    "## Alertas de qualidade dos dados",
    "",
  ]
  if (dados.alertas.length === 0) {
    linhas.push("- Nenhum alerta de qualidade nesta competência.")
  } else {
    for (const a of dados.alertas) {
      const nivel = a.nivel === "atencao" ? "atenção" : "info"
      linhas.push(`- [${nivel}] **${a.titulo}** — ${a.detalhe}`)
    }
  }
  linhas.push(
    "",
    "## Checklist de fechamento (somente leitura, GOAL 007)",
    "",
    `Contagem: ${checklist.contagem.ok} ok · ${checklist.contagem.atencao} atenção · ${checklist.contagem.pendente} pendente · ${checklist.contagem.nao_disponivel} não disponível · ${checklist.contagem.total} sinais.`,
    "",
    `> ${checklist.disclaimer}`,
    "",
    "### Itens que requerem atenção, pendentes ou indisponíveis",
    "",
  )
  const naoOk = checklist.itens.filter((it) => it.estado !== "ok")
  if (naoOk.length === 0) {
    linhas.push("- Nenhum item fora de `ok`.")
  } else {
    for (const it of naoOk) {
      const evid = it.evidencia ? ` — evidência: ${it.evidencia}` : ""
      linhas.push(`- [${it.estado}] **${it.titulo}** — ${it.explicacao} (origem: ${it.origem})${evid}`)
    }
  }
  linhas.push("", "Itens em estado `ok` estão listados em `csv/fechamento-checklist.csv`.", "")
  return linhas.join("\n")
}

const PLACEHOLDER_DOCUMENTOS = [
  "# Documentos do fechamento — não incluídos nesta fase",
  "",
  "O domínio real de documentos do Contador ainda não existe: sem persistência, sem",
  "upload e sem portal externo. Este pacote **não contém anexos de documentos**.",
  "",
  "Quando o domínio for implementado, os documentos da competência entrarão aqui.",
  "",
].join("\n")

const PLACEHOLDER_XML = [
  "# Notas fiscais (XML) — não incluídas nesta fase",
  "",
  "A fonte fiscal permanece atrás de `CONTADOR_FISCAL_READER` e **não é consultada** por",
  "este módulo. Este pacote **não contém XML** de NF-e/NFC-e.",
  "",
  "A emissão e o XML fiscal são responsabilidade do módulo Fiscal e do seu contador.",
  "",
].join("\n")

/**
 * Monta todos os arquivos de CONTEÚDO (CSVs, resumo, avisos, placeholders).
 * Não inclui `INDICE.md` nem `manifest.json` — esses derivam destes (ver builder).
 */
export function montarArquivosConteudo(entrada: EntradaConteudo): ArquivoPacote[] {
  const { dados, checklist } = entrada
  return [
    { caminho: "RESUMO.md", categoria: "resumo", descricao: "Resumo legível da competência.", conteudo: resumoMd(entrada) },
    { caminho: "AVISOS-E-PENDENCIAS.md", categoria: "avisos", descricao: "Alertas de qualidade e pendências do checklist.", conteudo: avisosMd(entrada) },
    { caminho: "csv/resumo-competencia.csv", categoria: "csv", descricao: "Líquido da competência e placeholder fiscal.", conteudo: csvResumoCompetencia(dados) },
    { caminho: "csv/vendas.csv", categoria: "csv", descricao: "Métricas de vendas e reconciliação de pagamentos.", conteudo: csvVendas(dados) },
    { caminho: "csv/vendas-formas-pagamento.csv", categoria: "csv", descricao: "Quebra de vendas por forma de pagamento.", conteudo: csvVendasFormasPagamento(dados) },
    { caminho: "csv/devolucoes.csv", categoria: "csv", descricao: "Devoluções da competência.", conteudo: csvDevolucoes(dados) },
    { caminho: "csv/financeiro.csv", categoria: "csv", descricao: "Realizados e posição de títulos em aberto.", conteudo: csvFinanceiro(dados) },
    { caminho: "csv/caixa.csv", categoria: "csv", descricao: "Operação de caixa: sessões, sangrias, suprimentos, diferenças.", conteudo: csvCaixa(dados) },
    { caminho: "csv/alertas.csv", categoria: "csv", descricao: "Alertas de qualidade dos dados.", conteudo: csvAlertas(dados) },
    { caminho: "csv/fechamento-checklist.csv", categoria: "csv", descricao: "Checklist de fechamento derivado (somente leitura).", conteudo: csvFechamentoChecklist(checklist) },
    { caminho: "documentos/LEIA-ME.md", categoria: "placeholder", descricao: "Placeholder honesto: documentos não incluídos nesta fase.", conteudo: PLACEHOLDER_DOCUMENTOS },
    { caminho: "notas-fiscais-xml/LEIA-ME.md", categoria: "placeholder", descricao: "Placeholder honesto: XML fiscal não incluído nesta fase.", conteudo: PLACEHOLDER_XML },
  ]
}
