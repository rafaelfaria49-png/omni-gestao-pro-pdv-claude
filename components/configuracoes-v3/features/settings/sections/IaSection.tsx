"use client";

import Link from "next/link";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { Sparkles, Zap, History, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Badge } from "@/components/configuracoes-v3/components/ui/badge";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { useUserCredits } from "@/hooks/useUserCredits";
import { useCreditsHistory } from "@/hooks/useCreditsHistory";
import { AI_MODELS_MOSAIC } from "@/lib/ai-models-list";
import { getActionLabel } from "@/src/lib/credits/action-labels";

function labelForStoredModel(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  const entry = AI_MODELS_MOSAIC.find((m) => m.id === trimmed);
  return entry?.label ?? trimmed;
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso || "—";
  return d.toLocaleString("pt-BR");
}

function IaSectionContent() {
  const { lojaAtivaId } = useLojaAtiva();
  const { hydrated, blob } = useStoreSettings();
  const { credits, loading: creditsLoading, error: creditsError } = useUserCredits();
  const { items: historyItems, loading: historyLoading, error: historyError } = useCreditsHistory();

  const noLoja = !lojaAtivaId?.trim();
  const modelId = (blob.aiMestreModel ?? "").trim();
  const modelLabel = modelId ? labelForStoredModel(modelId) : "";

  const historyPreview = historyItems.slice(0, 10);

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Sparkles className="h-5 w-5" />}
        title="IA e Créditos"
        description="Saldo e histórico via API; modelo da unidade em printerConfig.aiMestreModel."
        actions={
          <Button asChild>
            <Link href="/dashboard/creditos">
              <Plus className="mr-2 h-4 w-4" />
              Comprar créditos
            </Link>
          </Button>
        }
      />

      {noLoja ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma unidade ativa: o modelo exibido pode não refletir a loja até você selecionar uma em{" "}
          <span className="font-medium text-foreground">Lojas</span>.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-gradient-primary p-6 text-primary-foreground shadow-glow lg:col-span-2">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Zap className="h-4 w-4" />
            Saldo de créditos
          </div>
          <p className="mt-1 text-xs opacity-80">Fonte: GET /api/user/credits (usuário logado).</p>
          {creditsLoading ? (
            <p className="mt-4 text-lg opacity-90">Carregando…</p>
          ) : creditsError ? (
            <p className="mt-4 text-sm opacity-95">{creditsError}</p>
          ) : (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold leading-tight tracking-tight">
                  {(credits ?? 0).toLocaleString("pt-BR")}
                </span>
                <span className="text-sm opacity-80">créditos</span>
              </div>
              <p className="mt-4 text-xs opacity-80">
                Não há limite mensal exposto por API neste projeto — apenas o saldo atual.
              </p>
            </>
          )}
        </div>

        <SettingsCard title="Atalhos">
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="w-full justify-between" asChild>
              <Link href="/dashboard/ia-mestre">
                IA Mestre
                <ExternalLink className="h-4 w-4 opacity-70" />
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-between" asChild>
              <Link href="/dashboard/marketing-ia">
                Marketing IA
                <ExternalLink className="h-4 w-4 opacity-70" />
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-between" asChild>
              <Link href="/dashboard/creditos">
                Página de créditos
                <ExternalLink className="h-4 w-4 opacity-70" />
              </Link>
            </Button>
          </div>
        </SettingsCard>
      </div>

      <SettingsCard
        title="Modelo IA Mestre (unidade)"
        description="Persistido em StoreSettings.printerConfig.aiMestreModel após salvar na tela do IA Mestre."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-semibold leading-snug text-foreground">
                {hydrated && modelId ? modelLabel : hydrated ? "Não definido na unidade" : "Carregando…"}
              </p>
              {modelId ? (
                <p className="mt-0.5 font-mono text-xs text-muted-foreground break-all">{modelId}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hydrated && modelId ? (
              <Badge className="bg-success text-success-foreground hover:bg-success">Salvo na unidade</Badge>
            ) : hydrated ? (
              <Badge variant="secondary">Padrão da tela / automático</Badge>
            ) : (
              <Badge variant="secondary">…</Badge>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/ia-mestre">Abrir IA Mestre</Link>
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Histórico de uso" description="GET /api/credits/history — últimos consumos do usuário.">
        <ul className="divide-y divide-border">
          {historyLoading ? (
            <li className="py-6 text-sm text-muted-foreground">Carregando histórico…</li>
          ) : historyError ? (
            <li className="py-6 text-sm text-muted-foreground">Não foi possível carregar o histórico.</li>
          ) : historyPreview.length === 0 ? (
            <li className="py-6 text-sm text-muted-foreground">Nenhum uso de crédito registrado ainda.</li>
          ) : (
            historyPreview.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <History className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{getActionLabel(h.action || "—")}</p>
                    <p className="text-xs text-muted-foreground">{formatHistoryDate(h.createdAt)}</p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">-{h.cost} créditos</span>
              </li>
            ))
          )}
        </ul>
        {historyItems.length > 10 ? (
          <Button variant="ghost" className="mt-2 w-full" asChild>
            <Link href="/dashboard/creditos">Ver tudo na página de créditos</Link>
          </Button>
        ) : null}
      </SettingsCard>
    </div>
  );
}

export function IaSection() {
  return <IaSectionContent />;
}
