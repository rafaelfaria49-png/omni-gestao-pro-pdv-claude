import { uid, nowIso } from "./_helpers";
import type { AtendimentoRapido } from "@/types/atendimento";

// AtendimentoRapido não tem modelo Prisma — persiste em memória por sessão.
const cache: AtendimentoRapido[] = [];

export async function listAtendimentos(storeId?: string): Promise<AtendimentoRapido[]> {
  return storeId ? cache.filter((a) => a.storeId === storeId) : [...cache];
}

export async function criarAtendimento(
  input: Omit<AtendimentoRapido, "id" | "criadoEm">,
): Promise<AtendimentoRapido> {
  const novo: AtendimentoRapido = { ...input, id: uid("at"), criadoEm: nowIso() };
  cache.unshift(novo);
  return novo;
}
