/**
 * backfill-movimentacoes-financeiras.mjs
 *
 * Gera MovimentacaoFinanceira para todos os ContaReceberTitulo (pago/parcial)
 * e ContaPagarTitulo (pago/parcial) que ainda não têm movimentação vinculada.
 *
 * Idempotente — pode ser executado múltiplas vezes sem duplicar dados.
 *
 * Uso:
 *   node scripts/backfill-movimentacoes-financeiras.mjs         → dry-run
 *   node scripts/backfill-movimentacoes-financeiras.mjs --exec  → executa
 */

import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_ID = "loja-1";
const DRY_RUN = !process.argv.includes("--exec");

function safeMoney(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? Math.abs(Math.round(n * 100) / 100) : 0;
}

async function existeMovimentacao(storeId, referenciaId, tipo, origem) {
  const found = await prisma.movimentacaoFinanceira.findFirst({
    where: { storeId, referenciaId, tipo, origem },
    select: { id: true },
  });
  return found !== null;
}

async function criarOuPular(storeId, referenciaId, tipo, origem, valor, descricao, stats) {
  if (await existeMovimentacao(storeId, referenciaId, tipo, origem)) {
    stats.ignorados++;
    if (DRY_RUN) console.log(`[SKIP] ${tipo.padEnd(7)} | ${origem.padEnd(16)} | R$ ${valor.toFixed(2).padStart(8)} | ${descricao}`);
    return;
  }

  if (DRY_RUN) {
    console.log(`[CRIAR] ${tipo.padEnd(7)} | ${origem.padEnd(16)} | R$ ${valor.toFixed(2).padStart(8)} | ${descricao}`);
    stats.criados++;
    return;
  }

  try {
    await prisma.movimentacaoFinanceira.create({
      data: { storeId, referenciaId, tipo, origem, valor, descricao },
    });
    stats.criados++;
  } catch (err) {
    stats.erros++;
    console.error(`[ERRO] ${descricao}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  backfill-movimentacoes-financeiras — ${DRY_RUN ? "DRY-RUN" : "EXEC"}`);
  console.log(`${"=".repeat(60)}\n`);

  const stats = { criados: 0, ignorados: 0, erros: 0 };

  // ── Contas a Receber pagas ────────────────────────────────────────────────
  const crPagas = await prisma.contaReceberTitulo.findMany({
    where: { storeId: STORE_ID, status: { in: ["pago", "parcial"] } },
    select: { id: true, storeId: true, descricao: true, cliente: true, valor: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`ContaReceberTitulo pagas/parciais: ${crPagas.length}`);

  for (const cr of crPagas) {
    const valor = safeMoney(cr.valor);
    if (!(valor > 0)) continue;
    const origem = cr.status === "parcial" ? "receber_parcial" : "receber";
    const descricao = `Recebimento — ${cr.cliente || cr.descricao}`;
    await criarOuPular(cr.storeId, cr.id, "entrada", origem, valor, descricao, stats);
  }

  // ── Contas a Pagar pagas ──────────────────────────────────────────────────
  const cpPagas = await prisma.contaPagarTitulo.findMany({
    where: { storeId: STORE_ID, status: { in: ["pago", "parcial"] } },
    select: { id: true, storeId: true, descricao: true, valor: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`ContaPagarTitulo pagas/parciais:   ${cpPagas.length}`);

  for (const cp of cpPagas) {
    const valor = safeMoney(cp.valor);
    if (!(valor > 0)) continue;
    const origem = cp.status === "parcial" ? "pagar_parcial" : "pagar";
    const descricao = `Pagamento — ${cp.descricao}`;
    await criarOuPular(cp.storeId, cp.id, "saida", origem, valor, descricao, stats);
  }

  // ── Resumo ────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  if (DRY_RUN) {
    console.log("DRY-RUN — nenhum dado foi gravado.");
    console.log(`    Seriam criadas : ${stats.criados}`);
    console.log(`    Seriam puladas : ${stats.ignorados}`);
  } else {
    const totalMov = await prisma.movimentacaoFinanceira.count({ where: { storeId: STORE_ID } });
    console.log("Backfill concluído.");
    console.log(`    Criadas        : ${stats.criados}`);
    console.log(`    Ignoradas      : ${stats.ignorados} (idempotência)`);
    console.log(`    Erros          : ${stats.erros}`);
    console.log(`    Total mov. DB  : ${totalMov} (storeId=${STORE_ID})`);

    // Exemplos recentes
    const exemplos = await prisma.movimentacaoFinanceira.findMany({
      where: { storeId: STORE_ID },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { tipo: true, origem: true, valor: true, descricao: true, createdAt: true },
    });
    console.log("\nExemplos recentes:");
    for (const e of exemplos) {
      console.log(`  ${e.tipo.padEnd(7)} | ${(e.origem ?? "").padEnd(16)} | R$ ${Number(e.valor).toFixed(2).padStart(8)} | ${e.descricao}`);
    }
  }
  console.log(`${"─".repeat(60)}\n`);
}

main()
  .catch((e) => { console.error("FATAL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
