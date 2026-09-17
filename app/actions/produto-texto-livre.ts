"use server";

/**
 * Interpretação de texto livre de Produto (CAD-R2-016) — Server Action.
 *
 * Adapter FINO (mesmo padrão de `resolverCodigoBarras`):
 * - autoriza via `requireCadastrosActionAccess(storeId, "hub")`;
 * - delega à interpretação server-side (`interpretarTextoProduto`);
 * - devolve a sugestão TEMPORÁRIA para preview/revisão no formulário.
 *
 * NÃO salva Produto, NÃO toca `Produto.metadata`, NÃO move estoque, NÃO cria
 * CadastroDraft. Persistir continua sendo `upsertProduto` → ProductWriteService
 * → StockLedger, após revisão humana ("Salvar produto").
 */

import { requireCadastrosActionAccess } from "@/lib/cadastros/cadastros-action-access";
import {
  interpretarTextoProduto,
  type SugestaoTextoLivre,
} from "@/lib/cadastros/natural-text";

export type InterpretarTextoLivreResult =
  | { ok: true; sugestao: SugestaoTextoLivre }
  | { ok: false; message: string };

export async function interpretarProdutoTextoLivre(
  storeId: string,
  texto: string,
): Promise<InterpretarTextoLivreResult> {
  await requireCadastrosActionAccess(storeId, "hub");
  try {
    const sugestao = await interpretarTextoProduto(texto);
    return { ok: true, sugestao };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Não foi possível interpretar o texto.",
    };
  }
}
