/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 1 (Fundação). Núcleo PURO e testável.
 *
 * Toda a regra de contagem/classificação vive aqui, em funções puras sobre dados simples
 * (sem Prisma, sem rede) — o mesmo espírito de `lib/estoque/deposito-core.ts`. As Server
 * Actions (Fase 2+) injetam o cliente/IO e apenas orquestram estas funções.
 *
 * Princípios inegociáveis (refletem o GOAL + ajuste do Gate #1):
 *   - A contagem é INERTE: NUNCA altera `Produto.stock`. O ajuste real é humano (Fase 4,
 *     reusa `registrarAjusteEstoque`).
 *   - Código não resolvido NÃO vira cadastro automático: entra na FILA DE RECONCILIAÇÃO
 *     (status "reconciliacao") — pode ser código errado, duplicado, sem barcode ou inexistente.
 *   - Produto do sistema não bipado NÃO é zerado automático: vai para "não contados"
 *     (conferência pendente).
 *   - Multi-loja: este núcleo opera sobre dados JÁ escopados por loja; `assertStoreId`
 *     mantém o contrato "sem fallback de loja" (ADR-0003) para os chamadores.
 */

export const STATUS_SESSAO = {
  ABERTA: "aberta",
  FINALIZADA: "finalizada",
  CANCELADA: "cancelada",
} as const
export type StatusSessao = (typeof STATUS_SESSAO)[keyof typeof STATUS_SESSAO]

export const STATUS_CONTAGEM = {
  /** Código resolveu para um produto do catálogo da loja. */
  ENCONTRADO: "encontrado",
  /** Código não resolveu → fila de reconciliação (análise humana posterior). */
  RECONCILIACAO: "reconciliacao",
} as const
export type StatusContagem = (typeof STATUS_CONTAGEM)[keyof typeof STATUS_CONTAGEM]

/** Produto do catálogo da loja (já escopado por `storeId`). */
export type ProdutoEstoque = {
  id: string
  nome: string
  sku: string | null
  barcode: string | null
  stock: number
}

/** Estado mínimo de uma linha de contagem (espelha `InventarioContagem`). */
export type ContagemLinha = {
  produtoId: string | null
  codigoBipado: string
  quantidadeContada: number
  estoqueSistemaSnapshot: number | null
  status: StatusContagem
  produtoNomeSnapshot?: string | null
  produtoSkuSnapshot?: string | null
}

/**
 * Saneia o `storeId`. Sem fallback silencioso (ADR-0003): vazio → erro explícito.
 * Espelha o padrão `(storeId ?? "").trim()` adotado no projeto.
 */
export function assertStoreId(storeId: string | null | undefined): string {
  const sid = (storeId ?? "").trim()
  if (!sid) throw new Error("storeId obrigatório (sem fallback de loja)")
  return sid
}

/** Normaliza o código bipado (trim). Vazio é inválido para uma contagem. */
export function normalizarCodigo(codigo: string | null | undefined): string {
  return (codigo ?? "").trim()
}

/** Quantidade inteira >= 1 (um bipe nunca conta zero/negativo). */
function sanitizarIncremento(n: number | null | undefined): number {
  const v = Math.trunc(Number(n ?? 1))
  return Number.isFinite(v) && v >= 1 ? v : 1
}

export type ResultadoBipe = {
  linha: ContagemLinha
  /** true se foi a primeira leitura do código nesta sessão. */
  novaLinha: boolean
}

/**
 * Aplica um bipe sobre a linha existente (ou cria a primeira). PURO — não persiste.
 *  - Código já bipado → incrementa `quantidadeContada` (preserva status/produto/snapshot).
 *  - Código novo COM produto → linha "encontrado" + snapshot do estoque do sistema.
 *  - Código novo SEM produto → linha "reconciliacao" (produtoId null, sem snapshot).
 */
export function aplicarBipe(
  existente: ContagemLinha | null,
  entrada: { codigoBipado: string; produto: ProdutoEstoque | null; incremento?: number },
): ResultadoBipe {
  const codigo = normalizarCodigo(entrada.codigoBipado)
  if (!codigo) throw new Error("Código bipado vazio")
  const inc = sanitizarIncremento(entrada.incremento)

  if (existente) {
    return {
      linha: { ...existente, quantidadeContada: existente.quantidadeContada + inc },
      novaLinha: false,
    }
  }

  if (entrada.produto) {
    return {
      linha: {
        produtoId: entrada.produto.id,
        codigoBipado: codigo,
        quantidadeContada: inc,
        estoqueSistemaSnapshot: Math.trunc(Number(entrada.produto.stock)) || 0,
        status: STATUS_CONTAGEM.ENCONTRADO,
        produtoNomeSnapshot: entrada.produto.nome,
        produtoSkuSnapshot: entrada.produto.sku,
      },
      novaLinha: true,
    }
  }

  return {
    linha: {
      produtoId: null,
      codigoBipado: codigo,
      quantidadeContada: inc,
      estoqueSistemaSnapshot: null,
      status: STATUS_CONTAGEM.RECONCILIACAO,
      produtoNomeSnapshot: null,
      produtoSkuSnapshot: null,
    },
    novaLinha: true,
  }
}

/** Diferença de contagem: positivo = sobra física; negativo = falta física. */
export function diferencaContagem(quantidadeContada: number, estoqueSistema: number): number {
  return (Math.trunc(Number(quantidadeContada)) || 0) - (Math.trunc(Number(estoqueSistema)) || 0)
}

// ─── Contagem por quantidade de produto cadastrado (substituir × somar) ─────────
// Produto JÁ cadastrado pode ter a quantidade física informada de uma vez (em vez de só +1 por
// bipe). Dois modos espelham a fala do operador:
//   - SUBSTITUIR: "contei X unidades no total agora" → a quantidade informada VIRA o total.
//   - SOMAR:      "já contei antes e achei mais X"   → a quantidade é ADICIONADA ao já contado.
// PURO: nunca toca estoque. A nova quantidade é só o número gravado em `quantidadeContada`.

export const MODO_CONTAGEM = {
  SUBSTITUIR: "substituir",
  SOMAR: "somar",
} as const
export type ModoContagem = (typeof MODO_CONTAGEM)[keyof typeof MODO_CONTAGEM]

/** Normaliza o modo recebido do cliente; default seguro = SUBSTITUIR ("contei X no total"). */
export function normalizarModoContagem(modo: string | null | undefined): ModoContagem {
  return modo === MODO_CONTAGEM.SOMAR ? MODO_CONTAGEM.SOMAR : MODO_CONTAGEM.SUBSTITUIR
}

/**
 * Quantidade contada informada manualmente: inteiro >= 0. Recontagem pode legitimamente
 * baixar até zero (SUBSTITUIR 0 = "não tem nenhum"); valores inválidos/negativos viram 0.
 */
export function sanitizarQuantidadeContagem(n: number | null | undefined): number {
  const v = Math.trunc(Number(n ?? 0))
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Resolve a nova `quantidadeContada` a partir do modo, do já contado e da quantidade informada.
 * PURO. Resultado nunca negativo.
 *   - SUBSTITUIR → quantidade (o total passa a ser o número informado).
 *   - SOMAR      → jaContado + quantidade.
 */
export function aplicarModoContagem(
  modo: ModoContagem,
  jaContado: number,
  quantidade: number,
): number {
  const base = Math.max(0, Math.trunc(Number(jaContado)) || 0)
  const q = sanitizarQuantidadeContagem(quantidade)
  return modo === MODO_CONTAGEM.SOMAR ? base + q : q
}

// ─── Relatório de fechamento ──────────────────────────────────────────────────

export type LinhaEncontrada = {
  produtoId: string
  nome: string
  sku: string | null
  estoqueSistema: number
  quantidadeContada: number
  diferenca: number
}

export type LinhaReconciliacao = {
  codigoBipado: string
  quantidadeContada: number
}

export type LinhaNaoContada = {
  produtoId: string
  nome: string
  sku: string | null
  estoqueSistema: number
}

export type RelatorioInventario = {
  /** A) Encontrados — todo produto resolvido e contado. */
  encontrados: LinhaEncontrada[]
  /** B) Divergência de estoque — encontrados cujo contado ≠ sistema. */
  divergencias: LinhaEncontrada[]
  /** C) Não encontrados no sistema — fila de reconciliação. */
  reconciliacao: LinhaReconciliacao[]
  /** Produtos do sistema nunca bipados (conferência pendente — NUNCA zerar automático). */
  naoContados: LinhaNaoContada[]
  /** D) Estoque "zerado no inventário" — não contados que têm saldo no sistema (caso crítico). */
  zeradoNoInventario: LinhaNaoContada[]
  totais: {
    encontrados: number
    divergencias: number
    reconciliacao: number
    naoContados: number
    zeradoNoInventario: number
    unidadesContadas: number
  }
}

/**
 * Constrói o relatório de fechamento a partir das contagens da sessão e do catálogo da loja.
 * O "sistema" usado na divergência é o `stock` ATUAL do produto (foto do snapshot é mantida
 * só para auditoria) — se o produto sumiu do catálogo, cai no `estoqueSistemaSnapshot`.
 * PURO: não decide ajuste nenhum; apenas classifica.
 */
export function montarRelatorioInventario(input: {
  contagens: ReadonlyArray<ContagemLinha>
  produtosLoja: ReadonlyArray<ProdutoEstoque>
}): RelatorioInventario {
  const produtoPorId = new Map(input.produtosLoja.map((p) => [p.id, p]))
  const contadosProdutoIds = new Set<string>()

  const encontrados: LinhaEncontrada[] = []
  const reconciliacao: LinhaReconciliacao[] = []
  let unidadesContadas = 0

  for (const c of input.contagens) {
    const contado = Math.trunc(Number(c.quantidadeContada)) || 0
    unidadesContadas += contado

    if (c.status === STATUS_CONTAGEM.RECONCILIACAO || !c.produtoId) {
      reconciliacao.push({ codigoBipado: c.codigoBipado, quantidadeContada: contado })
      continue
    }

    contadosProdutoIds.add(c.produtoId)
    const atual = produtoPorId.get(c.produtoId)
    const estoqueSistema = atual ? atual.stock : c.estoqueSistemaSnapshot ?? 0
    encontrados.push({
      produtoId: c.produtoId,
      nome: atual?.nome ?? c.produtoNomeSnapshot ?? c.produtoId,
      sku: atual?.sku ?? c.produtoSkuSnapshot ?? null,
      estoqueSistema,
      quantidadeContada: contado,
      diferenca: diferencaContagem(contado, estoqueSistema),
    })
  }

  const divergencias = encontrados.filter((e) => e.diferenca !== 0)

  const naoContados: LinhaNaoContada[] = input.produtosLoja
    .filter((p) => !contadosProdutoIds.has(p.id))
    .map((p) => ({ produtoId: p.id, nome: p.nome, sku: p.sku, estoqueSistema: p.stock }))

  const zeradoNoInventario = naoContados.filter((p) => p.estoqueSistema > 0)

  return {
    encontrados,
    divergencias,
    reconciliacao,
    naoContados,
    zeradoNoInventario,
    totais: {
      encontrados: encontrados.length,
      divergencias: divergencias.length,
      reconciliacao: reconciliacao.length,
      naoContados: naoContados.length,
      zeradoNoInventario: zeradoNoInventario.length,
      unidadesContadas,
    },
  }
}
