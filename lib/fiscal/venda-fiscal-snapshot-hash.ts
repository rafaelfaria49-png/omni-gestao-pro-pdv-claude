/**
 * Hash determinístico do Snapshot Fiscal da Venda (GOAL-005 — runtime integration).
 *
 * Camada PURA que produz um SHA-256 canônico e reproduzível do snapshot fiscal,
 * excluindo CAMPOS VOLÁTEIS (timestamp `geradoEm`). O hash é a "assinatura de
 * conteúdo" do contrato congelado: mesmo venda + mesmo contexto fiscal → mesmo hash,
 * independentemente do instante em que o snapshot foi gerado.
 *
 * Princípios:
 *  - DETERMINÍSTICO: mesma entrada → mesmo hash (canonização recursiva de chaves).
 *  - IMUTÁVEL: o hash não muda após o congelamento — só mudaria se o snapshot
 *    fosse reescrito (o serviço NÃO reescreve; `deepFreeze` reforça em runtime).
 *  - SEM `geradoEm`: o timestamp de geração é metadata de auditoria, não conteúdo
 *    fiscal. Incluí-lo tornaria o hash não-determinístico entre execuções.
 *  - SEM rede, sem I/O, sem side-effects — puro `crypto.createHash`.
 *
 * Uso:
 *   const built = buildVendaFiscalSnapshot(input)
 *   if (built.ok) {
 *     const hash = computeSnapshotHash(built.snapshot)
 *     // persistir hash no JSONB snapshotPagamento.hash
 *   }
 */
import { createHash } from "node:crypto"
import type { VendaFiscalSnapshot } from "./venda-fiscal-snapshot"

/**
 * Versão do CONTRATO de hash (canonização + algoritmo). Independente da versão do
 * snapshot (`VENDA_FISCAL_SNAPSHOT_VERSAO`): mudanças na forma de canonizar ou no
 * algoritmo de hash incrementam este número, permitindo auditoria de divergência
 * entre hashes gerados por versões diferentes do contrato.
 */
export const SNAPSHOT_HASH_CONTRATO_VERSAO = 1

/** Algoritmo de hash — SHA-256 (FIPS 180-4). */
export const SNAPSHOT_HASH_ALGORITHM = "sha256"

/** Campos VOLÁTEIS do snapshot que NÃO participam do hash (metadata de auditoria). */
const SNAPSHOT_HASH_CAMPOS_EXCLUIDOS = new Set<string>(["geradoEm"])

/**
 * Canoniza um valor recursivamente para um formato estável (chaves ordenadas,
 * tipos normalizados). Arrays preservam ordem dos elementos (ordem é semântica
 * fiscal — itens da nota têm `numeroItem` sequencial).
 */
function canonicalize(value: unknown): unknown {
  if (value === null) return null
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v))
  }
  if (typeof value === "object" && !Object.isFrozen(value)) {
    // deepFreeze foi aplicado ao snapshot; respeitamos a imutabilidade sem mutar.
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    const keys = Object.keys(obj)
    // Ordena chaves ASCII (estável e reproduzível em qualquer runtime).
    for (const k of keys.sort()) {
      if (SNAPSHOT_HASH_CAMPOS_EXCLUIDOS.has(k)) continue
      out[k] = canonicalize(obj[k])
    }
    return out
  }
  return String(value)
}

/**
 * Serialização canônica estável (sem espaços, sem quebras, chaves ordenadas).
 * Diferente de `JSON.stringify` puro (que preserva ordem de inserção), esta
 * função produz uma string determinística independente da ordem de criação
 * das chaves no objeto original.
 */
function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

/**
 * Calcula o hash SHA-256 determinístico do snapshot fiscal.
 *
 * EXCLUI `geradoEm` (timestamp volátil de auditoria). Todos os demais campos
 * (emitente, destinatário, venda, itens, totais, diagnostico, tributacao)
 * participam do hash após canonização.
 *
 * @returns hash hexadecimal de 64 caracteres (SHA-256).
 */
export function computeSnapshotHash(snapshot: VendaFiscalSnapshot): string {
  const canon = canonicalStringify(snapshot)
  return createHash(SNAPSHOT_HASH_ALGORITHM).update(canon, "utf8").digest("hex")
}

/**
 * Verifica que um snapshot persistido corresponde ao hash congelado no ato da
 * solicitação. Útil para auditoria de imutabilidade: re-computa o hash do
 * snapshot lido do banco e compara com o hash persistido.
 *
 * @returns true se o hash re-computado for idêntico ao persistido.
 */
export function verifySnapshotHash(
  snapshot: VendaFiscalSnapshot,
  expectedHash: string,
): boolean {
  const actual = computeSnapshotHash(snapshot)
  return actual === expectedHash
}
