// ============================================================================
// Importação de OS sobre uma OS JÁ EXISTENTE — patch intencional SOB A TRAVA
// ----------------------------------------------------------------------------
// Os importadores (`PUT /api/ops/ordens/import` e `importador-avancado`) gravavam o
// payload importado INTEIRO por cima da OS: apagavam a recusa terminal do
// recebimento misto, espelhos financeiros, timeline e campos desconhecidos — e a
// mesma chave recusada voltava a poder baixar dinheiro.
//
// Regra (mesma primitiva de `os-payload-lock`): transação → FOR UPDATE da OS
// (loja + id) → payload MAIS RECENTE → patch:
//   - campos do arquivo importado sobrescrevem os de mesmo nome do latest;
//   - campos que o arquivo NÃO traz continuam (campos desconhecidos preservados);
//   - estado do servidor NUNCA vem do arquivo: identidade, timeline, chaves de
//     estado V3/V4 (`*V3`/`*V4`: recusas, pagamentoV3, aPrazoV3, status V3…) e
//     estoque (`estoque*`);
//   - OS com estado financeiro/terminal (espelho de pagamento, a prazo, recusa
//     gravada, título no Financeiro, entregue/cancelada): o arquivo também não
//     troca valores nem status (payload e colunas `valorTotal`/`valorBase`/`status`).
// Uma OS por transação; trava só a OS (folha) — sem ciclo com os writers de pagamento.
// Módulo comum (sem "use server").
// ============================================================================

import type { Prisma } from "@/generated/prisma";
import { buildContaReceberLocalKey } from "@/lib/financeiro/contracts/local-key";
import { mutarPayloadOSV3, type OSPayloadV3, type TxOSPayloadV3 } from "./os-payload-lock";
import { statusV3FromOS } from "./status-machine";

/** Nunca vêm do arquivo importado quando a OS já existe. */
const CAMPOS_SERVIDOR = new Set(["id", "storeId", "codigo", "criadoEm", "timeline"]);
const SUFIXO_ESTADO_SERVIDOR = /V\d+$/;
const PREFIXO_ESTOQUE = /^estoque[A-Z]/;

/** Com estado financeiro/terminal na OS, o arquivo também não troca valores nem status. */
const CAMPOS_FINANCEIROS_OU_TERMINAIS = new Set([
  "status",
  "operacaoStatus",
  "valorServico",
  "valorPecas",
  "valorTotal",
  "valorBase",
  "desconto",
  "orcamento",
  "financeiro",
  "pagamento",
  "pagamentos",
  "servicos",
  "servicosCatalogo",
  "pecas",
  "dataSaida",
  "horaSaida",
]);

export function campoDoServidorNaImportacaoOSV3(campo: string): boolean {
  return CAMPOS_SERVIDOR.has(campo) || SUFIXO_ESTADO_SERVIDOR.test(campo) || PREFIXO_ESTOQUE.test(campo);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Estado financeiro/terminal visível no próprio payload (sem consultar o Financeiro). */
export function payloadComEstadoFinanceiroOuTerminalV3(payload: Record<string, unknown>): boolean {
  if (payload.pagamentoV3 != null || payload.aPrazoV3 != null) return true;
  const recusas = payload.recebimentoMistoRecusasV3;
  if (Array.isArray(recusas) && recusas.length > 0) return true;
  const status = statusV3FromOS(payload as Parameters<typeof statusV3FromOS>[0]);
  return status === "entregue" || status === "cancelada";
}

/** Patch puro: latest + campos importados permitidos. Campos ausentes no arquivo continuam. */
export function mesclarImportacaoOSV3(
  latest: Record<string, unknown>,
  importado: Record<string, unknown>,
  protegerFinanceiro: boolean,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...latest };
  for (const [campo, valor] of Object.entries(importado)) {
    if (campoDoServidorNaImportacaoOSV3(campo)) continue;
    if (protegerFinanceiro && CAMPOS_FINANCEIROS_OU_TERMINAIS.has(campo)) continue;
    next[campo] = valor;
  }
  return next;
}

export interface ColunasImportacaoOSV3 {
  numero?: string;
  /** `null` = não resolvido no arquivo: mantém o vínculo atual. */
  clienteId?: string | null;
  equipamento?: string;
  defeito?: string;
  laudoTecnico?: string | null;
  valorTotal?: number;
  valorBase?: number;
  status?: Prisma.OrdemServicoUncheckedUpdateInput["status"];
}

export interface ImportacaoAplicadaOSV3 {
  numero: string | null;
  payload: Record<string, unknown>;
  /** `true` = OS com estado financeiro/terminal: valores e status do arquivo foram ignorados. */
  financeiroProtegido: boolean;
}

/**
 * Aplica a importação a uma OS existente DESTA loja, dentro de `tx`, sob a trava da linha.
 * `null` = a OS não existe nesta loja (nada gravado).
 */
export async function aplicarImportacaoEmOSExistenteV3(p: {
  tx: TxOSPayloadV3;
  storeId: string;
  osId: string;
  importado: Record<string, unknown>;
  colunas: ColunasImportacaoOSV3;
  /** Garante `payload.id = osId` (contrato da rota de importação). */
  fixarIdNoPayload?: boolean;
}): Promise<ImportacaoAplicadaOSV3 | null> {
  return mutarPayloadOSV3<ImportacaoAplicadaOSV3 | null>({
    tx: p.tx,
    storeId: p.storeId,
    osId: p.osId,
    aceitarPayloadVazio: true,
    aoAusente: () => null,
    mutate: async (os, tx) => {
      const latest = os.payload as Record<string, unknown>;
      let financeiroProtegido = payloadComEstadoFinanceiroOuTerminalV3(latest);
      if (!financeiroProtegido) {
        const titulo = await tx.contaReceberTitulo.findFirst({
          where: {
            storeId: p.storeId,
            localKey: {
              in: [
                buildContaReceberLocalKey({ kind: "adapter_os_faturamento", storeId: p.storeId, ordemServicoId: os.id }),
                buildContaReceberLocalKey({ kind: "receber_os", storeId: p.storeId, ordemServicoId: os.id }),
              ],
            },
          },
          select: { id: true },
        });
        financeiroProtegido = !!titulo;
      }
      const next = mesclarImportacaoOSV3(latest, isRecord(p.importado) ? p.importado : {}, financeiroProtegido);
      if (p.fixarIdNoPayload) next.id = os.id;

      const c = p.colunas;
      const colunas: Omit<Prisma.OrdemServicoUncheckedUpdateInput, "payload"> = {};
      if (c.numero !== undefined) colunas.numero = c.numero;
      if (c.clienteId) colunas.clienteId = c.clienteId;
      if (c.equipamento !== undefined) colunas.equipamento = c.equipamento;
      if (c.defeito !== undefined) colunas.defeito = c.defeito;
      if (c.laudoTecnico !== undefined) colunas.laudoTecnico = c.laudoTecnico;
      if (!financeiroProtegido) {
        if (c.valorTotal !== undefined) colunas.valorTotal = c.valorTotal;
        if (c.valorBase !== undefined) colunas.valorBase = c.valorBase;
        if (c.status !== undefined) colunas.status = c.status;
      }
      return {
        payload: next as OSPayloadV3,
        colunas,
        resultado: { numero: c.numero ?? os.numero, payload: next, financeiroProtegido },
      };
    },
  });
}
