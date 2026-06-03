"use client";

import { useMemo } from "react";
import { ShieldCheck, ShieldX } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { SectionShellV3 } from "../components/SectionShellV3";
import { MetricCardV3 } from "../components/MetricCardV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatData } from "../lib/format";
import { isGarantiaAtiva } from "../lib/os-derive";

const DIAS_VENCENDO = 15;

type GarantiaClasse = "ativa" | "vencendo" | "expirada" | "nenhuma";

function garantiaFim(os: OrdemServico): string | null {
  return os.garantia?.fimEm ?? os.garantiasOperacionais?.[0]?.dataFim ?? null;
}
function garantiaPrazo(os: OrdemServico): number | null {
  return os.garantia?.prazoDias ?? os.garantiasOperacionais?.[0]?.prazoDias ?? null;
}
function temGarantia(os: OrdemServico): boolean {
  return Boolean(os.garantia?.ativa || os.garantia?.fimEm || (os.garantiasOperacionais?.length ?? 0) > 0);
}

function classifica(os: OrdemServico): GarantiaClasse {
  if (!temGarantia(os)) return "nenhuma";
  if (isGarantiaAtiva(os)) {
    const fim = garantiaFim(os);
    if (fim) {
      const dias = (new Date(fim).getTime() - Date.now()) / 86400000;
      if (!Number.isNaN(dias) && dias <= DIAS_VENCENDO) return "vencendo";
    }
    return "ativa";
  }
  return "expirada";
}

function GarantiaCard({ os, onOpen }: { os: OrdemServico; onOpen: (id: string) => void }) {
  const prazo = garantiaPrazo(os);
  const fim = garantiaFim(os);
  return (
    <button
      type="button"
      onClick={() => onOpen(os.id)}
      className="w-full min-w-0 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-border-hover hover:bg-muted/30"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{os.codigo}</span>
        {prazo ? <span className="shrink-0 text-xs text-muted-foreground">{prazo} dias</span> : null}
      </div>
      <p className="mt-1 truncate text-sm text-foreground">{os.cliente?.nome ?? "Cliente não identificado"}</p>
      <p className="truncate text-xs text-muted-foreground">
        {[os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ") || os.equipamento?.tipo || "Equipamento"}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">Válida até {formatData(fim)}</p>
    </button>
  );
}

function Segmento({
  titulo,
  ordens,
  onOpen,
  vazio,
}: {
  titulo: string;
  ordens: OrdemServico[];
  onOpen: (id: string) => void;
  vazio: string;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">
        {titulo} <span className="text-muted-foreground">({ordens.length})</span>
      </h3>
      {ordens.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ordens.map((os) => (
            <GarantiaCard key={os.id} os={os} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground">
          {vazio}
        </p>
      )}
    </section>
  );
}

export function GarantiasV3() {
  const { ordens, loading, primeiraCarga, storeId, openOS } = useOperacoesV3();

  const seg = useMemo(() => {
    const ativas: OrdemServico[] = [];
    const vencendo: OrdemServico[] = [];
    const expiradas: OrdemServico[] = [];
    for (const os of ordens) {
      const c = classifica(os);
      if (c === "ativa") ativas.push(os);
      else if (c === "vencendo") vencendo.push(os);
      else if (c === "expirada") expiradas.push(os);
    }
    return { ativas, vencendo, expiradas };
  }, [ordens]);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.garantias.titulo} subtitulo={SCREEN_COPY.garantias.subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  const totalComGarantia = seg.ativas.length + seg.vencendo.length + seg.expiradas.length;

  return (
    <SectionShellV3 titulo={SCREEN_COPY.garantias.titulo} subtitulo={SCREEN_COPY.garantias.subtitulo}>
      {primeiraCarga && loading ? (
        <LoadingBlockV3 />
      ) : totalComGarantia === 0 ? (
        <EmptyStateV3
          icon={<ShieldX className="h-8 w-8" />}
          titulo="Nenhuma garantia registrada"
          descricao="Quando uma OS for entregue com garantia, ela aparece aqui segmentada por validade."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <MetricCardV3 label="Ativas" value={seg.ativas.length} tone="success" icon={<ShieldCheck className="h-4 w-4" />} />
            <MetricCardV3 label="Vencendo (≤15d)" value={seg.vencendo.length} tone="warning" />
            <MetricCardV3 label="Expiradas" value={seg.expiradas.length} tone="neutral" />
          </div>
          <Segmento titulo="Ativas" ordens={seg.ativas} onOpen={openOS} vazio="Nenhuma garantia ativa." />
          <Segmento titulo="Vencendo em breve" ordens={seg.vencendo} onOpen={openOS} vazio="Nada vencendo nos próximos 15 dias." />
          <Segmento titulo="Expiradas" ordens={seg.expiradas} onOpen={openOS} vazio="Nenhuma garantia expirada." />
        </div>
      )}
    </SectionShellV3>
  );
}
