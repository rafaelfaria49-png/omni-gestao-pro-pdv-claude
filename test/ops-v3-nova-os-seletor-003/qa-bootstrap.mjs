/**
 * OPERACOES-V3-SELETOR-003-ACEITE-REAL — massa QA SINTÉTICA para o aceite no navegador.
 *
 * Cria (idempotente) no PostgreSQL LOCAL DESCARTÁVEL:
 *  - Loja A `000-qa-seletor-a` (assistência liberada: pacote básico + service + deviceCatalog);
 *  - Loja B `000-qa-seletor-b` (outra unidade, sem vínculo com o usuário QA);
 *  - usuário QA STORE/ADMIN vinculado só à loja A;
 *  - OS original ENTREGUE na loja A (garantia de 90 dias vigente) e uma OS na loja B.
 *
 * Recusa qualquer banco que não seja loopback + `ops_v3_seletor_qa*`. Lê as credenciais só do
 * ambiente (arquivo fora do repositório); nenhum segredo é impresso nem versionado.
 *
 *   node --env-file=<qa.env fora do repo> test/ops-v3-nova-os-seletor-003/qa-bootstrap.mjs
 */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

export const LOJA_A = "000-qa-seletor-a";
export const LOJA_B = "000-qa-seletor-b";
export const OS_ORIGEM_A = "qa-seletor-origem-a";
export const OS_LOJA_B = "qa-seletor-loja-b";

export function exigirBancoQASeletor(e = process.env) {
  const urls = [e.DATABASE_URL, e.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("BLOQUEIO_QA: DATABASE_URL e DIRECT_URL ausentes.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost"].includes(u.hostname))) throw new Error("BLOQUEIO_QA: só PostgreSQL em loopback.");
  if (urls[0] !== urls[1] || !parsed[0].pathname.slice(1).startsWith("ops_v3_seletor_qa")) {
    throw new Error("BLOQUEIO_QA: o alvo precisa ser o banco descartável ops_v3_seletor_qa* (idêntico em DATABASE_URL e DIRECT_URL).");
  }
  return urls[0];
}

const ENTRADA = "2026-08-01T12:00:00.000Z";

function payloadOS({ id, codigo, storeId, clienteId, nome, telefone, modelo, serie, entregueEm }) {
  return {
    id, codigo, storeId, clienteId, criadoEm: ENTRADA, atualizadoEm: ENTRADA, prioridade: "media", origem: "balcao",
    pecas: [], observacoes: [], anexos: [],
    cliente: { id: clienteId, nome, telefone },
    equipamento: { tipo: "Smartphone", marca: "Samsung", modelo, numeroSerie: serie, acessorios: ["Capa"], defeitoRelatado: "Tela quebrada" },
    status: "entregue", operacaoStatus: "entregue", operacaoStatusV3: "entregue", valorTotal: 300,
    servicosCatalogo: [{ servicoId: `s-${id}`, descricao: "Troca de tela", custoInterno: 92, valorVenda: 300, prazoGarantiaDias: 90, termoGarantia: "" }],
    orcamento: { id: `orc-${id}`, status: "aprovado", sintetizado: false, respondidoEm: ENTRADA, criadoEm: ENTRADA, desconto: 0, total: 300, servicos: [{ id: "s1", descricao: "Troca de tela", valor: 300 }], pecas: [] },
    aberturaV3: { versao: 1, recepcao: { recebidoPor: "Operador QA Seletor", origem: "balcao", prioridade: "media", localFisico: "balcao", dataEntrada: ENTRADA }, garantiaPrevista: { modelo: "tela", label: "Troca de tela", prazoDias: 90 } },
    entregaV3: { entregueEm, entreguePor: "QA", recebidoPor: nome },
    timeline: [{ id: `ev-${id}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: ENTRADA }],
  };
}

async function semearOS(prisma, { id, codigo, storeId, nome, telefone, modelo, serie }) {
  const existe = await prisma.ordemServico.findUnique({ where: { id } });
  if (existe) return;
  const cliente = await prisma.cliente.create({ data: { storeId, name: nome, phone: telefone } });
  const entregueEm = new Date(Date.now() - 10 * 86_400_000).toISOString();
  await prisma.ordemServico.create({
    data: {
      id, storeId, numero: codigo, clienteId: cliente.id, status: "Entregue",
      equipamento: `Samsung ${modelo}`, defeito: "Tela quebrada", valorTotal: 300,
      payload: payloadOS({ id, codigo, storeId, clienteId: cliente.id, nome, telefone, modelo, serie, entregueEm }),
    },
  });
}

async function main() {
  const url = exigirBancoQASeletor();
  const email = (process.env.PLAYWRIGHT_E2E_EMAIL ?? "").trim();
  const senha = (process.env.PLAYWRIGHT_E2E_PASSWORD ?? "").trim();
  if (!email.endsWith(".test") || senha.length < 16) {
    throw new Error("BLOQUEIO_QA: PLAYWRIGHT_E2E_EMAIL deve ser sintético (*.test) e a senha QA aleatória (≥ 16).");
  }
  const { PrismaClient } = require(resolve(root, "generated/prisma"));
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const [{ db }] = await prisma.$queryRawUnsafe("SELECT current_database() AS db");
    if (!String(db).startsWith("ops_v3_seletor_qa")) throw new Error(`BLOQUEIO_QA: conectado em ${db}.`);
    const assistencia = { version: 1, modules: ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings", "service", "deviceCatalog"] };
    for (const [id, name] of [[LOJA_A, "Loja QA Seletor A"], [LOJA_B, "Loja QA Seletor B"]]) {
      await prisma.store.upsert({ where: { id }, update: { moduleAccess: assistencia }, create: { id, name, moduleAccess: assistencia } });
    }
    const hash = await bcrypt.hash(senha, 10);
    const user = await prisma.adminUser.upsert({
      where: { email },
      update: { password: hash, role: "ADMIN", active: true, accessScope: "STORE", lojaId: LOJA_A },
      create: { email, name: "Operador QA Seletor", password: hash, role: "ADMIN", accessScope: "STORE", lojaId: LOJA_A },
    });
    await prisma.adminUserStore.upsert({
      where: { adminUserId_storeId: { adminUserId: user.id, storeId: LOJA_A } },
      update: {},
      create: { adminUserId: user.id, storeId: LOJA_A },
    });
    await semearOS(prisma, { id: OS_ORIGEM_A, codigo: "OS-QASA-ORIGEM", storeId: LOJA_A, nome: "Cliente QA Origem A", telefone: "(11) 97777-0101", modelo: "Galaxy QAA1", serie: "35QAA0001" });
    await semearOS(prisma, { id: OS_LOJA_B, codigo: "OS-QASB-OUTRA", storeId: LOJA_B, nome: "Cliente QA Loja B", telefone: "(11) 97777-0202", modelo: "Galaxy QAB1", serie: "35QAB0001" });
    console.log(`QA pronto em ${db}: lojas ${LOJA_A} (usuário QA) e ${LOJA_B} (sem vínculo), OS originais entregues sintéticas.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
