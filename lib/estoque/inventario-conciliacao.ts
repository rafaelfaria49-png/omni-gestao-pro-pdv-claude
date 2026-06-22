/**
 * INVENTARIO_INTELIGENTE_V01 — Conciliação dinâmica. Núcleo PURO e testável.
 *
 * Resolve o problema do inventário de VÁRIOS DIAS: entre a contagem física de um produto e o
 * fechamento, ele continua sendo vendido (PDV), usado em OS, devolvido ou movimentado. Comparar
 * o "contado" com o "estoque atual" cru acusaria divergência FALSA. Aqui projetamos a contagem
 * para o presente usando o livro-razão (`MovimentacaoEstoque`, deltas assinados):
 *
 *   saldoEsperadoHoje = quantidadeContada + Σ(movimentações com createdAt > countedAt)
 *   divergenciaReal   = saldoEsperadoHoje − estoqueAtual
 *
 * Exemplo: contou 10 unidades; depois vendeu 3 (delta −3) → saldoEsperadoHoje = 7. Se o sistema
 * também está em 7, divergenciaReal = 0 → CONCILIADO (o sistema recalculou corretamente).
 *
 * Princípios (espelham o GOAL + o Inventário Assistido existente):
 *   - PURO: sem Prisma, sem rede. As Server Actions injetam o ledger/catálogo e orquestram.
 *   - NUNCA decide ajuste sozinho: apenas classifica. A escrita real (humana) reusa
 *     `registrarAjusteEstoque` na camada de ação.
 *   - `countedAt` por item = `ultimoBipeEm` (observação física mais recente do produto).
 *   - Multi-loja: opera sobre dados JÁ escopados por loja (o chamador garante o `storeId`).
 */

import { novoSaldoParaContagem } from "./inventario-ajuste"

// ─── Grupos da conciliação ──────────────────────────────────────────────────────

export const GRUPO_CONCILIACAO = {
  /** Conferido, sem movimentação após a contagem e sem divergência. */
  OK: "ok",
  /** Conferido; houve venda/OS/entrada após a contagem e o sistema recalculou certo (divergência 0). */
  COM_MOVIMENTACAO: "com_movimentacao",
  /** Conferido; mesmo considerando as movimentações, ainda sobra diferença. */
  COM_DIVERGENCIA: "com_divergencia",
  /** Produto com estoque positivo no sistema que NÃO foi bipado no inventário. */
  NAO_ENCONTRADO: "nao_encontrado",
  /** Não encontrado e sem movimentação há X meses (ou que nunca movimentou). */
  SUSPEITO_ANTIGO: "suspeito_antigo",
} as const
export type GrupoConciliacao = (typeof GRUPO_CONCILIACAO)[keyof typeof GRUPO_CONCILIACAO]

/** Janela padrão (meses) sem movimentação para um "não encontrado" virar "suspeito antigo". */
export const MESES_SUSPEITO_PADRAO = 6

// ─── Entradas (dados já escopados por loja) ─────────────────────────────────────

/** Uma linha do livro-razão relevante para a conciliação (delta assinado). */
export type MovimentoEstoqueConc = {
  produtoId: string
  /** Delta assinado já aplicado ao saldo: + entrada/devolução, − saída de venda/OS. */
  quantidade: number
  /** Quando a movimentação ocorreu (`MovimentacaoEstoque.createdAt`). */
  em: Date | string
}

/** Item contado e resolvido para um produto do catálogo (status "encontrado"). */
export type ContagemConc = {
  produtoId: string
  quantidadeContada: number
  /** Momento da última observação física do produto (`ultimoBipeEm`). */
  contadoEm: Date | string
}

/** Produto do catálogo da loja (estoque ATUAL + valores para impacto financeiro). */
export type ProdutoConc = {
  id: string
  nome: string
  sku: string | null
  estoqueAtual: number
  precoCusto: number
  precoVenda: number
}

// ─── Saídas ──────────────────────────────────────────────────────────────────

export type ItemConciliado = {
  produtoId: string
  nome: string
  sku: string | null
  quantidadeContada: number
  contadoEm: string
  /** Σ deltas de estoque após a contagem (vendas/OS −, devoluções/entradas +). */
  movimentacaoPosContagem: number
  /** contado + movimentacaoPosContagem. */
  saldoEsperadoHoje: number
  estoqueAtual: number
  /** saldoEsperadoHoje − estoqueAtual. 0 = conciliado; >0 falta no sistema; <0 sobra. */
  divergenciaReal: number
  precoCusto: number
  precoVenda: number
  grupo: Extract<GrupoConciliacao, "ok" | "com_movimentacao" | "com_divergencia">
}

export type ItemNaoEncontrado = {
  produtoId: string
  nome: string
  sku: string | null
  estoqueAtual: number
  precoCusto: number
  precoVenda: number
  /** Última movimentação registrada (qualquer origem). null = nunca movimentou. */
  ultimaMovimentacaoEm: string | null
  /** Impacto financeiro se zerado: estoqueAtual × custo. */
  impactoCusto: number
  /** Impacto financeiro se zerado: estoqueAtual × venda. */
  impactoVenda: number
  grupo: Extract<GrupoConciliacao, "nao_encontrado" | "suspeito_antigo">
}

export type TotaisConciliacao = {
  cadastrados: number
  contados: number
  ok: number
  comMovimentacao: number
  comDivergencia: number
  naoEncontrados: number
  suspeitosAntigos: number
  unidadesContadas: number
  /** Impacto de zerar TODOS os não encontrados (headline do painel). */
  impactoCustoNaoEncontrados: number
  impactoVendaNaoEncontrados: number
}

export type RelatorioConciliacao = {
  itens: ItemConciliado[]
  naoEncontrados: ItemNaoEncontrado[]
  totais: TotaisConciliacao
}

// ─── Helpers puros ──────────────────────────────────────────────────────────────

function ms(d: Date | string | null | undefined): number {
  if (d == null) return 0
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime()
  return Number.isFinite(t) ? t : 0
}

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}

function int(n: number | null | undefined): number {
  const v = Math.trunc(Number(n ?? 0))
  return Number.isFinite(v) ? v : 0
}

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/**
 * Soma os deltas de estoque de UM produto que ocorreram ESTRITAMENTE após `contadoEm`.
 * As movimentações já chegam filtradas por produto pelo chamador; aqui só aplicamos o corte
 * temporal. Movimentação exatamente no instante da contagem NÃO entra (a contagem é o marco).
 */
export function somarMovimentacoesApos(
  movs: ReadonlyArray<MovimentoEstoqueConc>,
  contadoEm: Date | string
): number {
  const ref = ms(contadoEm)
  let soma = 0
  for (const m of movs) {
    if (ms(m.em) > ref) soma += int(m.quantidade)
  }
  return soma
}

/** Classifica um item ENCONTRADO a partir da movimentação pós-contagem e da divergência real. */
export function classificarEncontrado(
  movimentacaoPosContagem: number,
  divergenciaReal: number
): ItemConciliado["grupo"] {
  if (divergenciaReal !== 0) return GRUPO_CONCILIACAO.COM_DIVERGENCIA
  if (movimentacaoPosContagem !== 0) return GRUPO_CONCILIACAO.COM_MOVIMENTACAO
  return GRUPO_CONCILIACAO.OK
}

/**
 * `true` se um produto não encontrado é "suspeito antigo": nunca movimentou, ou a última
 * movimentação é mais antiga que a janela (`meses`). PURO.
 */
export function isSuspeitoAntigo(
  ultimaMovimentacaoEm: Date | string | null,
  agora: Date | string,
  meses: number = MESES_SUSPEITO_PADRAO
): boolean {
  if (!ultimaMovimentacaoEm) return true
  const janelaMs = Math.max(0, meses) * 30 * 24 * 60 * 60 * 1000
  return ms(ultimaMovimentacaoEm) < ms(agora) - janelaMs
}

/**
 * Concilia UM item contado: projeta a contagem até o presente com o ledger e mede a divergência
 * real contra o estoque atual do sistema. PURO.
 */
export function conciliarEncontrado(input: {
  produto: ProdutoConc
  contagem: ContagemConc
  movs: ReadonlyArray<MovimentoEstoqueConc>
}): ItemConciliado {
  const contado = int(input.contagem.quantidadeContada)
  const movimentacaoPosContagem = somarMovimentacoesApos(input.movs, input.contagem.contadoEm)
  const saldoEsperadoHoje = contado + movimentacaoPosContagem
  const estoqueAtual = int(input.produto.estoqueAtual)
  const divergenciaReal = saldoEsperadoHoje - estoqueAtual
  return {
    produtoId: input.produto.id,
    nome: input.produto.nome,
    sku: input.produto.sku,
    quantidadeContada: contado,
    contadoEm: iso(input.contagem.contadoEm),
    movimentacaoPosContagem,
    saldoEsperadoHoje,
    estoqueAtual,
    divergenciaReal,
    precoCusto: money(input.produto.precoCusto),
    precoVenda: money(input.produto.precoVenda),
    grupo: classificarEncontrado(movimentacaoPosContagem, divergenciaReal),
  }
}

/**
 * Monta a conciliação completa de uma sessão a partir de:
 *  - `contagens`: linhas contadas resolvidas para um produto (status "encontrado");
 *  - `produtos`: catálogo ATIVO da loja (estoque atual + custo/venda);
 *  - `movimentacoes`: ledger relevante (qualquer produto contado, posterior ao início da contagem);
 *  - `ultimaMovPorProduto`: última movimentação de cada produto (para classificar não encontrados).
 *
 * PURO — apenas classifica em 5 grupos. Não decide ajuste nenhum.
 */
export function montarConciliacao(input: {
  contagens: ReadonlyArray<ContagemConc>
  produtos: ReadonlyArray<ProdutoConc>
  movimentacoes: ReadonlyArray<MovimentoEstoqueConc>
  ultimaMovPorProduto?: Readonly<Record<string, string | null>>
  agora?: Date | string
  mesesSuspeito?: number
}): RelatorioConciliacao {
  const produtoPorId = new Map(input.produtos.map((p) => [p.id, p]))
  const agora = input.agora ?? new Date()
  const meses = input.mesesSuspeito ?? MESES_SUSPEITO_PADRAO
  const ultimaMov = input.ultimaMovPorProduto ?? {}

  // Indexa o ledger por produto uma vez (evita varrer tudo por item).
  const movsPorProduto = new Map<string, MovimentoEstoqueConc[]>()
  for (const m of input.movimentacoes) {
    const arr = movsPorProduto.get(m.produtoId)
    if (arr) arr.push(m)
    else movsPorProduto.set(m.produtoId, [m])
  }

  const itens: ItemConciliado[] = []
  const contadosIds = new Set<string>()
  let unidadesContadas = 0

  for (const c of input.contagens) {
    const produto = produtoPorId.get(c.produtoId)
    if (!produto) continue // produto saiu do catálogo — não entra na conciliação de saldo
    contadosIds.add(c.produtoId)
    unidadesContadas += int(c.quantidadeContada)
    itens.push(
      conciliarEncontrado({ produto, contagem: c, movs: movsPorProduto.get(c.produtoId) ?? [] })
    )
  }

  // Não encontrados = produtos com estoque positivo que não foram contados.
  const naoEncontrados: ItemNaoEncontrado[] = []
  for (const p of input.produtos) {
    if (contadosIds.has(p.id)) continue
    if (int(p.estoqueAtual) <= 0) continue
    const ultimaMovimentacaoEm = ultimaMov[p.id] ?? null
    const estoqueAtual = int(p.estoqueAtual)
    naoEncontrados.push({
      produtoId: p.id,
      nome: p.nome,
      sku: p.sku,
      estoqueAtual,
      precoCusto: money(p.precoCusto),
      precoVenda: money(p.precoVenda),
      ultimaMovimentacaoEm,
      impactoCusto: money(estoqueAtual * p.precoCusto),
      impactoVenda: money(estoqueAtual * p.precoVenda),
      grupo: isSuspeitoAntigo(ultimaMovimentacaoEm, agora, meses)
        ? GRUPO_CONCILIACAO.SUSPEITO_ANTIGO
        : GRUPO_CONCILIACAO.NAO_ENCONTRADO,
    })
  }

  const ok = itens.filter((i) => i.grupo === GRUPO_CONCILIACAO.OK).length
  const comMovimentacao = itens.filter((i) => i.grupo === GRUPO_CONCILIACAO.COM_MOVIMENTACAO).length
  const comDivergencia = itens.filter((i) => i.grupo === GRUPO_CONCILIACAO.COM_DIVERGENCIA).length
  const suspeitosAntigos = naoEncontrados.filter((n) => n.grupo === GRUPO_CONCILIACAO.SUSPEITO_ANTIGO).length

  return {
    itens,
    naoEncontrados,
    totais: {
      cadastrados: input.produtos.length,
      contados: contadosIds.size,
      ok,
      comMovimentacao,
      comDivergencia,
      naoEncontrados: naoEncontrados.length,
      suspeitosAntigos,
      unidadesContadas,
      impactoCustoNaoEncontrados: money(naoEncontrados.reduce((s, n) => s + n.impactoCusto, 0)),
      impactoVendaNaoEncontrados: money(naoEncontrados.reduce((s, n) => s + n.impactoVenda, 0)),
    },
  }
}

// ─── Simulação (preview antes de aplicar) ───────────────────────────────────────

export type SimulacaoConciliacao = {
  /** Produtos cujo estoque efetivamente mudaria (delta ≠ 0). */
  produtosAlterados: number
  /** Não encontrados que seriam zerados. */
  produtosZerados: number
  /** Σ |delta| das saídas líquidas (unidades removidas do sistema). */
  unidadesBaixadas: number
  /** Σ delta das entradas líquidas (unidades adicionadas ao sistema). */
  unidadesAdicionadas: number
  /** Divergências em que o sistema fica MAIOR após o ajuste (delta > 0). */
  divergenciasPositivas: number
  /** Divergências em que o sistema fica MENOR após o ajuste (delta < 0). */
  divergenciasNegativas: number
  /** Σ delta × custo (assinado; negativo = baixa de valor a custo). */
  custoImpactado: number
  /** Σ delta × venda (assinado; negativo = baixa de valor a venda). */
  vendaImpactado: number
}

/**
 * Saldo que será efetivamente gravado em uma divergência: o saldo esperado hoje, nunca negativo.
 * Reusa o clamp já testado do ajuste F4 (`novoSaldoParaContagem`).
 */
export function saldoAplicavel(saldoEsperadoHoje: number): number {
  return novoSaldoParaContagem(saldoEsperadoHoje)
}

/**
 * Simula o impacto de aplicar a conciliação a uma SELEÇÃO de divergências + não encontrados.
 * Cada divergência iria de `estoqueAtual` para `saldoAplicavel(saldoEsperadoHoje)`; cada não
 * encontrado iria para 0. PURO — não altera nada. O `delta` aqui é o que o estoque do sistema
 * mudaria (novoSaldo − estoqueAtual), com o mesmo sinal do livro-razão.
 */
export function simularAplicacaoConciliacao(input: {
  divergencias: ReadonlyArray<ItemConciliado>
  naoEncontrados: ReadonlyArray<ItemNaoEncontrado>
}): SimulacaoConciliacao {
  let produtosAlterados = 0
  let produtosZerados = 0
  let unidadesBaixadas = 0
  let unidadesAdicionadas = 0
  let divergenciasPositivas = 0
  let divergenciasNegativas = 0
  let custoImpactado = 0
  let vendaImpactado = 0

  for (const d of input.divergencias) {
    const novo = saldoAplicavel(d.saldoEsperadoHoje)
    const delta = novo - int(d.estoqueAtual)
    if (delta === 0) continue
    produtosAlterados += 1
    if (delta > 0) {
      divergenciasPositivas += 1
      unidadesAdicionadas += delta
    } else {
      divergenciasNegativas += 1
      unidadesBaixadas += -delta
    }
    custoImpactado += delta * d.precoCusto
    vendaImpactado += delta * d.precoVenda
  }

  for (const n of input.naoEncontrados) {
    const delta = 0 - int(n.estoqueAtual)
    if (delta === 0) continue
    produtosAlterados += 1
    produtosZerados += 1
    divergenciasNegativas += 1
    unidadesBaixadas += -delta
    custoImpactado += delta * n.precoCusto
    vendaImpactado += delta * n.precoVenda
  }

  return {
    produtosAlterados,
    produtosZerados,
    unidadesBaixadas,
    unidadesAdicionadas,
    divergenciasPositivas,
    divergenciasNegativas,
    custoImpactado: money(custoImpactado),
    vendaImpactado: money(vendaImpactado),
  }
}
