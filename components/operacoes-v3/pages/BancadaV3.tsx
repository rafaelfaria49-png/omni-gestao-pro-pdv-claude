"use client";

import { useMemo } from "react";
import { Hammer, User } from "lucide-react";
import { SectionShellV3 } from "../components/SectionShellV3";
import { OSCardV3 } from "../components/OSCardV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { agruparPorTecnico } from "../lib/os-derive";

export function BancadaV3() {
  const { ordens, loading, primeiraCarga, storeId, openOS } = useOperacoesV3();
  const grupos = useMemo(() => agruparPorTecnico(ordens), [ordens]);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.bancada.titulo} subtitulo={SCREEN_COPY.bancada.subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  return (
    <SectionShellV3 titulo={SCREEN_COPY.bancada.titulo} subtitulo={SCREEN_COPY.bancada.subtitulo}>
      {primeiraCarga && loading ? (
        <LoadingBlockV3 />
      ) : grupos.length === 0 ? (
        <EmptyStateV3
          icon={<Hammer className="h-8 w-8" />}
          titulo="Nenhuma OS ativa na bancada"
          descricao="OS entregues ou canceladas não aparecem aqui. Assim que houver trabalho em andamento, ele se agrupa por técnico."
        />
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.tecnicoId}>
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-4 w-4" aria-hidden />
                </span>
                <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{g.tecnicoNome}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {g.ordens.length} OS
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.ordens.map((os) => (
                  <OSCardV3 key={os.id} os={os} onOpen={openOS} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </SectionShellV3>
  );
}
