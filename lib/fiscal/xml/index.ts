/**
 * XML Builder da NFC-e (GOAL_009) — ponto único de import.
 *
 * DORMENTE: constrói um XML determinístico a partir da NotaFiscal congelada (snapshots +
 * itens). Não assina, não transmite, não gera DANFE/QRCode, não acessa SEFAZ. Mesmo
 * snapshot → mesmo XML; hash interno para verificação/testes.
 */
export { buildNfceXml } from "./xml-builder"
export { xmlHash } from "./xml-utils"
export type {
  NfceXmlInput,
  NfceXmlItem,
  NfceXmlNotaHeader,
  NfceXmlPagamentoSnapshot,
  NfceXmlResult,
  NfcePagamentoLinha,
  SnapshotDestinatario,
  SnapshotEmitente,
} from "./xml-types"
