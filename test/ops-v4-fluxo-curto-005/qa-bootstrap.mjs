/**
 * OPS-V4-FLUXO-CURTO-005 — massa QA SINTÉTICA para o E2E local.
 *
 * Cria (idempotente) a loja QA e o usuário QA no PostgreSQL LOCAL DESCARTÁVEL.
 * Recusa qualquer banco que não seja loopback + `ops_v4_fluxo_005_qa*`. Lê só o
 * `.env` local (gitignorado); nenhum segredo é impresso nem versionado.
 * A loja tem id que ordena primeiro (`/api/stores` ordena por id), para virar a
 * loja ativa do E2E sem depender de outras lojas sintéticas do banco.
 *
 *   node test/ops-v4-fluxo-curto-005/qa-bootstrap.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { parse } = require("dotenv");
const bcrypt = require("bcryptjs");

export const LOJA_QA_005 = "000-qa-ops-005";

function env() {
  const arquivo = resolve(root, ".env");
  const local = existsSync(arquivo) ? parse(readFileSync(arquivo)) : {};
  return { ...local, ...process.env };
}

export function exigirBancoQA005(e = env()) {
  const urls = [e.DATABASE_URL, e.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("BLOQUEIO_QA: DATABASE_URL e DIRECT_URL ausentes no .env local.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) {
    throw new Error("BLOQUEIO_QA: só PostgreSQL em loopback.");
  }
  const nome = parsed[0].pathname.replace(/^\//, "");
  if (!nome.startsWith("ops_v4_fluxo_005_qa") || parsed.some((u) => u.pathname !== parsed[0].pathname || u.port !== parsed[0].port)) {
    throw new Error("BLOQUEIO_QA: o alvo precisa ser o banco descartável ops_v4_fluxo_005_qa* (mesmo em DATABASE_URL e DIRECT_URL).");
  }
  return urls[0];
}

async function main() {
  const e = env();
  const url = exigirBancoQA005(e);
  const email = (e.PLAYWRIGHT_E2E_EMAIL ?? "").trim();
  const senha = (e.PLAYWRIGHT_E2E_PASSWORD ?? "").trim();
  if (!email.endsWith(".test") || senha.length < 12) {
    throw new Error("BLOQUEIO_QA: PLAYWRIGHT_E2E_EMAIL deve ser sintético (*.test) e a senha QA aleatória (≥ 12).");
  }
  const { PrismaClient } = require(resolve(root, "generated/prisma"));
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const [{ db }] = await prisma.$queryRawUnsafe("SELECT current_database() AS db");
    if (!String(db).startsWith("ops_v4_fluxo_005_qa")) throw new Error(`BLOQUEIO_QA: conectado em ${db}.`);
    await prisma.store.upsert({
      where: { id: LOJA_QA_005 },
      update: {},
      create: { id: LOJA_QA_005, name: "Loja QA Próxima Ação 005" },
    });
    const hash = await bcrypt.hash(senha, 10);
    await prisma.adminUser.upsert({
      where: { email },
      update: { password: hash, role: "ADMIN", active: true },
      create: { email, name: "Operador QA 005", password: hash, role: "ADMIN", lojaId: LOJA_QA_005 },
    });
    console.log(`QA pronto em ${db}: loja ${LOJA_QA_005} + usuário sintético (credenciais só no .env local).`);
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
