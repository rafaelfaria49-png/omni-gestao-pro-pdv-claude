/**
 * Tipos do storage fiscal — ADR-0018 (GOAL-013).
 *
 * Contrato do espelho privado OPCIONAL e do reader server-side. A coluna
 * `NotaFiscal.xmlAutorizado` (e `xmlStorageRef`, `protocolo`, etc.) é a fonte
 * primária obrigatória; o espelho é uma cópia imutável extra, validada por hash.
 *
 * Este GOAL NÃO provisiona bucket, credencial, role, KMS ou qualquer recurso
 * externo. A implementação concreta do espelho é uma sprint futura (ADR
 * própria, se necessário). Aqui fixa-se APENAS o contrato.
 *
 * Regras (ADR-0018 §2.4 e §2.5):
 * - `storeId` é obrigatório em toda fronteira (ADR-0003).
 * - O espelho nunca substitui a coluna como fonte da verdade.
 * - Reader nunca reconstrói XML; só devolve bytes persistidos.
 * - Nenhum XML completo em logs; apenas hashes/identificadores.
 */

/**
 * Localizador canônico de documento fiscal (mesmo escopo ADR-0017).
 * Reutilizado aqui porque o reader exige isolamento por `storeId` estrito.
 */
export type FiscalDocumentLocator = Readonly<{
  storeId: string
  vendaId: string
  notaFiscalId: string
}>

/**
 * Bytes do XML autorizado/devolvido para o consumidor autorizado.
 * `xmlAutorizado` é o `<nfeProc>` persistido. `xmlAssinado` é o `<NFe>`
 * assinado antes da transmissão (evidência do que foi submetido).
 */
export type AuthorizedXmlDocument = Readonly<{
  storeId: string
  vendaId: string
  notaFiscalId: string
  chaveAcesso: string | null
  serie: number | null
  numero: number | null
  modelo: string
  ambiente: string
  status: string
  xmlAutorizado: string | null
  xmlAssinado: string | null
  xmlAutorizadoSha256: string | null
  xmlAssinadoSha256: string | null
  protocolo: string | null
  cStat: string | null
  xMotivo: string | null
  dataAutorizacao: Date | null
  digestValue: string | null
  qrCodeData: string | null
  urlConsulta: string | null
  xmlStorageRef: string | null
}>

/**
 * Porta do espelho privado opcional (ADR-0018 §2.4).
 *
 * `active === false` é o **único** estado aceitável enquanto não houver storage
 * privado provisionado — que é o estado atual do projeto e deste GOAL. Um
 * backend concreto é sprint futura; aqui fixa-se apenas o contrato.
 */
export interface XmlStorageMirror {
  readonly active: boolean
  /**
   * Persiste cópia imutável dos bytes do XML autorizado (e/ou assinado) num
   * bucket privado exclusivo do Fiscal. Devolve `xmlStorageRef` se a cópia
   * foi feita com sucesso, OU `null` se este espelho está inativo.
   */
  storeMirror(input: {
    storeId: string
    notaFiscalId: string
    xmlAutorizado: string
    bytesSha256: string
  }): Promise<{ xmlStorageRef: string | null; divergent: boolean; reason?: string }>
  /**
   * Lê os bytes da cópia privada pelo `xmlStorageRef`. Devolve `null` quando
   * espelho está inativo, ou o objeto não existe.
   */
  readMirror(input: {
    storeId: string
    xmlStorageRef: string
  }): Promise<{ bytes: string; bytesSha256: string } | null>
  /**
   * Verifica divergência coluna × espelho. A coluna sempre vence (decisão
   * ADR-0018); a divergência é registrada em `FiscalLog` pelo caller, jamais
   * silenciada.
   */
  verifyAgainstColumn(input: {
    storeId: string
    notaFiscalId: string
    xmlStorageRef: string
    columnBytesSha256: string
  }): Promise<{ divergent: boolean; reason?: string }>
}

/**
 * Erro de storage fiscal. Mantém a mesma disciplina do cofre fiscal (ADR-0009):
 * mensagem genérica, sem conteúdo de XML, URL assinada ou token.
 */
export class FiscalStorageError extends Error {
  readonly code:
    | "store_id_obrigatorio"
    | "store_invalida"
    | "nota_nao_autorizada"
    | "nota_nao_encontrada"
    | "mirror_indisponivel"
    | "mirror_divergente"
  constructor(
    code: FiscalStorageError["code"],
    message: string,
  ) {
    super(message)
    this.name = "FiscalStorageError"
    this.code = code
  }
}

/**
 * Fronteira de leitura server-side (ADR-0018 §2.5). Exige `storeId` e valida
 * isolamento por loja — uma loja jamais lê o XML de outra.
 */
export interface FiscalXmlReader {
  readAuthorizedDocument(locator: FiscalDocumentLocator): Promise<AuthorizedXmlDocument | null>
}