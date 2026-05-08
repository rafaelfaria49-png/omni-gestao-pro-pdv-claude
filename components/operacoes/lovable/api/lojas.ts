import { listLojasCadastros } from "@/app/actions/cadastros";
import type { Loja } from "@/types/loja";

export async function listLojas(): Promise<Loja[]> {
  const rows = await listLojasCadastros();
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    cnpj: r.cnpj || undefined,
    cidade: r.cidade || undefined,
    ativa: r.ativa,
  }));
}
