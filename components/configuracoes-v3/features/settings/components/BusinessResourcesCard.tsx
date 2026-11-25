"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Info, SlidersHorizontal } from "lucide-react";
import { useStoreBusiness } from "@/lib/use-store-business";
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions";
import { usesClientExperience } from "@/lib/navigation/client-experience";
import {
  BUSINESS_BRANCHES,
  BUSINESS_RESOURCES,
  businessPresentation,
  resolveBusinessResource,
  type BusinessBranch,
  type BusinessPresentation,
  type BusinessResourceKey,
} from "@/lib/store-business-capabilities";
import type { CapabilityOverrideValue, StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1";
import { SettingsCard } from "./SettingsCard";
import { SettingsCardSkeleton } from "./SettingsCardSkeleton";
import { SettingsStatusBadge } from "./SettingsStatusBadge";
import { SettingsFeedbackBanner } from "./SettingsFeedbackBanner";
import { SettingsSubSection } from "./SettingsSubSection";
import { SettingsCollapsible } from "./SettingsCollapsible";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";

export interface BusinessResourcesController {
  save: () => Promise<boolean>;
  discard: () => void;
  isDirty: () => boolean;
  isSaving: () => boolean;
}

export interface BusinessResourcesCardProps {
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  controllerRef?: React.MutableRefObject<BusinessResourcesController | null>;
}

const BRANCH_IMPACT_SUMMARY: Record<BusinessBranch, string> = {
  padaria: "Sugere preparação de cadastro para produtos por peso.",
  assistencia: "Sugere Assistência técnica, Compatibilidade com aparelhos e Acessórios no PDV.",
  acessorios: "Sugere Compatibilidade com aparelhos e seletor de modelo e cor de acessórios no PDV.",
  moda: "Sugere preparação de cadastro para grade comercial de cor e tamanho.",
  variedades: "Operação direta de varejo sem módulos especializados ativados por padrão.",
  agropecuaria: "Sugere preparação de cadastro para produtos comercializados por peso.",
  supermercado: "Operação de alto giro sem módulos técnicos especializados ativados por padrão.",
  comercio: "Configuração padrão limpa para varejo multissetorial.",
};

const OPERATIONAL_DESCRIPTIONS: Record<string, string> = {
  "service.technical": "Ordens de serviço, bancada técnica, laudo e acompanhamento de reparos.",
  "catalog.deviceCompatibility": "Vincula películas, capas e peças aos modelos compatíveis no cadastro.",
  "pdv.accessoryModelColor": "Habilita seletor rápido de modelo e cor de acessórios no PDV.",
  "catalog.serializedDevices":
    "Desligado por padrão em todos os ramos. Ative por unidade, apenas se a loja vender aparelhos.",
};

export function BusinessResourcesCard({
  onDirtyChange,
  onSavingChange,
  controllerRef,
}: BusinessResourcesCardProps = {}) {
  const business = useStoreBusiness();
  // Mantém o formulário montado durante revalidações em segundo plano (ex.: refreshStoreSettings)
  // da MESMA loja, evitando destruir rascunhos não salvos de Ramo e recursos (B2).
  // Ao trocar de storeId, volta imediatamente ao ciclo limpo de carregamento da nova loja.
  const [hydratedStoreId, setHydratedStoreId] = useState<string | null>(
    business.ready && business.storeId ? business.storeId : null,
  );
  const [lastKnownBranch, setLastKnownBranch] = useState<BusinessBranch>(business.branch);
  const [lastKnownCaps, setLastKnownCaps] = useState<StoreCapabilitiesV1 | null>(business.capabilities);

  useEffect(() => {
    if (business.ready && business.storeId) {
      setHydratedStoreId(business.storeId);
      setLastKnownBranch(business.branch);
      setLastKnownCaps(business.capabilities);
    } else if (business.storeId !== hydratedStoreId) {
      setHydratedStoreId(null);
    }
  }, [business.branch, business.capabilities, business.ready, business.storeId, hydratedStoreId]);

  const stayMountedForSameStore = Boolean(business.storeId && hydratedStoreId === business.storeId);
  const effectiveReady = business.ready || stayMountedForSameStore;

  useEffect(() => {
    if (!effectiveReady) {
      onDirtyChange?.(false);
      onSavingChange?.(false);
      if (controllerRef) controllerRef.current = null;
    }
  }, [controllerRef, effectiveReady, onDirtyChange, onSavingChange]);

  if (!effectiveReady && business.hydrated) {
    return (
      <section id="ramo-recursos" className="scroll-mt-6">
        <SettingsFeedbackBanner
          variant="error"
          role="alert"
          title="Não foi possível carregar ramo e recursos desta unidade."
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void business.refresh()}>
              Tentar novamente
            </Button>
          }
        >
          Verifique a conexão e tente recarregar as configurações salvas.
        </SettingsFeedbackBanner>
      </section>
    );
  }

  if (!effectiveReady) {
    return (
      <section id="ramo-recursos" className="scroll-mt-6">
        <SettingsCardSkeleton variant="resources" label="Carregando ramo e recursos da unidade…" />
      </section>
    );
  }

  return (
    <BusinessResourcesForm
      key={business.storeId}
      fallbackBranch={lastKnownBranch}
      fallbackCapabilities={lastKnownCaps}
      onDirtyChange={onDirtyChange}
      onSavingChange={onSavingChange}
      controllerRef={controllerRef}
    />
  );
}

function BusinessResourcesForm({
  fallbackBranch,
  fallbackCapabilities,
  onDirtyChange,
  onSavingChange,
  controllerRef,
}: BusinessResourcesCardProps & {
  fallbackBranch: BusinessBranch;
  fallbackCapabilities: StoreCapabilitiesV1 | null;
}) {
  const permissions = useEnterprisePermissions();
  const { branch: liveBranch, capabilities: liveCapabilities, canConfigure, ready, save, legacyProfile } =
    useStoreBusiness();
  const { toast } = useToast();

  // Durante revalidação em segundo plano da mesma loja, conserva a última leitura confirmada
  // sem piscar para fallback legado nem perder edições em andamento.
  const branch = ready ? liveBranch : fallbackBranch;
  const capabilities = ready ? liveCapabilities : fallbackCapabilities;

  const [selected, setSelected] = useState<BusinessBranch | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<BusinessResourceKey, CapabilityOverrideValue>>>({});
  const [presentation, setPresentation] = useState<BusinessPresentation>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const draftWithoutPresentation: StoreCapabilitiesV1 = useMemo(
    () => ({
      version: 1,
      business: {
        ...capabilities?.business,
        ...(selected !== null ? { primaryBranch: selected } : {}),
      },
      overrides: { ...capabilities?.overrides, ...overrides },
    }),
    [capabilities, overrides, selected],
  );

  const draft: StoreCapabilitiesV1 = useMemo(
    () => ({
      ...draftWithoutPresentation,
      business: {
        ...draftWithoutPresentation.business,
        presentation: { ...capabilities?.business?.presentation, ...presentation },
      },
    }),
    [capabilities?.business?.presentation, draftWithoutPresentation, presentation],
  );

  const currentBranch = selected ?? branch;
  const branchBaselineExamples = useMemo(
    () => businessPresentation(draftWithoutPresentation),
    [draftWithoutPresentation],
  );
  const examples = useMemo(() => businessPresentation(draft), [draft]);

  // Apresentação do cliente: ramos de assistência/acessórios só com a liberação correspondente.
  // O ramo atual continua listado para não trocar silenciosamente o valor salvo.
  const client = usesClientExperience(permissions) !== false;
  const branchOffered = (value: BusinessBranch) =>
    !client ||
    value === branch ||
    value === selected ||
    (value === "assistencia"
      ? permissions?.hubs.operacoes === true
      : value === "acessorios"
        ? permissions?.modules?.deviceCatalog === true
        : true);

  const visibleResources = useMemo(
    () =>
      BUSINESS_RESOURCES.filter((item) =>
        item.key === "service.technical"
          ? permissions?.hubs.operacoes
          : ["catalog.deviceCompatibility", "pdv.accessoryModelColor", "catalog.serializedDevices"].includes(
                item.key,
              )
            ? permissions?.modules?.deviceCatalog
            : true,
      ),
    [permissions],
  );

  const operationalResources = visibleResources.filter((item) => item.stage === "operational");
  const preparationResources = visibleResources.filter((item) => item.stage === "preparation");
  const activeTotalCount = visibleResources.filter(
    (item) => resolveBusinessResource(draft, item.key, legacyProfile).requested,
  ).length;

  const disabled = !canConfigure || saving;
  const dirty =
    selected !== null ||
    Object.keys(overrides).length > 0 ||
    Object.keys(presentation).length > 0;

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => {
      onDirtyChange?.(false);
    };
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(saving);
    return () => {
      onSavingChange?.(false);
    };
  }, [onSavingChange, saving]);

  const handleBranchChange = (nextBranch: BusinessBranch) => {
    setSaveError(null);
    const nextSelected = nextBranch === branch ? null : nextBranch;
    setSelected(nextSelected);
    // Remove overrides que voltaram a coincidir com o baseline do ramo escolhido (M4).
    setOverrides((current) => {
      const next: Partial<Record<BusinessResourceKey, CapabilityOverrideValue>> = {};
      const nextCapsBase: StoreCapabilitiesV1 = {
        version: 1,
        business: {
          ...capabilities?.business,
          ...(nextSelected !== null ? { primaryBranch: nextSelected } : {}),
        },
        overrides: { ...capabilities?.overrides },
      };
      for (const [k, v] of Object.entries(current) as Array<[BusinessResourceKey, CapabilityOverrideValue]>) {
        const wanted = typeof v === "boolean" ? v : v.enabled;
        const base = resolveBusinessResource(nextCapsBase, k, legacyProfile);
        if (base.requested !== wanted) {
          next[k] = v;
        }
      }
      return next;
    });
  };

  // Voltar ao estado salvo desfaz a escolha; override salvo em objeto troca só `enabled`.
  const toggle = (key: BusinessResourceKey, checked: boolean) => {
    setSaveError(null);
    setOverrides((current) => {
      const rest = { ...current };
      delete rest[key];
      const saved = capabilities?.overrides?.[key];
      const untouched = resolveBusinessResource(
        { ...draft, overrides: { ...capabilities?.overrides, ...rest } },
        key,
        legacyProfile,
      );
      if (untouched.requested === checked) return rest;
      return {
        ...rest,
        [key]: typeof saved === "object" && saved !== null ? { ...saved, enabled: checked } : checked,
      };
    });
  };

  const handlePresentationChange = (key: keyof BusinessPresentation, value: string) => {
    setSaveError(null);
    setPresentation((current) => {
      const next = { ...current };
      // Compara com o baseline do ramo atual em edição (M4), evitando snap-back ao trocar de ramo.
      const baselineValue = branchBaselineExamples[key];
      if (value === baselineValue) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const discard = useCallback(() => {
    if (savingRef.current) return;
    setSelected(null);
    setOverrides({});
    setPresentation({});
    setSaveError(null);
  }, []);

  const submit = useCallback(async (): Promise<boolean> => {
    if (savingRef.current || !dirty || !canConfigure) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      // Somente escolhas tocadas; nunca reenviar o snapshot inteiro da loja.
      await save({
        printerConfig: {
          capabilities: {
            version: 1,
            business: {
              ...(selected !== null ? { primaryBranch: selected } : {}),
              ...(Object.keys(presentation).length ? { presentation } : {}),
            },
            ...(Object.keys(overrides).length ? { overrides } : {}),
          },
        },
      });
      if (!mountedRef.current) return false;
      setSelected(null);
      setOverrides({});
      setPresentation({});
      toast({
        title: "Ramo e recursos salvos",
        description: "Configuração atualizada para esta unidade.",
        variant: "success",
      });
      return true;
    } catch (error) {
      if (!mountedRef.current) return false;
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      setSaveError(`Não foi possível salvar ramo e recursos. ${msg}`);
      toast({
        title: "Não foi possível salvar",
        description: msg,
        variant: "destructive",
      });
      return false;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [canConfigure, dirty, overrides, presentation, save, selected, toast]);

  useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = {
      save: submit,
      discard,
      isDirty: () => dirty,
      isSaving: () => savingRef.current,
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, dirty, discard, submit]);

  const renderTile = (item: (typeof BUSINESS_RESOURCES)[number], isPreparation: boolean) => {
    const state = resolveBusinessResource(draft, item.key, legacyProfile);
    const sourceLabel =
      state.source === "explicit"
        ? "Escolha explícita"
        : state.source === "manual"
          ? "Ativação manual"
          : "Sugestão do ramo";
    const sourceTone =
      state.source === "explicit"
        ? "explicit"
        : state.source === "manual"
          ? "manual"
          : "preset";
    const hintId = `business-resource-${item.key}-hint`;
    const descriptionText = isPreparation
      ? `Preparação de cadastro. ${
          item.key === "catalog.weight"
            ? "Venda fracionada e baixa em kg/g ainda indisponíveis; produtos por peso ficam bloqueados para venda."
            : "Estoque por combinação e venda de variações ainda indisponíveis."
        }`
      : OPERATIONAL_DESCRIPTIONS[item.key] ?? "";

    return (
      <label
        key={item.key}
        data-active={state.requested ? "true" : "false"}
        data-stage={item.stage}
        data-disabled={disabled ? "true" : "false"}
        className="cfg-resource-tile flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-3.5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-snug" style={{ color: "var(--cfg-fg)" }}>
            {item.label}
          </span>
          {/* Fora do nome acessível da caixa; lido como descrição via aria-describedby. */}
          {descriptionText ? (
            <span
              id={hintId}
              aria-hidden="true"
              className="mt-1 block text-xs leading-relaxed"
              style={{ color: "var(--cfg-muted)" }}
            >
              {descriptionText}
            </span>
          ) : null}
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <SettingsStatusBadge tone={sourceTone}>{sourceLabel}</SettingsStatusBadge>
            {isPreparation ? (
              <SettingsStatusBadge tone="unavailable" aria-hidden={true}>
                Em preparação
              </SettingsStatusBadge>
            ) : null}
          </span>
        </span>

        <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center">
          <input
            type="checkbox"
            checked={state.requested}
            disabled={disabled}
            onChange={(event) => toggle(item.key, event.target.checked)}
            aria-describedby={descriptionText ? hintId : undefined}
            className="cfg-cb absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span aria-hidden="true" className="cfg-switch" />
        </span>
      </label>
    );
  };

  const presentationPreview = `${examples.productExample} · ${examples.categoryExample}`;

  return (
    <section id="ramo-recursos" className="scroll-mt-6">
      <SettingsCard
        icon={<SlidersHorizontal className="h-4 w-4" />}
        title="Ramo e recursos"
        description="Escolha o ramo uma vez e combine os recursos que sua loja utiliza. Suas escolhas têm prioridade sobre as sugestões."
        headerExtra={
          <>
            {dirty ? (
              <SettingsStatusBadge tone="dirty" showDot>
                Não salvo
              </SettingsStatusBadge>
            ) : null}
            <SettingsStatusBadge tone="neutral">
              {activeTotalCount} {activeTotalCount === 1 ? "marcado" : "marcados"}
            </SettingsStatusBadge>
          </>
        }
        feedback={
          saveError ? (
            <SettingsFeedbackBanner variant="error" role="alert">
              {saveError}
            </SettingsFeedbackBanner>
          ) : undefined
        }
        footerHint="Envia apenas as escolhas alteradas nesta unidade."
        footer={
          <>
            <Button type="button" variant="ghost" disabled={disabled || !dirty} onClick={discard}>
              Descartar
            </Button>
            <Button type="button" disabled={disabled || !dirty} onClick={() => void submit()}>
              {saving ? "Salvando…" : "Salvar ramo e recursos"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!canConfigure ? (
            <SettingsFeedbackBanner variant="readonly">
              Somente responsáveis com permissão de Configurações podem editar.
            </SettingsFeedbackBanner>
          ) : null}

          {/* Seletor nativo de ramo + Cartão de Impacto do Ramo */}
          <div className="grid grid-cols-1 items-stretch gap-3.5 md:grid-cols-12">
            <div className="space-y-1.5 md:col-span-5">
              <label
                htmlFor="business-branch"
                className="block text-xs font-medium"
                style={{ color: "var(--cfg-fg-body)" }}
              >
                Ramo principal
              </label>
              <div className="relative">
                <select
                  id="business-branch"
                  value={currentBranch}
                  disabled={disabled}
                  onChange={(event) => handleBranchChange(event.target.value as BusinessBranch)}
                  className="cfg-select h-10 w-full appearance-none border px-3 pr-9 text-[13px] font-medium"
                >
                  {Object.entries(BUSINESS_BRANCHES)
                    .filter(([value]) => branchOffered(value as BusinessBranch))
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--cfg-muted)" }}
                />
              </div>
            </div>

            <div
              className="flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 md:col-span-7"
              style={{
                backgroundColor: "var(--cfg-inset)",
                borderColor: "var(--cfg-border)",
              }}
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="text-xs leading-relaxed" style={{ color: "var(--cfg-muted)" }}>
                <p>
                  <strong style={{ color: "var(--cfg-fg)" }}>Impacto do ramo:</strong>{" "}
                  {BRANCH_IMPACT_SUMMARY[currentBranch]}
                </p>
                <p className="mt-0.5">
                  Para padaria, recomendamos o PDV Clássico. Salvar o ramo preserva a escolha atual de PDV, preços,
                  produtos e estoque.
                </p>
              </div>
            </div>
          </div>

          {/* Resource Tile Matrix — Recursos operacionais */}
          {operationalResources.length > 0 ? (
            <SettingsSubSection title="Recursos operacionais">
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {operationalResources.map((item) => renderTile(item, false))}
              </div>
            </SettingsSubSection>
          ) : null}

          {/* Resource Tile Matrix — Preparação de cadastro (honestidade operacional) */}
          {preparationResources.length > 0 ? (
            <SettingsSubSection
              title="Preparação de cadastro"
              description="Configuração de catálogo — venda operacional ainda indisponível"
            >
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {preparationResources.map((item) => renderTile(item, true))}
              </div>
            </SettingsSubSection>
          ) : null}

          <p
            className="flex items-start gap-2 text-xs leading-relaxed"
            style={{ color: "var(--cfg-muted)" }}
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Integração com balança: indisponível, depende de equipamento e homologação por terminal.
              {(!client || permissions?.modules?.deviceCatalog) &&
                " Cor de acessórios não representa grade comercial."}
            </span>
          </p>

          {/* Accordion polido — Padrões de apresentação do cadastro */}
          <SettingsCollapsible
            title="Padrões de apresentação do cadastro"
            summary={presentationPreview}
            expandedSummary="Personalize os exemplos exibidos nos campos do cadastro de produtos desta unidade."
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              {(
                [
                  ["productExample", "Exemplo de produto"],
                  ["categoryExample", "Exemplo de categoria"],
                  ["brandExample", "Exemplo de marca"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <label
                    htmlFor={`business-${key}`}
                    className="block text-xs font-medium"
                    style={{ color: "var(--cfg-fg-body)" }}
                  >
                    {label}
                  </label>
                  <Input
                    id={`business-${key}`}
                    maxLength={160}
                    disabled={disabled}
                    value={examples[key]}
                    onChange={(event) => handlePresentationChange(key, event.target.value)}
                    className="cfg-input"
                  />
                </div>
              ))}
            </div>
          </SettingsCollapsible>
        </div>
      </SettingsCard>
    </section>
  );
}
