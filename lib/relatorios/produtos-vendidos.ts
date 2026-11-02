/**
 * RELATORIOS-PRODUTOS-VENDIDOS-REAL-001 — agregação pura do relatório
 * "Produtos Mais Vendidos". Sem Prisma, sem rede: recebe o que o loader
 * (`produtos-vendidos-query.ts`) leu do banco e devolve o relatório pronto.
 *
 * Contrato dos números (todos sustentados por linhas persistidas):
 *  - Coorte por DATA DA VENDA (`Venda.at`) dentro do período.
 *  - BRUTO = `ItemVenda` de vendas não canceladas (`Venda.status != "cancelada"`).
 *    Venda cancelada sai inteira do ranking; aparece só no resumo de canceladas.
 *  - DEVOLVIDO = `ItemDevolucaoVenda` cujas devoluções apontam para uma venda da
 *    coorte (`DevolucaoVenda.vendaLocalId = Venda.pedidoId`), independentemente da
 *    data da devolução. Várias devoluções da mesma venda somam e são LIMITADAS ao
 *    que a venda vendeu daquele produto — nunca devolve mais do que vendeu.
 *  - LÍQUIDO = bruto − devolvido.
 *  - Receita = soma de `ItemVenda.lineTotal` (valor da linha gravado na venda).
 *    Ajustes no total da venda que não estão nas linhas (desconto/acréscimo geral)
 *    não são rateados por produto; a diferença é exposta em `diagnostico`.
 *  - Nada de custo/margem: `Produto.precoCusto` é o custo ATUAL, não o histórico.
 */
import { resolveSaleLineItemType, type SaleLineItemType } from "@/lib/sale-line-classification"

// ── Entradas (formato do loader) ─────────────────────────────────────────────

/** `ItemVenda` agrupado por (inventoryId, nome) nas vendas não canceladas da coorte. */
export type GrupoItemVendido = {
  inventoryId: string | null
  nome: string
  quantidade: number
  receita: number
}

export type LinhaItem = {
  inventoryId: string | null
  nome: string
  quantidade: number
  valor: number
}

/** Venda da coorte que tem devolução registrada (com as linhas que vendeu). */
export type VendaComDevolucao = { pedidoId: string; itens: LinhaItem[] }

/** Devolução vinculada a uma venda da coorte. */
export type DevolucaoVinculada = { vendaLocalId: string; itens: LinhaItem[] }

export type ProdutoCatalogo = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  category: string | null
  brand: string | null
  active: boolean
}

export type CategoriaCatalogo = { slug: string; nome: string }

export type DadosProdutosVendidos = {
  grupos: GrupoItemVendido[]
  vendasComDevolucao: VendaComDevolucao[]
  devolucoes: DevolucaoVinculada[]
  produtos: ProdutoCatalogo[]
  categorias: CategoriaCatalogo[]
  /** Vendas não canceladas da coorte: quantidade e soma de `Venda.total`. */
  vendas: { quantidade: number; total: number }
  /** Vendas canceladas da coorte (excluídas do ranking). */
  canceladas: { quantidade: number; total: number }
  /** Devoluções do período (pela data da devolução) sem venda vinculada encontrada na loja. */
  devolucoesSemVenda: { documentos: number; quantidade: number; valor: number }
}

export const ORDENS = ["quantidade", "receita"] as const
export type OrdemRanking = (typeof ORDENS)[number]

export type FiltrosProdutosVendidos = {
  /** Chave de categoria (`CategoriaResumo.chave`); vazio = todas. */
  categoria?: string
  /** Busca por nome atual, nome gravado na venda, SKU ou código de barras. */
  busca?: string
  /** `false` (padrão) = só produtos; `true` inclui avulsos, serviços e O.S. */
  incluirNaoCatalogo?: boolean
  ordem?: OrdemRanking
  limite?: number
}

// ── Saídas ───────────────────────────────────────────────────────────────────

export type SituacaoCatalogo = "ativo" | "inativo" | "fora_do_catalogo" | "sem_catalogo"

export type ProdutoVendido = {
  chave: string
  tipo: SaleLineItemType
  produtoId: string | null
  nome: string
  /** Nomes gravados nas vendas quando diferem do nome atual (histórico legado). */
  nomesNaVenda: string[]
  sku: string | null
  codigoBarras: string | null
  marca: string | null
  categoriaChave: string
  categoriaNome: string
  situacao: SituacaoCatalogo
  quantidadeBruta: number
  receitaBruta: number
  quantidadeDevolvida: number
  valorDevolvido: number
  quantidadeLiquida: number
  receitaLiquida: number
  /** receitaBruta / quantidadeBruta (preço médio praticado). */
  precoMedio: number
  /** Fração (0..1) da quantidade líquida do recorte filtrado. */
  participacaoQuantidade: number
  /** Fração (0..1) da receita líquida do recorte filtrado. */
  participacaoReceita: number
}

export type CategoriaResumo = {
  chave: string
  nome: string
  produtos: number
  quantidadeBruta: number
  quantidadeDevolvida: number
  quantidadeLiquida: number
  receitaBruta: number
  receitaLiquida: number
}

export type RelatorioProdutosVendidos = {
  produtos: ProdutoVendido[]
  /** Linhas que casam com os filtros, antes do `limite`. */
  totalProdutos: number
  /** Resumo por categoria do recorte (tipo + busca), ignorando o filtro de categoria. */
  categorias: CategoriaResumo[]
  totais: {
    quantidadeBruta: number
    quantidadeDevolvida: number
    quantidadeLiquida: number
    receitaBruta: number
    valorDevolvido: number
    receitaLiquida: number
  }
  vendas: { quantidade: number; total: number }
  canceladas: { quantidade: number; total: number }
  diagnostico: {
    /** Σ Venda.total − Σ lineTotal (todas as linhas, todos os tipos). */
    ajusteNaoRateado: number
    devolucoesSemVenda: { documentos: number; quantidade: number; valor: number }
    /** Quantidade devolvida acima do vendido na mesma venda, descartada no cálculo. */
    quantidadeDevolvidaDescartada: number
  }
}

export type PeriodoRelatorio = { inicio: Date; fim: Date }

/** Período máximo aceito numa consulta (dias). */
export const PERIODO_MAXIMO_DIAS = 366

/**
 * `from`/`to` são instantes ISO (o cliente envia início e fim do dia local, como no
 * Histórico de Vendas). Ambos obrigatórios; `to` inclusivo.
 */
export function parsePeriodoRelatorio(
  from: string | null | undefined,
  to: string | null | undefined,
): { ok: true; periodo: PeriodoRelatorio } | { ok: false; error: string } {
  if (!from?.trim() || !to?.trim()) return { ok: false, error: "Informe o período (from e to)." }
  const inicio = new Date(from.trim())
  const fim = new Date(to.trim())
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return { ok: false, error: "Período inválido." }
  if (inicio > fim) return { ok: false, error: "A data inicial é posterior à final." }
  if (fim.getTime() - inicio.getTime() > PERIODO_MAXIMO_DIAS * 24 * 60 * 60 * 1000) {
    return { ok: false, error: `Período máximo de ${PERIODO_MAXIMO_DIAS} dias.` }
  }
  return { ok: true, periodo: { inicio, fim } }
}

export const LIMITE_PADRAO = 100
export const LIMITE_MAXIMO = 500

const SEM_CATEGORIA = "__sem_categoria__"
const FORA_DO_CATALOGO = "__fora_do_catalogo__"
const CATEGORIA_POR_TIPO: Record<Exclude<SaleLineItemType, "produto">, { chave: string; nome: string }> = {
  avulso: { chave: "__tipo_avulso__", nome: "Itens avulsos" },
  servico: { chave: "__tipo_servico__", nome: "Serviços" },
  ordem_servico: { chave: "__tipo_os__", nome: "Ordens de serviço" },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100

export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function num(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0
}

type Resolvedor = (inventoryId: string | null, nome: string) => {
  chave: string
  tipo: SaleLineItemType
  produto: ProdutoCatalogo | null
}

/**
 * Identidade da linha. Produto do catálogo agrupa pelo `Produto.id`, inclusive
 * linhas legadas gravadas com SKU/código de barras no lugar do id (mesma ordem de
 * resolução do writer: id → sku → barcode). Linhas sem produto agrupam pelo nome.
 */
export function criarResolvedor(produtos: ProdutoCatalogo[]): Resolvedor {
  const porId = new Map<string, ProdutoCatalogo>()
  const porSku = new Map<string, ProdutoCatalogo>()
  const porBarcode = new Map<string, ProdutoCatalogo>()
  for (const p of produtos) {
    porId.set(p.id, p)
    if (p.sku?.trim()) porSku.set(p.sku.trim(), p)
    if (p.barcode?.trim()) porBarcode.set(p.barcode.trim(), p)
  }
  return (inventoryIdRaw, nome) => {
    const inventoryId = inventoryIdRaw?.trim() || null
    const tipo = resolveSaleLineItemType({ inventoryId })
    const nomeChave = normalizarTexto(nome) || "(sem nome)"
    if (tipo !== "produto") return { chave: `${tipo}:${nomeChave}`, tipo, produto: null }
    if (!inventoryId) return { chave: `produto-sem-id:${nomeChave}`, tipo, produto: null }
    const produto = porId.get(inventoryId) ?? porSku.get(inventoryId) ?? porBarcode.get(inventoryId) ?? null
    return { chave: `produto:${produto?.id ?? inventoryId}`, tipo, produto }
  }
}

function criarCategorizador(categorias: CategoriaCatalogo[]) {
  // Produto pode gravar o slug OU o nome do cadastro: ambos levam à mesma chave (o slug).
  const canonica = new Map<string, { chave: string; nome: string }>()
  for (const c of categorias) {
    const nome = c.nome?.trim()
    const slug = normalizarTexto(c.slug)
    if (!nome || !slug) continue
    canonica.set(slug, { chave: slug, nome })
    if (!canonica.has(normalizarTexto(nome))) canonica.set(normalizarTexto(nome), { chave: slug, nome })
  }
  return (tipo: SaleLineItemType, produto: ProdutoCatalogo | null): { chave: string; nome: string } => {
    if (tipo !== "produto") return CATEGORIA_POR_TIPO[tipo]
    if (!produto) return { chave: FORA_DO_CATALOGO, nome: "Fora do catálogo atual" }
    const raw = produto.category?.trim() ?? ""
    const chave = normalizarTexto(raw)
    if (!chave) return { chave: SEM_CATEGORIA, nome: "Sem categoria" }
    return canonica.get(chave) ?? { chave, nome: raw }
  }
}

// ── Devoluções: limitadas ao vendido por (venda, produto) ────────────────────

type Devolvido = { quantidade: number; valor: number }

function calcularDevolvidos(
  vendas: VendaComDevolucao[],
  devolucoes: DevolucaoVinculada[],
  resolver: Resolvedor,
): { porChave: Map<string, Devolvido>; descartada: number } {
  const vendido = new Map<string, Map<string, Devolvido>>()
  for (const v of vendas) {
    const m = new Map<string, Devolvido>()
    for (const it of v.itens) {
      const { chave } = resolver(it.inventoryId, it.nome)
      const cur = m.get(chave) ?? { quantidade: 0, valor: 0 }
      cur.quantidade += Math.max(0, num(it.quantidade))
      cur.valor += Math.max(0, num(it.valor))
      m.set(chave, cur)
    }
    vendido.set(v.pedidoId, m)
  }

  // Soma todas as devoluções de cada (venda, produto) ANTES de limitar.
  const pedido = new Map<string, Map<string, Devolvido>>()
  for (const d of devolucoes) {
    if (!vendido.has(d.vendaLocalId)) continue
    const m = pedido.get(d.vendaLocalId) ?? new Map<string, Devolvido>()
    for (const it of d.itens) {
      const { chave } = resolver(it.inventoryId, it.nome)
      const cur = m.get(chave) ?? { quantidade: 0, valor: 0 }
      cur.quantidade += Math.max(0, num(it.quantidade))
      cur.valor += Math.max(0, num(it.valor))
      m.set(chave, cur)
    }
    pedido.set(d.vendaLocalId, m)
  }

  const porChave = new Map<string, Devolvido>()
  let descartada = 0
  for (const [pedidoId, m] of pedido) {
    const sold = vendido.get(pedidoId)!
    for (const [chave, dev] of m) {
      const s = sold.get(chave) ?? { quantidade: 0, valor: 0 }
      const qtd = Math.min(dev.quantidade, s.quantidade)
      descartada += dev.quantidade - qtd
      if (qtd <= 0) continue
      // Valor proporcional à parte aceita, nunca acima do que a venda faturou do item.
      const valor = Math.min(dev.quantidade > 0 ? (dev.valor * qtd) / dev.quantidade : 0, s.valor)
      const cur = porChave.get(chave) ?? { quantidade: 0, valor: 0 }
      cur.quantidade += qtd
      cur.valor += valor
      porChave.set(chave, cur)
    }
  }
  return { porChave, descartada }
}

// ── Agregação principal ──────────────────────────────────────────────────────

export function agregarProdutosVendidos(
  dados: DadosProdutosVendidos,
  filtros: FiltrosProdutosVendidos = {},
): RelatorioProdutosVendidos {
  const resolver = criarResolvedor(dados.produtos)
  const categorizar = criarCategorizador(dados.categorias)
  const { porChave: devolvidos, descartada } = calcularDevolvidos(dados.vendasComDevolucao, dados.devolucoes, resolver)

  type Acc = Omit<ProdutoVendido, "participacaoQuantidade" | "participacaoReceita" | "precoMedio" | "nomesNaVenda" | "quantidadeLiquida" | "receitaLiquida" | "quantidadeDevolvida" | "valorDevolvido"> & {
    nomes: Map<string, number>
    busca: string
  }
  const linhas = new Map<string, Acc>()
  let receitaLinhasTotal = 0

  for (const g of dados.grupos) {
    const quantidade = Math.max(0, num(g.quantidade))
    const receita = num(g.receita)
    receitaLinhasTotal += receita
    const { chave, tipo, produto } = resolver(g.inventoryId, g.nome)
    let acc = linhas.get(chave)
    if (!acc) {
      const cat = categorizar(tipo, produto)
      acc = {
        chave,
        tipo,
        produtoId: produto?.id ?? null,
        nome: produto?.name?.trim() || g.nome?.trim() || "(sem nome)",
        sku: produto?.sku?.trim() || null,
        codigoBarras: produto?.barcode?.trim() || null,
        marca: produto?.brand?.trim() || null,
        categoriaChave: cat.chave,
        categoriaNome: cat.nome,
        situacao: tipo !== "produto" ? "sem_catalogo" : !produto ? "fora_do_catalogo" : produto.active ? "ativo" : "inativo",
        quantidadeBruta: 0,
        receitaBruta: 0,
        nomes: new Map(),
        busca: normalizarTexto([produto?.name, produto?.sku, produto?.barcode, produto?.brand].filter(Boolean).join(" ")),
      }
      linhas.set(chave, acc)
    }
    acc.quantidadeBruta += quantidade
    acc.receitaBruta += receita
    const nomeVenda = g.nome?.trim()
    if (nomeVenda) acc.nomes.set(nomeVenda, (acc.nomes.get(nomeVenda) ?? 0) + quantidade)
  }

  const busca = normalizarTexto(filtros.busca)
  const incluirNaoCatalogo = filtros.incluirNaoCatalogo === true

  const todas: ProdutoVendido[] = []
  for (const acc of linhas.values()) {
    if (!incluirNaoCatalogo && acc.tipo !== "produto") continue
    const nomesNaVenda = [...acc.nomes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([n]) => n)
    // Sem produto no catálogo, o nome exibido é o mais vendido entre os gravados.
    const nome = acc.produtoId ? acc.nome : nomesNaVenda[0] ?? acc.nome
    if (busca) {
      const alvo = `${acc.busca} ${normalizarTexto(nomesNaVenda.join(" "))}`
      if (!alvo.includes(busca)) continue
    }
    const dev = devolvidos.get(acc.chave) ?? { quantidade: 0, valor: 0 }
    const quantidadeDevolvida = Math.min(dev.quantidade, acc.quantidadeBruta)
    const valorDevolvido = round2(dev.valor)
    todas.push({
      chave: acc.chave,
      tipo: acc.tipo,
      produtoId: acc.produtoId,
      nome,
      nomesNaVenda: nomesNaVenda.filter((n) => normalizarTexto(n) !== normalizarTexto(nome)).slice(0, 5),
      sku: acc.sku,
      codigoBarras: acc.codigoBarras,
      marca: acc.marca,
      categoriaChave: acc.categoriaChave,
      categoriaNome: acc.categoriaNome,
      situacao: acc.situacao,
      quantidadeBruta: acc.quantidadeBruta,
      receitaBruta: round2(acc.receitaBruta),
      quantidadeDevolvida,
      valorDevolvido,
      quantidadeLiquida: acc.quantidadeBruta - quantidadeDevolvida,
      receitaLiquida: round2(acc.receitaBruta - valorDevolvido),
      precoMedio: acc.quantidadeBruta > 0 ? round2(acc.receitaBruta / acc.quantidadeBruta) : 0,
      participacaoQuantidade: 0,
      participacaoReceita: 0,
    })
  }

  // Resumo por categoria: recorte tipo + busca, sem o filtro de categoria.
  const cats = new Map<string, CategoriaResumo>()
  for (const p of todas) {
    const c = cats.get(p.categoriaChave) ?? {
      chave: p.categoriaChave,
      nome: p.categoriaNome,
      produtos: 0,
      quantidadeBruta: 0,
      quantidadeDevolvida: 0,
      quantidadeLiquida: 0,
      receitaBruta: 0,
      receitaLiquida: 0,
    }
    c.produtos += 1
    c.quantidadeBruta += p.quantidadeBruta
    c.quantidadeDevolvida += p.quantidadeDevolvida
    c.quantidadeLiquida += p.quantidadeLiquida
    c.receitaBruta = round2(c.receitaBruta + p.receitaBruta)
    c.receitaLiquida = round2(c.receitaLiquida + p.receitaLiquida)
    cats.set(p.categoriaChave, c)
  }
  const categorias = [...cats.values()].sort(
    (a, b) => b.quantidadeLiquida - a.quantidadeLiquida || b.receitaLiquida - a.receitaLiquida || a.nome.localeCompare(b.nome, "pt-BR"),
  )

  const categoria = filtros.categoria?.trim() ?? ""
  const filtradas = categoria ? todas.filter((p) => p.categoriaChave === categoria) : todas

  const totais = { quantidadeBruta: 0, quantidadeDevolvida: 0, quantidadeLiquida: 0, receitaBruta: 0, valorDevolvido: 0, receitaLiquida: 0 }
  for (const p of filtradas) {
    totais.quantidadeBruta += p.quantidadeBruta
    totais.quantidadeDevolvida += p.quantidadeDevolvida
    totais.quantidadeLiquida += p.quantidadeLiquida
    totais.receitaBruta += p.receitaBruta
    totais.valorDevolvido += p.valorDevolvido
    totais.receitaLiquida += p.receitaLiquida
  }
  totais.receitaBruta = round2(totais.receitaBruta)
  totais.valorDevolvido = round2(totais.valorDevolvido)
  totais.receitaLiquida = round2(totais.receitaLiquida)

  for (const p of filtradas) {
    p.participacaoQuantidade = totais.quantidadeLiquida > 0 ? p.quantidadeLiquida / totais.quantidadeLiquida : 0
    p.participacaoReceita = totais.receitaLiquida > 0 ? p.receitaLiquida / totais.receitaLiquida : 0
  }

  const ordem: OrdemRanking = filtros.ordem === "receita" ? "receita" : "quantidade"
  filtradas.sort((a, b) =>
    ordem === "receita"
      ? b.receitaLiquida - a.receitaLiquida || b.quantidadeLiquida - a.quantidadeLiquida || a.nome.localeCompare(b.nome, "pt-BR")
      : b.quantidadeLiquida - a.quantidadeLiquida || b.receitaLiquida - a.receitaLiquida || a.nome.localeCompare(b.nome, "pt-BR"),
  )

  const limite = Math.min(LIMITE_MAXIMO, Math.max(1, Math.trunc(num(filtros.limite) || LIMITE_PADRAO)))

  return {
    produtos: filtradas.slice(0, limite),
    totalProdutos: filtradas.length,
    categorias,
    totais,
    vendas: { quantidade: dados.vendas.quantidade, total: round2(dados.vendas.total) },
    canceladas: { quantidade: dados.canceladas.quantidade, total: round2(dados.canceladas.total) },
    diagnostico: {
      ajusteNaoRateado: round2(dados.vendas.total - receitaLinhasTotal),
      devolucoesSemVenda: {
        documentos: dados.devolucoesSemVenda.documentos,
        quantidade: dados.devolucoesSemVenda.quantidade,
        valor: round2(dados.devolucoesSemVenda.valor),
      },
      quantidadeDevolvidaDescartada: descartada,
    },
  }
}
