"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { ShoppingCart } from "lucide-react";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Switch } from "@/components/configuracoes-v3/components/ui/switch";
import { configPadrao } from "@/lib/config-empresa";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import type { StorePdvParams } from "@/lib/store-settings-types";
import {
  defaultFormasPagamento,
  formasPagamentoEqual,
  normalizeFormasPagamento,
  type FormaPagamentoConfig,
} from "@/lib/pdv-formas-pagamento";
import { FormasPagamentoSettings } from "./FormasPagamentoSettings";

type VendasForm = {
  garantiaPadraoDias: number;
  validadeOrcamentoDias: number;
  incluirImpostoEstimadoNoPdv: boolean;
  aliquotaImpostoEstimadoPdv: number;
  moduloControleConsumo: boolean;
  formasPagamento: FormaPagamentoConfig[];
};

function safePrinter(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
}

function formFromPdvParams(p: StorePdvParams): VendasForm {
  return {
    garantiaPadraoDias:
      Number(p.garantiaPadraoDias) || configPadrao.pdv.garantiaPadraoDias,
    validadeOrcamentoDias:
      Number(p.validadeOrcamentoDias) || configPadrao.pdv.validadeOrcamentoDias,
    incluirImpostoEstimadoNoPdv: !!p.incluirImpostoEstimadoNoPdv,
    aliquotaImpostoEstimadoPdv: Math.max(0, Number(p.aliquotaImpostoEstimadoPdv) || 0),
    moduloControleConsumo: !!p.moduloControleConsumo,
    formasPagamento: normalizeFormasPagamento(p.formasPagamento ?? defaultFormasPagamento()),
  };
}

function formsEqual(a: VendasForm, b: VendasForm): boolean {
  return (
    a.garantiaPadraoDias === b.garantiaPadraoDias &&
    a.validadeOrcamentoDias === b.validadeOrcamentoDias &&
    a.incluirImpostoEstimadoNoPdv === b.incluirImpostoEstimadoNoPdv &&
    a.aliquotaImpostoEstimadoPdv === b.aliquotaImpostoEstimadoPdv &&
    a.moduloControleConsumo === b.moduloControleConsumo &&
    formasPagamentoEqual(a.formasPagamento, b.formasPagamento)
  );
}

function VendasSectionContent() {
  const { toast } = useToast();
  const { lojaAtivaId } = useLojaAtiva();
  const { hydrated, settings, pdvParams, refresh, storeId } = useStoreSettings();

  const [remotePrinterConfig, setRemotePrinterConfig] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState<VendasForm>(() => formFromPdvParams(pdvParams));
  const [snapshot, setSnapshot] = useState<VendasForm>(() => formFromPdvParams(pdvParams));
  const [saving, setSaving] = useState(false);
  const syncFromSettings = useCallback(() => {
    const next = formFromPdvParams(pdvParams);
    setForm(next);
    setSnapshot(next);
    setRemotePrinterConfig(safePrinter(settings?.printerConfig));
  }, [pdvParams, settings?.printerConfig]);

  useEffect(() => {
    if (!hydrated) return;
    syncFromSettings();
  }, [hydrated, syncFromSettings, storeId, settings]);

  const noLoja = !lojaAtivaId?.trim();
  const busy = !hydrated || saving;
  const dirty = useMemo(() => !formsEqual(form, snapshot), [form, snapshot]);

  const updateForm = <K extends keyof VendasForm>(key: K, value: VendasForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCancel = () => {
    setForm(snapshot);
  };

  const handleSave = async () => {
    const lojaHeader = lojaAtivaId?.trim();
    if (!lojaHeader) {
      toast({
        title: "Nenhuma unidade ativa",
        description: "Defina a unidade ativa na seção Lojas e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const garantiaPadraoDias = Math.max(
        1,
        Math.min(
          365,
          Math.round(Number(form.garantiaPadraoDias)) || configPadrao.pdv.garantiaPadraoDias,
        ),
      );
      const validadeOrcamentoDias = Math.max(
        1,
        Math.min(
          365,
          Math.round(Number(form.validadeOrcamentoDias)) || configPadrao.pdv.validadeOrcamentoDias,
        ),
      );
      const aliquotaImpostoEstimadoPdv = Math.max(
        0,
        Math.min(100, Number(form.aliquotaImpostoEstimadoPdv) || 0),
      );

      const nextPdvParams: StorePdvParams = {
        ...pdvParams,
        garantiaPadraoDias,
        validadeOrcamentoDias,
        incluirImpostoEstimadoNoPdv: form.incluirImpostoEstimadoNoPdv,
        aliquotaImpostoEstimadoPdv,
        moduloControleConsumo: form.moduloControleConsumo,
        formasPagamento: normalizeFormasPagamento(form.formasPagamento),
      };

      const nextPrinter: Record<string, unknown> = {
        ...safePrinter(remotePrinterConfig),
        pdvParams: nextPdvParams,
      };

      const res = await fetch(`/api/stores/${encodeURIComponent(lojaHeader)}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: lojaHeader,
        },
        body: JSON.stringify({ printerConfig: nextPrinter }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Falha ao salvar (HTTP ${res.status})`);
      }

      const saved: VendasForm = {
        garantiaPadraoDias,
        validadeOrcamentoDias,
        incluirImpostoEstimadoNoPdv: form.incluirImpostoEstimadoNoPdv,
        aliquotaImpostoEstimadoPdv,
        moduloControleConsumo: form.moduloControleConsumo,
        formasPagamento: normalizeFormasPagamento(form.formasPagamento),
      };
      setForm(saved);
      setSnapshot(saved);
      setRemotePrinterConfig(nextPrinter);
      await refresh();
      toast({
        title: "Vendas atualizadas",
        description: "Preferências gravadas na unidade ativa.",
      });
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const controlsDisabled = busy || noLoja;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title="Vendas"
        description="Formas de pagamento, prazos de orçamento, impostos no PDV e módulo de mesas — gravados em printerConfig.pdvParams por unidade."
      />

      {noLoja ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma unidade ativa. Abra a seção <span className="font-medium text-foreground">Lojas</span> e selecione
          uma unidade.
        </p>
      ) : null}

      <SettingsCard
        title="Formas de pagamento"
        description="Ative, ordene e configure regras das formas exibidas nos PDVs desta unidade."
      >
        <FormasPagamentoSettings
          value={form.formasPagamento}
          onChange={(formasPagamento) => setForm((prev) => ({ ...prev, formasPagamento }))}
          disabled={controlsDisabled}
        />
      </SettingsCard>

      <SettingsCard
        title="Orçamentos"
        description="Usados em mensagens de orçamento e como padrão ao criar orçamento novo."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vendas-garantia-dias">Garantia padrão (dias)</Label>
            <Input
              id="vendas-garantia-dias"
              type="number"
              min={1}
              max={365}
              value={form.garantiaPadraoDias}
              onChange={(e) => updateForm("garantiaPadraoDias", parseInt(e.target.value, 10) || 0)}
              disabled={controlsDisabled}
            />
            <p className="text-xs text-muted-foreground">Linha &quot;Garantia: X dias&quot; ao enviar orçamento (ex.: WhatsApp).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vendas-validade-dias">Validade do orçamento (dias)</Label>
            <Input
              id="vendas-validade-dias"
              type="number"
              min={1}
              max={365}
              value={form.validadeOrcamentoDias}
              onChange={(e) => updateForm("validadeOrcamentoDias", parseInt(e.target.value, 10) || 0)}
              disabled={controlsDisabled}
            />
            <p className="text-xs text-muted-foreground">Prazo sugerido ao abrir novo orçamento (editável no formulário).</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Impostos"
        description="Totais no PDV: por padrão o carrinho não soma impostos ao total. Ative só se quiser exibir estimativa."
      >
        <div className="space-y-4">
          <ToggleRow
            label="Incluir imposto estimado no total do PDV"
            hint="Desligado: total = subtotal − descontos. Ligado: total = subtotal + imposto estimado − descontos."
            checked={form.incluirImpostoEstimadoNoPdv}
            onCheckedChange={(v) => updateForm("incluirImpostoEstimadoNoPdv", v)}
            disabled={controlsDisabled}
          />
          <div className="space-y-1.5">
            <Label htmlFor="vendas-aliquota">Alíquota estimada (% sobre o subtotal)</Label>
            <Input
              id="vendas-aliquota"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.aliquotaImpostoEstimadoPdv}
              onChange={(e) => updateForm("aliquotaImpostoEstimadoPdv", parseFloat(e.target.value) || 0)}
              disabled={controlsDisabled || !form.incluirImpostoEstimadoNoPdv}
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Mesas e consumo"
        description="Exibe no menu Vendas a tela de mesas: consumo sem pagamento na hora e envio da conta ao PDV."
      >
        <ToggleRow
          label="Ativar módulo de mesas / consumo"
          hint={
            form.moduloControleConsumo
              ? "Disponível em /dashboard/vendas/mesas e pelo botão Mesas no PDV."
              : "Quando ativo, o atalho Mesas aparece no PDV desta unidade."
          }
          checked={form.moduloControleConsumo}
          onCheckedChange={(v) => updateForm("moduloControleConsumo", v)}
          disabled={controlsDisabled}
        />
      </SettingsCard>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving || noLoja || !dirty}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void handleSave()} disabled={controlsDisabled || !dirty}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card-muted px-4 py-3">
      <div>
        <Label className="text-foreground">{label}</Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
      />
    </div>
  );
}

export function VendasSection() {
  return <VendasSectionContent />;
}
