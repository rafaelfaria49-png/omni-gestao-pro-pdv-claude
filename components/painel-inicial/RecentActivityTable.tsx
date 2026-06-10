"use client";

import Link from "next/link";
import { ArrowUpRight, CircleDot, ShoppingBag, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DemoBadge } from "@/components/painel-inicial/DemoBadge";
import type { DashboardEliteMovimento } from "@/hooks/use-dashboard-elite";
import { Spinner } from "@/components/ui/spinner";

type DemoRow = {
  id: string;
  type: "venda" | "os";
  client: string;
  desc: string;
  value: string;
  time: string;
};

const DEMO_ROWS: DemoRow[] = [
  {
    id: "V-2841",
    type: "venda",
    client: "Marcos Almeida",
    desc: "Venda registrada",
    value: "R$ 4.890,00",
    time: "agora",
  },
  {
    id: "OS-1132",
    type: "os",
    client: "Padaria Bela Vista",
    desc: "Ordem de serviço",
    value: "R$ 1.250,00",
    time: "12 min",
  },
];

const fmtBrl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function formatRelativePtBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 60_000) return "agora";
  if (diffMs < 3_600_000) {
    const min = Math.floor(diffMs / 60_000);
    return `há ${min} min`;
  }
  if (diffMs < 86_400_000) {
    const h = Math.floor(diffMs / 3_600_000);
    return `há ${h} h`;
  }
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Ontem, ${time}`;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kindMeta(kind: DashboardEliteMovimento["kind"] | string): {
  icon: LucideIcon;
  label: string;
  badgeClass: string;
  iconBoxClass: string;
} {
  if (kind === "venda") {
    return {
      icon: ShoppingBag,
      label: "Venda",
      badgeClass: "bg-success/10 text-success border-success/20",
      iconBoxClass: "bg-muted border-border text-foreground",
    };
  }
  if (kind === "os") {
    return {
      icon: Wrench,
      label: "OS",
      badgeClass: "bg-primary/10 text-primary border-primary/30",
      iconBoxClass: "bg-accent border-border text-accent-foreground",
    };
  }
  return {
    icon: CircleDot,
    label: "Outro",
    badgeClass: "bg-muted text-muted-foreground border-border",
    iconBoxClass: "bg-muted border-border text-muted-foreground",
  };
}

function shortId(id: string, kind: string): string {
  const s = id.trim();
  if (!s) return "—";
  if (kind === "venda") return s.length > 8 ? `V-${s.slice(0, 6)}…` : s;
  if (kind === "os") return s.length > 8 ? `OS-${s.slice(0, 6)}…` : s;
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
}

type RecentActivityTableProps = {
  movimentos?: DashboardEliteMovimento[];
  loading?: boolean;
  /** Quando true, usa apenas dados da API (sem demo). */
  useLiveData?: boolean;
  /** Exibe linhas de exemplo quando não está em modo ao vivo. */
  showDemoPreview?: boolean;
  hasStore?: boolean;
  error?: string | null;
  /** API carregada com sucesso (exibe selo Ao vivo). */
  isConnected?: boolean;
};

export function RecentActivityTable({
  movimentos,
  loading = false,
  useLiveData = false,
  showDemoPreview = false,
  hasStore = true,
  error = null,
  isConnected = false,
}: RecentActivityTableProps) {
  const showDemo = showDemoPreview && !useLiveData && !loading;
  const liveRows = useLiveData ? (movimentos ?? []) : [];
  const isEmptyLive = useLiveData && !loading && hasStore && !error && liveRows.length === 0;
  const failedLive = useLiveData && !loading && hasStore && Boolean(error);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-border gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-semibold text-[14px] tracking-tight">Atividades Recentes</h3>
            {showDemo ? <DemoBadge>Exemplo</DemoBadge> : null}
            {isConnected && !loading ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Ao vivo</span>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {showDemo
              ? "Pré-visualização — dados fictícios"
              : useLiveData
                ? "Últimas vendas e ordens de serviço da unidade"
                : "Aguardando dados da unidade"}
          </p>
        </div>
        <Link
          href="/dashboard/vendas-arquivo-geral"
          className="shrink-0 text-[11.5px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
        >
          Histórico de vendas <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && useLiveData ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground" role="status">
          <Spinner className="size-5 text-primary" />
          <p className="text-sm">Carregando atividades…</p>
        </div>
      ) : !hasStore && useLiveData ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground" role="status">
          Selecione uma unidade para ver as atividades recentes.
        </div>
      ) : failedLive ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground" role="alert">
          <p className="font-medium text-foreground">Atividades indisponíveis</p>
          <p className="mt-1 text-xs">Use &quot;Atualizar&quot; no topo do painel para tentar novamente.</p>
        </div>
      ) : isEmptyLive ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground" role="status">
          <p className="font-medium text-foreground">Nenhuma movimentação recente</p>
          <p className="mt-1 text-xs">Vendas e OS aparecerão aqui conforme forem registradas.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {(showDemo ? DEMO_ROWS : liveRows).map((row) => {
            if (showDemo) {
              const r = row as DemoRow;
              const meta = kindMeta(r.type);
              const Icon = meta.icon;
              return (
                <div
                  key={r.id}
                  className="px-4 py-2 flex items-center gap-3 transition-colors"
                  aria-disabled
                >
                  <div
                    className={[
                      "h-7 w-7 rounded-md grid place-items-center shrink-0 border",
                      meta.iconBoxClass,
                    ].join(" ")}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] truncate">{r.client}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{r.id}</span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                      {r.desc} <span className="text-muted-foreground/70">· exemplo</span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${meta.badgeClass}`}
                  >
                    {meta.label}
                  </span>
                  <div className="text-right shrink-0 w-24">
                    <div className="font-display font-semibold text-[12.5px] tabular-nums">{r.value}</div>
                    <div className="text-[10.5px] text-muted-foreground">{r.time}</div>
                  </div>
                </div>
              );
            }

            const m = row as DashboardEliteMovimento;
            const meta = kindMeta(m.kind);
            const Icon = meta.icon;
            const desc =
              m.kind === "venda"
                ? "Venda registrada"
                : m.kind === "os"
                  ? "Ordem de serviço"
                  : "Movimentação";
            const href =
              m.kind === "venda"
                ? "/dashboard/vendas-arquivo-geral"
                : m.kind === "os"
                  ? "/dashboard/operacoes-v3"
                  : null;
            const content = (
              <>
                <div
                  className={[
                    "h-7 w-7 rounded-md grid place-items-center shrink-0 border",
                    meta.iconBoxClass,
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px] truncate">{m.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {shortId(m.id, m.kind)}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">{desc}</div>
                </div>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${meta.badgeClass}`}
                >
                  {meta.label}
                </span>
                <div className="text-right shrink-0 w-24">
                  <div className="font-display font-semibold text-[12.5px] tabular-nums">
                    {fmtBrl(m.value)}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">{formatRelativePtBr(m.at)}</div>
                </div>
              </>
            );

            if (href) {
              return (
                <Link
                  key={`${m.kind}-${m.id}`}
                  href={href}
                  className="px-4 py-2 flex items-center gap-3 hover:bg-muted/40 transition-colors"
                  title={`Abrir ${m.kind === "venda" ? "histórico de vendas" : "Operações"}`}
                >
                  {content}
                </Link>
              );
            }
            return (
              <div
                key={`${m.kind}-${m.id}`}
                className="px-4 py-2 flex items-center gap-3 transition-colors"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
