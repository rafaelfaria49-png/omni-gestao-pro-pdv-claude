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
