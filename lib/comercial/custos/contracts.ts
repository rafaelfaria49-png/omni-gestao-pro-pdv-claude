/**
 * Contrato de custos comerciais (OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001 · ADR-0025).
 *
 * Separação obrigatória de eventos (nunca equivalentes):
 *   aquisição comercial ≠ obrigação financeira ≠ pagamento efetivo ≠ entrada de estoque ≠
 *   consumo de material ≠ apropriação de custo ≠ custo histórico da venda.
 *
 * Este módulo só APROPRIA custo a uma unidade. Dinheiro só se move pelo Financeiro canônico
 * (Contas a Pagar → pagar); estoque só pelo boundary do StockLedger. Valores em CENTAVOS inteiros.
 * Puro (sem I/O): reutilizável no cliente, nos testes e no servidor.
 */

export const CUSTO_ORIGENS = ["estoque", "preexistente", "vinculo_financeiro", "nova_compra", "gerencial"] as const
export type CustoOrigem = (typeof CUSTO_ORIGENS)[number]

export const CUSTO_CATEGORIAS = ["peca", "mao_obra_interna", "servico_terceirizado", "frete", "outro"] as const
export type CustoCategoria = (typeof CUSTO_CATEGORIAS)[number]

export const CUSTO_STATUS = ["conhecido", "estimado", "desconhecido"] as const
export type CustoStatus = (typeof CUSTO_STATUS)[number]

export const ORIGEM_FINANCEIRA_TIPOS = ["conta_pagar", "gestor_money_gasto"] as const
export type OrigemFinanceiraTipo = (typeof ORIGEM_FINANCEIRA_TIPOS)[number]

export const CUSTO_ORIGEM_LABEL: Record<CustoOrigem, string> = {
  estoque: "Material do estoque",
  preexistente: "Material preexistente (já pago)",
  vinculo_financeiro: "Compra/gasto já registrado",
  nova_compra: "Nova compra",
  gerencial: "Custo gerencial (sem pagamento)",
}

export const CUSTO_CATEGORIA_LABEL: Record<CustoCategoria, string> = {
  peca: "Peça / componente",
  mao_obra_interna: "Mão de obra interna",
  servico_terceirizado: "Serviço terceirizado",
  frete: "Frete",
  outro: "Outro custo",
}

export const CUSTO_STATUS_LABEL: Record<CustoStatus, string> = {
  conhecido: "Conhecido",
  estimado: "Estimado",
  desconhecido: "Desconhecido",
}

/** Combinações válidas origem × categoria (espelha os CHECKs da migration). */
export const CATEGORIAS_POR_ORIGEM: Record<CustoOrigem, readonly CustoCategoria[]> = {
  estoque: ["peca", "outro"],
  preexistente: ["peca", "frete", "outro"],
  vinculo_financeiro: ["peca", "servico_terceirizado", "frete", "outro"],
  nova_compra: ["peca", "servico_terceirizado", "frete", "outro"],
  gerencial: ["mao_obra_interna"],
}

/** Efeito financeiro de cada origem — é isto que impede saída fictícia ou duplicada. */
export const EFEITO_FINANCEIRO: Record<CustoOrigem, string> = {
  estoque: "Nenhum: o material já foi comprado; consome o estoque pelo custo médio histórico.",
  preexistente: "Nenhum: material pago antes; não gera pagamento nem entrada inventada.",
  vinculo_financeiro: "Nenhum novo: rateia uma obrigação já registrada, até o valor e a quantidade dela.",
  nova_compra: "Cria UMA obrigação pendente em Contas a Pagar. Saída de dinheiro só quando o Financeiro pagar.",
  gerencial: "Nenhum: custo gerencial (mão de obra interna) nunca vira pagamento.",
}

// ─── Etapas do prontuário (ortogonais ao status de estoque da unidade) ──────────

export const UNIDADE_CATEGORIAS = ["smartphone", "tablet", "notebook", "computador", "televisor", "audio", "eletrodomestico", "outro"] as const
export type UnidadeCategoria = (typeof UNIDADE_CATEGORIAS)[number]
export const UNIDADE_CATEGORIA_LABEL: Record<UnidadeCategoria, string> = {
  smartphone: "Smartphone", tablet: "Tablet", notebook: "Notebook", computador: "Computador",
  televisor: "Televisor", audio: "Caixa de som / áudio", eletrodomestico: "Eletrodoméstico", outro: "Outro",
}
/** Categorias em que IMEI faz sentido; nas demais a identificação é por número de série. */
export const CATEGORIAS_COM_IMEI: ReadonlySet<UnidadeCategoria> = new Set(["smartphone", "tablet"])
/** Bateria só se aplica a portáteis. */
export const CATEGORIAS_COM_BATERIA: ReadonlySet<UnidadeCategoria> = new Set(["smartphone", "tablet", "notebook", "audio"])

export const FUNCIONAMENTO = ["normal", "com_avarias", "danificado", "nao_liga", "nao_avaliado"] as const
export type Funcionamento = (typeof FUNCIONAMENTO)[number]
export const FUNCIONAMENTO_LABEL: Record<Funcionamento, string> = {
  normal: "Funcionando normalmente", com_avarias: "Funcionando com avarias", danificado: "Danificado, necessita reparo",
  nao_liga: "Não liga", nao_avaliado: "Não avaliado",
}

export const FINALIDADES = ["revenda", "preparacao", "pecas", "devolucao_fornecedor", "baixa"] as const
export type Finalidade = (typeof FINALIDADES)[number]
export const FINALIDADE_LABEL: Record<Finalidade, string> = {
  revenda: "Revenda", preparacao: "Preparação", pecas: "Retirada de peças",
  devolucao_fornecedor: "Devolução ao fornecedor", baixa: "Baixa autorizada",
}

export const ETAPAS_PREPARACAO = ["nenhuma", "em_preparacao", "em_testes", "concluida"] as const
export type EtapaPreparacao = (typeof ETAPAS_PREPARACAO)[number]
export const ETAPA_LABEL: Record<EtapaPreparacao, string> = {
  nenhuma: "Sem preparação", em_preparacao: "Em preparação", em_testes: "Em testes", concluida: "Preparação concluída",
}

/** Justificativa mínima para confirmar um custo de aquisição ZERO (ex.: doação, garantia de fornecedor). */
export const JUSTIFICATIVA_CUSTO_ZERO_MIN = 10

/**
 * Situação REAL do custo de aquisição (revisão independente P1-1). Custo 0 vem também de quem não
 * pode definir custo (o cadastro força 0) — por isso zero só é "conhecido" quando confirmado no
 * prontuário com justificativa; caso contrário é DESCONHECIDO, nunca margem de 100%.
 * Espelhado em SQL no Relatório comercial (`lib/relatorios/comercial.ts`).
 */
export function statusCustoAquisicao(
  custoAquisicaoReais: number,
  perfil: { custoAquisicaoStatus: string; custoAquisicaoJustificativa?: string | null } | null | undefined,
): CustoStatus {
  const declarado = perfil?.custoAquisicaoStatus
  if (declarado === "desconhecido") return "desconhecido"
  if (custoAquisicaoReais > 0) return declarado === "estimado" ? "estimado" : "conhecido"
  const confirmado = (perfil?.custoAquisicaoJustificativa ?? "").trim().length >= JUSTIFICATIVA_CUSTO_ZERO_MIN
  if (confirmado && (declarado === "conhecido" || declarado === "estimado")) return declarado
  return "desconhecido"
}

/** Etapa/finalidade que mantém a unidade FORA do estoque vendável. */
export function bloqueiaLiberacao(perfil: { etapaPreparacao: string; finalidade: string } | null | undefined): string | null {
  if (!perfil) return null
  if (perfil.etapaPreparacao === "em_preparacao" || perfil.etapaPreparacao === "em_testes") {
    return "A unidade está em preparação: conclua a preparação antes de liberar para venda."
  }
  if (perfil.finalidade !== "revenda" && perfil.finalidade !== "preparacao") {
    return `Finalidade "${FINALIDADE_LABEL[perfil.finalidade as Finalidade] ?? perfil.finalidade}" não é revenda.`
  }
  return null
}

/** Conferências de segurança/procedência — registro manual, nunca contorno de bloqueio. */
export const CONFERENCIAS_SEGURANCA = [
  { key: "bloqueioAtivacaoApple", label: "Bloqueio de ativação Apple (iCloud) desativado pelo dono" },
  { key: "contaGoogle", label: "Conta Google removida (FRP)" },
  { key: "gerenciamentoCorporativo", label: "Sem gerenciamento corporativo (MDM)" },
  { key: "dadosRemovidos", label: "Dados anteriores removidos com autorização" },
  { key: "procedenciaPecas", label: "Procedência das peças conferida" },
  { key: "historicoReparo", label: "Histórico de reparo informado" },
] as const
export type ConferenciaKey = (typeof CONFERENCIAS_SEGURANCA)[number]["key"]
export const CONFERENCIA_VALORES = ["PASS", "FAIL", "NAO_TESTADO", "NAO_APLICAVEL"] as const

export function sanitizeConferencias(raw: unknown): Partial<Record<ConferenciaKey, (typeof CONFERENCIA_VALORES)[number]>> {
  const out: Partial<Record<ConferenciaKey, (typeof CONFERENCIA_VALORES)[number]>> = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const { key } of CONFERENCIAS_SEGURANCA) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v === "string" && (CONFERENCIA_VALORES as readonly string[]).includes(v)) out[key] = v as (typeof CONFERENCIA_VALORES)[number]
  }
  return out
}

/** Atalho oficial de consulta de restrição (conferência MANUAL registrada; não há API integrada). */
export const CONSULTA_IMEI_OFICIAL = { label: "Consulta Aparelho Impedido (ABR Telecom · Anatel)", url: "https://www.consultaaparelhoimpedido.com.br/" } as const

export function isCustoOrigem(v: unknown): v is CustoOrigem {
  return typeof v === "string" && (CUSTO_ORIGENS as readonly string[]).includes(v)
}
export function isCustoCategoria(v: unknown): v is CustoCategoria {
  return typeof v === "string" && (CUSTO_CATEGORIAS as readonly string[]).includes(v)
}
export function isCustoStatus(v: unknown): v is CustoStatus {
  return typeof v === "string" && (CUSTO_STATUS as readonly string[]).includes(v)
}
