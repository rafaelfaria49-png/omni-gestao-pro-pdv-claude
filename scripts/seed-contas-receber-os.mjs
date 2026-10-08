/**
 * Seed idempotente de IMPORTAÇÃO: cria o `ContaReceberTitulo` canônico (`os-faturamento`) das
 * OS já importadas que ainda NÃO têm título.
 *
 * Título existente NUNCA é regravado: ele é a autoridade do ledger (histórico de baixas,
 * marcadores `a_prazo_autorizado` que o replay dos recebimentos procura), do status
 * (pago/parcial/cancelado/estornado) e do valor vigente. Sincronizar título existente com a OS é
 * papel do adapter `os-faturamento` (OS → título, sob trava), não deste snapshot.
 *
 * Por OS, numa transação curta: OS `FOR UPDATE` → releitura da OS → `INSERT … ON CONFLICT DO
 * NOTHING` do título. Mesma ordem global dos recebimentos (advisory → sessão → OS → título), sem
 * título → OS; um título criado/pago por outro fluxo em qualquer momento vence.
 *
 * Uso:
 *   node scripts/seed-contas-receber-os.mjs         → dry-run (só leitura)
 *   node scripts/seed-contas-receber-os.mjs --exec  → cria os títulos ausentes
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "../generated/prisma/index.js";

const STORE_ID = "loja-1";
const TX_SEED_TITULO = { maxWait: 5_000, timeout: 15_000 };

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

const OS_SELECT = { id: true, storeId: true, numero: true, valorTotal: true, createdAt: true, status: true, clienteId: true, payload: true };

/** Título NOVO derivado da OS (só usado quando a OS ainda não tem título). */
function montarTituloDaOS(os) {
  const payload = isRecord(os.payload) ? os.payload : {};
  const osCodigo = safeStr(payload.codigo) || (os.numero ? `OS-${os.numero}` : `OS-${os.id.slice(-6)}`);
  const clienteNome = safeStr(payload?.cliente?.nome) || "Cliente";

  // Política simples: OS Entregue => receber como pago; caso contrário pendente.
  const status = os.status === "Entregue" ? "pago" : "pendente";

  const createdAtIso = os.createdAt?.toISOString?.() ?? new Date().toISOString();
  const vencimento = ptbrDateFromIso(addDays(createdAtIso, 30));
  const valor = Math.round(Number(os.valorTotal || 0) * 100) / 100;

  return {
    osCodigo,
    data: {
      storeId: os.storeId,
      localKey: buildLocalKeyOsFaturamento(os.storeId, os.id),
      descricao: `OS ${osCodigo} — Faturamento`,
      cliente: clienteNome,
      valor,
      vencimento,
      status,
      payload: buildPayloadCompact({
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
      }),
    },
  };
}

/**
 * Cria o título da OS se ausente. A OS é travada e relida (valor/status mais recentes); o INSERT
 * não sobrescreve um título já existente nem um criado em paralelo (espera o commit dele e
 * desiste). Nenhum UPDATE: nada aqui depende de leitura feita fora da trava.
 */
async function criarTituloSeAusente(prisma, storeId, osId) {
  return prisma.$transaction(async (tx) => {
    const travada = await tx.$queryRaw`
      SELECT "id" FROM "ordens_servico" WHERE "id" = ${osId} AND "storeId" = ${storeId} FOR UPDATE
    `;
    if (!Array.isArray(travada) || travada.length === 0) return { acao: "ignorada", osCodigo: osId };
    const os = await tx.ordemServico.findFirst({ where: { id: osId, storeId }, select: OS_SELECT });
    if (!os || !(Number(os.valorTotal || 0) > 0)) return { acao: "ignorada", osCodigo: osId };
    const { osCodigo, data } = montarTituloDaOS(os);
    const { count } = await tx.contaReceberTitulo.createMany({ data: [data], skipDuplicates: true });
    return { acao: count === 1 ? "criado" : "preservado", osCodigo, data };
  }, TX_SEED_TITULO);
}

export async function seedContasReceberOS(prisma, { storeId = STORE_ID, dryRun = true, log = console.log, logError = console.error } = {}) {
  log(`\nSeed Contas a Receber (OS) — ${dryRun ? "DRY-RUN" : "EXEC"}\n`);

  const osRows = await prisma.ordemServico.findMany({
    where: { storeId, valorTotal: { gt: 0 } },
    select: OS_SELECT,
    orderBy: { createdAt: "asc" },
  });

  log(`OS encontradas (storeId=${storeId}, valorTotal>0): ${osRows.length}`);

  const stats = { processed: osRows.length, created: 0, preserved: 0, skipped: 0, errors: 0 };

  for (const os of osRows) {
    if (dryRun) {
      const { osCodigo, data } = montarTituloDaOS(os);
      const existing = await prisma.contaReceberTitulo.findUnique({
        where: { storeId_localKey: { storeId: os.storeId, localKey: data.localKey } },
        select: { id: true },
      });
      if (existing) {
        stats.preserved++;
        log(`[CR] PRESERVADO (dry-run) | OS ${osCodigo} | título existente não é regravado`);
      } else {
        stats.created++;
        log(`[CR] CRIADO (dry-run) | OS ${osCodigo} | ${data.cliente} | R$ ${data.valor.toFixed(2)} | ${data.status}`);
      }
      continue;
    }

    try {
      const r = await criarTituloSeAusente(prisma, os.storeId, os.id);
      if (r.acao === "criado") {
        stats.created++;
        log(`[CR] criado     | OS ${r.osCodigo} | ${r.data.cliente} | R$ ${r.data.valor.toFixed(2)} | ${r.data.status}`);
      } else if (r.acao === "preservado") {
        stats.preserved++;
        log(`[CR] preservado | OS ${r.osCodigo} | título existente não é regravado`);
      } else {
        stats.skipped++;
        log(`[CR] ignorada   | OS ${r.osCodigo} | OS ausente ou sem valor na releitura`);
      }
    } catch (err) {
      stats.errors++;
      logError(`[CR] ERRO | OS ${os.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (dryRun) {
    log("\nDRY-RUN concluído. Rode com --exec para gravar.");
    return stats;
  }

  const total = await prisma.contaReceberTitulo.count({ where: { storeId } });
  log("\n" + "─".repeat(56));
  log("[CR] Resumo final");
  log(`    Processadas : ${osRows.length} OS`);
  log(`    Criadas     : ${stats.created}`);
  log(`    Preservadas : ${stats.preserved} (título existente)`);
  log(`    Ignoradas   : ${stats.skipped}`);
  log(`    Erros       : ${stats.errors}`);
  log(`    Total CR DB : ${total} (storeId=${storeId})`);
  log("─".repeat(56));
  return stats;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedContasReceberOS(prisma, { dryRun: !process.argv.includes("--exec") });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
}
