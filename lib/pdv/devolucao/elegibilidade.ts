/**
 * PDV-F8 — busca de vendas de origem no SERVIDOR.
 *
 * O F8 antes procurava só no `localStorage` do navegador: venda feita em outro
 * terminal não aparecia e o "disponível para devolver" ignorava devoluções feitas
 * em outros caixas. Aqui a fonte é o banco, sempre escopada pela loja:
 *  - código da venda (pedidoId) exato;
 *  - código de barras / SKU / ID do produto → últimas vendas que contêm o item;
 *  - CPF/CNPJ do cliente ou parte do nome.
 * `qtyReturned` de cada linha é o agregado de TODAS as devoluções da venda no banco,
 * na UNIDADE da linha (unidades para UN, kg com 3 casas para KG).
 *
 * PADARIA-KG-F8-TROCAS-CONFIGURAVEIS-FINAL-001: venda KG (mesmo marcador
 * manualKgSale) NÃO bloqueia mais a venda inteira — a política trabalha POR LINHA:
 * linha KG exige `printerConfig.pdvTrocasPeso` habilitado (padrão ATIVADO);
 * linha UN segue sempre liberada. É leitura informativa: a autoridade final
 * continua no lock da gravação.
 */
import type { Prisma } from "@/generated/prisma"
import type { SaleRecord } from "@/lib/operations-sale-types"
import { saleFromDbRow } from "@/lib/vendas/sale-from-db-row"
import { saleProductKeyResolver } from "@/lib/pdv/devolucao/product-keys"
import { fatorValorPago, linhaVendidaUnidades, type UnidadeLinha } from "@/lib/pdv/devolucao/registrar-devolucao"
import { f8KgReturnSchemaReady, trocasPesoPermitidas } from "@/lib/pdv/devolucao/trocas-peso-policy"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"

export const ELEGIBILIDADE_LIMITE = 10

type ReadClient = Pick<Prisma.TransactionClient, "venda" | "produto" | "itemDevolucaoVenda" | "storeSettings" | "$queryRaw">

export type VendaElegivel = SaleRecord & {
  /** Linhas com o saldo devolvível calculado no servidor. */
  lines: Array<
    SaleRecord["lines"][number] & {
      qtyReturned: number
      /** Chave HISTÓRICA da linha (`ItemVenda.inventoryId` = Produto.id): enviar na devolução. */
      produtoId: string
      /** Unidade HISTÓRICA da linha vendida (nunca o cadastro atual). */
      unidade: UnidadeLinha
      /** Motivo quando a linha não pode ser devolvida por política (serviço/avulso/KG desativado/sem cadastro). */
      bloqueioDevolucao?: string
    }
  >
}

export type BuscaElegibilidadeResult = {
  criterio: "pedido" | "produto" | "cliente" | "nenhum"
  produtoNome?: string
  vendas: VendaElegivel[]
  /** Política vigente da loja para trocas de produtos por peso (GOAL §3/§4). */
  trocasPesoPermitidas: boolean
}

function digits(s: string): string {
  return s.replace(/\D/g, "")
}

export async function buscarVendasElegiveis(
  client: ReadClient,
  storeId: string,
  rawQuery: string,
): Promise<BuscaElegibilidadeResult> {
  const q = rawQuery.trim()
  if (!q || !storeId) return { criterio: "nenhum", vendas: [], trocasPesoPermitidas: true }

  const settings = await client.storeSettings.findUnique({ where: { storeId }, select: { printerConfig: true } })
  const trocasPeso = trocasPesoPermitidas({ printerConfig: settings?.printerConfig ?? undefined })

  const include = { itens: true } as const
  let criterio: BuscaElegibilidadeResult["criterio"] = "nenhum"
  let produtoNome: string | undefined
  let rows: Prisma.VendaGetPayload<{ include: typeof include }>[] = []

  // 1. Código da venda (exato, sem diferenciar caixa).
  const byPedido = await client.venda.findMany({
    where: { storeId, pedidoId: { equals: q, mode: "insensitive" } },
    include,
    take: 1,
  })
  if (byPedido.length > 0) {
    criterio = "pedido"
    rows = byPedido
  }

  // 2. Produto por código de barras / SKU / ID → últimas vendas com o item.
  if (rows.length === 0) {
    const produto = await client.produto.findFirst({
      where: { storeId, OR: [{ id: q }, { sku: q }, { barcode: q }] },
      select: { id: true, sku: true, barcode: true, name: true },
    })
    if (produto) {
      const ids = [produto.id, produto.sku, produto.barcode].filter((x): x is string => typeof x === "string" && x.trim() !== "")
      criterio = "produto"
      produtoNome = produto.name
      rows = await client.venda.findMany({
        where: { storeId, itens: { some: { inventoryId: { in: ids } } } },
        include,
        orderBy: { at: "desc" },
        take: ELEGIBILIDADE_LIMITE,
      })
    }
  }

  // 3. Cliente: CPF/CNPJ (payload) ou parte do nome.
  if (rows.length === 0 && criterio === "nenhum") {
    const doc = digits(q)
    const or: Prisma.VendaWhereInput[] = [{ clienteNome: { contains: q, mode: "insensitive" } }]
    if (doc.length >= 11) or.push({ payload: { path: ["customerCpf"], equals: doc } })
    rows = await client.venda.findMany({
      where: { storeId, OR: or },
      include,
      orderBy: { at: "desc" },
      take: ELEGIBILIDADE_LIMITE,
    })
    if (rows.length > 0) criterio = "cliente"
  }

  if (rows.length === 0) return { criterio, produtoNome, vendas: [], trocasPesoPermitidas: trocasPeso }

  // Linhas KG só aparecem como devolvíveis quando a estrutura do banco existe.
  const temVendaKg = rows.some((r) => r.itens.some((i) => i.quantidadeKg !== null))
  const schemaKgPronto = temVendaKg ? await f8KgReturnSchemaReady(client) : true

  const pedidoIds = rows.map((r) => r.pedidoId)
  const devolvidos = await client.itemDevolucaoVenda.findMany({
    where: { devolucao: { storeId, vendaLocalId: { in: pedidoIds } } },
    select: { inventoryId: true, quantidade: true, quantidadeKg: true, devolucao: { select: { vendaLocalId: true } } },
  })
  const vendas: VendaElegivel[] = []
  for (const r of rows) {
    // Identidade HISTÓRICA por venda (mesmo resolvedor do escritor): SKU renomeado ou
    // reutilizado depois da venda não troca o produto da linha.
    const payloadLines = (r.payload as { lines?: Array<{ inventoryId?: string; produtoId?: string }> } | null)?.lines
    const keys = await saleProductKeyResolver(client, storeId, r, [
      ...devolvidos.filter((d) => d.devolucao.vendaLocalId === r.pedidoId).map((d) => d.inventoryId),
      ...(Array.isArray(payloadLines) ? payloadLines.flatMap((l) => [l?.inventoryId, l?.produtoId]) : []),
    ])
    const canon = (k: string | null | undefined, pid?: string | null) => keys.resolve(k, pid)
    const retorno = new Map<string, number>()
    let historicoNaoResolvido = false
    for (const d of devolvidos) {
      if (d.devolucao.vendaLocalId !== r.pedidoId) continue
      const k = canon(d.inventoryId)
      if (!k) {
        historicoNaoResolvido = true
        continue
      }
      const linha = d.quantidadeKg !== null && d.quantidadeKg !== undefined ? Number(String(d.quantidadeKg)) : d.quantidade || 0
      retorno.set(k, (retorno.get(k) ?? 0) + linha)
    }
    const bloqueio = (k: string, db: { unidade: UnidadeLinha; ilegivel?: boolean }): string | undefined =>
      db.ilegivel
        ? "Não devolvível: linha da venda com quantidade ilegível (sem unidade nem peso) — exige conferência manual."
        : historicoNaoResolvido
        ? "Não devolvível: há devolução anterior desta venda com item não identificável — exige conferência manual."
        : isVirtualSaleLine(k) || !keys.isProduto(k)
        ? `Não devolvível: serviço/avulso não gera vale nem volta ao estoque (sem política aprovada).`
        : keys.isComercialInvalido(k)
          ? "Não devolvível: declaração comercial do produto inválida (revise o cadastro)."
          : db.unidade === "KG" && !schemaKgPronto
            ? "Não devolvível: a estrutura de devolução por peso ainda não foi aplicada no banco desta loja."
            : db.unidade === "KG" && !trocasPeso
              ? "Não devolvível por peso: esta loja desativou trocas/devoluções de produtos vendidos por peso. Produtos por unidade seguem liberados."
              : undefined

    const sale = saleFromDbRow({
      pedidoId: r.pedidoId,
      total: r.total,
      at: r.at,
      clienteNome: r.clienteNome,
      status: r.status,
      payload: r.payload,
      clientSaleId: r.clientSaleId,
      serverId: r.id,
      itens: r.itens,
    })
    // Quantidade/valor/unidade por item vêm do banco (ItemVenda), não do payload do client.
    const porItem = new Map<string, { unidade: UnidadeLinha; quantidade: number; lineTotal: number; nome: string; ilegivel?: boolean }>()
    for (const it of r.itens) {
      const k = (it.inventoryId ?? "").trim()
      if (!k) continue
      const cur = porItem.get(k)
      const linha = linhaVendidaUnidades(it)
      // Linha ilegível (sem quantidade nem peso): aparece bloqueada — conferência manual.
      if (!linha) {
        if (!cur) porItem.set(k, { unidade: "UN", quantidade: 0, lineTotal: 0, nome: it.nome, ilegivel: true })
        continue
      }
      if (!cur) porItem.set(k, { unidade: linha.unidade, quantidade: linha.unidade === "KG" ? linha.units / 1000 : linha.units, lineTotal: it.lineTotal || 0, nome: it.nome })
      else {
        cur.quantidade += linha.unidade === "KG" ? linha.units / 1000 : linha.units
        cur.lineTotal += it.lineTotal || 0
      }
    }
    // Mantém a chave que o PDV conhece (SKU do payload); números sempre do banco.
    // Mesmo fator do escritor: a tela mostra o valor que o servidor vai creditar.
    const fator = fatorValorPago(r.total, r.itens)
    for (const v of porItem.values()) v.lineTotal = Math.round(v.lineTotal * fator * 100) / 100
    const usados = new Set<string>()
    const lines: VendaElegivel["lines"] = []
    for (const base of sale.lines) {
      const k = canon(base.inventoryId, (base as { produtoId?: string }).produtoId)
      const db = k ? porItem.get(k) : undefined
      if (!db || usados.has(k)) continue
      usados.add(k)
      const b = bloqueio(k, db)
      lines.push({
        ...base,
        quantity: db.quantidade,
        lineTotal: db.lineTotal,
        qtyReturned: retorno.get(k) ?? 0,
        produtoId: k,
        unidade: db.unidade,
        ...(db.unidade === "KG" ? { quantityUnit: "KG" as const } : {}),
        ...(b ? { bloqueioDevolucao: b } : {}),
      })
    }
    for (const [k, v] of porItem) {
      if (usados.has(k)) continue
      const b = bloqueio(k, v)
      lines.push({
        inventoryId: k,
        name: v.nome,
        unitPrice: v.quantidade > 0 ? v.lineTotal / v.quantidade : 0,
        quantity: v.quantidade,
        lineTotal: v.lineTotal,
        qtyReturned: retorno.get(k) ?? 0,
        produtoId: k,
        unidade: v.unidade,
        ...(v.unidade === "KG" ? { quantityUnit: "KG" as const } : {}),
        ...(b ? { bloqueioDevolucao: b } : {}),
      } as VendaElegivel["lines"][number])
    }
    vendas.push({ ...sale, lines })
  }

  return { criterio, produtoNome, vendas, trocasPesoPermitidas: trocasPeso }
}
