"use server";

/**
 * Cadastro Inteligente de Produto — F1 UI · Server Actions do Assistente IA.
 *
 * ESCOPO ESTRITO: leitura de produtos da loja ativa + persistência do bloco IA EXCLUSIVAMENTE
 * em `Produto.metadata` (JSONB). NUNCA toca colunas core (name/sku/category/brand/price/stock),
 * schema, importador, marketplace, whatsapp, PDV, financeiro ou inventário.
 */

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ProdutoIAMetadata } from "@/lib/catalog/produto-catalogo";

function metaRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

/**
 * Salva o bloco IA editado pelo operador em `Produto.metadata` (merge raso aditivo).
 * Multi-loja: exige `storeId` não-vazio e confere que o produto pertence à loja.
 * Preserva chaves existentes (ncm/cest, importador) — só sobrescreve as enviadas.
 */
export async function salvarProdutoIAMetadata(
  storeId: string,
  productId: string,
  meta: ProdutoIAMetadata,
): Promise<{ ok: true }> {
  const sid = (storeId ?? "").trim();
  const pid = (productId ?? "").trim();
  if (!sid) throw new Error("Loja ativa não resolvida.");
  if (!pid) throw new Error("Produto inválido.");
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error("Metadata inválido.");
  }

  const row = await prisma.produto.findFirst({
    where: { id: pid, storeId: sid },
    select: { metadata: true },
  });
  if (!row) throw new Error("Produto não encontrado nesta unidade.");

  const prev = metaRecord(row.metadata);
  const merged: Record<string, unknown> = {
    ...prev,
    ...meta,
    iaRevisadoPor: "operador",
    iaRevisadoEm: new Date().toISOString(),
  };

  await prisma.produto.update({
    where: { id: pid },
    data: { metadata: merged as Prisma.InputJsonValue },
  });

  revalidatePath("/dashboard/produtos/assistente-ia");
  revalidatePath("/dashboard/cadastros-v2");
  return { ok: true };
}
