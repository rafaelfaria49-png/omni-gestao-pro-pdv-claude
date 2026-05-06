import { db } from "./_db";
import { delay } from "./_helpers";
import type { Loja } from "@/types/loja";

export async function listLojas(): Promise<Loja[]> {
  await delay(40);
  return [...db.lojas];
}
