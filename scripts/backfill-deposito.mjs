/**
 * backfill-deposito.mjs — BL-07 Fase 1 (ADR-0007 · SPRINT_BL07_FASE1).
 *
 * Bootstrap idempotente do multi-depósito para LOJAS EXISTENTES:
 *   1) garante 1 "Depósito Principal" (codigo=PRINCIPAL, principal=true) por loja;
 *   2) materializa ProdutoDeposito a partir de Produto.stock no depósito principal;
 *   3) verifica a invariante: Σ ProdutoDeposito.quantidade == Σ Produto.stock por loja.
 *
 * NÃO altera Produto.stock (cache permanece a verdade operacional até a Fase 2).
 * Idempotente / re-runnable — re-executar re-sincroniza o principal ao Produto.stock.
 *
 * Pré-requisito: schema aplicado (migração 0011 via `npm run db:push`) + client regenerado.
 *
 * Uso:
 *   node --env-file=.env scripts/backfill-deposito.mjs                 → dry-run (não escreve)
 *   node --env-file=.env scripts/backfill-deposito.mjs --exec          → executa
 *   node --env-file=.env scripts/backfill-deposito.mjs --store=loja-2  → restringe a 1 loja
 */
import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes("--exec");
const storeArg = (process.argv.find((a) => a.startsWith("--store=")) ?? "").split("=")[1]?.trim();

const DEPOSITO_PRINCIPAL_NOME = "Depósito Principal";
const DEPOSITO_PRINCIPAL_CODIGO = "PRINCIPAL";

async function ensurePrincipal(storeId) {
  const found = await prisma.deposito.findFirst({
    where: { storeId, OR: [{ codigo: DEPOSITO_PRINCIPAL_CODIGO }, { principal: true }] },
    select: { id: true },
  });
  if (found) return { id: found.id, created: false };
  if (DRY_RUN) return { id: null, created: true };
  const created = await prisma.deposito.create({
    data: { storeId, nome: DEPOSITO_PRINCIPAL_NOME, codigo: DEPOSITO_PRINCIPAL_CODIGO, ativo: true, principal: true },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

async function main() {
  const stores = storeArg
    ? await prisma.store.findMany({ where: { id: storeArg }, select: { id: true } })
    : await prisma.store.findMany({ select: { id: true }, orderBy: { id: "asc" } });

  if (stores.length === 0) {
    console.error(`[ABORT] nenhuma loja${storeArg ? ` com id="${storeArg}"` : ""} encontrada.`);
    process.exitCode = 1;
    return;
  }

  console.log(`[${DRY_RUN ? "DRY-RUN" : "EXEC"}] ${stores.length} loja(s).`);
  let driftTotal = 0;

  for (const { id: storeId } of stores) {
    const dep = await ensurePrincipal(storeId);
    const produtos = await prisma.produto.findMany({ where: { storeId }, select: { id: true, stock: true } });
    const somaStock = produtos.reduce((acc, p) => acc + (Math.trunc(Number(p.stock)) || 0), 0);

    if (!DRY_RUN && dep.id) {
      for (const p of produtos) {
        const quantidade = Math.trunc(Number(p.stock)) || 0;
        await prisma.produtoDeposito.upsert({
          where: { produtoId_depositoId: { produtoId: p.id, depositoId: dep.id } },
          create: { storeId, produtoId: p.id, depositoId: dep.id, quantidade },
          update: { quantidade },
        });
      }
    }

    // Verificação de invariante (só faz sentido após exec; em dry-run reporta o alvo).
    let somaDeposito = somaStock;
    if (!DRY_RUN && dep.id) {
      const rows = await prisma.produtoDeposito.findMany({ where: { storeId }, select: { quantidade: true } });
      somaDeposito = rows.reduce((acc, r) => acc + (Math.trunc(Number(r.quantidade)) || 0), 0);
    }
    const drift = somaDeposito - somaStock;
    driftTotal += Math.abs(drift);

    console.log(
      `  ${storeId}: principal=${dep.created ? (DRY_RUN ? "CRIAR" : "criado") : "ok"} · produtos=${produtos.length} · Σstock=${somaStock} · Σdepósito=${somaDeposito} · drift=${drift}`,
    );
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] nada gravado. Rode com --exec para aplicar.");
  } else if (driftTotal === 0) {
    console.log("\n[OK] invariante verde: Σ ProdutoDeposito == Σ Produto.stock em todas as lojas (drift total = 0).");
  } else {
    console.error(`\n[ALERTA] drift total = ${driftTotal} — investigar antes de prosseguir.`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
