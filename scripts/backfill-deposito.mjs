/**
 * backfill-deposito.mjs — BL-07 Fase 1 (ADR-0007 · SPRINT_BL07_FASE1).
 *
 * Bootstrap idempotente do multi-depósito para LOJAS EXISTENTES:
 *   1) garante 1 "Depósito Principal" (codigo=PRINCIPAL, principal=true) por loja;
 *   2) materializa ProdutoDeposito a partir de Produto.stock no depósito principal;
 *   3) verifica a invariante por produto, em milésimos exatos (KG tem 3 casas — ver backfill-deposito-core.mjs).
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
import { backfillLoja } from "./backfill-deposito-core.mjs";

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
  let verde = true;

  for (const { id: storeId } of stores) {
    const dep = await ensurePrincipal(storeId);
    const r = await backfillLoja(prisma, { storeId, depositoId: dep.id, dryRun: DRY_RUN });
    if (!r.verde) verde = false;
    console.log(`  principal=${dep.created ? (DRY_RUN ? "CRIAR" : "criado") : "ok"} · ${r.linha}`);
    if (r.divergentes.length) console.error(`    divergentes: ${r.divergentes.slice(0, 20).join(", ")}${r.divergentes.length > 20 ? " …" : ""}`);
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] nada gravado. Rode com --exec para aplicar.");
  } else if (verde) {
    console.log("\n[OK] invariante verde: depósitos == Produto.stock por produto, em milésimos exatos.");
  } else {
    console.error("\n[ALERTA] invariante divergente ou saldo com precisão inválida — investigar antes de prosseguir.");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
