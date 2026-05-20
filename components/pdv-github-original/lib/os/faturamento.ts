import type { Orcamento, OrdemServico } from "@/types/os";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Origem do registro de faturamento no payload (extensível no futuro). */
export type FaturamentoOrigemOS = "orcamento_os";

/** Estado do ciclo de faturamento ligado à OS (sem tabela financeira ainda). */
export type FaturamentoStatusOS = "pendente" | "cancelado";

/** Campos opcionais persistidos no JsonB da OS. */
export interface FaturamentoOSCampos {
  faturamentoPendente?: boolean;
  faturamentoStatus?: FaturamentoStatusOS;
  faturamentoOrigem?: FaturamentoOrigemOS;
  faturamentoTotal?: number;
  faturamentoCriadoEm?: string;
  faturamentoReferencia?: string;
}

/** Snapshot completo quando há faturamento pendente a partir do orçamento. */
export type FaturamentoOSPendenteSlice = {
  faturamentoPendente: true;
  faturamentoStatus: "pendente";
  faturamentoOrigem: FaturamentoOrigemOS;
  faturamentoTotal: number;
  faturamentoCriadoEm: string;
  faturamentoReferencia: string;
};

/**
 * Verifica se o valor contém um snapshot coerente de faturamento no payload.
 * Para `pendente`, exige origem, total, data e referência.
 */
export function isFaturamentoOS(v: unknown): v is FaturamentoOSCampos {
  if (!isRecord(v)) return false;
  const pendente = v.faturamentoPendente;
  const status = v.faturamentoStatus;
  if (typeof pendente !== "boolean") return false;
  if (status !== "pendente" && status !== "cancelado") return false;

  if (pendente) {
    if (status !== "pendente") return false;
    const origem = v.faturamentoOrigem;
    const total = v.faturamentoTotal;
    const criado = v.faturamentoCriadoEm;
    const ref = v.faturamentoReferencia;
    return (
      origem === "orcamento_os" &&
      typeof total === "number" &&
      Number.isFinite(total) &&
      typeof criado === "string" &&
      typeof ref === "string" &&
      ref.length > 0
    );
  }

  return status === "cancelado";
}

export type BuildFaturamentoFromOrcamentoInput = {
  os: Pick<OrdemServico, "id" | "codigo">;
  orcamento: Orcamento;
  criadoEm: string;
};

/**
 * Monta o bloco persistido quando o orçamento é aprovado (total já recalculado).
 * Referência combina código legível e id estável para integrações futuras.
 */
export function buildFaturamentoFromOrcamento(input: BuildFaturamentoFromOrcamentoInput): FaturamentoOSPendenteSlice {
  const { os, orcamento, criadoEm } = input;
  return {
    faturamentoPendente: true,
    faturamentoStatus: "pendente",
    faturamentoOrigem: "orcamento_os",
    faturamentoTotal: orcamento.total,
    faturamentoCriadoEm: criadoEm,
    faturamentoReferencia: `${os.codigo} · ${os.id}`,
  };
}

/** Bloco mínimo quando o orçamento é recusado (sem faturamento pendente). */
export function buildFaturamentoRecusadoOrcamento(): Pick<FaturamentoOSCampos, "faturamentoPendente" | "faturamentoStatus"> {
  return {
    faturamentoPendente: false,
    faturamentoStatus: "cancelado",
  };
}
