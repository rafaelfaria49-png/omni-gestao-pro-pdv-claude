/**
 * Normalização do termo de busca de trocas — mesma regra do SQL (`translate(lower(...))`):
 * minúsculas e sem acento. Códigos NÃO passam por aqui para comparação exata: zeros à
 * esquerda e distinções relevantes são preservados na busca por código.
 */
export function normalizarTermoBusca(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}
