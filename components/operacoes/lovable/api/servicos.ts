import { db } from "./_db";
import { delay } from "./_helpers";
import type { CatalogoServico } from "@/types/servico";

export async function listServicos(storeId?: string): Promise<CatalogoServico[]> {
  await delay();
  return storeId ? db.servicos.filter((s) => s.storeId === storeId) : [...db.servicos];
}

export async function upsertServico(servico: CatalogoServico): Promise<CatalogoServico> {
  await delay(60);
  const idx = db.servicos.findIndex((s) => s.id === servico.id);
  if (idx === -1) db.servicos.push(servico);
  else db.servicos[idx] = servico;
  return servico;
}
