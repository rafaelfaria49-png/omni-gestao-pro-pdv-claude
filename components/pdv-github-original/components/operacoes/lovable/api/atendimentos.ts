import { db } from "./_db";
import { delay, nowIso, uid } from "./_helpers";
import type { AtendimentoRapido } from "@/types/atendimento";

export async function listAtendimentos(storeId?: string): Promise<AtendimentoRapido[]> {
  await delay();
  return storeId ? db.atendimentos.filter((a) => a.storeId === storeId) : [...db.atendimentos];
}

export async function criarAtendimento(input: Omit<AtendimentoRapido, "id" | "criadoEm">): Promise<AtendimentoRapido> {
  await delay(60);
  const novo: AtendimentoRapido = { ...input, id: uid("at"), criadoEm: nowIso() };
  db.atendimentos.push(novo);
  return novo;
}
