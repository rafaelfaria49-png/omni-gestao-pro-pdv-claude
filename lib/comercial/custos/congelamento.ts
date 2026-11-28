/**
 * Congelamento do custo histórico na venda da unidade (ADR-0025 · VC-01/VC-03).
 *
 * Roda DENTRO da transação do motor de venda (gancho de aparelhos), depois do vínculo
 * venda↔unidade. Grava uma linha imutável (trigger append-only). Alterar o custo depois não muda
 * o lucro histórico. Sem a migration comercial ou com o recurso desligado: não faz nada
 * (a venda segue exatamente como antes).
 */
import type { Prisma } from "@/generated/prisma"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"
import { resolveBusinessResource } from "@/lib/store-business-capabilities"
import { comercialInstalado } from "@/lib/comercial/instalacao"
import { comporCusto } from "./composicao"
import { reaisLegadoParaCentavos } from "./money"

export async function congelarCustoVendaTx(
  tx: Prisma.TransactionClient,
  args: {
    storeId: string
    capabilities: StoreCapabilitiesV1 | null
    aparelhoVendaId: string
    vendaId: string
    aparelho: { id: string; custoAquisicao: number; despesas: number; precoVenda: number }
    precoVenda: number
  },
): Promise<{ congelado: boolean }> {
  if (!resolveBusinessResource(args.capabilities, "commercial.historicalCost").operational) return { congelado: false }
  if (!(await comercialInstalado(tx))) return { congelado: false }
  const [perfil, lancamentos] = await Promise.all([
    tx.comercialPerfilUnidade.findUnique({
      where: { aparelhoId_storeId: { aparelhoId: args.aparelho.id, storeId: args.storeId } },
      select: { custoAquisicaoStatus: true, custoAquisicaoJustificativa: true },
    }),
    tx.comercialCustoLancamento.findMany({
      where: { storeId: args.storeId, aparelhoId: args.aparelho.id, status: "ativo" },
      select: { id: true, categoria: true, origem: true, descricao: true, quantidade: true, valorCentavos: true, custoStatus: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
  ])
  const c = comporCusto(args.aparelho, perfil, lancamentos)
  // skipDuplicates: replay idempotente da mesma venda nunca reescreve o custo congelado.
  await tx.comercialVendaCusto.createMany({
    data: [{
      storeId: args.storeId,
      aparelhoVendaId: args.aparelhoVendaId,
      vendaId: args.vendaId,
      aparelhoId: args.aparelho.id,
      precoVendaCentavos: reaisLegadoParaCentavos(args.precoVenda),
      custoAquisicaoCentavos: c.aquisicaoCentavos,
      custoAplicadoCentavos: c.aplicadoCentavos + c.despesasLegadoCentavos,
      custoTotalCentavos: c.totalCentavos,
      completo: c.completo,
      estimado: c.estimado,
      componentes: c.componentes as unknown as Prisma.InputJsonValue,
    }],
    skipDuplicates: true,
  })
  return { congelado: true }
}
