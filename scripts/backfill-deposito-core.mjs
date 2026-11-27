/**
 * Núcleo do backfill de depósitos (BL-07 Fase 1) — separado do CLI para teste.
 *
 * ESTOQUE-MANUAL-KG-001: saldo KG tem até 3 casas, gravado como milésimos/1000.
 * O depósito recebe o valor EXATO de `Produto.stock` e a invariante é conferida
 * em milésimos inteiros, por produto e por loja. Truncar (como antes) zerava
 * gramas e, por truncar os dois lados, ainda reportava "invariante verde".
 * Valor com mais de 3 casas não é arredondado: vira drift explícito.
 */

/** Milésimos inteiros exatos de um saldo; `null` = não finito ou mais de 3 casas. */
export function milesimosExatos(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const text = String(Math.abs(value))
  if (/e/i.test(text)) return null
  const [inteiro, fracao = ""] = text.split(".")
  if (fracao.length > 3) return null
  const m = Number(inteiro) * 1000 + Number(fracao.padEnd(3, "0"))
  if (!Number.isSafeInteger(m)) return null
  return value < 0 && m !== 0 ? -m : m
}

const fmt = (m) => (m === null ? "inválido" : String(m / 1000))

/**
 * Backfill de UMA loja. `depositoId` = principal já garantido (null em dry-run de loja sem principal).
 * Devolve somas em milésimos e a lista de produtos cuja soma de depósitos ≠ stock.
 */
export async function backfillLoja(prisma, { storeId, depositoId, dryRun }) {
  const produtos = await prisma.produto.findMany({ where: { storeId }, select: { id: true, stock: true } })
  const invalidos = produtos.filter((p) => milesimosExatos(p.stock) === null).map((p) => p.id)

  if (!dryRun && depositoId) {
    for (const p of produtos) {
      if (invalidos.includes(p.id)) continue // não propaga saldo corrompido; reportado abaixo
      await prisma.produtoDeposito.upsert({
        where: { produtoId_depositoId: { produtoId: p.id, depositoId } },
        create: { storeId, produtoId: p.id, depositoId, quantidade: p.stock },
        update: { quantidade: p.stock },
      })
    }
  }

  const somaStock = produtos.reduce((acc, p) => acc + (milesimosExatos(p.stock) ?? 0), 0)
  // Dry-run reporta o alvo; exec relê o que o banco gravou de fato.
  const depositos = !dryRun && depositoId
    ? await prisma.produtoDeposito.findMany({ where: { storeId }, select: { produtoId: true, quantidade: true } })
    : produtos.map((p) => ({ produtoId: p.id, quantidade: p.stock }))
  const porProduto = new Map()
  let depositoInvalido = false
  for (const d of depositos) {
    const m = milesimosExatos(d.quantidade)
    if (m === null) depositoInvalido = true
    porProduto.set(d.produtoId, (porProduto.get(d.produtoId) ?? 0) + (m ?? 0))
  }
  const somaDeposito = [...porProduto.values()].reduce((a, b) => a + b, 0)
  const divergentes = produtos
    .filter((p) => invalidos.includes(p.id) || (porProduto.get(p.id) ?? 0) !== milesimosExatos(p.stock))
    .map((p) => p.id)

  return {
    storeId,
    produtos: produtos.length,
    somaStock,
    somaDeposito,
    drift: somaDeposito - somaStock,
    divergentes,
    invalidos,
    depositoInvalido,
    verde: divergentes.length === 0 && !depositoInvalido,
    linha: `${storeId}: produtos=${produtos.length} · Σstock=${fmt(somaStock)} · Σdepósito=${fmt(somaDeposito)} · drift=${fmt(somaDeposito - somaStock)} · divergentes=${divergentes.length}${invalidos.length ? ` · precisão inválida=${invalidos.join(",")}` : ""}`,
  }
}
