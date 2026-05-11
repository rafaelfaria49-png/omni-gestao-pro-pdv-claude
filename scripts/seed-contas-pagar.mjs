/**
 * Seed idempotente de despesas realistas (ContaPagarTitulo + Fornecedor).
 *
 * Uso:
 *   node scripts/seed-contas-pagar.mjs         → dry-run (não grava)
 *   node scripts/seed-contas-pagar.mjs --exec  → executa upserts
 */
import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORE_ID = "loja-1";
const DRY_RUN = !process.argv.includes("--exec");

function safeStr(v) {
  return typeof v === "string" ? v : "";
}

function ptbrDate(d) {
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

function monthRef(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildLocalKeyPagarFornecedor(storeId, fornecedorId, referencia) {
  return `pagar:fornecedor:${storeId}:${fornecedorId}:${referencia}`;
}

function buildPayloadCompact(input) {
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

async function findOrCreateFornecedor(name) {
  const existing = await prisma.fornecedor.findFirst({
    where: { storeId: STORE_ID, name },
    select: { id: true, name: true },
  });
  if (existing) return existing;
  if (DRY_RUN) return { id: `DRY_${name}`, name };
  return prisma.fornecedor.create({
    data: { storeId: STORE_ID, name },
    select: { id: true, name: true },
  });
}

async function main() {
  console.log(`\nSeed Contas a Pagar — ${DRY_RUN ? "DRY-RUN" : "EXEC"}\n`);

  const now = new Date();
  const ref = monthRef(now);

  // Fornecedores base (encontra ou cria idempotente)
  const fornImobiliaria  = await findOrCreateFornecedor("Imobiliária Central");
  const fornEnergia      = await findOrCreateFornecedor("Concessionária de Energia");
  const fornInternet     = await findOrCreateFornecedor("Provedor de Internet Fibra");
  const fornContab       = await findOrCreateFornecedor("Contabilidade Pro");
  const fornPecasSamsung = await findOrCreateFornecedor("Fornecedor Peças Samsung");
  const fornPecasIphone  = await findOrCreateFornecedor("Fornecedor Peças iPhone/Apple");
  const fornFerramentas  = await findOrCreateFornecedor("Distribuidora de Ferramentas");
  const fornMarketing    = await findOrCreateFornecedor("Agência de Marketing Digital");

  const titles = [
    { fornecedor: fornImobiliaria,  descricao: "Aluguel da loja",                 categoria: "Aluguel",       valor: 1800,   dia: 5  },
    { fornecedor: fornEnergia,      descricao: "Conta de energia elétrica",        categoria: "Energia",       valor: 620,    dia: 10 },
    { fornecedor: fornInternet,     descricao: "Internet fibra / telefone",        categoria: "Internet",      valor: 139.9,  dia: 12 },
    { fornecedor: fornContab,       descricao: "Honorários contábeis",             categoria: "Contabilidade", valor: 450,    dia: 15 },
    { fornecedor: fornPecasSamsung, descricao: "Reposição peças Samsung (mensal)", categoria: "Peças Samsung", valor: 1250,   dia: 18 },
    { fornecedor: fornPecasIphone,  descricao: "Reposição peças iPhone (mensal)",  categoria: "Peças iPhone",  valor: 980,    dia: 20 },
    { fornecedor: fornFerramentas,  descricao: "Ferramentas e consumíveis",        categoria: "Ferramentas",   valor: 240,    dia: 22 },
    { fornecedor: fornMarketing,    descricao: "Gestão redes sociais / tráfego",   categoria: "Marketing",     valor: 350,    dia: 25 },
  ];

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const t of titles) {
    const venc = new Date(now);
    venc.setDate(t.dia);
    const vencimento = ptbrDate(venc);

    const localKey = buildLocalKeyPagarFornecedor(STORE_ID, t.fornecedor.id, `${ref}:${t.categoria}`);
    const status = "pendente";

    const payload = buildPayloadCompact({
      origem: "manual",
      fornecedorId: t.fornecedor.id.startsWith("DRY_") ? undefined : t.fornecedor.id,
      fornecedorNome: t.fornecedor.name,
      categoria: t.categoria,
      referencia: `Despesa ${ref}`,
      createdFrom: "seed_financeiro",
    });

    const data = {
      storeId: STORE_ID,
      fornecedorId: t.fornecedor.id.startsWith("DRY_") ? null : t.fornecedor.id,
      localKey,
      payload,
      descricao: t.descricao,
      valor: t.valor,
      vencimento,
      status,
      numeroDocumento: "",
    };

    const existing = await prisma.contaPagarTitulo.findUnique({
      where: { storeId_localKey: { storeId: STORE_ID, localKey } },
      select: { id: true },
    });

    if (DRY_RUN) {
      const action = existing ? "atualizado" : "criado";
      console.log(`[CP] ${action.toUpperCase()} (dry-run) | ${t.categoria.padEnd(14)} | ${t.descricao.padEnd(36)} | R$ ${String(t.valor.toFixed(2)).padStart(8)} | venc=${vencimento}`);
      continue;
    }

    try {
      await prisma.contaPagarTitulo.upsert({
        where: { storeId_localKey: { storeId: STORE_ID, localKey } },
        create: data,
        update: data,
      });
      if (existing) {
        updated++;
        console.log(`[CP] atualizado | ${t.categoria.padEnd(14)} | ${t.descricao}`);
      } else {
        created++;
        console.log(`[CP] criado     | ${t.categoria.padEnd(14)} | ${t.descricao} | R$ ${t.valor.toFixed(2)} | venc=${vencimento}`);
      }
    } catch (err) {
      errors++;
      console.error(`[CP] ERRO | ${t.descricao}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDRY-RUN concluído. Rode com --exec para gravar.");
    return;
  }

  const total = await prisma.contaPagarTitulo.count({ where: { storeId: STORE_ID } });
  console.log("\n" + "─".repeat(56));
  console.log("[CP] Resumo final");
  console.log(`    Criadas     : ${created}`);
  console.log(`    Atualizadas : ${updated}`);
  console.log(`    Erros       : ${errors}`);
  console.log(`    Total CP DB : ${total} (storeId=${STORE_ID})`);
  console.log("─".repeat(56));
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

