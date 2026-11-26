"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SETTINGS_SECTIONS, sectionLabel, type SectionId } from "./features/settings/sections";
import { isSectionId, parseSectionFromSearchParam } from "./features/settings/section-routing";
import { SettingsSidebar } from "./features/settings/components/SettingsSidebar";
import { GeralSection } from "./features/settings/sections/GeralSection";
import { LojasSection } from "./features/settings/sections/LojasSection";
import { PlanoSection } from "./features/settings/sections/PlanoSection";
import { AparenciaSection } from "./features/settings/sections/AparenciaSection";
import { PdvSection } from "./features/settings/sections/PdvSection";
import { VendasSection } from "./features/settings/sections/VendasSection";
import { FinanceiroSection } from "./features/settings/sections/FinanceiroSection";
import { FiscalSection } from "./features/settings/sections/FiscalSection";
import { IaSection } from "./features/settings/sections/IaSection";
import { IntegracoesSection } from "./features/settings/sections/IntegracoesSection";
import { ImportacaoSection } from "./features/settings/sections/ImportacaoSection";
import { UsuariosSection } from "./features/settings/sections/UsuariosSection";
import { AuditoriaSection } from "./features/settings/sections/AuditoriaSection";
import { SegurancaSection } from "./features/settings/sections/SegurancaSection";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "./components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";
import { Button } from "./components/ui/button";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ConfiguracoesNavProvider } from "./contexts/ConfiguracoesNavContext";
import { Toaster } from "./components/ui/toaster";
import { registrarGuardaTrocaLoja, useLojaAtiva } from "@/lib/loja-ativa";
import { registerRouteExitGuard } from "@/lib/navigation/route-exit-guard";
import "./configuracoes-v3.css";
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions";
import { canAccessSettingsSection } from "@/lib/auth/page-access";
import { usesClientExperience } from "@/lib/navigation/client-experience";

const SECTION_COMPONENTS: Record<SectionId, () => JSX.Element> = {
  geral: GeralSection,
  lojas: LojasSection,
  plano: PlanoSection,
  aparencia: AparenciaSection,
  pdv: PdvSection,
  vendas: VendasSection,
  financeiro: FinanceiroSection,
  fiscal: FiscalSection,
  ia: IaSection,
  integracoes: IntegracoesSection,
  importacao: ImportacaoSection,
  usuarios: UsuariosSection,
  auditoria: AuditoriaSection,
  seguranca: SegurancaSection,
};

const CONFIG_PATH = "/dashboard/configuracoes";

type PendingNavigation =
  | { kind: "section"; id: SectionId }
  | { kind: "external"; href: string; label: string }
  | { kind: "store"; storeId: string; label: string; commit: () => void };

export default function ConfiguracoesV3Page() {
  const permissions = useEnterprisePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const secFromUrl = parseSectionFromSearchParam(searchParams.get("sec"));
  const [active, setActive] = useState<SectionId>(secFromUrl);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dirtySections, setDirtySections] = useState<ReadonlySet<SectionId>>(() => new Set());
  const [savingSections, setSavingSections] = useState<ReadonlySet<SectionId>>(() => new Set());
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);

  const permittedActive = canAccessSettingsSection(permissions, active) ? active : "geral";
  const { lojas, lojaAtivaId, lojaAtivaRaw } = useLojaAtiva();
  const storeScopeKey = lojaAtivaId?.trim() || "__sem_unidade__";

  const dirtySectionsRef = useRef(dirtySections);
  const savingSectionsRef = useRef(savingSections);
  const permittedActiveRef = useRef(permittedActive);
  const lojasRef = useRef(lojas);
  dirtySectionsRef.current = dirtySections;
  savingSectionsRef.current = savingSections;
  permittedActiveRef.current = permittedActive;
  lojasRef.current = lojas;

  useEffect(() => {
    setActive(secFromUrl);
  }, [secFromUrl]);

  // Limpa flags de sujeira/salvamento e diálogos pendentes ao trocar a unidade ativa (sem vazamento entre lojas).
  useEffect(() => {
    const empty = new Set<SectionId>();
    dirtySectionsRef.current = empty;
    savingSectionsRef.current = empty;
    setDirtySections(empty);
    setSavingSections(empty);
    setPendingNav(null);
  }, [storeScopeKey]);

  const hasGuardActive = dirtySections.size > 0 || savingSections.size > 0;

  // Protege fechamento/recarregamento da guia do navegador quando há alterações não salvas ou salvamento em andamento.
  useEffect(() => {
    if (!hasGuardActive) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasGuardActive]);

  // Protege troca de unidade via seletor global (StoreSwitcher) ou qualquer consumidor de setLojaAtivaId.
  useEffect(() => {
    return registrarGuardaTrocaLoja({
      temRascunhoSujo: () =>
        dirtySectionsRef.current.has(permittedActiveRef.current) ||
        savingSectionsRef.current.has(permittedActiveRef.current),
      solicitarSaida: (trocar, descricao) => {
        const targetId = descricao.replace(/^troca de loja para\s+/i, "").trim();
        const targetStore = lojasRef.current.find((l) => l.id === targetId);
        const label = targetStore?.nomeFantasia?.trim() || targetId || "outra unidade";
        setMobileOpen(false);
        setPendingNav({ kind: "store", storeId: targetId, label, commit: trocar });
        return "bloqueada";
      },
    });
  }, []);

  // Protege saídas programáticas (ex.: Command Menu ⌘K da Topbar global) sem redesenhar o shell global.
  useEffect(() => {
    return registerRouteExitGuard({
      shouldBlock: (href) => {
        if (
          !dirtySectionsRef.current.has(permittedActiveRef.current) &&
          !savingSectionsRef.current.has(permittedActiveRef.current)
        ) {
          return false;
        }
        try {
          const url = new URL(href, window.location.href);
          if (
            url.pathname === CONFIG_PATH &&
            parseSectionFromSearchParam(url.searchParams.get("sec")) === permittedActiveRef.current
          ) {
            return false;
          }
        } catch {
          /* segue para bloquear destino desconhecido */
        }
        return true;
      },
      requestExit: (href, label) => {
        setMobileOpen(false);
        setPendingNav({ kind: "external", href, label: label || "outra página" });
        return true;
      },
    });
  }, []);

  // Intercepta links <a href> do shell global (Sidebar, Topbar, MobileNavSheet, Breadcrumb, Novo, Minha conta)
  // em fase de captura antes do Next.js <Link> navegar; mantém propagation para fechar sheets móveis.
  useEffect(() => {
    if (!hasGuardActive) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      if (
        !dirtySectionsRef.current.has(permittedActiveRef.current) &&
        !savingSectionsRef.current.has(permittedActiveRef.current)
      ) {
        return;
      }
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (
        url.pathname === CONFIG_PATH &&
        parseSectionFromSearchParam(url.searchParams.get("sec")) === permittedActiveRef.current
      ) {
        return;
      }
      event.preventDefault();
      const nextHref = `${url.pathname}${url.search}${url.hash}`;
      const label =
        anchor.getAttribute("aria-label")?.trim() ||
        anchor.textContent?.replace(/\s+/g, " ").trim().slice(0, 60) ||
        url.pathname;
      setMobileOpen(false);
      setPendingNav({ kind: "external", href: nextHref, label });
    };
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [hasGuardActive]);

  const setSectionDirty = useCallback((id: SectionId, dirty: boolean) => {
    setDirtySections((prev) => {
      const has = prev.has(id);
      if (has === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      dirtySectionsRef.current = next;
      return next;
    });
  }, []);

  const setSectionSaving = useCallback((id: SectionId, saving: boolean) => {
    setSavingSections((prev) => {
      const has = prev.has(id);
      if (has === saving) return prev;
      const next = new Set(prev);
      if (saving) next.add(id);
      else next.delete(id);
      savingSectionsRef.current = next;
      return next;
    });
  }, []);

  const syncUrl = useCallback(
    (id: SectionId) => {
      const base = pathname?.startsWith(CONFIG_PATH) ? pathname : CONFIG_PATH;
      const params = new URLSearchParams(searchParams.toString());
      params.set("sec", id);
      router.replace(`${base}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const raw = searchParams.get("sec");
    if (!raw?.trim()) return;
    if (!isSectionId(raw.trim().toLowerCase())) {
      syncUrl("geral");
    }
  }, [searchParams, syncUrl]);

  const clearCurrentDirty = useCallback(() => {
    setDirtySections((prev) => {
      if (!prev.has(permittedActive)) return prev;
      const next = new Set(prev);
      next.delete(permittedActive);
      dirtySectionsRef.current = next;
      return next;
    });
  }, [permittedActive]);

  const commitSectionNavigation = useCallback(
    (id: SectionId) => {
      clearCurrentDirty();
      setPendingNav(null);
      setActive(id);
      setMobileOpen(false);
      syncUrl(id);
    },
    [clearCurrentDirty, syncUrl],
  );

  const commitPendingNavigation = useCallback(() => {
    if (!pendingNav) return;
    // Nunca interrompe um salvamento em andamento.
    if (savingSectionsRef.current.has(permittedActiveRef.current)) return;

    if (pendingNav.kind === "section") {
      commitSectionNavigation(pendingNav.id);
      return;
    }
    if (pendingNav.kind === "store") {
      const runSwitch = pendingNav.commit;
      const cleared = new Set(dirtySectionsRef.current);
      cleared.delete(permittedActiveRef.current);
      dirtySectionsRef.current = cleared;
      setDirtySections(cleared);
      setPendingNav(null);
      setMobileOpen(false);
      runSwitch();
      return;
    }
    const targetHref = pendingNav.href;
    const cleared = new Set(dirtySectionsRef.current);
    cleared.delete(permittedActiveRef.current);
    dirtySectionsRef.current = cleared;
    setDirtySections(cleared);
    setPendingNav(null);
    setMobileOpen(false);
    router.push(targetHref);
  }, [commitSectionNavigation, pendingNav, router]);

  const navigateToSection = useCallback(
    (id: SectionId) => {
      if (id === permittedActive) {
        setMobileOpen(false);
        return;
      }
      if (dirtySectionsRef.current.has(permittedActive) || savingSectionsRef.current.has(permittedActive)) {
        setMobileOpen(false);
        setPendingNav({ kind: "section", id });
        return;
      }
      commitSectionNavigation(id);
    },
    [commitSectionNavigation, permittedActive],
  );

  const requestExternalNavigation = useCallback(
    (href: string, label?: string): boolean => {
      if (!dirtySectionsRef.current.has(permittedActive) && !savingSectionsRef.current.has(permittedActive)) {
        return false;
      }
      setMobileOpen(false);
      setPendingNav({ kind: "external", href, label: label || "outra página" });
      return true;
    },
    [permittedActive],
  );

  const handleChange = useCallback(
    (id: SectionId) => {
      navigateToSection(id);
    },
    [navigateToSection],
  );

  const Active = SECTION_COMPONENTS[permittedActive];
  const clientMode = usesClientExperience(permissions);
  // O título acompanha a seção efetivamente exibida (seção negada cai em Geral).
  const currentLabel = sectionLabel(
    SETTINGS_SECTIONS.find((s) => s.id === permittedActive),
    clientMode,
  );
  const pendingLabel =
    pendingNav?.kind === "section"
      ? sectionLabel(
          SETTINGS_SECTIONS.find((s) => s.id === pendingNav.id),
          clientMode,
        )
      : pendingNav?.label ?? "";
  const hasStore = Boolean(lojaAtivaId?.trim());
  const storePillName = hasStore ? lojaAtivaRaw?.nomeFantasia?.trim() || "Unidade ativa" : "Sem unidade";

  const activeSectionDirty = dirtySections.has(permittedActive);
  const activeSectionSaving = savingSections.has(permittedActive);
  const isStoreSwitchPending = pendingNav?.kind === "store";

  const dialogTitle = activeSectionSaving
    ? `Salvamento em andamento em ${currentLabel}`
    : activeSectionDirty
      ? `Alterações não salvas em ${currentLabel}`
      : "Salvamento concluído";

  const dialogCancelLabel = activeSectionSaving
    ? "Aguardar conclusão"
    : activeSectionDirty
      ? "Continuar editando"
      : `Permanecer em ${currentLabel}`;

  const dialogActionLabel = activeSectionSaving
    ? "Salvando…"
    : activeSectionDirty
      ? isStoreSwitchPending
        ? "Descartar e trocar unidade"
        : "Sair sem salvar"
      : isStoreSwitchPending
        ? `Trocar para ${pendingLabel}`
        : `Ir para ${pendingLabel}`;

  return (
    <ThemeProvider>
      <ConfiguracoesNavProvider
        navigateToSection={navigateToSection}
        requestExternalNavigation={requestExternalNavigation}
        setSectionDirty={setSectionDirty}
        dirtySections={dirtySections}
        setSectionSaving={setSectionSaving}
        savingSections={savingSections}
      >
        <div className="configuracoes-v3-root configuracoes-v3-app flex h-full w-full text-foreground">
          {/* Sidebar — desktop */}
          <div className={permittedActive === "pdv" ? "hidden" : "hidden lg:flex h-full shrink-0"}>
            <SettingsSidebar active={permittedActive} onChange={handleChange} />
          </div>

          {/* Conteúdo */}
          <main className="relative flex-1 min-w-0 flex flex-col h-full">
            {/* Top bar mobile / tablet (< lg) */}
            {permittedActive !== "pdv" && (
              <header
                className="flex items-center justify-between gap-3 border-b px-4 py-2.5 lg:hidden"
                style={{
                  backgroundColor: "var(--cfg-surface)",
                  borderColor: "var(--cfg-border)",
                }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Abrir navegação de Configurações"
                      >
                        <Menu className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="left"
                      hideCloseButton
                      aria-describedby={undefined}
                      className="w-[272px] p-0"
                    >
                      <SheetTitle className="sr-only">Navegação de Configurações</SheetTitle>
                      <SettingsSidebar
                        active={permittedActive}
                        onChange={handleChange}
                        headerAction={
                          <SheetClose asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Fechar navegação de Configurações"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </SheetClose>
                        }
                      />
                    </SheetContent>
                  </Sheet>
                  <div className="min-w-0 leading-tight">
                    <p className="text-[11px] font-medium" style={{ color: "var(--cfg-muted)" }}>
                      Configurações
                    </p>
                    <h1
                      className="truncate text-sm font-semibold tracking-tight sm:text-base"
                      style={{ color: "var(--cfg-fg)" }}
                    >
                      {currentLabel}
                    </h1>
                  </div>
                </div>

                <span
                  className="inline-flex max-w-[170px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: "var(--cfg-inset)",
                    borderColor: hasStore ? "var(--cfg-border)" : "var(--cfg-warning-border)",
                    color: hasStore ? "var(--cfg-fg-body)" : "var(--cfg-warning-fg)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: hasStore ? "var(--cfg-success-dot)" : "var(--cfg-warning-dot)" }}
                  />
                  <span className="truncate">{storePillName}</span>
                </span>
              </header>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto scroll-elegant">
              <div
                key={`${permittedActive}-${storeScopeKey}`}
                className={`mx-auto w-full px-4 py-4 sm:px-6 sm:py-5 xl:px-8 xl:py-6 animate-fade-in ${
                  permittedActive === "pdv" ? "max-w-7xl" : "max-w-[1040px]"
                }`}
              >
                <Active />
              </div>
            </div>
          </main>
        </div>

        {/* Guarda segura de navegação e troca de unidade (alterações pendentes ou salvamento em andamento) */}
        <AlertDialog open={pendingNav !== null} onOpenChange={(open) => !open && setPendingNav(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {activeSectionSaving ? (
                  isStoreSwitchPending ? (
                    <>
                      Aguarde a conclusão do salvamento atual antes de trocar para{" "}
                      <strong className="font-medium text-foreground">{pendingLabel}</strong>, para evitar perda de
                      alterações ou estado inconsistente entre unidades.
                    </>
                  ) : (
                    <>
                      Aguarde a conclusão do salvamento atual antes de avançar para{" "}
                      <strong className="font-medium text-foreground">{pendingLabel}</strong>, para evitar interrupção
                      do envio ou perda de confirmação.
                    </>
                  )
                ) : activeSectionDirty ? (
                  isStoreSwitchPending ? (
                    <>
                      Você possui alterações pendentes nesta unidade. Se trocar para{" "}
                      <strong className="font-medium text-foreground">{pendingLabel}</strong> agora, suas edições não
                      salvas serão descartadas.
                    </>
                  ) : (
                    <>
                      Você editou campos nesta tela sem salvar. Se avançar para{" "}
                      <strong className="font-medium text-foreground">{pendingLabel}</strong> agora, suas alterações
                      pendentes serão descartadas.
                    </>
                  )
                ) : (
                  <>
                    As alterações foram confirmadas para esta unidade. Você já pode prosseguir para{" "}
                    <strong className="font-medium text-foreground">{pendingLabel}</strong> com segurança.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingNav(null)}>{dialogCancelLabel}</AlertDialogCancel>
              <AlertDialogAction disabled={activeSectionSaving} onClick={commitPendingNavigation}>
                {dialogActionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Toaster />
      </ConfiguracoesNavProvider>
    </ThemeProvider>
  );
}
