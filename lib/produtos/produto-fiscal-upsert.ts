/**
 * Canonização fiscal do caminho Cadastros V2 (`upsertProduto`).
 *
 * Fecha a paridade fiscal da porta do Cadastros V2 com REST/importadores: reutiliza o
 * contrato canônico já publicado (`lib/produto-fiscal.ts`) — mesmo saneamento, mesma forma
 * compacta em `metadata.fiscal`. NÃO calcula imposto, NÃO emite nada, NÃO cria contrato novo.
 *
 * Diferente da REST (que faz whole-block replace), o Cadastros V2 já mescla `metadata.fiscal`
 * campo a campo no merge de 2 níveis do `upsertProduto`. Este helper apenas lê esse bloco já
 * mesclado como base canônica, sobrepõe os campos fiscais top-level do body (paridade REST) e
 * reescreve `metadata.fiscal` na forma canônica — preservando os campos fiscais não reenviados
 * (update parcial não-destrutivo) e todos os demais namespaces do metadata.
 */
import {
  getProdutoFiscal,
  mergeProdutoFiscalIntoMetadata,
  sanitizeProdutoFiscal,
  PRODUTO_FISCAL_VAZIO,
  type ProdutoFiscal,
  type ProdutoFiscalInput,
} from "@/lib/produto-fiscal"

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

const FISCAL_KEYS = Object.keys(PRODUTO_FISCAL_VAZIO) as (keyof ProdutoFiscal)[]

/**
 * Reescreve `metadata.fiscal` na forma canônica a partir de um metadata JÁ mesclado
 * (merge de 2 níveis do `upsertProduto`) e do input fiscal extraído do body.
 *
 * Chame apenas quando houver sinal fiscal (`fiscalInputFromBody(body) != null`); sem sinal,
 * o merge de 2 níveis já preserva o `fiscal` existente e este helper não deve ser chamado.
 */
export function canonicalizeProdutoFiscalMetadata(
  mergedMetadata: unknown,
  fiscalInput: ProdutoFiscalInput,
): Record<string, unknown> {
  // Base = fiscal já mesclado campo a campo (existente + `metadata.fiscal` enviado), lido
  // canonicamente (saneado; fallback legado do topo tratado por `getProdutoFiscal`).
  const base = getProdutoFiscal({ metadata: mergedMetadata })
  // Campos fiscais top-level do body sobrepõem a base — só os preenchidos, para não apagar
  // os campos não reenviados (aliases origem/unidade resolvidos pelo saneamento).
  const incoming = sanitizeProdutoFiscal(fiscalInput)
  const fiscalSource: ProdutoFiscal = { ...base }
  for (const key of FISCAL_KEYS) {
    if (incoming[key]) fiscalSource[key] = incoming[key]
  }
  // Remove qualquer resíduo não canônico antes de gravar a forma compacta (só os 10 campos).
  // Se nada fiscal sobrar, `mergeProdutoFiscalIntoMetadata` não recria a chave (JSONB enxuto).
  const next = { ...(asObject(mergedMetadata) ?? {}) }
  delete next.fiscal
  return mergeProdutoFiscalIntoMetadata(next, fiscalSource)
}
