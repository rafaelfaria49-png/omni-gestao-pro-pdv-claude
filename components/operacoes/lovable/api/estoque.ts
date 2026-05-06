import { db } from "./_db";
import { delay, nowIso, uid } from "./_helpers";
import type { MovimentoEstoque, PecaEstoque } from "@/types/estoque";

export async function listPecas(storeId?: string): Promise<PecaEstoque[]> {
  await delay();
  return storeId ? db.pecas.filter((p) => p.storeId === storeId) : [...db.pecas];
}

export async function getPeca(id: string): Promise<PecaEstoque | undefined> {
  await delay(40);
  return db.pecas.find((p) => p.id === id);
}

// Reserva (não baixa ainda) — usado quando uma peça é adicionada à OS.
export async function reservarPeca(
  pecaId: string,
  quantidade: number,
  osId: string,
): Promise<MovimentoEstoque> {
  await delay(60);
  const mov: MovimentoEstoque = {
    id: uid("mov"),
    storeId: db.pecas.find((p) => p.id === pecaId)?.storeId ?? "loja_matriz",
    pecaId,
    tipo: "reserva",
    quantidade,
    origem: "os",
    origemId: osId,
    criadoEm: nowIso(),
  };
  db.movimentos.push(mov);
  return mov;
}

// Baixa real — chamada quando a OS é entregue ou venda emitida.
export async function baixarPeca(
  pecaId: string,
  quantidade: number,
  origem: "os" | "venda",
  origemId: string,
): Promise<MovimentoEstoque> {
  await delay(60);
  const peca = db.pecas.find((p) => p.id === pecaId);
  if (peca) peca.estoqueAtual = Math.max(0, peca.estoqueAtual - quantidade);
  const mov: MovimentoEstoque = {
    id: uid("mov"),
    storeId: peca?.storeId ?? "loja_matriz",
    pecaId,
    tipo: "saida",
    quantidade,
    origem,
    origemId,
    criadoEm: nowIso(),
  };
  db.movimentos.push(mov);
  return mov;
}
