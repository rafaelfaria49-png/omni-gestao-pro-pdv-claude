"use server";

/**
 * Cadastro Inteligente de Produto — F1 UI · Server Actions do Assistente IA.
 *
 * ESCOPO ESTRITO: leitura de produtos da loja ativa + persistência do bloco IA EXCLUSIVAMENTE
 * em `Produto.metadata` (JSONB). NUNCA toca colunas core (name/sku/category/brand/price/stock),
 * schema, importador, marketplace, whatsapp, PDV, financeiro ou inventário.
 */

import { revalidatePath } from "next/cache";
import { requireCadastrosActionAccess } from "@/lib/cadastros/cadastros-action-access";
import {
  cadastrosAuditActorLabel,
  cadastrosAuditPrincipalFromSession,
} from "@/lib/cadastros/cadastros-audit-principal";
import { updateProduct } from "@/lib/cadastros/product-write-service";
import type { ProdutoIAMetadata } from "@/lib/catalog/produto-catalogo";

/**
 * Salva o bloco IA editado pelo operador em `Produto.metadata` via boundary
 * canônico (CAD-R2-006).
 *
 * IA sugere; humano revisa; servidor autoriza. Sem primitive própria de
 * persistência de Produto aqui: o write passa pelo ProductWriteService
 * (trusted context + ownership + IDOR fail-closed + merge 2 níveis + audit
 * canônico com principal da sessão). A origem revisada é registrada como
 * proveniência (`iaRevisadoPor`/`iaRevisadoEm`, server-derived), nunca como
 * autoridade vinda do payload. Nunca toca colunas core.
 */
export async function salvarProdutoIAMetadata(
  storeId: string,
  productId: string,
  meta: ProdutoIAMetadata,
): Promise<{ ok: true }> {
  const gate = await requireCadastrosActionAccess(storeId, "hub");
  const sid = gate.storeId;
  const principal = cadastrosAuditPrincipalFromSession(gate.session);
  const pid = (productId ?? "").trim();
  if (!pid) throw new Error("Produto inválido.");
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error("Metadata inválido.");
  }

  const result = await updateProduct(
    { storeId: sid, principal },
    pid,
    {
      metadata: {
        ...(meta as Record<string, unknown>),
        iaRevisadoPor: cadastrosAuditActorLabel(principal),
        iaRevisadoEm: new Date().toISOString(),
      },
    },
  );
  if (!result.ok) {
    // Contrato preservado: callers esperam throw com mensagem amigável.
    // Cross-store vira o mesmo NOT_FOUND (sem oráculo entre lojas).
    if (result.code === "NOT_FOUND" || result.code === "CROSS_STORE") {
      throw new Error("Produto não encontrado nesta unidade.");
    }
    throw new Error(result.message);
  }

  revalidatePath("/dashboard/produtos/assistente-ia");
  revalidatePath("/dashboard/cadastros-v2");
  return { ok: true };
}
