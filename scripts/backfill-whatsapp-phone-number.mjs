/**
 * backfill-whatsapp-phone-number.mjs
 *
 * Seed idempotente do mapa `phone_number_id -> loja` a partir das envs vigentes,
 * para o deploy atual continuar roteando/enviando como hoje (cutover sem regressão).
 *
 * Idempotente — chave única `phoneNumberId`; re-executar = [SKIP].
 *
 * Uso:
 *   node --env-file=.env scripts/backfill-whatsapp-phone-number.mjs          → dry-run
 *   node --env-file=.env scripts/backfill-whatsapp-phone-number.mjs --exec   → executa
 *
 * MULTI_LOJA-S-003 / ADR-0006 (F-04/DT-07).
 */

import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes("--exec");
const mask = (s) => (s.length > 7 ? `${s.slice(0, 4)}***${s.slice(-3)}` : "***");

async function main() {
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const storeId = (process.env.WHATSAPP_WEBHOOK_STORE_ID ?? "loja-1").trim();
  const tokenEnvKey = "WHATSAPP_ACCESS_TOKEN";

  if (!phoneNumberId) {
    console.error("[ABORT] WHATSAPP_PHONE_NUMBER_ID ausente — nada a semear.");
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.whatsAppPhoneNumber.findUnique({ where: { phoneNumberId } });
  if (existing) {
    console.log(`[SKIP] ${mask(phoneNumberId)} já mapeado -> ${existing.storeId}`);
    return;
  }

  console.log(`[${DRY_RUN ? "DRY" : "EXEC"}] ${mask(phoneNumberId)} -> ${storeId} (tokenEnvKey=${tokenEnvKey})`);
  if (DRY_RUN) return;

  await prisma.whatsAppPhoneNumber.create({
    data: { phoneNumberId, storeId, tokenEnvKey, active: true },
  });
  console.log("[OK] linha criada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
