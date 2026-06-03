// ============================================================================
// Operações V3 — Fase 1A · Fronteira de ações de ORÇAMENTO consideradas SEGURAS
// ----------------------------------------------------------------------------
// Reexporta SOMENTE as actions reais já existentes do Operações cujo efeito,
// nesta fase, fica restrito ao payload da OS (orçamento + timeline) e NÃO
// materializa Conta a Receber nem movimenta estoque:
//
//   • gerarOrcamentoDaOS       — materializa um RASCUNHO editável a partir dos
//                                itens da OS. Patch = { orcamento(rascunho),
//                                timeline }. Sem campos de faturamento →
//                                `syncFinanceiroAfterOSPayloadUpdate` não cria
//                                cobrança (gate exige faturamentoPendente+total).
//                                Idempotente: não sobrescreve orçamento real.
//   • enviarOrcamentoAoCliente — rascunho → "enviado". Sem campos de faturamento
//                                → não cria/cancela Conta a Receber. Sincroniza
//                                apenas os itens de leitura da OS (sem estoque).
//
// PROPOSITALMENTE NÃO reexportado nesta fase (efeito financeiro real — Fase 1B+):
//   • approveOrcamento  → seta faturamentoPendente/Status/Total → materializa
//                          Conta a Receber via syncFinanceiroAfterOSPayloadUpdate.
//   • rejectOrcamento   → seta faturamentoStatus "cancelado" → cancela cobrança.
//
// NÃO é backend novo: apenas delega às funções reais de `@/api/os`
// (mesmas usadas pelo Operações HUB V2). Os wrappers abaixo apenas normalizam
// a assinatura para `(storeId, osId) => Promise<OrdemServico>` e fixam o `autor`
// da timeline — a fronteira V3 ainda não coleta o operador nesta fase.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import {
  gerarOrcamentoDaOS as gerarOrcamentoDaOSImpl,
  enviarOrcamentoAoCliente as enviarOrcamentoAoClienteImpl,
} from "@/api/os";

const AUTOR_V3 = "Você";

export function gerarOrcamentoDaOS(storeId: string, osId: string): Promise<OrdemServico> {
  return gerarOrcamentoDaOSImpl(storeId, osId, AUTOR_V3);
}

export function enviarOrcamentoAoCliente(storeId: string, osId: string): Promise<OrdemServico> {
  return enviarOrcamentoAoClienteImpl(storeId, osId, AUTOR_V3);
}
