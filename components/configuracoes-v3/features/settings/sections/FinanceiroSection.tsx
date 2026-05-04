"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { Wallet, FileText, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Switch } from "@/components/configuracoes-v3/components/ui/switch";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { AppOpsProviders } from "@/components/dashboard/app-ops-providers";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useFinanceiro } from "@/lib/financeiro-store";
import type { ContaPagarItem } from "@/lib/financeiro-types";
import {
  type CentroFinanceiroV3,
  defaultCentroFinanceiroV3,
  loadCentroFinanceiroV3ForStore,
  normalizeCentroV3,
  persistCentroFinanceiroV3ForStore,
} from "@/lib/centro-financeiro";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function effectiveStatusContaPagar(c: ContaPagarItem): ContaPagarItem["status"] {
  if (c.status === "pago") return "pago";
  if (c.dataVencimento < todayISO()) return "atrasado";
  return "pendente";
}

function FinanceiroSectionContent() {
  const { toast } = useToast();
  const { lojaAtivaId } = useLojaAtiva();
  const { contasPagar, movimentos } = useFinanceiro();

  const storeId = lojaAtivaId?.trim() ?? "";
  const noLoja = !storeId;

  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [centroDraft, setCentroDraft] = useState<CentroFinanceiroV3>(() => defaultCentroFinanceiroV3());
  const [baselineJson, setBaselineJson] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!storeId) {
      const def = defaultCentroFinanceiroV3();
      setCentroDraft(def);
      setBaselineJson(JSON.stringify(def));
      setHydrated(true);
      return;
    }

    setHydrated(false);
    void (async () => {
      let loaded = loadCentroFinanceiroV3ForStore(storeId);
      try {
        const r = await fetch(`/api/stores/${encodeURIComponent(storeId)}/settings`, {
          credentials: "include",
          cache: "no-store",
          headers: { [ASSISTEC_LOJA_HEADER]: storeId },
        });
        const j = (await r.json().catch(() => null)) as { settings?: { cardFees?: unknown } | null } | null;
        const cf = j?.settings?.cardFees;
        if (cf && typeof cf === "object") {
          loaded = normalizeCentroV3({ ...loaded, ...(cf as Record<string, unknown>) });
        }
      } catch {
        /* mantém local */
      }
      if (cancelled) return;
      const n = normalizeCentroV3(loaded);
      setCentroDraft(n);
      setBaselineJson(JSON.stringify(n));
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const maquininhasAtivas = useMemo(
    () => centroDraft.maquininhas.filter((m) => m.ativo).length,
    [centroDraft.maquininhas],
  );

  const dirty = useMemo(() => {
    if (!hydrated) return false;
    try {
      return JSON.stringify(normalizeCentroV3(centroDraft)) !== baselineJson;
    } catch {
      return true;
    }
  }, [hydrated, centroDraft, baselineJson]);

  const resumoPagarReceber = useMemo(() => {
    const comStatus = contasPagar.map((c) => ({ ...c, status: effectiveStatusContaPagar(c) }));
    const totalPagar = comStatus
      .filter((c) => c.status === "pendente" || c.status === "atrasado")
      .reduce((s, c) => s + c.valor, 0);
    const totalReceber = movimentos
      .filter((m) => m.tipo === "entrada" && m.status !== "Pago")
      .reduce((s, m) => s + m.valor, 0);
    return { totalPagar, totalReceber };
  }, [contasPagar, movimentos]);

  const fmtBrl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleCancel = () => {
    try {
      setCentroDraft(normalizeCentroV3(JSON.parse(baselineJson)));
    } catch {
      setCentroDraft(defaultCentroFinanceiroV3());
    }
  };

  const salvarCentro = useCallback(async () => {
    if (!storeId) {
      toast({
        title: "Nenhuma unidade ativa",
        description: "Defina a unidade ativa na seção Lojas e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const normalized = normalizeCentroV3(centroDraft);
      setCentroDraft(normalized);
      persistCentroFinanceiroV3ForStore(storeId, normalized);
      const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: storeId,
        },
        body: JSON.stringify({ cardFees: normalized }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Falha ao salvar (HTTP ${res.status})`);
      }
      setBaselineJson(JSON.stringify(normalized));
      toast({ title: "Financeiro salvo", description: "Metas e centro financeiro sincronizados com a unidade." });
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [centroDraft, storeId, toast]);

  const busy = !hydrated || saving;
  const controlsDisabled = busy || noLoja;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Wallet className="h-5 w-5" />}
        title="Financeiro"
        description="Metas do centro financeiro, resumo de contas e preferências."
      />

      {noLoja ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma unidade ativa. Abra a seção <span className="font-medium text-foreground">Lojas</span> e selecione
          uma unidade para carregar e gravar o centro financeiro.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SettingsCard
          title="Metas de faturamento"
          description="Valores salvos em cardFees da unidade (mesmo modelo do centro financeiro)."
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fin-meta-fat">Meta de faturamento (R$)</Label>
              <Input
                id="fin-meta-fat"
                type="number"
                min={0}
                step={0.01}
                value={centroDraft.metaFaturamento}
                onChange={(e) =>
                  setCentroDraft((d) => ({
                    ...d,
                    metaFaturamento: Math.max(0, parseFloat(e.target.value) || 0),
                  }))
                }
                disabled={controlsDisabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-meta-obs">Anotações da meta</Label>
              <Input
                id="fin-meta-obs"
                value={centroDraft.metaObservacao}
                onChange={(e) => setCentroDraft((d) => ({ ...d, metaObservacao: e.target.value }))}
                placeholder="Ex.: trimestre, campanha, observação interna"
                disabled={controlsDisabled}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card-muted px-4 py-3">
              <div>
                <Label>Maquininhas ativas no PDV</Label>
                <p className="text-xs text-muted-foreground">
                  Configure taxas e ativação no centro financeiro completo do dashboard.
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground">{maquininhasAtivas}</span>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard title="Contas a pagar e a receber" description="Dados locais do módulo Financeiro (carteiras).">
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon={<ArrowUpCircle className="h-5 w-5" />}
              label="Entradas pendentes"
              value={fmtBrl(resumoPagarReceber.totalReceber)}
              tone="success"
            />
            <StatTile
              icon={<ArrowDownCircle className="h-5 w-5" />}
              label="A pagar (aberto)"
              value={fmtBrl(resumoPagarReceber.totalPagar)}
              tone="destructive"
            />
          </div>
          <Button variant="outline" className="mt-4 w-full" asChild>
            <Link href="/?page=fluxo-caixa">Ver lançamentos</Link>
          </Button>
        </SettingsCard>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving || noLoja || !dirty}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void salvarCentro()} disabled={controlsDisabled || !dirty}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>

      <SettingsCard title="Relatórios" description="Exportações periódicas automáticas.">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card-muted px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Relatório mensal por email</p>
              <p className="text-xs text-muted-foreground">Não há configuração persistida para esta unidade ainda.</p>
            </div>
          </div>
          <Switch checked={false} disabled />
        </div>
      </SettingsCard>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "destructive";
}) {
  return (
    <div className="rounded-lg border border-border bg-card-muted p-6">
      <div
        className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${tone === "success" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
      >
        {icon}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function FinanceiroSection() {
  return (
    <AppOpsProviders>
      <FinanceiroSectionContent />
    </AppOpsProviders>
  );
}
