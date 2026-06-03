"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { SectionShellV3 } from "../components/SectionShellV3";
import { ConstructionBadgeV3 } from "../components/ConstructionBadgeV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { ButtonV3 } from "../components/UiV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";

interface TecnicoResumo {
  id: string;
  nome: string;
  total: number;
  ativas: number;
  entregues: number;
}

function resumirTecnicos(ordens: OrdemServico[]): TecnicoResumo[] {
  const map = new Map<string, TecnicoResumo>();
  for (const os of ordens) {
    const id = os.tecnico?.id ?? "__sem_tecnico__";
    const nome = os.tecnico?.nome ?? "Sem técnico atribuído";
    const r = map.get(id) ?? { id, nome, total: 0, ativas: 0, entregues: 0 };
    r.total += 1;
    if (os.status === "entregue") r.entregues += 1;
    else if (os.status !== "cancelada") r.ativas += 1;
    map.set(id, r);
  }
  return [...map.values()].sort((a, b) => b.ativas - a.ativas);
}

export function TecnicosV3() {
  const { ordens, loading, primeiraCarga, storeId, navigate } = useOperacoesV3();
  const tecnicos = useMemo(() => resumirTecnicos(ordens), [ordens]);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.tecnicos.titulo} subtitulo={SCREEN_COPY.tecnicos.subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  return (
    <SectionShellV3
      titulo={SCREEN_COPY.tecnicos.titulo}
      subtitulo={SCREEN_COPY.tecnicos.subtitulo}
      badge={<ConstructionBadgeV3 variant="conectar" label="Produtividade a conectar" />}
    >
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
            Carga de trabalho é <strong>real</strong> (contagem de OS). Métricas de tempo/produtividade ficam
            <strong> a conectar</strong> — não exibimos números de tempo estimados.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tecnicos.map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Users className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{t.nome}</h3>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 py-2">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{t.ativas}</p>
                    <p className="text-[11px] text-muted-foreground">Ativas</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 py-2">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{t.entregues}</p>
                    <p className="text-[11px] text-muted-foreground">Entregues</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 py-2">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{t.total}</p>
                    <p className="text-[11px] text-muted-foreground">Total</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="inline-flex items-center rounded-md border border-dashed border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                    Tempo médio: a conectar
                  </span>
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
