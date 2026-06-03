import type { Orcamento, OrdemServico, PecaUsada, Servico } from "@/types/os";

/**
 * PASSO 1 (remediação intake → orçamento). Funções PURAS (sem I/O, vitest-safe):
 *  - `buildOrcamentoRascunhoFromOS`: materializa um orçamento **rascunho** a partir dos
 *    itens já gravados pela Nova OS (`servicosCatalogo` + `pecas`), para que o orçamento
 *    deixe de ser uma síntese somente-leitura e passe a ser editável/aprovável.
 *  - `selectEstoquePecaSource`: define a **fonte única** de peças para baixa de estoque,
 *    evitando dupla baixa quando a mesma peça vive em `payload.pecas` E `orcamento.pecas`.
 */

type OSItensFonte = Pick<OrdemServico, "servicosCatalogo" | "pecas">;

export interface BuildOrcamentoDeps {
  uid: (prefix: string) => string;
  nowIso: () => string;
}

/** Monta um orçamento `rascunho` (editável) a partir dos itens da OS. Não toca financeiro. */
export function buildOrcamentoRascunhoFromOS(os: OSItensFonte, deps: BuildOrcamentoDeps): Orcamento {
  const cat = Array.isArray(os.servicosCatalogo) ? os.servicosCatalogo : [];
  const pecasFonte = Array.isArray(os.pecas) ? os.pecas : [];

  const servicos: Servico[] = cat.map((s) => ({
    id: deps.uid("srv"),
    descricao: s.descricao,
    valor: Number(s.valorVenda) || 0,
    desconto: 0,
    observacao: s.observacao,
    prazoGarantiaDias: s.prazoGarantiaDias,
    termoGarantia: s.termoGarantia,
  }));

  const pecas: PecaUsada[] = pecasFonte.map((p) => ({ ...p }));

  const sumServ = servicos.reduce((acc, s) => acc + Math.max(0, s.valor - (s.desconto ?? 0)), 0);
  const sumPecas = pecas.reduce(
    (acc, p) => acc + Math.max(0, (p.quantidade || 0) * (p.valorUnitario || 0) - (p.desconto ?? 0)),
    0,
  );

  const now = deps.nowIso();
  return {
    id: deps.uid("orc"),
    status: "rascunho",
    pecas,
    servicos,
    desconto: 0,
    total: Math.max(0, sumServ + sumPecas),
    criadoEm: now,
    atualizadoEm: now,
    sintetizado: false,
  };
}

/**
 * Fonte ÚNICA de peças para baixa de estoque. Quando o orçamento já tem peças, ele é a
 * fonte autoritativa (pode ter sido editado no painel); senão, usa `payload.pecas`.
 * Impede dupla baixa (a mesma peça em `payload.pecas` e em `orcamento.pecas`).
 */
export function selectEstoquePecaSource(
  payloadPecas: PecaUsada[] | undefined,
  orcamentoPecas: PecaUsada[] | undefined,
): { source: "payload.pecas" | "payload.orcamento.pecas"; rows: PecaUsada[] } {
  if (Array.isArray(orcamentoPecas) && orcamentoPecas.length > 0) {
    return { source: "payload.orcamento.pecas", rows: orcamentoPecas };
  }
  return { source: "payload.pecas", rows: Array.isArray(payloadPecas) ? payloadPecas : [] };
}
