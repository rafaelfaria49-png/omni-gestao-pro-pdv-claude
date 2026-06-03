"use client";

import { useMemo, useState } from "react";
import { ChevronRight, History, Phone, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionShellV3 } from "../components/SectionShellV3";
import { StatusBadgeV3 } from "../components/StatusBadgeV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatBRL, formatData } from "../lib/format";
import { agruparPorCliente, matchOrdem, orcamentoTotal } from "../lib/os-derive";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function HistoricoClientesV3() {
  const { ordens, loading, primeiraCarga, storeId, openOS } = useOperacoesV3();
  const [q, setQ] = useState("");

  const grupos = useMemo(() => {
    const filtradas = q.trim() ? ordens.filter((o) => matchOrdem(o, q)) : ordens;
    return agruparPorCliente(filtradas);
  }, [ordens, q]);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.historico.titulo} subtitulo={SCREEN_COPY.historico.subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  return (
    <SectionShellV3 titulo={SCREEN_COPY.historico.titulo} subtitulo={SCREEN_COPY.historico.subtitulo}>
      <div className="mb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            className={inputCls}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente, telefone, aparelho ou OS…"
          />
        </div>
      </div>

      {primeiraCarga && loading ? (
        <LoadingBlockV3 />
      ) : grupos.length === 0 ? (
        <EmptyStateV3
          icon={<History className="h-8 w-8" />}
          titulo={q.trim() ? "Nenhum resultado" : "Sem histórico ainda"}
          descricao={q.trim() ? "Tente outro termo de busca." : "O histórico por cliente aparece conforme as OS são criadas."}
        />
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => (
            <div key={g.clienteId} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{g.clienteNome}</p>
                    {g.telefone ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" aria-hidden /> {g.telefone}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{g.ordens.length} OS</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">{formatBRL(g.totalEstimado)}</p>
                </div>
              </div>

              <ul className="mt-3 divide-y divide-border/60">
                {g.ordens.slice(0, 5).map((os) => (
                  <li key={os.id}>
                    <button
                      type="button"
                      onClick={() => openOS(os.id)}
                      className="flex w-full items-center gap-2 py-2 text-left hover:bg-muted/30"
                    >
                      <span className="w-24 shrink-0 truncate text-xs font-medium text-foreground">{os.codigo}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {[os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ") ||
                          os.equipamento?.tipo ||
                          "Equipamento"}
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{formatData(os.criadoEm)}</span>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                        {orcamentoTotal(os) > 0 ? formatBRL(orcamentoTotal(os)) : "—"}
                      </span>
                      <StatusBadgeV3 status={os.status} className="shrink-0" />
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {g.ordens.length > 5 ? (
                <p className={cn("mt-1 text-center text-xs text-muted-foreground")}>+{g.ordens.length - 5} OS anteriores</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SectionShellV3>
  );
}
