/**
 * Storage fiscal — ADR-0018 (GOAL-013).
 *
 * Ponto único de importação para:
 *  - Reader server-side de XML autorizado/assinado persistido (read-only).
 *  - Espelho privado opcional (no-op neste GOAL; backend real em sprint
 *    futura, sem quebrar callers).
 *  - Tipos do contrato.
 *
 * Regras inegociáveis (ver ADR-0018):
 * - `storeId` obrigatório; isolamento estrito por loja (ADR-0003).
 * - A coluna `NotaFiscal.xmlAutorizado` é a fonte primária obrigatória.
 * - O espelho **nunca** substitui a coluna.
 * - Nenhum XML completo em logs; apenas hashes/identificadores.
 * - Sem provisionamento de bucket/kms/credencial neste GOAL.
 */
export * from "./types"
export { noopXmlStorageMirror, resolveXmlStorageMirror } from "./mirror-vault"
export {
  createFiscalXmlReader,
  fiscalXmlReader,
  type FiscalXmlReaderClient,
} from "./xml-storage-reader"