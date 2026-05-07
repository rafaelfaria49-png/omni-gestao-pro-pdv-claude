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

export async function upsertServico(servico: CatalogoServico): Promise<CatalogoServico> {
  // Catálogo de serviços no Operações HUB agora vem do Cadastros HUB.
  // Escrita/edição do catálogo permanece na tela Cadastros por enquanto.
  return servico;
}
