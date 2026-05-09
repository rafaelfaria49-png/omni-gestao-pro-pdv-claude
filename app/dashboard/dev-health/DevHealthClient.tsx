"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { cn } from "@/lib/utils";

type Level = "idle" | "loading" | "ok" | "attention" | "error";

type ProbeResult = {
  level: Level;
  httpStatus: number;
  detail?: string;
  rowCount?: number;
};

const ENDPOINTS = [
  { key: "stores", label: "/api/stores", path: "/api/stores" },
  { key: "prodHealth", label: "/api/debug/prod-health", path: "/api/debug/prod-health" },
  { key: "receber", label: "/api/ops/contas-receber-list", path: "/api/ops/contas-receber-list" },
  { key: "pagar", label: "/api/ops/contas-pagar-list", path: "/api/ops/contas-pagar-list" },
  { key: "ordens", label: "/api/ops/ordens", path: "/api/ops/ordens" },
] as const;

function levelLabel(level: Level): string {
  switch (level) {
    case "loading":
      return "Carregando";
    case "ok":
      return "OK";
    case "attention":
      return "Atenção";
    case "error":
      return "Erro";
    default:
      return "—";
  }
}

function summarizeProbe(
  path: string,
  status: number,
  json: unknown,
): Pick<ProbeResult, "level" | "detail" | "rowCount"> {
  if (status === 0) {
    return { level: "error", detail: "Falha de rede ou resposta vazia" };
  }
  if (status === 401 || status === 403) {
    return {
      level: "attention",
      detail: status === 401 ? "Não autorizado (assinatura/sessão)" : "Assinatura inválida ou sem permissão",
    };
  }
  if (status >= 500) {
    const msg =
      json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `HTTP ${status}`;
    return { level: "error", detail: truncate(msg, 160) };
  }
  if (status >= 400) {
    return { level: "error", detail: `HTTP ${status}` };
  }

  if (!json || typeof json !== "object") {
    return { level: "error", detail: "Resposta não JSON" };
  }

  const o = json as Record<string, unknown>;

  if (path === "/api/stores") {
    const stores = o.stores;
    const n = Array.isArray(stores) ? stores.length : undefined;
    if (Array.isArray(stores)) return { level: "ok", rowCount: n, detail: `${n} loja(s)` };
    return { level: "attention", detail: "JSON sem lista stores" };
  }

  if (path === "/api/debug/prod-health") {
    if (o.ok === true) return { level: "ok", detail: "Banco respondendo" };
    const err = typeof o.error === "string" ? o.error : "ok=false";
    return { level: "error", detail: truncate(err, 160) };
  }

  if (path.includes("contas-receber-list") || path.includes("contas-pagar-list")) {
    if (o.ok === true && Array.isArray(o.rows)) {
      return { level: "ok", rowCount: o.rows.length, detail: `${o.rows.length} título(s)` };
    }
    if (o.ok === false && typeof o.error === "string") return { level: "error", detail: truncate(o.error, 160) };
    return { level: "attention", detail: "Formato inesperado" };
  }

  if (path.includes("/api/ops/ordens")) {
    const ordens = o.ordens;
    if (Array.isArray(ordens)) return { level: "ok", rowCount: ordens.length, detail: `${ordens.length} registro(s)` };
    if (typeof o.error === "string") return { level: "error", detail: o.error };
    return { level: "attention", detail: "JSON sem ordens[]" };
  }

  return { level: "ok", detail: "HTTP 200" };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}

export function DevHealthClient() {
  const { lojaAtivaId } = useLojaAtiva();
  const storeHeader = lojaAtivaId?.trim() || "";

  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [running, setRunning] = useState(false);
  const [probes, setProbes] = useState<Record<string, ProbeResult>>({});
  const [prodHealthExtras, setProdHealthExtras] = useState<{
    storeIdResolved?: string;
    counts?: { stores: number; clientes: number; produtos: number; vendas: number };
    envFlags?: { hasDatabaseUrl: boolean; hasDirectUrl: boolean };
    produtoProbeOk?: boolean;
    produtoProbeError?: string | null;
  } | null>(null);

  const nodeEnv = process.env.NODE_ENV === "production" ? "production" : "development";

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    setProbes(
      Object.fromEntries(ENDPOINTS.map((e) => [e.key, { level: "loading" as const, httpStatus: 0 }])),
    );
    setProdHealthExtras(null);

    const headers: HeadersInit = { accept: "application/json" };
    if (storeHeader) (headers as Record<string, string>)[ASSISTEC_LOJA_HEADER] = storeHeader;

    const next: Record<string, ProbeResult> = {};

    await Promise.all(
      ENDPOINTS.map(async ({ key, path }) => {
        try {
          const res = await fetch(path, { method: "GET", credentials: "include", headers });
          const text = await res.text();
          let json: unknown = null;
          try {
            json = JSON.parse(text) as unknown;
          } catch {
            json = null;
          }
          const summary = summarizeProbe(path, res.status, json);
          next[key] = {
            level: summary.level,
            httpStatus: res.status,
            detail: summary.detail,
            rowCount: summary.rowCount,
          };

          if (path === "/api/debug/prod-health" && json && typeof json === "object") {
            const ph = json as Record<string, unknown>;
            const counts = ph.counts as Record<string, unknown> | undefined;
            const env = ph.env as Record<string, unknown> | undefined;
            const probesPh = ph.probes as Record<string, unknown> | undefined;
            setProdHealthExtras({
              storeIdResolved: typeof ph.storeIdResolved === "string" ? ph.storeIdResolved : undefined,
              counts:
                counts &&
                typeof counts.stores === "number" &&
                typeof counts.clientes === "number" &&
                typeof counts.produtos === "number" &&
                typeof counts.vendas === "number"
                  ? {
                      stores: counts.stores,
                      clientes: counts.clientes,
                      produtos: counts.produtos,
                      vendas: counts.vendas,
                    }
                  : undefined,
              envFlags:
                env &&
                typeof env.hasDatabaseUrl === "boolean" &&
                typeof env.hasDirectUrl === "boolean"
                  ? { hasDatabaseUrl: env.hasDatabaseUrl, hasDirectUrl: env.hasDirectUrl }
                  : undefined,
              produtoProbeOk: typeof probesPh?.produtoProbeOk === "boolean" ? probesPh.produtoProbeOk : undefined,
              produtoProbeError:
                probesPh?.produtoProbeError === null || typeof probesPh?.produtoProbeError === "string"
                  ? (probesPh?.produtoProbeError as string | null)
                  : undefined,
            });
          }
        } catch (e) {
          next[key] = {
            level: "error",
            httpStatus: 0,
            detail: e instanceof Error ? e.message : "Erro desconhecido",
          };
        }
      }),
    );

    setProbes(next);
    setLastRun(new Date());
    setRunning(false);
  }, [storeHeader]);

  useEffect(() => {
    void runDiagnostics();
  }, [runDiagnostics]);

  const overallWorst = useMemo(() => {
    const levels = ENDPOINTS.map((e) => probes[e.key]?.level ?? "idle");
    if (levels.some((l) => l === "idle")) return "idle" as Level;
    if (levels.some((l) => l === "loading")) return "loading";
    if (levels.some((l) => l === "error")) return "error";
    if (levels.some((l) => l === "attention")) return "attention";
    if (levels.every((l) => l === "ok")) return "ok";
    return "attention";
  }, [probes]);

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 space-y-6">
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Painel técnico interno — não expõe secrets — somente leitura.</p>
        <p className="mt-2">
          Esta página apenas consulta endpoints públicos da própria origem. Não são exibidos URLs de banco, chaves de API,
          tokens ou service role. Use somente para diagnóstico operacional.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Saúde / diagnóstico</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ambiente Next.js: <span className="font-medium text-foreground">{nodeEnv}</span>
            {typeof window !== "undefined" && (
              <>
                {" · "}
                Origem: <span className="font-mono text-xs text-foreground">{window.location.origin}</span>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Loja ativa (header):{" "}
            <span className="font-mono text-foreground">{storeHeader || "(cookie / legado)"}</span>
          </p>
          {prodHealthExtras?.storeIdResolved ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              StoreId resolvido pelo servidor (prod-health):{" "}
              <span className="font-mono text-foreground">{prodHealthExtras.storeIdResolved}</span>
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Última atualização:{" "}
            {lastRun ? lastRun.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—"}
          </p>
        </div>
        <Button type="button" onClick={() => void runDiagnostics()} disabled={running} className="gap-2 shrink-0">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar diagnóstico
        </Button>
      </div>

      {prodHealthExtras ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Detalhe /api/debug/prod-health</h2>
          {prodHealthExtras.counts ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Lojas</dt>
                <dd className="font-mono tabular-nums text-foreground">{prodHealthExtras.counts.stores}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Clientes</dt>
                <dd className="font-mono tabular-nums text-foreground">{prodHealthExtras.counts.clientes}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Produtos</dt>
                <dd className="font-mono tabular-nums text-foreground">{prodHealthExtras.counts.produtos}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vendas</dt>
                <dd className="font-mono tabular-nums text-foreground">{prodHealthExtras.counts.vendas}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Contagens indisponíveis nesta resposta (erro parcial ou timeout).</p>
          )}
          {prodHealthExtras.envFlags ? (
            <p className="mt-3 text-xs text-muted-foreground">
              ENV (flags apenas): DATABASE_URL definida ={" "}
              <span className="text-foreground">{prodHealthExtras.envFlags.hasDatabaseUrl ? "sim" : "não"}</span>
              {" · "}DIRECT_URL definida ={" "}
              <span className="text-foreground">{prodHealthExtras.envFlags.hasDirectUrl ? "sim" : "não"}</span>
            </p>
          ) : null}
          {prodHealthExtras.produtoProbeOk === false ? (
            <p className="mt-2 text-xs text-destructive">
              Probe produto na loja atual falhou
              {prodHealthExtras.produtoProbeError ? `: ${prodHealthExtras.produtoProbeError}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Resumo rápido:</span>
        <StatusBadge level={overallWorst === "idle" || overallWorst === "loading" ? "loading" : overallWorst} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ENDPOINTS.map(({ key, label }) => {
          const p = probes[key];
          const level = p?.level ?? "idle";
          return (
            <div key={key} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground truncate">{label}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge level={level === "idle" ? "loading" : level} />
                    {p?.httpStatus ? (
                      <span className="text-xs text-muted-foreground tabular-nums">HTTP {p.httpStatus}</span>
                    ) : null}
                    {typeof p?.rowCount === "number" ? (
                      <span className="text-xs font-medium text-foreground">{p.rowCount} linhas</span>
                    ) : null}
                  </div>
                </div>
                <EndpointIcon level={level} />
              </div>
              {p?.detail ? <p className="mt-2 text-xs text-muted-foreground leading-snug">{p.detail}</p> : null}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Rota direta: <span className="font-mono">/dashboard/dev-health</span> — não está no menu lateral por padrão.
      </p>
    </div>
  );
}

function StatusBadge({ level }: { level: Level }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        level === "loading" && "border-border bg-muted text-muted-foreground",
        level === "ok" && "border-success/30 bg-success/10 text-success",
        level === "attention" && "border-warning/40 bg-warning/15 text-warning",
        level === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {levelLabel(level)}
    </span>
  );
}

function EndpointIcon({ level }: { level: Level }) {
  if (level === "loading") return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />;
  if (level === "ok") return <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />;
  if (level === "attention") return <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />;
  if (level === "error") return <XCircle className="h-5 w-5 shrink-0 text-destructive" />;
  return <Loader2 className="h-5 w-5 shrink-0 text-muted-foreground opacity-40" />;
}
