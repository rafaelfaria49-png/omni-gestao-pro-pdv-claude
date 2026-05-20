// Mock DB em memória — único ponto que detém o estado.
// Substitua estas leituras por chamadas HTTP reais sem alterar a UI.
import { CLIENTES_SEED, type ClienteRecord } from "@/data/clientesSeed";
import { LOJAS_SEED } from "@/data/lojasSeed";
import { PECAS_SEED } from "@/data/estoqueSeed";
import { VENDAS_SEED } from "@/data/vendasSeed";
import { OS_SEED } from "@/data/osSeed";
import { SERVICOS_SEED } from "@/data/servicosSeed";
import { ATENDIMENTOS_SEED } from "@/data/atendimentosSeed";
import type { Loja } from "@/types/loja";
import type { PecaEstoque, MovimentoEstoque } from "@/types/estoque";
import type { Venda } from "@/types/venda";
import type { OrdemServico } from "@/types/os";
import type { CatalogoServico } from "@/types/servico";
import type { AtendimentoRapido } from "@/types/atendimento";

export const db = {
  lojas: [...LOJAS_SEED] as Loja[],
  clientes: [...CLIENTES_SEED] as ClienteRecord[],
  pecas: [...PECAS_SEED] as PecaEstoque[],
  movimentos: [] as MovimentoEstoque[],
  vendas: [...VENDAS_SEED] as Venda[],
  ordens: [...OS_SEED] as OrdemServico[],
  servicos: [...SERVICOS_SEED] as CatalogoServico[],
  atendimentos: [...ATENDIMENTOS_SEED] as AtendimentoRapido[],
};
