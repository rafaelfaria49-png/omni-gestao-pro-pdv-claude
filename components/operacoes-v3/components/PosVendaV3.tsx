"use client";

// ============================================================================
// Operações V3 — Fase 3A · Seção PÓS-VENDA do Workspace
// ----------------------------------------------------------------------------
// Consolida entrega, garantia, retornos e histórico pós-venda da OS, com ações
// reais (registrar entrega, abrir/finalizar retorno) e impressão do Termo de
// Entrega. Não baixa estoque; não toca Financeiro/V2.
// ============================================================================

import { useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, PackageCheck, Printer, RotateCcw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import { statusV3FromOS } from "@/lib/operacoes-v3/status-machine";
import {
  GARANTIA_SITUACAO_META_V3,
  RETORNO_STATUS_META_V3,
  lerEntregaV3,
  lerGarantiaV3,
  lerRetornosV3,
  retornosDoClienteV3,
} from "@/lib/operacoes-v3/pos-venda-model";
import { ButtonV3 } from "./UiV3";
import { usePosVendaV3 } from "../hooks/use-pos-venda-v3";
import { formatData, formatDataHora } from "../lib/format";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const TONE_CLS: Record<string, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", TONE_CLS[tone] ?? TONE_CLS.neutral)}>
      {children}
    </span>
  );
}

function KV({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

export function PosVendaV3({
  os,
  storeId,
  ordens,
  onChanged,
  notificar,
  onImprimirEntrega,
  onAbrirRetornos,
}: {
  os: OrdemServico;
  storeId: string | null;
  ordens: OrdemServico[];
  onChanged: () => void;
  notificar: (msg: string) => void;
  onImprimirEntrega: () => void;
  onAbrirRetornos: () => void;
}) {
  const { pending, error, entregar, abrirRetorno, finalizarRetorno } = usePosVendaV3(storeId, os.id, onChanged);

  const status = statusV3FromOS(os);
  const entrega = lerEntregaV3(os);
  const garantia = lerGarantiaV3(os);
  const retornos = lerRetornosV3(os);
  const clienteRet = retornosDoClienteV3(ordens, os);
  const gMeta = GARANTIA_SITUACAO_META_V3[garantia.situacao];

  const deliverable = status === "pronta" || status === "recebida";

  const [recebidoPor, setRecebidoPor] = useState("");
  const [obsEntrega, setObsEntrega] = useState("");
  const [motivo, setMotivo] = useState("");

  const onEntregar = async () => {
    const ok = await entregar({ recebidoPor: recebidoPor.trim() || undefined, observacao: obsEntrega.trim() || undefined });
    if (ok) {
      setRecebidoPor("");
      setObsEntrega("");
      notificar("Entrega registrada.");
    }
  };
  const onAbrir = async () => {
    if (!motivo.trim()) return;
    const ok = await abrirRetorno(motivo.trim());
    if (ok) {
      setMotivo("");
      notificar("Retorno aberto.");
    }
  };
  const onFinalizar = async (id: string) => {
    const ok = await finalizarRetorno(id);
    if (ok) notificar("Retorno finalizado.");
  };

  return (
    <div id="pos-venda" className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <PackageCheck className="h-4 w-4 text-primary" aria-hidden /> Pós-venda
        </h3>
        {entrega.entregue ? (
          <ButtonV3 variant="outline" onClick={onImprimirEntrega}>
            <Printer className="h-4 w-4" /> Termo de Entrega
          </ButtonV3>
        ) : null}
      </div>

      {/* ---- Entrega ---- */}
      <section className="mt-3">
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Entrega</h4>
        {entrega.entregue ? (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> Entregue em {formatDataHora(entrega.entregueEm)}
            </p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-3">
              <KV label="Recebido por" value={entrega.recebidoPor} />
              <KV label="Entregue por" value={entrega.entreguePor} />
              <KV label="Observação" value={entrega.observacao} />
            </dl>
          </div>
        ) : deliverable ? (
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="mb-2 text-xs text-muted-foreground">Finalize a OS registrando a entrega ao cliente (Pronta/Recebida → Entregue).</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={inputCls} value={recebidoPor} onChange={(e) => setRecebidoPor(e.target.value)} placeholder={`Recebido por (padrão: ${os.cliente?.nome ?? "cliente"})`} />
              <input className={inputCls} value={obsEntrega} onChange={(e) => setObsEntrega(e.target.value)} placeholder="Observação (opcional)" />
            </div>
            <ButtonV3 variant="primary" className="mt-2" disabled={pending === "entrega"} onClick={onEntregar}>
              {pending === "entrega" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
              Registrar entrega
            </ButtonV3>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            A OS precisa estar <strong>Pronta</strong> ou <strong>Recebida</strong> para registrar a entrega.
          </p>
        )}
      </section>

      {/* ---- Garantia ---- */}
      <section className="mt-4">
        <div className="mb-1 flex items-center gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Garantia</h4>
          <Badge tone={gMeta.tone}><ShieldCheck className="h-3 w-3" /> {gMeta.label}</Badge>
        </div>
        {garantia.situacao === "nenhuma" ? (
          <p className="text-sm text-muted-foreground">Nenhuma garantia definida para esta OS.</p>
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <KV label="Tipo" value={garantia.label} />
            <KV label="Início" value={garantia.inicio ? formatData(garantia.inicio) : garantia.situacao === "prevista" ? "Na entrega" : "—"} />
            <KV label="Vencimento" value={garantia.vencimento ? formatData(garantia.vencimento) : "—"} />
            <KV
              label="Dias restantes"
              value={
                typeof garantia.diasRestantes === "number"
                  ? garantia.diasRestantes >= 0
                    ? `${garantia.diasRestantes} dias`
                    : `vencida há ${Math.abs(garantia.diasRestantes)} dias`
                  : garantia.semCobertura
                    ? "Sem cobertura"
                    : `${garantia.prazoDias} dias (a partir da entrega)`
              }
            />
          </dl>
        )}
      </section>

      {/* ---- Retornos ---- */}
      <section className="mt-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Retornos em garantia ({retornos.length})
          </h4>
          {clienteRet.total > 0 ? (
            <button type="button" onClick={onAbrirRetornos} className="text-[11px] text-primary hover:underline">
              Cliente: {clienteRet.total} retorno(s) em {clienteRet.ordensComRetorno} OS →
            </button>
          ) : null}
        </div>

        {retornos.length > 0 ? (
          <ul className="space-y-1.5">
            {retornos.map((r) => {
              const m = RETORNO_STATUS_META_V3[r.status];
              return (
                <li key={r.id} className="rounded-lg border border-border bg-background p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-sm text-foreground">{r.motivo}</span>
                    <Badge tone={m.tone}>{m.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Aberto {formatDataHora(r.criadoEm)}{r.criadoPor ? ` · ${r.criadoPor}` : ""}
                    {r.garantiaAtivaNaAbertura === false ? " · garantia não ativa" : ""}
                    {r.status === "finalizado" && r.finalizadoEm ? ` · finalizado ${formatDataHora(r.finalizadoEm)}` : ""}
                  </p>
                  {r.status === "aberto" ? (
                    <ButtonV3 variant="outline" className="mt-2" disabled={pending === "finalizar"} onClick={() => onFinalizar(r.id)}>
                      {pending === "finalizar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Finalizar retorno
                    </ButtonV3>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum retorno registrado para esta OS.</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className={cn(inputCls, "max-w-xs")} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo do retorno…" />
          <ButtonV3 variant="subtle" disabled={!motivo.trim() || pending === "retorno"} onClick={onAbrir}>
            {pending === "retorno" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Abrir Retorno
          </ButtonV3>
        </div>
      </section>

      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
