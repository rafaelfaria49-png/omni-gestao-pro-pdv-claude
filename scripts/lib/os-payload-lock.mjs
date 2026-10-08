/**
 * Scripts de manutenção (fora do runtime Next) que gravam `OrdemServico.payload`.
 *
 * Mesma regra de `lib/operacoes-v3/os-payload-lock.ts` + `os-payload-import.ts`:
 * transação → `SELECT … FOR UPDATE` da OS (loja + id) → payload MAIS RECENTE → mutação
 * intencional (spread do latest: campos desconhecidos, timeline e estado do servidor
 * preservados) → UPDATE na mesma transação. Nunca regravar um snapshot lido antes.
 *
 * Paridade das regras com o TS: `lib/operacoes-v3/os-payload-import.test.ts`.
 */

export const TX_PAYLOAD_OS = { maxWait: 5_000, timeout: 15_000 };

const CAMPOS_SERVIDOR = new Set(["id", "storeId", "codigo", "criadoEm", "timeline"]);
const SUFIXO_ESTADO_SERVIDOR = /V\d+$/;
const PREFIXO_ESTOQUE = /^estoque[A-Z]/;
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
// Superconjunto conservador dos status finais da V3 (`statusV3FromOS`): na dúvida, protege.
const STATUS_FINAIS = new Set(["entregue", "cancelada", "cancelado", "finalizado", "finalizada"]);

const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);

export function campoDoServidorNaImportacaoOS(campo) {
  return CAMPOS_SERVIDOR.has(campo) || SUFIXO_ESTADO_SERVIDOR.test(campo) || PREFIXO_ESTOQUE.test(campo);
}

export function payloadComEstadoFinanceiroOuTerminal(payload) {
  if (!isRecord(payload)) return false;
  if (payload.pagamentoV3 != null || payload.aPrazoV3 != null) return true;
  if (Array.isArray(payload.recebimentoMistoRecusasV3) && payload.recebimentoMistoRecusasV3.length > 0) return true;
  return [payload.operacaoStatusV3, payload.operacaoStatus, payload.status].some(
    (s) => typeof s === "string" && STATUS_FINAIS.has(s.trim().toLowerCase()),
  );
}

export function mesclarImportacaoOS(latest, importado, protegerFinanceiro) {
  const next = { ...(isRecord(latest) ? latest : {}) };
  for (const [campo, valor] of Object.entries(isRecord(importado) ? importado : {})) {
    if (campoDoServidorNaImportacaoOS(campo)) continue;
    if (protegerFinanceiro && CAMPOS_FINANCEIROS_OU_TERMINAIS.has(campo)) continue;
    next[campo] = valor;
  }
  return next;
}

/** Trava a OS e relê o payload. `null` = a OS não existe nesta loja. */
export async function lerOSTravada(tx, storeId, osId) {
  const rows = await tx.$queryRaw`
    SELECT "id" FROM "ordens_servico" WHERE "id" = ${osId} AND "storeId" = ${storeId} FOR UPDATE
  `;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = await tx.ordemServico.findFirst({ where: { id: osId, storeId }, select: { id: true, numero: true, payload: true } });
  if (!row) return null;
  return { id: row.id, numero: row.numero ?? null, payload: isRecord(row.payload) ? row.payload : {} };
}

/**
 * `mutate(latest, tx)` devolve `{ payload, colunas?, resultado }`; `payload: null` = nada a gravar.
 * `null` = a OS não existe nesta loja.
 */
export async function mutarPayloadOS(prisma, { storeId, osId, mutate }) {
  return prisma.$transaction(async (tx) => {
    const os = await lerOSTravada(tx, storeId, osId);
    if (!os) return null;
    const m = await mutate(os, tx);
    if (m.payload) {
      await tx.ordemServico.update({ where: { id: os.id }, data: { ...(m.colunas ?? {}), payload: m.payload } });
    }
    return m.resultado;
  }, TX_PAYLOAD_OS);
}

/** Importação sobre OS existente: patch intencional; valores/status protegidos se houver estado financeiro/terminal. */
export async function aplicarImportacaoEmOSExistente(prisma, { storeId, osId, importado, colunas }) {
  return mutarPayloadOS(prisma, {
    storeId,
    osId,
    mutate: async (os, tx) => {
      let protegido = payloadComEstadoFinanceiroOuTerminal(os.payload);
      if (!protegido) {
        const titulo = await tx.contaReceberTitulo.findFirst({
          where: {
            storeId,
            localKey: { in: [`os-faturamento:${storeId.trim()}:${os.id.trim()}`, `receber:os:${storeId.trim()}:${os.id.trim()}`] },
          },
          select: { id: true },
        });
        protegido = !!titulo;
      }
      const next = mesclarImportacaoOS(os.payload, importado, protegido);
      const c = colunas ?? {};
      const data = {};
      for (const k of ["numero", "equipamento", "defeito", "laudoTecnico"]) if (c[k] !== undefined) data[k] = c[k];
      if (c.clienteId) data.clienteId = c.clienteId;
      if (!protegido) for (const k of ["valorTotal", "valorBase", "status"]) if (c[k] !== undefined) data[k] = c[k];
      return { payload: next, colunas: data, resultado: { financeiroProtegido: protegido } };
    },
  });
}
