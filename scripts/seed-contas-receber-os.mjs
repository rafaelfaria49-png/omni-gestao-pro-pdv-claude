/**
 * Seed idempotente: cria/atualiza `ContaReceberTitulo` a partir das OS já importadas.
 *
 * Uso:
 *   node scripts/seed-contas-receber-os.mjs         → dry-run (não grava)
 *   node scripts/seed-contas-receber-os.mjs --exec  → executa upserts
 */
import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_ID = "loja-1";
const DRY_RUN = !process.argv.includes("--exec");

function safeStr(v) {
  return typeof v === "string" ? v : "";
}

function isRecord(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function ptbrDateFromIso(iso) {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

function addDays(iso, days) {
  const d = iso ? new Date(iso) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function buildPayloadCompact(input) {
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function buildLocalKeyOsFaturamento(storeId, ordemServicoId) {
  // contrato: lib/financeiro/contracts/local-key.ts
  return `os-faturamento:${storeId}:${ordemServicoId}`;
}

async function main() {
  console.log(`\nSeed Contas a Receber (OS) — ${DRY_RUN ? "DRY-RUN" : "EXEC"}\n`);

  const osRows = await prisma.ordemServico.findMany({
    where: { storeId: STORE_ID, valorTotal: { gt: 0 } },
    select: { id: true, storeId: true, numero: true, valorTotal: true, createdAt: true, status: true, clienteId: true, payload: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`OS encontradas (storeId=${STORE_ID}, valorTotal>0): ${osRows.length}`);

  const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };

  for (const os of osRows) {
    const payload = isRecord(os.payload) ? os.payload : {};
    const osCodigo = safeStr(payload.codigo) || (os.numero ? `OS-${os.numero}` : `OS-${os.id.slice(-6)}`);
    const clienteNome = safeStr(payload?.cliente?.nome) || "Cliente";

    const localKey = buildLocalKeyOsFaturamento(os.storeId, os.id);

    // Política simples: OS Entregue => receber como pago; caso contrário pendente.
    const status = os.status === "Entregue" ? "pago" : "pendente";

    const createdAtIso = os.createdAt?.toISOString?.() ?? new Date().toISOString();
    const vencimentoIso = addDays(createdAtIso, 30);
    const vencimento = ptbrDateFromIso(vencimentoIso);

    const valor = Math.round(Number(os.valorTotal || 0) * 100) / 100;
    const descricao = `OS ${osCodigo} — Faturamento`;

    const payloadTitulo = buildPayloadCompact({
      origem: "os",
      ordemServicoId: os.id,
      ordemNumero: osCodigo,
      clienteId: safeStr(os.clienteId),
      clienteNome,
      referencia: `OS ${osCodigo}`,
      createdFrom: "seed_os_import",
      statusOperacional: safeStr(payload.operacaoStatus) || safeStr(payload.status) || safeStr(os.status),
      // guarda o snapshot do orçamento/serviços se estiver disponível
      orcamento: payload.orcamento ?? undefined,
    });

    const existing = await prisma.contaReceberTitulo.findUnique({
      where: { storeId_localKey: { storeId: os.storeId, localKey } },
      select: { id: true },
    });

    const data = {
      storeId: os.storeId,
      localKey,
      descricao,
      cliente: clienteNome,
      valor,
      vencimento,
      status,
      payload: payloadTitulo,
    };

    if (DRY_RUN) {
      const action = existing ? "atualizado" : "criado";
      console.log(`[CR] ${action.toUpperCase()} (dry-run) | OS ${osCodigo} | ${clienteNome} | R$ ${valor.toFixed(2)} | ${status}`);
      continue;
    }

    try {
      await prisma.contaReceberTitulo.upsert({
        where: { storeId_localKey: { storeId: os.storeId, localKey } },
        create: data,
        update: data,
      });
      if (existing) {
        stats.updated++;
        console.log(`[CR] atualizado | OS ${osCodigo} | ${clienteNome} | R$ ${valor.toFixed(2)} | ${status}`);
      } else {
        stats.created++;
        console.log(`[CR] criado     | OS ${osCodigo} | ${clienteNome} | R$ ${valor.toFixed(2)} | ${status}`);
      }
    } catch (err) {
      stats.errors++;
      console.error(`[CR] ERRO | OS ${osCodigo}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDRY-RUN concluído. Rode com --exec para gravar.");
    return;
  }

  const total = await prisma.contaReceberTitulo.count({ where: { storeId: STORE_ID } });
  console.log("\n" + "─".repeat(56));
  console.log("[CR] Resumo final");
  console.log(`    Processadas : ${osRows.length} OS`);
  console.log(`    Criadas     : ${stats.created}`);
  console.log(`    Atualizadas : ${stats.updated}`);
  console.log(`    Ignoradas   : ${stats.skipped}`);
  console.log(`    Erros       : ${stats.errors}`);
  console.log(`    Total CR DB : ${total} (storeId=${STORE_ID})`);
  console.log("─".repeat(56));
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

