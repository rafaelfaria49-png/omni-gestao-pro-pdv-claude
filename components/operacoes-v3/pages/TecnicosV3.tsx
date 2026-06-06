"use client";

// ============================================================================
// Operações V3 — Fase 3B · Técnicos (métricas reais de carga/produção)
// ----------------------------------------------------------------------------
// Total atribuídas, em execução, prontas, atrasadas e entregues hoje — tudo real
// (contagem de OS). Sem comissão e sem tempo médio nesta fase.
// ============================================================================

import { useMemo } from "react";
import { Users } from "lucide-react";
import { SectionShellV3 } from "../components/SectionShellV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { ButtonV3 } from "../components/UiV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { metricasPorTecnicoV3 } from "@/lib/operacoes-v3/producao-model";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-lg bg-muted/40 py-2 text-center">
      <p className={`text-lg font-semibold tabular-nums ${tone === "danger" && value > 0 ? "text-destructive" : "text-foreground"}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function TecnicosV3() {
  const { ordens, loading, primeiraCarga, storeId, navigate } = useOperacoesV3();
  const tecnicos = useMemo(() => metricasPorTecnicoV3(ordens), [ordens]);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.tecnicos.titulo} subtitulo={SCREEN_COPY.tecnicos.subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  return (
    <SectionShellV3 titulo={SCREEN_COPY.tecnicos.titulo} subtitulo={SCREEN_COPY.tecnicos.subtitulo}>
      {primeiraCarga && loading ? (
        <LoadingBlockV3 />
      ) : tecnicos.length === 0 ? (
        <EmptyStateV3
          icon={<Users className="h-8 w-8" />}
          titulo="Nenhuma OS para resumir por técnico"
          descricao="A carga de trabalho da equipe aparece aqui assim que houver OS cadastradas."
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Métricas <strong>reais</strong> (contagem de OS). Tempo médio e comissão ficam <strong>a conectar</strong>.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tecnicos.map((t) => (
              <div key={t.tecnicoId} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${t.semTecnico ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}
                  >
                    <Users className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{t.tecnicoNome}</h3>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Stat label="Atribuídas" value={t.totalAtribuidas} />
                  <Stat label="Em execução" value={t.emExecucao} />
                  <Stat label="Prontas" value={t.prontas} />
                  <Stat label="Atrasadas" value={t.atrasadas} tone="danger" />
                  <Stat label="Entregues hoje" value={t.entreguesHoje} />
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 px-1 text-center text-[10px] text-muted-foreground">
                    Tempo médio: a conectar
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <ButtonV3 variant="ghost" onClick={() => navigate("bancada")}>
                    Ver bancada
                  </ButtonV3>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionShellV3>
  );
}
