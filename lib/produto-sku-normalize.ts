/**
 * Normalização de SKU/código de produto para deduplicação entre importadores.
 *
 * Contexto: o importador universal/legado prefixa `gc-` (e há `imp-`, `prod-`, `id-`
 * em outros fluxos); o importador avançado grava o código cru. Sem normalização,
 * `gc-7580381444976` e `7580381444976` viram dois produtos por causa do
 * `@@unique([storeId, sku])`. Estas funções permitem tratá-los como o mesmo item.
 *
 * A camada de exibição (components/dashboard/estoque/gestao-produtos.tsx) já remove
 * esses prefixos ao mostrar o "código" — aqui aplicamos a mesma ideia no matching.
 */

const AUTO_PREFIX_RE = /^(?:gc-|imp-|prod-|id-)+/i

/** Remove prefixos automáticos de importador e normaliza (lowercase, trim) para comparação. */
export function normalizeProdutoSku(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase()
  if (!s) return ""
  return s.replace(AUTO_PREFIX_RE, "").trim()
}

/** EAN/GTIN: 8, 12, 13 ou 14 dígitos. Chave forte para dedupe quando presente. */
export function looksLikeEan(raw: unknown): boolean {
  return /^\d{8,14}$/.test(String(raw ?? "").trim())
}

/**
 * Frases fortemente documentais — quando aparecem no "nome" do produto, o registro
 * provavelmente é um termo/contrato/documento que vazou para a planilha, não um produto.
 * Mantidas como frases multi-palavra para minimizar falso positivo em nomes legítimos.
 */
const FRASES_DOCUMENTO = [
  "termo de garantia",
  "garantia legal",
  "codigo de defesa do consumidor",
  "cliente declara",
  "condicao de produto usado",
  "assistencia tecnica especializada",
  "lei no",
  "lei n.",
  "inciso ii",
] as const

function normalizeParaDocumento(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

/**
 * Heurística "comprimento > 500 + jurídico": decide se um nome parece documento/termo
 * em vez de produto. Usado para NÃO importar lixo como produto.
 */
export function nomePareceDocumento(name: unknown): boolean {
  const raw = String(name ?? "")
  if (raw.length > 500) return true
  const n = normalizeParaDocumento(raw)
  return FRASES_DOCUMENTO.some((kw) => n.includes(kw))
}
