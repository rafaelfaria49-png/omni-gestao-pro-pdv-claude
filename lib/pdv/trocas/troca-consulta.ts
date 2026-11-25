/**
 * OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001
 *
 * Consulta servidor para trocas/devoluções e para o detalhe da venda no histórico.
 *
 * A busca roda no PostgreSQL sobre as vendas PERSISTIDAS da loja (nunca sobre o array
 * carregado no navegador): cupom, cliente, CPF/CNPJ, nome HISTÓRICO do item vendido
 * (linha da venda, com ou sem acento), código de barras / SKU / id do produto (todos os
 * produtos correspondentes — nenhum "primeiro" arbitrário) e itens avulsos. Paginada e
 * filtrada por período — não carrega o histórico inteiro.
 */
import "server-only"

import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { normalizeDocDigits } from "@/lib/cpf"
import {
  liquidosPorLinha,
  linhasComDisponibilidade,
  linhasDaVenda,
  type LinhaComDisponibilidade,
} from "@/lib/pdv/trocas/troca-disponibilidade"
import { normalizarTermoBusca } from "@/lib/pdv/trocas/troca-busca-termo"

const ACENTOS = "áàâãäåéèêëíìîïóòôõöúùûüçñ"
const SEM_ACENTO = "aaaaaaeeeeiiiiooooouuuucn"

/** Normalização SQL equivalente a `normalizarTermoBusca` (minúsculas, sem acento). */
function norm(expr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`translate(lower(coalesce(${expr}, '')), ${ACENTOS}, ${SEM_ACENTO})`
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export type ProdutoCodigos = { id: string; name: string; sku: string | null; barcode: string | null; active: boolean; status: string }

export type LinhaTrocaView = LinhaComDisponibilidade & {
  valorLiquido: number
  /** Códigos do CADASTRO ATUAL (não necessariamente os da data da venda). */
  cadastroAtual: { produtoId: string; sku: string | null; barcode: string | null; situacao: "ativo" | "inativo" } | null
  situacaoCadastro: "cadastrado" | "inativo" | "removido" | "avulso" | "servico" | "aparelho_imei"
  corresponde?: boolean
}

export type DevolucaoHistoricoView = {
  id: string
  localId: string
  tipo: string
  at: string
  valorTotal: number
  creditoEmitido: number
  operador: string
  motivo: string
  clienteNome: string
  itens: Array<{ nome: string; quantidade: number; valorTotal: number }>
  /** Fluxo novo: vínculo e financeiro exatos. Legado: `null` (não inferimos). */
  novaVenda: { pedidoId: string; total: number } | null
  diferenca: { valor: number; forma: string | null } | null
  reembolso: { valor: number; forma: string } | null
  valeEmitido: number | null
  status: "confirmada" | "legado"
}

export type VendaTrocaView = {
  pedidoId: string
  at: string
  total: number
  status: string
  clienteNome: string
  temCliente: boolean
  linhas: LinhaTrocaView[]
  devolucoes: DevolucaoHistoricoView[]
  /** Devoluções legadas que não casam com nenhuma linha (inconsistência a revisar). */
  naoAlocado: Array<{ localId: string; nome: string; quantidade: number }>
  /** Esta venda nasceu de uma troca (venda substituta). */
  trocaOrigem: { vendaOrigem: string; devolucaoId: string } | null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

async function produtosPorChaves(storeId: string, chaves: string[]): Promise<ProdutoCodigos[]> {
  const uniq = Array.from(new Set(chaves.map((c) => c.trim()).filter(Boolean)))
  if (uniq.length === 0) return []
  return prisma.produto.findMany({
    where: { storeId, OR: [{ id: { in: uniq } }, { sku: { in: uniq } }, { barcode: { in: uniq } }] },
    select: { id: true, name: true, sku: true, barcode: true, active: true, status: true },
    take: 500,
  })
}

function montarView(
  venda: { pedidoId: string; at: Date; total: number; status: string; clienteNome: string | null; payload: unknown; itens: Array<{ inventoryId: string | null; nome: string; quantidade: number; precoUnitario: number; lineTotal: number }> },
  devolucoes: Array<{ id: string; localId: string; tipo: string; at: Date; valorTotal: number; creditoEmitido: number; operador: string; motivo: string; clienteNome: string; payload: unknown; itens: Array<{ inventoryId: string | null; nome: string; quantidade: number; valorTotal: number }> }>,
  produtos: ProdutoCodigos[],
): VendaTrocaView {
  const originais = linhasDaVenda(venda.payload, venda.itens)
  const { linhas, naoAlocado } = linhasComDisponibilidade(originais, devolucoes)
  const liquidos = liquidosPorLinha(venda.total, originais)
  const acha = (l: LinhaComDisponibilidade) =>
    produtos.find((p) => p.id === l.produtoId) ??
    produtos.find((p) => p.id === l.inventoryId || (p.sku && p.sku === l.inventoryId) || (p.barcode && p.barcode === l.inventoryId))
  const p = asRecord(venda.payload)
  const trocaOrigemRaw = asRecord(p?.trocaOrigem)
  return {
    pedidoId: venda.pedidoId,
    at: venda.at.toISOString(),
    total: venda.total,
    status: venda.status,
    clienteNome: venda.clienteNome ?? "",
    temCliente: Boolean((venda.clienteNome ?? "").trim() || normalizeDocDigits(String(p?.customerCpf ?? ""))),
    linhas: linhas.map((l) => {
      const prod = l.destino === "retorna_estoque" || l.destino === "aparelho_imei" ? acha(l) : undefined
      const inativo = prod ? prod.active === false || /inativ/i.test(prod.status) : false
      const situacaoCadastro: LinhaTrocaView["situacaoCadastro"] =
        l.destino === "aparelho_imei"
          ? "aparelho_imei"
          : l.destino === "servico"
            ? "servico"
            : l.destino === "sem_vinculo_estoque"
              ? "avulso"
              : !prod
                ? "removido"
                : inativo
                  ? "inativo"
                  : "cadastrado"
      return {
        ...l,
        valorLiquido: liquidos[l.lineIndex] ?? 0,
        cadastroAtual: prod ? { produtoId: prod.id, sku: prod.sku, barcode: prod.barcode, situacao: inativo ? "inativo" : "ativo" } : null,
        situacaoCadastro,
      }
    }),
    devolucoes: devolucoes
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map((d) => {
        const dp = asRecord(d.payload)
        const r = asRecord(dp?.resultado)
        const nova = asRecord(r?.novaVenda)
        const dif = asRecord(r?.diferenca)
        const reemb = asRecord(r?.reembolso)
        return {
          id: d.id,
          localId: d.localId,
          tipo: d.tipo,
          at: d.at.toISOString(),
          valorTotal: d.valorTotal,
          creditoEmitido: d.creditoEmitido,
          operador: d.operador,
          motivo: d.motivo,
          clienteNome: d.clienteNome,
          itens: d.itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, valorTotal: i.valorTotal })),
          novaVenda: nova && typeof nova.pedidoId === "string" ? { pedidoId: nova.pedidoId, total: Number(nova.total) || 0 } : null,
          diferenca: dif ? { valor: Number(dif.valor) || 0, forma: typeof dif.forma === "string" ? dif.forma : null } : null,
          reembolso: reemb ? { valor: Number(reemb.valor) || 0, forma: String(reemb.forma ?? "") } : null,
          valeEmitido: r ? Number(r.valeEmitido) || 0 : null,
          status: r ? "confirmada" : "legado",
        }
      }),
    naoAlocado,
    trocaOrigem:
      trocaOrigemRaw && typeof trocaOrigemRaw.vendaOrigem === "string"
        ? { vendaOrigem: trocaOrigemRaw.vendaOrigem, devolucaoId: String(trocaOrigemRaw.devolucaoId ?? "") }
        : null,
  }
}

const VENDA_SELECT = {
  pedidoId: true,
  at: true,
  total: true,
  status: true,
  clienteNome: true,
  payload: true,
  itens: { select: { inventoryId: true, nome: true, quantidade: true, precoUnitario: true, lineTotal: true }, orderBy: { id: "asc" as const } },
} as const

const DEVOLUCAO_SELECT = {
  id: true,
  localId: true,
  tipo: true,
  at: true,
  valorTotal: true,
  creditoEmitido: true,
  operador: true,
  motivo: true,
  clienteNome: true,
  payload: true,
  vendaLocalId: true,
  itens: { select: { inventoryId: true, nome: true, quantidade: true, valorTotal: true } },
} as const

function chavesDasLinhas(views: Array<{ payload: unknown; itens: Array<{ inventoryId: string | null; nome: string; quantidade: number; precoUnitario: number; lineTotal: number }> }>): string[] {
  return views.flatMap((v) => linhasDaVenda(v.payload, v.itens).flatMap((l) => [l.inventoryId, l.produtoId]))
}

export async function detalheVendaParaTroca(storeId: string, pedidoId: string): Promise<VendaTrocaView | null> {
  const venda = await prisma.venda.findFirst({ where: { storeId, pedidoId: pedidoId.trim() }, select: VENDA_SELECT })
  if (!venda) return null
  const [devolucoes, produtos] = await Promise.all([
    prisma.devolucaoVenda.findMany({ where: { storeId, vendaLocalId: venda.pedidoId }, select: DEVOLUCAO_SELECT }),
    produtosPorChaves(storeId, chavesDasLinhas([venda])),
  ])
  return montarView(venda, devolucoes, produtos)
}

export type BuscaTrocaParams = { storeId: string; q: string; dias: number; take: number; skip: number }

export type BuscaTrocaResultado = {
  termo: string
  vendas: VendaTrocaView[]
  hasMore: boolean
  /** Produtos do cadastro que casaram com o código/nome (todos, não só o primeiro). */
  produtosCorrespondentes: Array<{ id: string; name: string; sku: string | null; barcode: string | null }>
}

export async function buscarVendasParaTroca(params: BuscaTrocaParams): Promise<BuscaTrocaResultado> {
  const { storeId } = params
  const termo = normalizarTermoBusca(params.q)
  const take = Math.min(Math.max(1, Math.trunc(params.take) || 10), 30)
  const skip = Math.max(0, Math.trunc(params.skip) || 0)
  const raw = params.q.trim()
  if (raw.length < 2) return { termo, vendas: [], hasMore: false, produtosCorrespondentes: [] }

  const digits = raw.replace(/\D/g, "")
  const doc = digits.length === 11 || digits.length === 14 ? normalizeDocDigits(digits) : ""
  const like = `%${escapeLike(termo)}%`

  // Produtos por código exato (zeros à esquerda preservados) e por nome normalizado.
  const porCodigo = await prisma.produto.findMany({
    where: {
      storeId,
      OR: [{ id: raw }, { sku: raw }, { barcode: raw }, { sku: { equals: raw, mode: "insensitive" } }],
    },
    select: { id: true, name: true, sku: true, barcode: true },
    take: 50,
  })
  const porNome =
    termo.length >= 3
      ? await prisma.$queryRaw<Array<{ id: string; name: string; sku: string | null; barcode: string | null }>>`
          SELECT id, name, sku, barcode FROM estoque_produtos
          WHERE "storeId" = ${storeId} AND ${norm(Prisma.raw('"name"'))} LIKE ${like}
          LIMIT 200`
      : []
  const produtos = [...porCodigo, ...porNome.filter((p) => !porCodigo.some((c) => c.id === p.id))]
  const ids = Array.from(
    new Set([raw, ...produtos.flatMap((p) => [p.id, p.sku ?? "", p.barcode ?? ""])].map((s) => s.trim()).filter(Boolean)),
  )

  const desde = params.dias > 0 ? new Date(Date.now() - params.dias * 86_400_000) : new Date(0)
  const pedidoLike = `%${escapeLike(raw.toUpperCase().replace(/\s/g, ""))}%`

  const rows = await prisma.$queryRaw<Array<{ pedidoId: string }>>`
    SELECT v."pedidoId" FROM vendas v
    WHERE v."storeId" = ${storeId}
      AND v.at >= ${desde}
      AND (
        upper(v."pedidoId") LIKE ${pedidoLike}
        OR ${norm(Prisma.raw('v."clienteNome"'))} LIKE ${like}
        OR (${doc} <> '' AND regexp_replace(coalesce(v.payload->>'customerCpf', ''), '[^0-9]', '', 'g') = ${doc})
        OR EXISTS (
          SELECT 1 FROM venda_itens i WHERE i."vendaId" = v.id
            AND (${norm(Prisma.raw("i.nome"))} LIKE ${like} OR i."inventoryId" = ANY(${ids}::text[]))
        )
        OR (jsonb_typeof(v.payload->'lines') = 'array' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(v.payload->'lines') l
          WHERE ${norm(Prisma.raw("l->>'name'"))} LIKE ${like}
             OR l->>'inventoryId' = ANY(${ids}::text[])
             OR l->>'produtoId' = ANY(${ids}::text[])
        ))
      )
    ORDER BY v.at DESC
    LIMIT ${take + 1} OFFSET ${skip}`

  const hasMore = rows.length > take
  const pedidoIds = rows.slice(0, take).map((r) => r.pedidoId)
  if (pedidoIds.length === 0) {
    return { termo, vendas: [], hasMore: false, produtosCorrespondentes: produtos.slice(0, 20) }
  }
  const [vendas, devolucoes] = await Promise.all([
    prisma.venda.findMany({ where: { storeId, pedidoId: { in: pedidoIds } }, select: VENDA_SELECT }),
    prisma.devolucaoVenda.findMany({ where: { storeId, vendaLocalId: { in: pedidoIds } }, select: DEVOLUCAO_SELECT }),
  ])
  const prodLinhas = await produtosPorChaves(storeId, chavesDasLinhas(vendas))
  const idSet = new Set(ids)
  const views = pedidoIds
    .map((pid) => vendas.find((v) => v.pedidoId === pid))
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .map((v) => {
      const view = montarView(v, devolucoes.filter((d) => d.vendaLocalId === v.pedidoId), prodLinhas)
      view.linhas = view.linhas.map((l) => ({
        ...l,
        corresponde:
          idSet.has(l.inventoryId) ||
          (l.produtoId ? idSet.has(l.produtoId) : false) ||
          (termo.length >= 2 && normalizarTermoBusca(l.name).includes(termo)),
      }))
      return view
    })
  return { termo, vendas: views, hasMore, produtosCorrespondentes: produtos.slice(0, 20) }
}
