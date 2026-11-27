import { NextResponse } from "next/server"
import { gestorMoneyAtivo } from "@/lib/gastos/ativacao"
import { respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import type { IntegrationContractStatus } from "@/lib/gestor-money/contracts"
import { diagnosticarStorageComprovantes } from "@/lib/gestor-money/server/documents-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Sonda somente leitura de prontidão da integração real do Gestor Money (G001–G006 + G003-STORAGE).
 *
 * - Não executa escrita nem migration.
 * - Não altera flags hospedadas.
 * - Não expõe segredos ou dados financeiros (apenas flags e nomes de variáveis faltantes).
 * - Com `GESTOR_MONEY_ENABLED !== "true"` (padrão em Production), informa
 *   honestamente `MODULE_DISABLED` e todas as rotas operacionais respondem 404.
 */
export async function GET() {
  const moduleEnabled = gestorMoneyAtivo()
  const foundationMerged = true
  const storageG003 = diagnosticarStorageComprovantes()

  const contratos: IntegrationContractStatus[] = [
    {
      id: "G001",
      nome: "Perfis & Autorização (PESSOAL sem storeId / EMPRESA com storeId)",
      disponivelNoRuntime: moduleEnabled,
      origem: "lib/gastos/access.ts + rls-contexto.ts",
      detalhe: moduleEnabled
        ? "Ativo no runtime: contexto opaco emitido exclusivamente no servidor com RLS transacional."
        : "Integrado ao código; dormente enquanto GESTOR_MONEY_ENABLED !== 'true'.",
    },
    {
      id: "G002",
      nome: "Writers de Contas, Categorias e Movimentos",
      disponivelNoRuntime: moduleEnabled,
      origem: "lib/gastos/contas.ts + categorias.ts + financeiro-scope.ts",
      detalhe: moduleEnabled
        ? "Ativo para PESSOAL e EMPRESA sem loja fictícia."
        : "Integrado ao código; aguardando ativação controlada.",
    },
    {
      id: "G003",
      nome: "Readers & Comprovantes Privados (Gate G003-STORAGE)",
      disponivelNoRuntime: moduleEnabled,
      origem: "lib/gastos/documentos.ts + documentos-storage.ts + read-scope.ts",
      detalhe: !moduleEnabled
        ? "Integrado ao código (com gate fail-closed G003-STORAGE); dormente enquanto GESTOR_MONEY_ENABLED !== 'true'."
        : storageG003.runtimeLiberado
          ? "Ativo no runtime: storage privado R2 comprovado (G003-STORAGE) com download assinado <= 60s."
          : `Leitura de metadados ativa; upload/download bloqueados (fail-closed · ${storageG003.bloqueioCodigo ?? "privacidade_bucket_nao_comprovada"}) até comprovação real da privacidade do bucket R2.`,
    },
    {
      id: "G004",
      nome: "Operações Atômicas (Despesas, Dívidas, Pagamentos, Transferências, Cartões, Limites e Faturas)",
      disponivelNoRuntime: moduleEnabled,
      origem: "lib/gastos/operacoes.ts + apply.ts + cartoes.ts",
      detalhe: moduleEnabled
        ? "Ativo com revisão/confirmação, idempotência, TRANSFERENCIA_INTERNA (PESSOAL/EMPRESA), limites canônicos de cartões, histórico imutável e bloqueio de limite insuficiente."
        : "Integrado ao código (incluindo limites canônicos de cartões e TRANSFERENCIA_INTERNA); rotas bloqueadas enquanto GESTOR_MONEY_ENABLED !== 'true'.",
    },
    {
      id: "G005",
      nome: "Consultas Consolidadas (CAIXA_REALIZADO / Centavos / Cartões por Ciclo)",
      disponivelNoRuntime: moduleEnabled,
      origem: "lib/gastos/query.ts + cartoes.ts",
      detalhe: moduleEnabled
        ? "Ativo em transação RepeatableRead somente leitura, incluindo projeção canônica de limites e faturas por ciclo."
        : "Integrado ao código; aguardando ativação controlada.",
    },
    {
      id: "G006",
      nome: "Canais, Fila e Outbox WhatsApp GESTAO",
      disponivelNoRuntime: false,
      origem: "lib/gastos/channels.ts + worker.ts",
      detalhe: "Fundação dormente; sem rota pública de ingresso nem worker ativo nesta etapa.",
    },
    {
      id: "G007",
      nome: "Vínculo de Telefone WhatsApp & Webhook Oficial",
      disponivelNoRuntime: false,
      origem: "Próximo milestone após fundação",
      detalhe: "WhatsApp permanece honestamente desconectado até conclusão do G007.",
    },
  ]

  return respostaFinanceiraPrivada(
    NextResponse.json(
      {
        ok: true,
        moduleEnabled,
        foundationMerged,
        state: moduleEnabled ? "READY" : "MODULE_DISABLED",
        mensagem: moduleEnabled
          ? "Integração real G001–G006 ativa neste ambiente isolado."
          : "Fundação G001–G006 conectada aos endpoints reais, mas dormente (GESTOR_MONEY_ENABLED !== 'true'). Nenhum dado simulado é exibido no modo real.",
        contratos,
        storageG003,
      },
      { status: 200 }
    )
  )
}
