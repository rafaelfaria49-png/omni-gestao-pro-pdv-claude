/**
 * PADARIA-KG-F8-TROCAS-CONFIGURAVEIS-FINAL-001 — política de trocas/devoluções por peso.
 *
 * Decisão do proprietário (2026-11-08): trocas e devoluções de produtos vendidos por
 * peso são permitidas POR PADRÃO, com configuração independente POR LOJA:
 *
 *   F8_KG_EXCHANGE_DEFAULT=ENABLED
 *   F8_KG_EXCHANGE_SCOPE=PER_STORE
 *   F8_KG_EXCHANGE_OWNER_CONFIGURABLE=YES
 *
 * Armazenamento: `StoreSettings.printerConfig.pdvTrocasPeso` (mesmo padrão server-first
 * do GOAL 007). A chave NÃO ativa a venda KG no PDV — o gate F1
 * (`PDV_MANUAL_KG_RELEASE`/`PDV_MANUAL_KG_STORES`) continua obrigatório e intocado.
 *
 * Módulo PURO (sem I/O real): usado no servidor (commit revalida) e na UI de
 * configurações — `import type { Prisma }` é apagado em compilação.
 *
 * Fail-safe: AUSÊNCIA da chave = padrão aprovado (ATIVADO). Chave PRESENTE com valor
 * fora do contrato = DESATIVADO — lixo no banco nunca vira autorização implícita.
 * Erro de leitura (throws) também recusa: o caller não trata exceção como "liberado".
 */
import type { Prisma } from "@/generated/prisma"

export const TROCAS_PESO_KEY = "pdvTrocasPeso" as const
export type TrocasPesoValue = "enabled" | "disabled"
export const DEFAULT_TROCAS_PESO: TrocasPesoValue = "enabled"

/** Aceita e persiste somente estes valores; qualquer outro é recusado no PUT. */
export function normalizeTrocasPesoValue(v: unknown): TrocasPesoValue | null {
  return v === "enabled" || v === "disabled" ? v : null
}

/** Política vigente a partir do `printerConfig` lido do banco (ou snapshot dele). */
export function trocasPesoPermitidas(printerConfig: { printerConfig?: unknown } | null | undefined): boolean {
  const raw = printerConfig?.printerConfig
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)[TROCAS_PESO_KEY]
    : undefined
  if (value === undefined) return true // ausência = padrão aprovado ATIVADO
  return normalizeTrocasPesoValue(value) === "enabled" // inválido presente = fail-closed
}

export const TROCA_KG_DESATIVADA_MENSAGEM =
  "Esta loja não aceita trocas voluntárias de produtos vendidos por peso. Produtos por unidade continuam liberados. Direitos legais do consumidor: registre a pendência para o Financeiro com justificativa — nada foi gravado."

/**
 * Leitura autoritativa DENTRO da transação do commit (nunca cache/localStorage).
 * `null` = StoreSettings ausente → padrão aprovado (ATIVADO), o que NÃO é erro de
 * leitura: a linha de loja só não foi criada ainda.
 */
export async function trocasPesoPermitidasTx(tx: Pick<Prisma.TransactionClient, "storeSettings">, storeId: string): Promise<boolean> {
  const settings = await tx.storeSettings.findUnique({ where: { storeId }, select: { printerConfig: true } })
  return trocasPesoPermitidas({ printerConfig: settings?.printerConfig ?? undefined })
}

/**
 * Escritor F8 × KG (caminho transacional auditável). O trigger `manual_kg_guard_return`
 * só aceita devoluções de venda KG com esta versão declarada NA MESMA transação —
 * gravadores legados e SQL direto continuam bloqueados no banco.
 */
export const F8_KG_RETURN_WRITER = "f8-kg-v1" as const

export async function enterF8KgReturnTransaction(tx: Pick<Prisma.TransactionClient, "$queryRaw">): Promise<void> {
  await tx.$queryRaw`SELECT set_config('omni.f8_kg_return_writer', ${F8_KG_RETURN_WRITER}, true)`
}

/**
 * Readiness do lado da devolução: as colunas/índice/trigger do contrato fracionário
 * precisam estar aplicados ANTES de aceitar troca KG (código novo nunca publica antes
 * do banco de que depende — mesma defesa do `manualKgAvailable` da venda).
 */
export async function f8KgReturnSchemaReady(db: Pick<Prisma.TransactionClient, "$queryRaw">): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>`
    SELECT
      (SELECT count(*) = 2 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'itens_devolucao_venda'
        AND ((column_name = 'quantidade' AND data_type = 'integer' AND is_nullable = 'YES')
          OR (column_name = 'quantidadeKg' AND data_type = 'numeric' AND numeric_precision = 65 AND numeric_scale = 30)))
      AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = current_schema()
        AND tablename = 'itens_devolucao_venda' AND indexname = 'itens_devolucao_venda_kg_produto_unique')
      AND EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'itens_devolucao_venda'
        AND c.conname = 'itens_devolucao_venda_quantity_contract' AND c.convalidated
        -- Fingerprint retido pela migration: CHECK substituído/drifted NÃO passa como pronto.
        AND obj_description(c.oid, 'pg_constraint') = 'f8-kg-return-v1:' || md5(pg_get_constraintdef(c.oid))) AS ready`
  return rows[0]?.ready === true
}

/** Condição da mercadoria devolvida (GOAL §5) — decide o retorno ao estoque. */
export const CONDICOES_MERCADORIA = ["apto_revenda", "nao_apto_revenda", "nao_recebido", "descarte"] as const
export type CondicaoMercadoria = (typeof CONDICOES_MERCADORIA)[number]

export function isCondicaoMercadoria(v: unknown): v is CondicaoMercadoria {
  return typeof v === "string" && (CONDICOES_MERCADORIA as readonly string[]).includes(v)
}

/** Só `apto_revenda` gera entrada de estoque; UN sem condição informada preserva o comportamento validado (entrada). */
export function condicaoGeraEntradaEstoque(condicao: CondicaoMercadoria | undefined): boolean {
  return condicao === undefined || condicao === "apto_revenda"
}
