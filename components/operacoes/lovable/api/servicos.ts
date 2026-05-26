import type { CatalogoServico } from "@/types/servico";
import { listServicos as listServicosCadastros } from "@/app/actions/cadastros";

export async function listServicos(storeId?: string): Promise<CatalogoServico[]> {
  if (!storeId) return [];
  const rows = await listServicosCadastros(storeId);
  return rows.map((s) => ({
    id: s.id,
    storeId,
    nome: s.nome,
    categoria: s.categoria !== "—" ? s.categoria : undefined,
    custoInterno: Number(s.custo ?? 0),
    valorVenda: Number(s.preco ?? 0),
    prazoGarantiaDias: Math.max(0, Math.trunc(s.garantia ?? 0)),
    termoGarantia: s.termo ?? "",
    ativo: s.status !== "Inativo",
  }));
}

/** Escrita ainda não disponível neste HUB — catálogo vem do Cadastros (read-only aqui). */
export async function upsertServico(_servico: CatalogoServico): Promise<CatalogoServico> {
  throw new Error(
    "Edição de serviços pelo Operações HUB ainda não está disponível. Use Cadastros para alterar o catálogo.",
  );
}
