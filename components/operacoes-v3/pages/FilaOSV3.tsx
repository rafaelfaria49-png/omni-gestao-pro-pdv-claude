"use client";

import { useMemo, useState } from "react";
import { CalendarRange, KanbanSquare, Search, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE } from "@/types/os";
import type { OSStatus } from "@/types/os";
import { SectionShellV3 } from "../components/SectionShellV3";
import { OSCardV3 } from "../components/OSCardV3";
import { StatusBadgeV3 } from "../components/StatusBadgeV3";
import { PaymentBadgeV3 } from "../components/PaymentBadgeV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { ConstructionBadgeV3 } from "../components/ConstructionBadgeV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatBRL, formatRelativo } from "../lib/format";
import { matchOrdem, orcamentoTotal, pagamentoInfo } from "../lib/os-derive";

type Tab = "kanban" | "lista" | "calendario";

const TABS: { id: Tab; label: string; icon: typeof KanbanSquare }[] = [
  { id: "kanban", label: "Kanban", icon: KanbanSquare },
  { id: "lista", label: "Lista", icon: Table2 },
  { id: "calendario", label: "Calendário", icon: CalendarRange },
];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function FilaOSV3() {
  const { ordens, loading, primeiraCarga, storeId, openOS } = useOperacoesV3();
  const [tab, setTab] = useState<Tab>("kanban");
  const [q, setQ] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<OSStatus | "todas">("todas");

  const filtradas = useMemo(() => ordens.filter((o) => matchOrdem(o, q)), [ordens, q]);
  const listadas = useMemo(
    () => filtradas.filter((o) => statusFiltro === "todas" || o.status === statusFiltro),
    [filtradas, statusFiltro],
  );

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.fila.titulo} subtitulo={SCREEN_COPY.fila.subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  const tabs = (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {TABS.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              tab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <SectionShellV3 titulo={SCREEN_COPY.fila.titulo} subtitulo={SCREEN_COPY.fila.subtitulo} actions={tabs}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            className={cn(inputCls, "pl-9")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por OS, cliente, aparelho, técnico…"
          />
        </div>
        {tab === "lista" ? (
          <select
            className={cn(inputCls, "w-auto")}
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value as OSStatus | "todas")}
          >
            <option value="todas">Todos os status</option>
            {PIPELINE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-xs text-muted-foreground">{filtradas.length} OS</span>
      </div>

      {primeiraCarga && loading ? (
        <LoadingBlockV3 />
      ) : tab === "kanban" ? (
        <KanbanView ordens={filtradas} onOpen={openOS} />
      ) : tab === "lista" ? (
        <ListaView ordens={listadas} onOpen={openOS} />
      ) : (
        <EmptyStateV3
          icon={<CalendarRange className="h-8 w-8" />}
          titulo="Calendário em construção"
          descricao="A visão de agenda por dia/técnico chega numa fase futura — sem datas fictícias aqui."
          acao={<ConstructionBadgeV3 />}
        />
      )}
    </SectionShellV3>
  );
}

function KanbanView({
  ordens,
  onOpen,
}: {
  ordens: ReturnType<typeof useOperacoesV3>["ordens"];
  onOpen: (id: string) => void;
}) {
  const colunas = PIPELINE.filter((p) => p.id !== "cancelada");
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Arrastar para mudar status chega na próxima fase — aqui as colunas são somente leitura.
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunas.map((col) => {
          const cards = ordens.filter((o) => o.status === col.id);
          return (
            <div key={col.id} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/20">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <span className="truncate text-sm font-semibold text-foreground">{col.label}</span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">{cards.length}</span>
              </div>
              <div className="min-h-[80px] space-y-2 p-2">
                {cards.length > 0 ? (
                  cards.map((os) => <OSCardV3 key={os.id} os={os} onOpen={onOpen} />)
                ) : (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListaView({
  ordens,
  onOpen,
}: {
  ordens: ReturnType<typeof useOperacoesV3>["ordens"];
  onOpen: (id: string) => void;
}) {
  if (ordens.length === 0) {
    return (
      <EmptyStateV3
        icon={<Table2 className="h-8 w-8" />}
        titulo="Nenhuma OS para este filtro"
        descricao="Ajuste a busca ou o status para ver resultados."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">OS</th>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Equipamento</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Pagamento</th>
            <th className="px-3 py-2 font-medium">Técnico</th>
            <th className="px-3 py-2 text-right font-medium">Prazo</th>
            <th className="px-3 py-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {ordens.map((os) => {
            const pag = pagamentoInfo(os);
            const equip =
              [os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ").trim() ||
              os.equipamento?.tipo ||
              "—";
            return (
              <tr
                key={os.id}
                onClick={() => onOpen(os.id)}
                className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2 font-medium text-foreground">{os.codigo}</td>
                <td className="max-w-[160px] truncate px-3 py-2 text-foreground">{os.cliente?.nome ?? "—"}</td>
                <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">{equip}</td>
                <td className="px-3 py-2"><StatusBadgeV3 status={os.status} /></td>
                <td className="px-3 py-2"><PaymentBadgeV3 estado={pag.estado} showValor={false} /></td>
                <td className="max-w-[120px] truncate px-3 py-2 text-muted-foreground">{os.tecnico?.nome ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">
                  {os.sla?.prazo ? formatRelativo(os.sla.prazo) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-foreground">
                  {orcamentoTotal(os) > 0 ? formatBRL(orcamentoTotal(os)) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
