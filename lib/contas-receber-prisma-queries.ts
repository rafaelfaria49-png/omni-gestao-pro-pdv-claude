/**
 * Consultas Prisma para títulos em Contas a Receber com vendas/itens.
 * O painel continua usando localStorage por padrão; use estas funções em APIs ou jobs de sync.
 */

import { leituraEmpresaWhere } from "@/lib/gastos/read-scope"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"

const tituloComVendasInclude = (storeId: string) => ({
  vendas: {
    where: { storeId },
    include: { itens: true },
    orderBy: { at: "desc" as const },
  },
} satisfies Prisma.ContaReceberTituloInclude)

export type ContaReceberTituloComVendas = Prisma.ContaReceberTituloGetPayload<{
  include: ReturnType<typeof tituloComVendasInclude>
}>

export async function listarContasReceberComVendas(storeId: string): Promise<ContaReceberTituloComVendas[]> {
  return prisma.contaReceberTitulo.findMany({
    where: leituraEmpresaWhere(storeId, { storeId }),
    include: tituloComVendasInclude(storeId),
    orderBy: { updatedAt: "desc" },
  })
}

export async function buscarContaReceberPorIdComVendas(
  id: string,
  storeId: string,
): Promise<ContaReceberTituloComVendas | null> {
  return prisma.contaReceberTitulo.findUnique({
    where: leituraEmpresaWhere(storeId, { id }),
    include: tituloComVendasInclude(storeId),
  })
}
