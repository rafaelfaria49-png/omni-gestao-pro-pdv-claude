// P2.3 · prova de estoque KG no branch pr315-kg, com o boundary REAL da PR (applyStockMutationTx) e o papel runtime.
// Tudo corre dentro de UMA transação interativa que termina em ROLLBACK proposital: nada fica gravado.
// Chamado por p2-preparo-preview.cjs (fase kg) com P2_KG_RUNTIME_URL no ambiente; imprime só JSON sem segredos.
// Rodar com o tsx a partir da raiz da worktree da PR (aliases @/ do tsconfig).
import Module from "node:module"
import path from "node:path"
import { PrismaClient } from "@/generated/prisma"
import type { StockLedgerTx } from "@/lib/estoque/stock-ledger-service"

// `server-only` é resolvido pelo Next; fora dele usa-se o mesmo stub do vitest.config.ts (test/server-only.ts).
const M = Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string }
const resolveOrig = M._resolveFilename
M._resolveFilename = function (r: string, ...a: unknown[]) {
  return resolveOrig.call(this, r === "server-only" ? path.join(process.cwd(), "test", "server-only.ts") : r, ...a)
}

const url = process.env.P2_KG_RUNTIME_URL ?? ""
if (!url) throw new Error("P2_KG_RUNTIME_URL ausente")
const db = new PrismaClient({ datasourceUrl: url })
const S = "p2kg-loja"
const ctx = { storeId: S, principal: null, source: "p2-preview-kg" }
class Rollback extends Error { constructor(public r: unknown) { super("rollback proposital") } }

async function main() {
  const { applyStockMutationTx } = await import("@/lib/estoque/stock-ledger-service")
  let out: unknown
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO stores (id, name, "updatedAt") VALUES (${S}, 'P2 KG sintética', now())`
      await tx.$executeRaw`INSERT INTO depositos (id, "storeId", nome, codigo, principal) VALUES ('p2kg-dep', ${S}, 'Principal', 'principal', true)`
      await tx.$executeRaw`INSERT INTO estoque_produtos (id, "storeId", name, stock, price, metadata, "updatedAt") VALUES
        ('p2kg-pao', ${S}, 'PAO FRANCES SINTETICO', 0, 20, '{"comercial":{"version":1,"modoVenda":"peso","unidade":"KG","basePreco":"KG"}}'::jsonb, now()),
        ('p2kg-un', ${S}, 'REFRI SINTETICO UN', 0, 7.5, '{}'::jsonb, now())`
      const t = tx as unknown as StockLedgerTx
      const ent = (produtoId: string, quantidade: number) =>
        applyStockMutationTx(t, ctx, { kind: "entrada", produtoId, quantidade, origem: "manual" } as never)
      const r1 = await ent("p2kg-pao", 2.5)
      const r2 = await ent("p2kg-pao", 0.75)
      const r4casas = await ent("p2kg-pao", 0.0001)
      const rUn = await ent("p2kg-un", 3)
      const rUnFrac = await ent("p2kg-un", 0.5)
      const txt = await tx.$queryRaw<Array<{ id: string; stock: string; dep: string | null }>>`
        SELECT p.id, p.stock::text AS stock, (SELECT string_agg(d.quantidade::text, ',') FROM produto_depositos d WHERE d."produtoId" = p.id) AS dep
        FROM estoque_produtos p WHERE p."storeId" = ${S} ORDER BY p.id`
      const movs = await tx.$queryRaw<Array<{ id: string; q: string; a: string; d: string }>>`
        SELECT "produtoId" AS id, quantidade::text AS q, "estoqueAntes"::text AS a, "estoqueDepois"::text AS d
        FROM movimentacoes_estoque WHERE "storeId" = ${S} ORDER BY "createdAt", id`
      throw new Rollback({
        r1: r1.ok ? [r1.estoqueAntes, r1.estoqueDepois] : r1,
        r2: r2.ok ? [r2.estoqueAntes, r2.estoqueDepois] : r2,
        kg_4_casas: r4casas.ok ? "ACEITO" : r4casas.code,
        un_inteiro: rUn.ok ? [rUn.estoqueAntes, rUn.estoqueDepois] : rUn,
        un_fracionado: rUnFrac.ok ? "ACEITO" : rUnFrac.code,
        saldos_texto_pg: txt, livro_texto_pg: movs,
      })
    }, { timeout: 60000 })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
    out = e.r
  }
  const resto = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT (SELECT count(*) FROM stores WHERE id = ${S}) + (SELECT count(*) FROM estoque_produtos WHERE "storeId" = ${S})
      + (SELECT count(*) FROM movimentacoes_estoque WHERE "storeId" = ${S}) AS n`
  console.log(JSON.stringify({ ...(out as object), linhas_restantes_apos_rollback: Number(resto[0].n) }))
}
main().catch((e) => { console.error(String(e instanceof Error ? e.message : e).slice(0, 2000)); process.exit(1) }).finally(() => db.$disconnect())
