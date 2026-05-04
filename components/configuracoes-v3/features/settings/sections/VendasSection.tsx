"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import {
  Banknote,
  CreditCard,
  Landmark,
  NotebookPen,
  QrCode,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/configuracoes-v3/components/ui/switch";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { ConfigEmpresaProvider, configPadrao } from "@/lib/config-empresa";
import { LojaAtivaProvider, useLojaAtiva } from "@/lib/loja-ativa";
import { StoreSettingsProvider, useStoreSettings } from "@/lib/store-settings-provider";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import type { StorePdvParams } from "@/lib/store-settings-types";

type VendasForm = {
  garantiaPadraoDias: number;
  validadeOrcamentoDias: number;
  incluirImpostoEstimadoNoPdv: boolean;
  aliquotaImpostoEstimadoPdv: number;
  moduloControleConsumo: boolean;
};

/** Somente UI — sem campo em printerConfig/API neste projeto. */
type FormasPagamentoVisual = {
  dinheiro: boolean;
  cartaoCredito: boolean;
  cartaoDebito: boolean;
  pix: boolean;
  fiado: boolean;
};

const FORMAS_PAGAMENTO_PADRAO: FormasPagamentoVisual = {
  dinheiro: true,
  cartaoCredito: true,
  cartaoDebito: true,
  pix: true,
  fiado: true,
};

const FORMAS_PAGAMENTO_ITENS: { key: keyof FormasPagamentoVisual; label: string; icon: LucideIcon }[] = [
  { key: "dinheiro", label: "Dinheiro", icon: Banknote },
  { key: "cartaoCredito", label: "Cartão crédito", icon: CreditCard },
  { key: "cartaoDebito", label: "Cartão débito", icon: Landmark },
  { key: "pix", label: "PIX", icon: QrCode },
  { key: "fiado", label: "Fiado", icon: NotebookPen },
];

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
  };
}

function formsEqual(a: VendasForm, b: VendasForm): boolean {
  return (
    a.garantiaPadraoDias === b.garantiaPadraoDias &&
    a.validadeOrcamentoDias === b.validadeOrcamentoDias &&
    a.incluirImpostoEstimadoNoPdv === b.incluirImpostoEstimadoNoPdv &&
    a.aliquotaImpostoEstimadoPdv === b.aliquotaImpostoEstimadoPdv &&
    a.moduloControleConsumo === b.moduloControleConsumo
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
  const [formasPagamentoVisual, setFormasPagamentoVisual] = useState<FormasPagamentoVisual>(FORMAS_PAGAMENTO_PADRAO);

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
        description="Prazos de orçamento, impostos no total do PDV e módulo de mesas — por unidade ativa."
      />

      {noLoja ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma unidade ativa. Abra a seção <span className="font-medium text-foreground">Lojas</span> e selecione
          uma unidade.
        </p>
      ) : null}

      <SettingsCard
        title="Formas de pagamento"
        description="Ative ou desative as opções exibidas no fluxo de venda. Configuração visual (ainda não integrada ao backend)."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {FORMAS_PAGAMENTO_ITENS.map(({ key, label, icon: Icon }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card-muted/60 px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <Label className="cursor-pointer text-base font-medium leading-snug text-foreground">{label}</Label>
              </div>
              <Switch
                checked={formasPagamentoVisual[key]}
                onCheckedChange={(v) =>
                  setFormasPagamentoVisual((prev) => ({
                    ...prev,
                    [key]: v === true,
                  }))
                }
                disabled={controlsDisabled}
              />
            </div>
          ))}
        </div>
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
  return (
    <ConfigEmpresaProvider>
      <LojaAtivaProvider>
        <StoreSettingsProvider>
          <VendasSectionContent />
        </StoreSettingsProvider>
      </LojaAtivaProvider>
    </ConfigEmpresaProvider>
  );
}
