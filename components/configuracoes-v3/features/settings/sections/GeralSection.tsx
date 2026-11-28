"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  Globe,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Save,
  Settings,
} from "lucide-react";
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsCardSkeleton } from "../components/SettingsCardSkeleton";
import { SettingsStatusBadge } from "../components/SettingsStatusBadge";
import { SettingsFeedbackBanner } from "../components/SettingsFeedbackBanner";
import { SettingsSubSection } from "../components/SettingsSubSection";
import { SettingsReadonlySummary } from "../components/SettingsReadonlySummary";
import { SettingsDirtyDock, type DirtySectionSummary } from "../components/SettingsDirtyDock";
import { UnidadeAtivaRequiredBanner } from "../components/UnidadeAtivaRequiredBanner";
import { unitMonogram } from "../components/SettingsSidebar";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { useStoreBusiness } from "@/lib/use-store-business";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { useConfiguracoesNav } from "@/components/configuracoes-v3/contexts/ConfiguracoesNavContext";
import {
  GoLiveChecklistRafaCell,
  useOperationalReadiness,
} from "../components/GoLiveChecklistRafaCell";
import {
  BusinessResourcesCard,
  type BusinessResourcesController,
  type BusinessResourcesSaveOutcome,
} from "../components/BusinessResourcesCard";
import { parseStoreBasics } from "@/lib/store-basics";
import { useStoreBasics, useStoreBasicsScope } from "@/lib/use-store-basics";
import { usesClientExperience } from "@/lib/navigation/client-experience";
import {
  BUSINESS_BRANCHES,
  BUSINESS_RESOURCES,
  businessResourceModule,
  resolveBusinessResource,
} from "@/lib/store-business-capabilities";
import { cn } from "../../../lib/utils";

function GeralSectionContent({ storeId }: { storeId: string }) {
  const permissions = useEnterprisePermissions();
  const clientMode = usesClientExperience(permissions);
  const { toast } = useToast();
  const { navigateToSection, setSectionDirty, setSectionSaving } = useConfiguracoesNav();
  const { lojaAtivaRaw, refreshStoresList } = useLojaAtiva();
  const { refresh: refreshStoreSettings } = useStoreSettings();
  const business = useStoreBusiness();
  const editor = useStoreBasics(storeId);

  const [businessDirty, setBusinessDirty] = useState(false);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessUnconfirmed, setBusinessUnconfirmed] = useState(false);
  const [dockSaving, setDockSaving] = useState(false);
  const [checklistOverride, setChecklistOverride] = useState<boolean | null>(null);
  const [empresaPulsing, setEmpresaPulsing] = useState(false);

  const businessControllerRef = useRef<BusinessResourcesController | null>(null);
  const empresaCardRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const whatsappInputRef = useRef<HTMLInputElement | null>(null);
  const dockSavingRef = useRef(false);

  const emptyBasics = useMemo(() => parseStoreBasics({}, {}), []);
  const draftValues = editor.draft ?? emptyBasics;
  const confirmedBasics = editor.baseline ?? emptyBasics;

  const {
    name: nomeFantasia,
    cnpj,
    phone: telefone,
    contactEmail: email,
    contactWhatsapp: whatsapp,
    contactWhatsappDono: whatsappDono,
    address,
  } = draftValues;

  const noLoja = !storeId.trim();
  const readOnly = permissions !== null && permissions.admin.configuracoes === false;
  const { saving } = editor;
  const loadState = noLoja ? "empty" : editor.loading ? "loading" : !editor.draft ? "error" : "idle";
  const busy = editor.loading || saving || dockSaving;
  const formDisabled = busy || noLoja || readOnly;

  // Checklist e Ribbon usam estritamente o baseline confirmado pelo servidor quando carregado
  // (nunca ressuscitam CNPJ limpo via lojaAtivaRaw nem usam rascunhos não salvos).
  const hasConfirmedBasics = editor.baseline !== null;
  const confirmedEmpresaSnapshot = useMemo(
    () => ({
      nomeFantasia: hasConfirmedBasics
        ? confirmedBasics.name
        : noLoja
          ? ""
          : lojaAtivaRaw?.nomeFantasia?.trim() || "",
      cnpj: hasConfirmedBasics
        ? confirmedBasics.cnpj
        : noLoja
          ? ""
          : lojaAtivaRaw?.cnpj?.trim() || "",
      telefone: confirmedBasics.phone,
      email: confirmedBasics.contactEmail,
      whatsapp: confirmedBasics.contactWhatsapp,
    }),
    [confirmedBasics, hasConfirmedBasics, lojaAtivaRaw?.cnpj, lojaAtivaRaw?.nomeFantasia, noLoja],
  );

  const showPlatformChecklist = permissions?.platformAuthority === true;
  const readiness = useOperationalReadiness(
    confirmedEmpresaSnapshot,
    showPlatformChecklist,
    hasConfirmedBasics,
  );

  // Recolhido por padrão após a configuração inicial, sem ocultar contagem de pendências no Ribbon.
  const checklistExpanded =
    checklistOverride !== null
      ? checklistOverride
      : !editor.loading && !readiness.hasCoreSetup;

  // Contagem confirmada de recursos operacionais ativos para o Ribbon (nunca rascunho).
  const confirmedActiveResources = useMemo(() => {
    if (!business.ready) return null;
    return BUSINESS_RESOURCES.filter((item) => {
      if (item.stage !== "operational") return false;
      const moduleKey = businessResourceModule(item.key);
      if (moduleKey === "operacoes" && !permissions?.hubs.operacoes) return false;
      if (moduleKey === "deviceCatalog" && !permissions?.modules?.deviceCatalog) return false;
      return resolveBusinessResource(business.capabilities, item.key, business.legacyProfile).requested;
    }).length;
  }, [business.capabilities, business.legacyProfile, business.ready, permissions]);

  // Sincroniza o estado dirty e salvamento em andamento com o shell (dot âmbar + guardas de troca/saída).
  const anyDirty = !readOnly && (editor.dirty || businessDirty);
  const anySaving = saving || dockSaving || businessSaving;

  useEffect(() => {
    setSectionDirty("geral", anyDirty);
    return () => {
      setSectionDirty("geral", false);
    };
  }, [anyDirty, setSectionDirty]);

  useEffect(() => {
    setSectionSaving("geral", anySaving);
    return () => {
      setSectionSaving("geral", false);
    };
  }, [anySaving, setSectionSaving]);

  const dirtyList = useMemo<DirtySectionSummary[]>(() => {
    if (readOnly) return [];
    const list: DirtySectionSummary[] = [];
    if (editor.dirty) list.push({ id: "empresa", label: "Dados da empresa" });
    if (businessDirty) list.push({ id: "ramo", label: "Ramo e recursos" });
    return list;
  }, [businessDirty, editor.dirty, readOnly]);

  const pendingConfirmationOnly = !editor.dirty && businessUnconfirmed;

  const handleFocusEmpresa = useCallback((field: "name" | "contactWhatsapp") => {
    const card = empresaCardRef.current;
    if (card) {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      if (!reduced) {
        setEmpresaPulsing(false);
        requestAnimationFrame(() => setEmpresaPulsing(true));
        window.setTimeout(() => setEmpresaPulsing(false), 1250);
      }
    }
    const targetInput = field === "contactWhatsapp" ? whatsappInputRef.current : nameInputRef.current;
    if (targetInput && !targetInput.disabled) {
      window.setTimeout(() => targetInput.focus(), 220);
    }
  }, []);

  const handleDiscardEmpresa = useCallback(() => {
    editor.cancel();
    toast({
      title: "Alterações descartadas",
      description: "Dados da empresa restaurados ao último estado salvo.",
    });
  }, [editor, toast]);

  const handleSaveEmpresa = useCallback(
    async (opts?: { skipRefresh?: boolean }): Promise<boolean> => {
      if (readOnly || noLoja || !editor.dirty) return false;
      const ok = await editor.save();
      if (!ok) return false;
      if (!opts?.skipRefresh) {
        void refreshStoreSettings();
        void refreshStoresList();
      }
      toast({
        title: "Salvo",
        description: "Dados da empresa salvos e conferidos para esta unidade.",
        variant: "success",
      });
      return true;
    },
    [editor, noLoja, readOnly, refreshStoreSettings, refreshStoresList, toast],
  );

  const handleDockDiscardAll = useCallback(() => {
    if (dockSavingRef.current || saving || businessSaving || businessControllerRef.current?.isSaving()) return;
    if (editor.dirty) editor.cancel();
    if (businessDirty) businessControllerRef.current?.discard();
    toast({
      title: "Alterações descartadas",
      description: "Os blocos alterados voltaram ao último estado confirmado.",
    });
  }, [businessDirty, businessSaving, editor, saving, toast]);

  /**
   * Coordena os dois formulários independentes sem criar transação artificial.
   * Adia refreshStoreSettings até ambos concluírem (evita corrida GET/PUT durante salvamento combinado).
   * Em falha parcial ou releitura não confirmada, preserva os rascunhos e nunca exibe confirmação global falsa.
   */
  const handleDockSaveAll = useCallback(async () => {
    if (dockSavingRef.current || saving || businessSaving || businessControllerRef.current?.isSaving() || readOnly || noLoja) {
      return;
    }
    const needEmp = editor.dirty;
    const needBus = businessDirty && Boolean(businessControllerRef.current?.isDirty());
    if (!needEmp && !needBus) return;

    dockSavingRef.current = true;
    setDockSaving(true);
    try {
      const empOk = needEmp ? await handleSaveEmpresa({ skipRefresh: true }) : true;
      const busOutcome: BusinessResourcesSaveOutcome = needBus
        ? await (businessControllerRef.current?.save() ?? Promise.resolve("failed" as const))
        : "confirmed";
      const busConfirmed = busOutcome === "confirmed";

      if (needEmp && empOk) {
        void refreshStoresList();
        // Se Ramo e recursos não foi salvo nem está aguardando revalidação de releitura, revalida settings.
        if (!needBus || busOutcome === "failed") {
          void refreshStoreSettings();
        }
      }

      if (needEmp && needBus && busOutcome === "unconfirmed") {
        toast({
          title: empOk ? "Confirmação pendente em Ramo e recursos" : "Salvamento parcial com confirmação pendente",
          description: empOk
            ? "Dados da empresa foram salvos, mas a releitura de Ramo e recursos falhou. Suas seleções foram mantidas — use 'Confirmar estado salvo'."
            : "Dados da empresa falhou e Ramo e recursos aguarda confirmação de releitura. Seus preenchimentos foram mantidos.",
          variant: empOk ? "default" : "destructive",
        });
      } else if (needEmp && needBus && empOk !== busConfirmed) {
        toast({
          title: "Salvamento parcial",
          description: empOk
            ? "Dados da empresa foram salvos, mas Ramo e recursos falhou. Suas escolhas foram mantidas para nova tentativa."
            : "Ramo e recursos foi salvo, mas Dados da empresa falhou. Seu preenchimento foi mantido — revise o aviso no formulário.",
          variant: "destructive",
        });
      }
    } finally {
      dockSavingRef.current = false;
      setDockSaving(false);
    }
  }, [
    businessDirty,
    businessSaving,
    editor.dirty,
    handleSaveEmpresa,
    noLoja,
    readOnly,
    refreshStoreSettings,
    refreshStoresList,
    saving,
    toast,
  ]);

  const pageTitle = clientMode ? "Dados da loja" : "Geral";
  const confirmedUnitName = noLoja
    ? "Nenhuma unidade ativa"
    : confirmedEmpresaSnapshot.nomeFantasia || "Unidade sem nome cadastrado";
  const confirmedCnpj = confirmedEmpresaSnapshot.cnpj;
  const ribbonMonogram = noLoja ? "!" : unitMonogram(confirmedUnitName);
  const confirmedBranchLabel = business.ready ? BUSINESS_BRANCHES[business.branch] : null;

  return (
    <div className={cn("cfg-geral-root space-y-3.5 sm:space-y-4", anyDirty && "pb-16")}>
      {/* ── 0. CABEÇALHO EDITORIAL DE CONFIGURAÇÕES (Desktop; mobile já usa topbar contextual) ── */}
      <header className="hidden lg:flex items-center justify-between gap-4 pb-0.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border shadow-xs"
            style={{
              backgroundColor: "var(--cfg-primary-soft)",
              borderColor: "var(--cfg-primary-border)",
              color: "var(--cfg-primary-text)",
            }}
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h1
              className="text-[21px] font-bold leading-tight tracking-[-0.02em]"
              style={{ color: "var(--cfg-fg)" }}
            >
              Configurações
            </h1>
            <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--cfg-muted)" }}>
              {clientMode
                ? "Identidade, contatos e operação da unidade ativa"
                : "Identidade e prontidão operacional"}
            </p>
          </div>
        </div>
      </header>

      {/* ── 1. UNIT IDENTITY & READINESS RIBBON (Largura total) ────── */}
      <section className="cfg-card overflow-hidden" aria-label="Identidade e prontidão da unidade">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-[13px] font-bold tracking-tight"
              style={{
                backgroundColor: noLoja ? "var(--cfg-warning-soft)" : "var(--cfg-primary-soft)",
                borderColor: noLoja ? "var(--cfg-warning-border)" : "var(--cfg-primary-border)",
                color: noLoja ? "var(--cfg-warning-fg)" : "var(--cfg-primary-text)",
              }}
            >
              {ribbonMonogram}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h2
                  className="text-[15.5px] font-semibold leading-tight tracking-tight"
                  style={{ color: "var(--cfg-fg)" }}
                >
                  {pageTitle}
                </h2>
                <span aria-hidden="true" style={{ color: "var(--cfg-border-strong)" }}>
                  ·
                </span>
                <span
                  className="truncate text-[13.5px] font-medium"
                  style={{ color: "var(--cfg-fg-body)" }}
                >
                  {confirmedUnitName}
                </span>
              </div>

              <div
                className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                style={{ color: "var(--cfg-muted)" }}
              >
                {!noLoja ? (
                  <>
                    {confirmedCnpj ? (
                      <span className="font-mono text-[11.5px] tabular-nums">{confirmedCnpj}</span>
                    ) : (
                      <span className="text-[11.5px]">CNPJ pendente</span>
                    )}
                    {confirmedBranchLabel ? (
                      <>
                        <span aria-hidden="true" style={{ color: "var(--cfg-border-strong)" }}>
                          •
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: "var(--cfg-inset)",
                            borderColor: "var(--cfg-border)",
                            color: "var(--cfg-fg-body)",
                          }}
                        >
                          <span>{confirmedBranchLabel}</span>
                          {confirmedActiveResources !== null ? (
                            <span style={{ color: "var(--cfg-muted)" }}>
                              · {confirmedActiveResources}{" "}
                              {confirmedActiveResources === 1 ? "recurso ativo" : "recursos ativos"}
                            </span>
                          ) : null}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span>Selecione uma unidade para configurar dados, ramo e recursos.</span>
                )}
                {readOnly ? (
                  <SettingsStatusBadge tone="readonly" icon={<Lock className="h-3 w-3" />}>
                    Somente leitura
                  </SettingsStatusBadge>
                ) : null}
              </div>
            </div>
          </div>

          {/* Gatilho integrado de prontidão (Plataforma) OU status da unidade (Cliente) */}
          {showPlatformChecklist ? (
            <div className="flex shrink-0 flex-wrap items-center gap-3.5">
              <div className="hidden flex-col items-end gap-1.5 sm:flex">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold tabular-nums" style={{ color: "var(--cfg-fg)" }}>
                    {readiness.doneCount}/{readiness.totalCount} prontos
                  </span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--cfg-muted)" }}>
                    ({readiness.percent}%)
                  </span>
                </div>
                <div
                  className="h-1.5 w-32 overflow-hidden rounded-full"
                  style={{ backgroundColor: "var(--cfg-hover)" }}
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${readiness.percent}%`,
                      backgroundColor: "var(--cfg-success-dot)",
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                aria-expanded={checklistExpanded}
                aria-controls={checklistExpanded ? "checklist-prontidao" : undefined}
                onClick={() => setChecklistOverride((prev) => !(prev ?? checklistExpanded))}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  backgroundColor:
                    readiness.attentionCount > 0 ? "var(--cfg-warning-soft)" : "var(--cfg-inset)",
                  borderColor:
                    readiness.attentionCount > 0 ? "var(--cfg-warning-border)" : "var(--cfg-border-strong)",
                  color: readiness.attentionCount > 0 ? "var(--cfg-warning-fg)" : "var(--cfg-fg)",
                }}
              >
                {readiness.attentionCount > 0 ? (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "var(--cfg-warning-dot)" }}
                  />
                ) : null}
                <span>
                  {checklistExpanded
                    ? "Recolher prontidão"
                    : readiness.attentionCount > 0
                      ? `${readiness.attentionCount} para revisar`
                      : "Prontidão"}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-150",
                    checklistExpanded && "rotate-180",
                  )}
                />
              </button>
            </div>
          ) : (
            <SettingsStatusBadge tone={noLoja ? "review" : "active"} showDot>
              {noLoja ? "Unidade pendente" : "Unidade ativa"}
            </SettingsStatusBadge>
          )}
        </div>

        {/* Checklist de prontidão operacional retrátil embutido */}
        {showPlatformChecklist && checklistExpanded ? (
          <GoLiveChecklistRafaCell
            embedded
            empresa={confirmedEmpresaSnapshot}
            precomputedItems={readiness.items}
            onFocusEmpresa={handleFocusEmpresa}
          />
        ) : null}
      </section>

      {/* Banner unificado quando nenhuma unidade está selecionada */}
      {noLoja ? (
        <UnidadeAtivaRequiredBanner
          clientMode={clientMode === true}
          onSelectStore={
            permissions?.platformAuthority ? () => navigateToSection("lojas") : undefined
          }
        />
      ) : null}

      {/* ── COMPOSIÇÃO ADAPTATIVA EM DUAS COLUNAS (~58/42 acima de 1000px úteis; vertical abaixo) ── */}
      <div className="cfg-geral-grid" data-has-ramo={!noLoja ? "true" : "false"}>
        {/* ── 2. DADOS DA EMPRESA (#dados-empresa · Coluna esquerda) ────── */}
        <div className="cfg-geral-col-empresa min-w-0">
          {loadState === "loading" ? (
            <SettingsCardSkeleton variant="form" label="Carregando dados da empresa…" />
          ) : loadState === "error" ? (
            <section id="dados-empresa" className="scroll-mt-6">
              <SettingsFeedbackBanner
                variant="error"
                role="alert"
                title="Não foi possível carregar os dados da unidade."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={editor.retryLoad}>
                    Tentar novamente
                  </Button>
                }
              >
                Recarregue os dados ou troque a unidade ativa para tentar novamente.
              </SettingsFeedbackBanner>
            </section>
          ) : (
            <section
              id="dados-empresa"
              ref={empresaCardRef}
              className={cn("scroll-mt-6 rounded-xl", empresaPulsing && "cfg-pulse")}
            >
              <SettingsCard
                className="cfg-empresa-card"
                bodyClassName="cfg-empresa-body"
                icon={<Building2 className="h-4 w-4" />}
                title="Dados da empresa"
                description="Aparecem em recibos, orçamentos, notas e relatórios da unidade."
                headerExtra={
                  editor.dirty ? (
                    <SettingsStatusBadge tone="dirty" showDot>
                      Alterações não salvas
                    </SettingsStatusBadge>
                  ) : undefined
                }
                feedback={
                  editor.message ? (
                    <SettingsFeedbackBanner
                      variant={editor.messageTone === "error" ? "error" : "success"}
                      role={editor.messageTone === "error" ? "alert" : "status"}
                    >
                      {editor.message}
                    </SettingsFeedbackBanner>
                  ) : undefined
                }
                footerHint="Alterações gravadas e conferidas apenas para a unidade ativa."
                footer={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDiscardEmpresa}
                      disabled={formDisabled || !editor.dirty}
                    >
                      Descartar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSaveEmpresa()}
                      disabled={formDisabled || !editor.dirty}
                    >
                      <Save className="size-3.5" aria-hidden="true" />
                      {saving ? "Salvando…" : "Salvar alterações"}
                    </Button>
                  </>
                }
              >
                <div className="space-y-4">
                  {readOnly ? (
                    <SettingsFeedbackBanner variant="readonly">
                      Somente responsáveis com permissão de Configurações podem editar os dados desta unidade.
                    </SettingsFeedbackBanner>
                  ) : null}

                  {/* Subbloco 1: Identificação */}
                  <SettingsSubSection title="Identificação">
                    <div className="grid grid-cols-12 gap-x-3 gap-y-3">
                      <div className="col-span-12 sm:col-span-7">
                        <Field
                          ref={nameInputRef}
                          label="Nome da empresa"
                          requiredIndicator
                          value={nomeFantasia}
                          onChange={(e) => editor.setField("name", e.target.value)}
                          placeholder="Minha Empresa LTDA"
                          disabled={formDisabled}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-5">
                        <Field
                          label="CNPJ"
                          value={cnpj}
                          onChange={(e) => editor.setField("cnpj", e.target.value)}
                          placeholder="00.000.000/0001-00"
                          disabled={formDisabled}
                          className="font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  </SettingsSubSection>

                  {/* Subbloco 2: Canais de contato (grade 2×2 equilibrada nas Refs 01 e 02) */}
                  <SettingsSubSection title="Canais de contato" divided>
                    <div className="cfg-contact-grid">
                      <Field
                        label="Email"
                        type="email"
                        icon={<Mail className="h-3.5 w-3.5" />}
                        value={email}
                        onChange={(e) => editor.setField("contactEmail", e.target.value)}
                        placeholder="contato@empresa.com"
                        disabled={formDisabled}
                      />
                      <Field
                        label="Telefone"
                        icon={<Phone className="h-3.5 w-3.5" />}
                        value={telefone}
                        onChange={(e) => editor.setField("phone", e.target.value)}
                        placeholder="(00) 00000-0000"
                        disabled={formDisabled}
                        className="tabular-nums"
                      />
                      <Field
                        ref={whatsappInputRef}
                        label="WhatsApp (loja)"
                        hint="Recibos"
                        icon={<MessageCircle className="h-3.5 w-3.5" />}
                        value={whatsapp}
                        onChange={(e) => editor.setField("contactWhatsapp", e.target.value)}
                        placeholder="(00) 00000-0000"
                        disabled={formDisabled}
                        className="tabular-nums"
                      />
                      <Field
                        label="WhatsApp (responsável)"
                        hint="Gerencial"
                        icon={<MessageCircle className="h-3.5 w-3.5" />}
                        value={whatsappDono}
                        onChange={(e) => editor.setField("contactWhatsappDono", e.target.value)}
                        placeholder="(00) 00000-0000"
                        disabled={formDisabled}
                        className="tabular-nums"
                      />
                    </div>
                  </SettingsSubSection>

                  {/* Subbloco 3: Endereço da unidade (grid brasileiro de 12 colunas sem linhas órfãs no mobile) */}
                  <SettingsSubSection title="Endereço da unidade" divided>
                    <div className="grid grid-cols-12 gap-x-3 gap-y-3">
                      <div className="col-span-12 sm:col-span-4">
                        <Field
                          label="CEP"
                          icon={<MapPin className="h-3.5 w-3.5" />}
                          value={address.cep}
                          onChange={(e) => editor.setAddressField("cep", e.target.value)}
                          placeholder="00000-000"
                          disabled={formDisabled}
                          className="font-mono tabular-nums"
                        />
                      </div>
                      <div className="col-span-8 sm:col-span-5">
                        <Field
                          label="Rua"
                          value={address.rua}
                          onChange={(e) => editor.setAddressField("rua", e.target.value)}
                          disabled={formDisabled}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-3">
                        <Field
                          label="Número"
                          value={address.numero}
                          onChange={(e) => editor.setAddressField("numero", e.target.value)}
                          disabled={formDisabled}
                          className="tabular-nums"
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-5">
                        <Field
                          label="Bairro"
                          value={address.bairro}
                          onChange={(e) => editor.setAddressField("bairro", e.target.value)}
                          disabled={formDisabled}
                        />
                      </div>
                      <div className="col-span-8 sm:col-span-5">
                        <Field
                          label="Cidade"
                          value={address.cidade}
                          onChange={(e) => editor.setAddressField("cidade", e.target.value)}
                          disabled={formDisabled}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Field
                          label="Estado"
                          value={address.estado}
                          onChange={(e) => editor.setAddressField("estado", e.target.value)}
                          maxLength={2}
                          disabled={formDisabled}
                          className="uppercase"
                        />
                      </div>
                    </div>
                  </SettingsSubSection>
                </div>
              </SettingsCard>
            </section>
          )}
        </div>

        {/* ── 3. RAMO E RECURSOS (#ramo-recursos · Coluna direita) ──────── */}
        {!noLoja ? (
          <div className="cfg-geral-col-ramo min-w-0">
            <BusinessResourcesCard
              externalBusy={dockSaving || saving}
              onDirtyChange={setBusinessDirty}
              onSavingChange={setBusinessSaving}
              onUnconfirmedChange={setBusinessUnconfirmed}
              controllerRef={businessControllerRef}
            />
          </div>
        ) : null}

        {/* ── 4. PREFERÊNCIAS REGIONAIS (encaixado na coluna esquerda em 2 colunas; base no vertical) ── */}
        {!noLoja && clientMode === false ? (
          <div className="cfg-geral-col-regional min-w-0">
            <SettingsReadonlySummary
              icon={<Globe className="h-4 w-4" />}
              title="Preferências regionais"
              description="Padrão operacional ativo (somente leitura). A personalização por unidade estará disponível em breve."
              items={[
                { label: "Moeda", value: "Real (BRL · R$)" },
                { label: "Fuso horário", value: "América/São Paulo (GMT-3)" },
              ]}
            />
          </div>
        ) : null}
      </div>

      {/* ── 5. STICKY DIRTY DOCK (coordena os 2 blocos independentes) ─────── */}
      <SettingsDirtyDock
        dirtySections={dirtyList}
        saving={anySaving}
        pendingConfirmationOnly={pendingConfirmationOnly}
        onDiscardAll={handleDockDiscardAll}
        onSaveAll={() => void handleDockSaveAll()}
      />
    </div>
  );
}

type FieldProps = {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  requiredIndicator?: boolean;
} & React.ComponentProps<typeof Input>;

const Field = ({
  label,
  hint,
  icon,
  requiredIndicator,
  className,
  ref,
  ...rest
}: FieldProps) => {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-0.5">
          <Label htmlFor={id} className="truncate text-xs font-medium" style={{ color: "var(--cfg-fg)" }}>
            {label}
          </Label>
          {requiredIndicator ? (
            <span aria-hidden="true" className="text-xs font-semibold text-destructive">
              *
            </span>
          ) : null}
        </div>
        {hint ? (
          <span className="shrink-0 text-[10.5px]" style={{ color: "var(--cfg-subtle)" }}>
            {hint}
          </span>
        ) : null}
      </div>
      <div className="relative">
        {icon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--cfg-input-icon)" }}
          >
            {icon}
          </span>
        ) : null}
        <Input
          ref={ref}
          id={id}
          aria-required={requiredIndicator || undefined}
          className={cn("cfg-input h-9", icon && "pl-8", className)}
          {...rest}
        />
      </div>
    </div>
  );
};

/** Usa `AppOpsProviders` do dashboard — sem providers duplicados. */
export function GeralSection() {
  const { storeId, scope } = useStoreBasicsScope();
  return <GeralSectionContent key={scope} storeId={storeId} />;
}
