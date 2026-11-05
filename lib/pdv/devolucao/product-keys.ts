/**
 * Identidade de produto nas devoluções (PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001).
 *
 * O motor de venda grava `ItemVenda.inventoryId` = `Produto.id` (cuid), enquanto o
 * PDV fala em SKU/código de barras e devoluções antigas guardaram o que o client
 * mandou. Sem normalizar, o teto por item comparava chaves diferentes do MESMO
 * produto (recusa indevida ou, pior, teto contornável trocando a grafia).
 * Tudo vira o `Produto.id` da loja quando a chave resolve; senão fica como veio.
 */
import type { Prisma } from "@/generated/prisma"
import { isProductWeightDeclared } from "@/lib/cadastros/product-commercial-contract"

type KeyClient = Pick<Prisma.TransactionClient, "produto">

export async function canonicalProductKeyResolver(
  client: KeyClient,
  storeId: string,
  rawKeys: Iterable<string | null | undefined>,
): Promise<(key: string | null | undefined) => string> {
  const keys = [...new Set([...rawKeys].map((k) => (k ?? "").trim()).filter(Boolean))]
  const byId = new Map<string, string>()
  const bySku = new Map<string, string>()
  const byBarcode = new Map<string, string>()
  if (keys.length > 0) {
    const produtos = await client.produto.findMany({
      where: { storeId, OR: [{ id: { in: keys } }, { sku: { in: keys } }, { barcode: { in: keys } }] },
      select: { id: true, sku: true, barcode: true },
    })
    for (const p of produtos) {
      byId.set(p.id, p.id)
      if (p.sku) bySku.set(p.sku, p.id)
      if (p.barcode) byBarcode.set(p.barcode, p.id)
    }
  }
  return (key) => {
    const k = (key ?? "").trim()
    if (!k) return ""
    return byId.get(k) ?? bySku.get(k) ?? byBarcode.get(k) ?? k
  }
}

type SaleKeyClient = Pick<Prisma.TransactionClient, "produto">

export type SaleForKeys = {
  itens: Array<{ id?: string; inventoryId: string | null; nome: string }>
  payload: unknown
}

export type SaleProductKeys = {
  /** Chave histórica da linha na venda (`ItemVenda.inventoryId`) ou "" se não pertence à venda. */
  resolve: (key: string | null | undefined, produtoId?: string | null) => string
  /** Chave pertence a um `Produto` existente da loja (lastro de estoque). */
  isProduto: (saleKey: string) => boolean
  /** Produto vendido por peso (KG/G): devolução bloqueada até aprovação do schema R3. */
  isPeso: (saleKey: string) => boolean
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

/**
 * PDV-F8-FINALIZACAO-COMPLETA-001 — identidade HISTÓRICA do item devolvido.
 *
 * A autoridade é a chave gravada na venda (`ItemVenda.inventoryId` = Produto.id
 * permanente). SKU/EAN são só identificadores de busca, e valem na ordem:
 *  1. chave exata da venda (Produto.id ou chave virtual);
 *  2. `produtoId` informado pelo client, se for uma chave da venda;
 *  3. o que a venda conhecia NO MOMENTO da venda (linhas do payload: SKU/EAN de
 *     então → linha correspondente) — SKU alterado ou reutilizado depois não muda
 *     a identidade;
 *  4. catálogo ATUAL (SKU/EAN de hoje → Produto.id), aceito só se o resultado for
 *     uma chave da venda.
 * Fora disso a chave não pertence à venda → "" (o caller recusa). Nunca devolve um
 * produto diferente do vendido.
 */
export async function saleProductKeyResolver(
  client: SaleKeyClient,
  storeId: string,
  venda: SaleForKeys,
  extraKeys: Iterable<string | null | undefined> = [],
): Promise<SaleProductKeys> {
  const saleKeys = new Set(venda.itens.map((i) => str(i.inventoryId)).filter(Boolean))

  // Payload da venda → chave histórica. O upsert cria um ItemVenda por linha, na ordem
  // do payload; casa por posição só quando o nome confere (senão não arrisca).
  const alias = new Map<string, string>()
  const lines = (venda.payload as { lines?: unknown } | null)?.lines
  const itensOrdenados = [...venda.itens].sort((a, b) => str(a.id).localeCompare(str(b.id)))
  // Nome repetido entre produtos DIFERENTES torna a posição ambígua: sem casamento por posição.
  const chavesPorNome = new Map<string, Set<string>>()
  for (const it of venda.itens) {
    const n = str(it.nome)
    const set = chavesPorNome.get(n) ?? new Set<string>()
    set.add(str(it.inventoryId))
    chavesPorNome.set(n, set)
  }
  const posicaoSegura = [...chavesPorNome.values()].every((set) => set.size <= 1)
  if (Array.isArray(lines)) {
    lines.forEach((raw, idx) => {
      const l = (raw ?? {}) as Record<string, unknown>
      const pid = str(l.produtoId)
      const inv = str(l.inventoryId)
      let alvo = pid && saleKeys.has(pid) ? pid : inv && saleKeys.has(inv) ? inv : ""
      if (!alvo && posicaoSegura && lines.length === itensOrdenados.length) {
        const it = itensOrdenados[idx]
        if (it && str(it.inventoryId) && str(it.nome) === str(l.name)) alvo = str(it.inventoryId)
      }
      if (!alvo) return
      for (const k of [inv, pid, str(l.sku), str(l.barcode)]) if (k && !alias.has(k)) alias.set(k, alvo)
    })
  }

  const catalog = await canonicalProductKeyResolver(client, storeId, [...saleKeys, ...extraKeys])
  const produtoIds = new Set<string>()
  const peso = new Set<string>()
  if (saleKeys.size > 0) {
    const rows = await client.produto.findMany({ where: { storeId, id: { in: [...saleKeys] } }, select: { id: true, metadata: true } })
    for (const r of rows) {
      produtoIds.add(r.id)
      if (isProductWeightDeclared(r.metadata)) peso.add(r.id)
    }
  }

  const resolve = (key: string | null | undefined, produtoId?: string | null): string => {
    const pid = str(produtoId)
    if (pid && saleKeys.has(pid)) return pid
    const k = str(key)
    if (!k) return ""
    if (saleKeys.has(k)) return k
    const viaVenda = alias.get(k)
    if (viaVenda) return viaVenda
    const atual = catalog(k)
    // Chave da venda que NÃO é Produto.id (legado/virtual) só casa exatamente: mapear
    // pelo SKU de hoje poderia apontar outro produto que herdou o código.
    return saleKeys.has(atual) && produtoIds.has(atual) ? atual : ""
  }
  return { resolve, isProduto: (k) => produtoIds.has(k), isPeso: (k) => peso.has(k) }
}
