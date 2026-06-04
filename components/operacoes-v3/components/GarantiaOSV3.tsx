"use client";

// ============================================================================
// Operações V3 — Fase 1E · Garantia da OS (aba): tipo/prazo/validade/situação +
// sugestão automática por serviço + edição (salva no payload) + imprimir termo.
// Leitura: garantia efetiva (os.garantia/garantiasOperacionais) e a garantia
// PREVISTA da abertura (aberturaV3.garantiaPrevista). Preparada p/ renovação.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, Save, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import {
  GARANTIA_CATALOGO_V3,
  garantiaCatalogoV3,
  prazoPadraoGarantiaV3,
} from "@/lib/operacoes-v3/garantia-textos";
import { sugerirGarantiaDaOSV3 } from "@/lib/operacoes-v3/print-model";
import { ButtonV3 } from "./UiV3";
import { formatData } from "../lib/format";

type Situacao = "ativa" | "expirada" | "prevista" | "sem";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function lerGarantiaPrevista(os: OrdemServico): { modelo?: string; prazoDias?: number; termo?: string } {
  const g = (os as { aberturaV3?: { garantiaPrevista?: { modelo?: unknown; prazoDias?: unknown; termo?: unknown } } }).aberturaV3?.garantiaPrevista;
  if (!g) return {};
  return {
    modelo: typeof g.modelo === "string" ? g.modelo : undefined,
    prazoDias: typeof g.prazoDias === "number" ? g.prazoDias : undefined,
    termo: typeof g.termo === "string" ? g.termo : undefined,
  };
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

const SITUACAO_META: Record<Situacao, { label: string; cls: string }> = {
  ativa: { label: "Ativa", cls: "border-success/30 bg-success/10 text-success" },
  expirada: { label: "Expirada", cls: "border-warning/30 bg-warning/10 text-warning" },
  prevista: { label: "Prevista", cls: "border-info/30 bg-info/10 text-info" },
  sem: { label: "Sem garantia", cls: "border-border bg-muted text-muted-foreground" },
};

export function GarantiaOSV3({
  os,
  storeId,
  onChanged,
  onImprimirTermo,
  salvarGarantia,
  pending,
  notificar,
}: {
  os: OrdemServico;
  storeId: string | null;
  onChanged: () => void;
  onImprimirTermo: () => void;
  salvarGarantia: (input: { modeloId: string; prazoDias?: number }) => Promise<boolean>;
  pending: boolean;
  notificar: (msg: string) => void;
}) {
  const prevista = useMemo(() => lerGarantiaPrevista(os), [os]);
  const sugestao = useMemo(() => sugerirGarantiaDaOSV3(os), [os]);
  const g = os.garantia;
  const operacionais = os.garantiasOperacionais ?? [];

  const [modeloId, setModeloId] = useState(prevista.modelo ?? "sem_garantia");
  const [prazoDias, setPrazoDias] = useState<number>(prevista.prazoDias ?? prazoPadraoGarantiaV3(prevista.modelo));
  const [dirty, setDirty] = useState(false);

  const editKey = `${os.id}:${os.atualizadoEm ?? ""}`;
  useEffect(() => {
    setModeloId(prevista.modelo ?? "sem_garantia");
    setPrazoDias(prevista.prazoDias ?? prazoPadraoGarantiaV3(prevista.modelo));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey]);

  // Situação efetiva
  let situacao: Situacao = "sem";
  let inicio: string | undefined;
  let fim: string | undefined;
  const opAtiva = operacionais.find((o) => o.status === "ativa");
  if (g?.ativa || opAtiva) {
    inicio = g?.inicioEm ?? opAtiva?.dataInicio;
    fim = g?.fimEm ?? opAtiva?.dataFim;
    const fimMs = fim ? Date.parse(fim) : NaN;
    situacao = Number.isFinite(fimMs) && fimMs < Date.now() ? "expirada" : "ativa";
  } else if (prevista.modelo && prevista.modelo !== "sem_garantia") {
    situacao = "prevista";
  }
  const meta = SITUACAO_META[situacao];
  const modeloLabel = garantiaCatalogoV3(modeloId).titulo;

  const aplicarModelo = (id: string) => {
    setModeloId(id);
    setPrazoDias(prazoPadraoGarantiaV3(id));
    setDirty(true);
  };

  const aplicarSugestao = () => {
    if (!sugestao) return;
    aplicarModelo(sugestao);
  };

  const onSalvar = async () => {
    if (!storeId) {
      notificar("Selecione uma unidade ativa.");
      return;
    }
    const ok = await salvarGarantia({ modeloId, prazoDias });
    if (ok) {
      setDirty(false);
      onChanged();
      notificar("Garantia salva.");
    }
  };

  return (
    <section id="garantia" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </span>
          <h3 className="truncate text-sm font-semibold text-foreground">Garantia da OS</h3>
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.cls)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {meta.label}
          </span>
        </div>
        <ButtonV3 variant="outline" onClick={onImprimirTermo}>
          <Printer className="h-4 w-4" aria-hidden /> Imprimir termo
        </ButtonV3>
      </div>

      <div className="space-y-3 px-4 py-4">
        {sugestao && sugestao !== modeloId ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="min-w-0 text-xs text-foreground">
              <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" aria-hidden />
              Sugestão pelo serviço: <strong>{garantiaCatalogoV3(sugestao).titulo}</strong>
            </p>
            <ButtonV3 variant="subtle" className="shrink-0 px-2 py-1 text-xs" onClick={aplicarSugestao}>
              Aplicar sugestão
            </ButtonV3>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Modelo de garantia</span>
            <select className={inputCls} value={modeloId} onChange={(e) => aplicarModelo(e.target.value)}>
              {GARANTIA_CATALOGO_V3.map((m) => (
                <option key={m.id} value={m.id}>{m.titulo}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Prazo (dias)</span>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={prazoDias}
              onChange={(e) => { setPrazoDias(Math.max(0, Math.trunc(Number(e.target.value) || 0))); setDirty(true); }}
            />
          </label>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          <KV label="Tipo" value={modeloLabel} />
          <KV label="Prazo" value={prazoDias > 0 ? `${prazoDias} dias` : "Sem cobertura"} />
          <KV label="Validade" value={fim ? formatData(fim) : situacao === "prevista" ? "A partir da entrega" : "—"} />
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonV3 variant="primary" disabled={pending || !dirty} onClick={onSalvar}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Salvar garantia
          </ButtonV3>
          {dirty ? (
            <ButtonV3 variant="ghost" disabled={pending} onClick={() => { setModeloId(prevista.modelo ?? "sem_garantia"); setPrazoDias(prevista.prazoDias ?? prazoPadraoGarantiaV3(prevista.modelo)); setDirty(false); }}>
              Descartar
            </ButtonV3>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">A garantia é prevista agora e passa a valer na entrega. Renovação/retorno chegam em fase futura.</p>
      </div>
    </section>
  );
}
