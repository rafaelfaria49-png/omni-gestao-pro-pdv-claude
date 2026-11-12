/**
 * Checklist de conferência do aparelho (OMNI-APARELHOS-ENDTOEND-001).
 * NAO_TESTADO nunca equivale a aprovado; só PASS conta como item conferido.
 */

export const CHECKLIST_VALORES = ["PASS", "FAIL", "NAO_TESTADO", "NAO_APLICAVEL"] as const
export type ChecklistValor = (typeof CHECKLIST_VALORES)[number]

export const CHECKLIST_VALOR_LABEL: Record<ChecklistValor, string> = {
  PASS: "Aprovado",
  FAIL: "Com falha",
  NAO_TESTADO: "Não testado",
  NAO_APLICAVEL: "Não se aplica",
}

export const CHECKLIST_ITENS = [
  { key: "liga", label: "Liga e desliga" },
  { key: "tela", label: "Tela" },
  { key: "touch", label: "Touch" },
  { key: "cameras", label: "Câmeras" },
  { key: "altoFalantes", label: "Alto-falantes" },
  { key: "microfones", label: "Microfones" },
  { key: "redeMovel", label: "Rede móvel" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "bluetooth", label: "Bluetooth" },
  { key: "carregamento", label: "Carregamento" },
  { key: "bateria", label: "Bateria" },
  { key: "botoes", label: "Botões" },
  { key: "biometria", label: "Biometria" },
  { key: "bloqueioConta", label: "Sem bloqueio de conta (iCloud/Google)" },
  { key: "sinaisDano", label: "Sem sinais de dano interno ou umidade" },
  { key: "estadoExterno", label: "Estado externo" },
] as const
export type ChecklistKey = (typeof CHECKLIST_ITENS)[number]["key"]
export type Checklist = Partial<Record<ChecklistKey, ChecklistValor>>

export function sanitizeChecklist(raw: unknown): Checklist {
  const out: Checklist = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  const r = raw as Record<string, unknown>
  for (const item of CHECKLIST_ITENS) {
    const v = r[item.key]
    if (typeof v === "string" && (CHECKLIST_VALORES as readonly string[]).includes(v)) out[item.key] = v as ChecklistValor
  }
  return out
}

export type ChecklistResumo = { aprovados: number; falhas: number; naoTestados: number; naoAplicaveis: number; total: number }

/** Itens ausentes contam como NÃO TESTADO. */
export function resumoChecklist(c: Checklist): ChecklistResumo {
  const r: ChecklistResumo = { aprovados: 0, falhas: 0, naoTestados: 0, naoAplicaveis: 0, total: CHECKLIST_ITENS.length }
  for (const item of CHECKLIST_ITENS) {
    const v = c[item.key] ?? "NAO_TESTADO"
    if (v === "PASS") r.aprovados++
    else if (v === "FAIL") r.falhas++
    else if (v === "NAO_APLICAVEL") r.naoAplicaveis++
    else r.naoTestados++
  }
  return r
}

export const ACESSORIOS_ITENS = [
  { key: "caixaOriginal", label: "Caixa original" },
  { key: "carregador", label: "Carregador" },
  { key: "cabo", label: "Cabo" },
  { key: "fone", label: "Fone" },
  { key: "capa", label: "Capa" },
  { key: "pelicula", label: "Película" },
  { key: "extratorChip", label: "Extrator de chip" },
  { key: "manual", label: "Manual" },
] as const
export type AcessorioKey = (typeof ACESSORIOS_ITENS)[number]["key"]
export type Acessorios = Partial<Record<AcessorioKey, boolean>>

export function sanitizeAcessorios(raw: unknown): Acessorios {
  const out: Acessorios = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  const r = raw as Record<string, unknown>
  for (const item of ACESSORIOS_ITENS) if (r[item.key] === true) out[item.key] = true
  return out
}

export function acessoriosTexto(a: Acessorios): string {
  const list = ACESSORIOS_ITENS.filter((i) => a[i.key]).map((i) => i.label)
  return list.length ? list.join(", ") : "Nenhum acessório"
}
