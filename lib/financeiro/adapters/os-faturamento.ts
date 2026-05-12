import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import type { OrdemServico, OSStatus } from "@/types/os";
import { isFaturamentoOS } from "@/lib/os/faturamento";
import { buildContaReceberLocalKey } from "@/lib/financeiro/contracts/local-key";
import { buildContaReceberPayload } from "@/lib/financeiro/contracts/payload";
import { FINANCEIRO_CREATED_FROM_OPERACOES_HUB_V2, FINANCEIRO_ORIGEM } from "@/lib/financeiro/contracts/origem";
import { RECEBER_STATUS } from "@/lib/financeiro/contracts/status";

type MinimalOS = Pick<OrdemServico, "id" | "storeId" | "clienteId" | "cliente" | "status" | "orcamento"> & {
  codigo?: string;
  faturamentoPendente?: boolean;
  faturamentoStatus?: "pendente" | "cancelado";
  faturamentoOrigem?: "orcamento_os";
  faturamentoTotal?: number;
  faturamentoCriadoEm?: string;
  faturamentoReferencia?: string;
  faturamentoModoCobranca?: string;
  faturamentoParcelas?: unknown;
  faturamentoFormaPagamento?: string;
  faturamentoRevisadoEm?: string;
  faturamentoValorAnterior?: number;
  faturamentoValorAtual?: number;
  orcamentoHistorico?: unknown;
  orcamentoRevisaoAtual?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function getFaturamentoReferenceFromOS(os: MinimalOS): string {
  const ref = safeStr(os.faturamentoReferencia);
  if (ref) return ref;
  const codigo = safeStr((os as { codigo?: unknown }).codigo);
  return codigo ? `${codigo} · ${os.id}` : `OS · ${os.id}`;
}

export function isOSFaturavel(os: MinimalOS): boolean {
  if (!isFaturamentoOS(os)) return false;
  if (os.faturamentoPendente !== true) return false;
  if (os.faturamentoStatus !== "pendente") return false;
  if (!(safeNum(os.faturamentoTotal) > 0)) return false;
  return true;
}

export function buildContaReceberFromOS(os: MinimalOS): {
  storeId: string;
  localKey: string;
  create: Prisma.ContaReceberTituloCreateInput;
  update: Prisma.ContaReceberTituloUpdateInput;
} {
  if (!os.storeId) throw new Error("OS inválida: storeId ausente");

  const localKey = buildContaReceberLocalKey({
    kind: "adapter_os_faturamento",
    storeId: os.storeId,
    ordemServicoId: os.id,
  });
  const valor = Math.round(safeNum(os.faturamentoTotal) * 100) / 100;
  const clienteNome = safeStr(os.cliente?.nome) || "Cliente";

  const baseDate = safeStr(os.faturamentoCriadoEm) ? new Date(os.faturamentoCriadoEm as string) : new Date();
  const parcelasRaw = (os as { faturamentoParcelas?: unknown }).faturamentoParcelas;
  const parcelas = Array.isArray(parcelasRaw) ? parcelasRaw : undefined;
  const primeiroVenc = parcelas?.[0] && isRecord(parcelas[0] as unknown) ? safeStr((parcelas[0] as { vencimentoIso?: unknown }).vencimentoIso) : "";
  const venc = primeiroVenc ? new Date(primeiroVenc) : new Date(baseDate);
  if (!primeiroVenc) {
    venc.setDate(venc.getDate() + 30);
  }
  const vencimento = new Intl.DateTimeFormat("pt-BR").format(venc);

  const codigo = safeStr((os as { codigo?: unknown }).codigo);
  const ordemNumero = codigo || `OS-${os.id.slice(-6)}`;
  const descricao = `OS ${ordemNumero} — Faturamento`;

  const modoCobranca = safeStr((os as { faturamentoModoCobranca?: unknown }).faturamentoModoCobranca);
  const formaPagamento = safeStr((os as { faturamentoFormaPagamento?: unknown }).faturamentoFormaPagamento);

  const payload = buildContaReceberPayload({
    origem: FINANCEIRO_ORIGEM.OS,
    ordemServicoId: os.id,
    ordemNumero,
    clienteId: safeStr(os.clienteId),
    clienteNome,
    faturamentoReferencia: getFaturamentoReferenceFromOS(os),
    orcamento: os.orcamento ?? null,
    parcelas: parcelas ?? undefined,
    createdFrom: FINANCEIRO_CREATED_FROM_OPERACOES_HUB_V2,
    statusOperacional: (os.status ?? "") as OSStatus,
    // Política: revisão pós-aprovação (quando aplicável)
    revisadoAposAprovacao: safeStr(os.faturamentoRevisadoEm) ? true : undefined,
    valorAnterior: safeNum(os.faturamentoValorAnterior) || undefined,
    valorNovo: safeNum(os.faturamentoValorAtual) || undefined,
    revisadoEm: safeStr(os.faturamentoRevisadoEm) || undefined,
    orcamentoRevisaoAtual: isRecord(os.orcamentoRevisaoAtual) ? os.orcamentoRevisaoAtual : undefined,
    metadata: {
      ...(modoCobranca ? { modoCobranca } : {}),
      ...(formaPagamento ? { formaPagamento } : {}),
    },
  }) as unknown as Prisma.InputJsonValue;

  const scalars = {
    descricao,
    cliente: clienteNome,
    valor,
    vencimento,
    status: RECEBER_STATUS.PENDENTE,
    payload,
  };

  return {
    storeId: os.storeId,
    localKey,
    create: {
      store: { connect: { id: os.storeId } },
      localKey,
      ...scalars,
    },
    update: {
      ...scalars,
    },
  };
}

export type UpsertContaReceberFromOSResult =
  | { ok: true; action: "created" | "updated"; id: string; localKey: string }
  | { ok: false; reason: "not_faturavel" | "invalid_os"; localKey?: string };

export async function upsertContaReceberFromOS(os: MinimalOS): Promise<UpsertContaReceberFromOSResult> {
  if (!os || !os.id || !os.storeId) return { ok: false, reason: "invalid_os" };
  if (!isOSFaturavel(os)) return { ok: false, reason: "not_faturavel" };

  const { localKey, create, update, storeId } = buildContaReceberFromOS(os);

  const existing = await prisma.contaReceberTitulo.findUnique({
    where: { storeId_localKey: { storeId, localKey } },
    select: { id: true, payload: true },
  });

  if (!existing) {
    const created = await prisma.contaReceberTitulo.create({ data: create, select: { id: true } });
    return { ok: true, action: "created", id: created.id, localKey };
  }

  // Preserva histórico de revisão no payload do título.
  const prevPayloadRaw = existing.payload as unknown;
  const prevPayload = isRecord(prevPayloadRaw) ? prevPayloadRaw : {};
  const nextPayloadRaw = (update as unknown as { payload?: unknown }).payload;
  const nextPayload = isRecord(nextPayloadRaw) ? nextPayloadRaw : {};

  let mergedPayload: Record<string, unknown> = { ...prevPayload, ...nextPayload };

  // Se há revisão pós-aprovação, acumula em `revisoes[]` (dedupe por `revisadoEm`).
  const revisadoEm = safeStr((nextPayload as { revisadoEm?: unknown }).revisadoEm);
  if (revisadoEm) {
    const prevRevs = (prevPayload as { revisoes?: unknown }).revisoes;
    const arr = Array.isArray(prevRevs) ? (prevRevs as Record<string, unknown>[]) : [];
    const entry = {
      revisadoEm,
      valorAnterior: safeNum((nextPayload as { valorAnterior?: unknown }).valorAnterior),
      valorNovo: safeNum((nextPayload as { valorNovo?: unknown }).valorNovo),
      orcamentoRevisaoAtual: isRecord((nextPayload as { orcamentoRevisaoAtual?: unknown }).orcamentoRevisaoAtual)
        ? (nextPayload as { orcamentoRevisaoAtual?: unknown }).orcamentoRevisaoAtual
        : undefined,
    };
    const deduped = [...arr.filter((r) => safeStr((r as { revisadoEm?: unknown }).revisadoEm) !== revisadoEm), entry];
    mergedPayload = { ...mergedPayload, revisoes: deduped };
  }

  const updated = await prisma.contaReceberTitulo.update({
    where: { storeId_localKey: { storeId, localKey } },
    data: { ...(update as Prisma.ContaReceberTituloUpdateInput), payload: mergedPayload as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  return { ok: true, action: "updated", id: updated.id, localKey };
}

export type CancelContaReceberFromOSResult =
  | { ok: true; action: "cancelled" | "noop_not_found"; id?: string; localKey: string }
  | { ok: false; reason: "invalid_os"; localKey?: string };

export async function cancelContaReceberFromOS(params: {
  storeId: string;
  ordemServicoId: string;
  motivo?: string;
}): Promise<CancelContaReceberFromOSResult> {
  const storeId = safeStr(params.storeId);
  const ordemServicoId = safeStr(params.ordemServicoId);
  if (!storeId || !ordemServicoId) return { ok: false, reason: "invalid_os" };

  const localKey = buildContaReceberLocalKey({
    kind: "adapter_os_faturamento",
    storeId,
    ordemServicoId,
  });

  const existing = await prisma.contaReceberTitulo.findUnique({
    where: { storeId_localKey: { storeId, localKey } },
    select: { id: true, payload: true },
  });
  if (!existing) return { ok: true, action: "noop_not_found", localKey };

  const raw = existing.payload as unknown;
  const base = isRecord(raw) ? raw : {};
  const nextPayload = {
    ...base,
    status: RECEBER_STATUS.CANCELADO,
    canceladoEm: new Date().toISOString(),
    ...(safeStr(params.motivo) ? { motivo: safeStr(params.motivo) } : {}),
  } satisfies Record<string, unknown>;

  await prisma.contaReceberTitulo.update({
    where: { storeId_localKey: { storeId, localKey } },
    data: {
      status: RECEBER_STATUS.CANCELADO,
      payload: nextPayload as unknown as Prisma.InputJsonValue,
    },
  });

  return { ok: true, action: "cancelled", id: existing.id, localKey };
}

