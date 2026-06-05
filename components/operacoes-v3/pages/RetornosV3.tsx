"use client";

// ============================================================================
// Operações V3 — Fase 3A · Retornos & retrabalho (histórico real)
// ----------------------------------------------------------------------------
// Agrega os retornos de todas as OS da unidade (por OS e por cliente), com
// motivo, datas e status. KPIs: total, abertos e taxa de retorno.
// ============================================================================

import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { SectionShellV3 } from "../components/SectionShellV3";
import { MetricCardV3 } from "../components/MetricCardV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatDataHora } from "../lib/format";
import { kpisPosVendaV3, lerRetornosV3, RETORNO_STATUS_META_V3, type RetornoV3 } from "@/lib/operacoes-v3/pos-venda-model";

type LinhaRetorno = { retorno: RetornoV3; os: OrdemServico };

export function RetornosV3() {
  const { ordens, loading, primeiraCarga, storeId, openOS } = useOperacoesV3();

  const { linhas, kpis } = useMemo(() => {
    const acc: LinhaRetorno[] = [];
    for (const os of ordens) {
      for (const retorno of lerRetornosV3(os)) acc.push({ retorno, os });
    }
    acc.sort((a, b) => Date.parse(b.retorno.criadoEm || "") - Date.parse(a.retorno.criadoEm || ""));
    return { linhas: acc, kpis: kpisPosVendaV3(ordens) };
  }, [ordens]);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.retornos.titulo} subtitulo={SCREEN_COPY.retornos.subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  return (
    <SectionShellV3 titulo={SCREEN_COPY.retornos.titulo} subtitulo={SCREEN_COPY.retornos.subtitulo}>
      {primeiraCarga && loading ? (
        <LoadingBlockV3 />
      ) : linhas.length === 0 ? (
        <EmptyStateV3
          icon={<RotateCcw className="h-8 w-8" />}
          titulo="Nenhum retorno registrado"
          descricao="Quando um aparelho voltar em garantia, abra o retorno no prontuário da OS — o histórico e a taxa de retorno aparecem aqui."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCardV3 label="Total de retornos" value={kpis.totalRetornos} tone="neutral" icon={<RotateCcw className="h-4 w-4" />} />
            <MetricCardV3 label="Em aberto" value={kpis.retornosAbertos} tone="warning" />
            <MetricCardV3 label="OS com retorno" value={kpis.osComRetorno} tone="info" />
            <MetricCardV3 label="Taxa de retorno" value={`${kpis.taxaRetorno}%`} hint="OS com retorno ÷ OS entregues" tone="neutral" />
          </div>

          <ul className="space-y-2">
            {linhas.map(({ retorno, os }) => {
              const m = RETORNO_STATUS_META_V3[retorno.status];
              return (
                <li key={retorno.id}>
                  <button
                    type="button"
                    onClick={() => openOS(os.id)}
                    className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-border-hover hover:bg-muted/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {os.codigo} · {os.cliente?.nome ?? "Cliente"}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          m.tone === "warning" ? "border-warning/30 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success"
                        }`}
                      >
                        {m.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-foreground">{retorno.motivo}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {[os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ") || os.equipamento?.tipo || "Equipamento"}
                      {" · aberto "}
                      {formatDataHora(retorno.criadoEm)}
                      {retorno.criadoPor ? ` · ${retorno.criadoPor}` : ""}
                      {retorno.garantiaAtivaNaAbertura === false ? " · garantia não ativa" : ""}
                      {retorno.status === "finalizado" && retorno.finalizadoEm ? ` · finalizado ${formatDataHora(retorno.finalizadoEm)}` : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionShellV3>
  );
}
