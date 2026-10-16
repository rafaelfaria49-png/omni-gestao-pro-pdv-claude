import type { Prisma } from "@/generated/prisma";
import { empresaSnapshotGarantiaV3 } from "./garantia-termos-model";

/** Somente campos públicos da loja autorizada, dentro da transação chamadora. */
export async function lerEmpresaTermoGarantiaV3(tx: Prisma.TransactionClient, storeId: string) {
  const loja = await tx.store.findUnique({ where: { id: storeId }, select: { name: true, cnpj: true, phone: true, address: true } });
  const settings = await tx.storeSettings.findUnique({ where: { storeId }, select: { contactEmail: true, contactWhatsapp: true } });
  return empresaSnapshotGarantiaV3(loja, settings);
}
