/**
 * Contador HUB · Pacote do Contador — segurança e integridade (puro, sem IO de rede/DB).
 *
 * GOAL 008. Três responsabilidades:
 * 1. Hash SHA-256 determinístico do conteúdo (integridade do manifesto).
 * 2. Neutralização de injeção de fórmula em CSV (planilhas do contador).
 * 3. Guardas de vazamento (storeId/PII) e de volume (o pacote in-memory precisa ser
 *    comprovadamente pequeno — o conteúdo deriva do DTO agregado, não de linhas cruas).
 */
import { createHash } from "node:crypto"
import type { ArquivoPacote } from "./tipos"

/** Limites explícitos: o conteúdo é derivado do DTO agregado (KB), nunca linhas cruas. */
export const MAX_ARQUIVOS_PACOTE = 64
export const MAX_BYTES_PACOTE = 5 * 1024 * 1024 // 5 MB — folga enorme sobre o volume real.

export class PacoteInseguroError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PacoteInseguroError"
  }
}

/** SHA-256 (hex) do texto em UTF-8 — mesma codificação que o ZIP usa ao gravar a string. */
export function sha256Hex(conteudo: string): string {
  return createHash("sha256").update(Buffer.from(conteudo, "utf8")).digest("hex")
}

/** Tamanho em bytes do texto em UTF-8 (coerente com o hash e o ZIP). */
export function bytesUtf8(conteudo: string): number {
  return Buffer.byteLength(conteudo, "utf8")
}

/**
 * Célula que começa com `= + - @` (ou TAB/CR) pode ser interpretada como fórmula
 * pelo Excel/Sheets. Prefixamos com apóstrofo para forçar texto. Aplicar SOMENTE em
 * células textuais — nunca em números (quebraria negativos legítimos).
 */
const PREFIXO_FORMULA = /^[=+\-@\t\r]/
export function neutralizarFormula(valor: string): string {
  return PREFIXO_FORMULA.test(valor) ? `'${valor}` : valor
}

/**
 * Guarda anti-vazamento: nenhum arquivo pode conter o `storeId` da loja ativa nem
 * sentinelas estruturais de PII/segredo. O conteúdo é 100% controlado (deriva do DTO
 * público), então qualquer ocorrência indica regressão — falhamos fechado.
 */
export function assertPacoteSeguro(
  arquivos: readonly ArquivoPacote[],
  opcoes: Readonly<{ storeId?: string | null }> = {},
): void {
  if (arquivos.length > MAX_ARQUIVOS_PACOTE) {
    throw new PacoteInseguroError(
      `Pacote excedeu o limite de ${MAX_ARQUIVOS_PACOTE} arquivos (${arquivos.length}).`,
    )
  }

  const storeId = (opcoes.storeId ?? "").trim()
  let totalBytes = 0

  for (const arquivo of arquivos) {
    totalBytes += bytesUtf8(arquivo.conteudo)
    if (totalBytes > MAX_BYTES_PACOTE) {
      throw new PacoteInseguroError(
        `Pacote excedeu o limite de ${MAX_BYTES_PACOTE} bytes; abortado por segurança.`,
      )
    }

    if (storeId && arquivo.conteudo.includes(storeId)) {
      throw new PacoteInseguroError(
        `Arquivo "${arquivo.caminho}" contém o identificador da loja ativa (vazamento).`,
      )
    }

    // Sentinelas estruturais herdadas do contrato do DTO público (GOAL 006).
    for (const sentinela of ['"storeId"', '"payload"', '"stack"', '"sessionToken"']) {
      if (arquivo.conteudo.includes(sentinela)) {
        throw new PacoteInseguroError(
          `Arquivo "${arquivo.caminho}" contém sentinela proibida (${sentinela}).`,
        )
      }
    }
  }
}
