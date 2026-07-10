import type { ProvedorId, ResultadoCadeia, TentativaLookup } from "./types"

/**
 * Memo em memória (GOAL 004A · D12).
 *
 * Dois propósitos, ambos não-persistidos (sem schema/migration):
 *  1. Provedor esgotado até 00:00 (America/Sao_Paulo) quando houver limite_excedido/429.
 *  2. Resultado do dia por GTIN, para evitar rebipar e queimar cota de novo na mesma sessão.
 *
 * Débito consciente: sonda pós-cold-start. Não há contador persistido em banco.
 */

/** Calcula o instante (UTC) da próxima meia-noite em America/Sao_Paulo. */
export function proximaMeiaNoiteSaoPaulo(now: Date = new Date()): Date {
  const TZ = "America/Sao_Paulo"
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now)
  const p: Record<string, string> = {}
  for (const part of parts) p[part.type] = part.value
  const y = Number(p.year)
  const mo = Number(p.month) - 1
  const d = Number(p.day)
  const h = Number(p.hour === "24" ? "0" : p.hour)
  const mi = Number(p.minute)
  const s = Number(p.second)

  // Instante local "como se fosse UTC" — usado para derivar o offset real.
  const localComoUtc = Date.UTC(y, mo, d, h, mi, s)
  const offsetMs = localComoUtc - now.getTime()

  // Meia-noite de hoje em SP local, convertida para UTC real.
  const meiaNoiteHojeUtc = Date.UTC(y, mo, d, 0, 0, 0) - offsetMs
  if (meiaNoiteHojeUtc > now.getTime()) return new Date(meiaNoiteHojeUtc)
  return new Date(Date.UTC(y, mo, d + 1, 0, 0, 0) - offsetMs)
}

type CacheGtin = {
  resultado: ResultadoCadeia
  tentativas: TentativaLookup[]
  expiraEm: Date
}

export class MemoLookup {
  private esgotados = new Map<ProvedorId, Date>()
  private cacheGtin = new Map<string, CacheGtin>()

  /** Marca um provedor como esgotado até `resetEm` (default: próxima meia-noite SP). */
  marcarEsgotado(provedor: ProvedorId, resetEm?: Date): void {
    this.esgotados.set(provedor, resetEm ?? proximaMeiaNoiteSaoPaulo())
  }

  /** Retorna o instante de reset se o provedor ainda estiver esgotado, ou null caso contrário. */
  esgotadoAte(provedor: ProvedorId, now: Date = new Date()): Date | null {
    const reset = this.esgotados.get(provedor)
    if (!reset) return null
    if (reset.getTime() <= now.getTime()) {
      this.esgotados.delete(provedor)
      return null
    }
    return reset
  }

  /** Memoriza o resultado da cadeia para um GTIN até `expiraEm`. */
  memoizarGtin(
    gtin: string,
    resultado: ResultadoCadeia,
    tentativas: TentativaLookup[],
    expiraEm?: Date,
  ): void {
    this.cacheGtin.set(gtin, {
      resultado,
      tentativas,
      expiraEm: expiraEm ?? proximaMeiaNoiteSaoPaulo(),
    })
  }

  /** Retorna o resultado em cache se ainda válido, ou null caso contrário. */
  obterGtin(gtin: string, now: Date = new Date()): CacheGtin | null {
    const entry = this.cacheGtin.get(gtin)
    if (!entry) return null
    if (entry.expiraEm.getTime() <= now.getTime()) {
      this.cacheGtin.delete(gtin)
      return null
    }
    return entry
  }

  /** Limpa todo o memo (útil em testes). */
  limpar(): void {
    this.esgotados.clear()
    this.cacheGtin.clear()
  }
}

/** Instância singleton do memo para a sessão do servidor. */
export const memoLookupGlobal = new MemoLookup()
