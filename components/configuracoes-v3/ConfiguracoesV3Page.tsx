"use client";

import { useCallback, useEffect, useState, type JSX } from "react";
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
import { useLojaAtiva } from "@/lib/loja-ativa";
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
  | { kind: "external"; href: string; label: string };

export default function ConfiguracoesV3Page() {
  const permissions = useEnterprisePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const secFromUrl = parseSectionFromSearchParam(searchParams.get("sec"));
  const [active, setActive] = useState<SectionId>(secFromUrl);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dirtySections, setDirtySections] = useState<ReadonlySet<SectionId>>(() => new Set());
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);

  const permittedActive = canAccessSettingsSection(permissions, active) ? active : "geral";
  const { lojaAtivaId, lojaAtivaRaw } = useLojaAtiva();
  const storeScopeKey = lojaAtivaId?.trim() || "__sem_unidade__";

  useEffect(() => {
    setActive(secFromUrl);
  }, [secFromUrl]);

  // Limpa flags de sujeira e diálogos pendentes ao trocar a unidade ativa (sem vazamento entre lojas).
  useEffect(() => {
    setDirtySections(new Set());
    setPendingNav(null);
  }, [storeScopeKey]);

  // Protege fechamento/recarregamento da guia do navegador quando há alterações não salvas.
  const hasAnyDirty = dirtySections.size > 0;
  useEffect(() => {
    if (!hasAnyDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasAnyDirty]);

  const setSectionDirty = useCallback((id: SectionId, dirty: boolean) => {
    setDirtySections((prev) => {
      const has = prev.has(id);
      if (has === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
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
    if (pendingNav.kind === "section") {
      commitSectionNavigation(pendingNav.id);
      return;
    }
    const targetHref = pendingNav.href;
    clearCurrentDirty();
    setPendingNav(null);
    setMobileOpen(false);
    router.push(targetHref);
  }, [clearCurrentDirty, commitSectionNavigation, pendingNav, router]);

  const navigateToSection = useCallback(
    (id: SectionId) => {
      if (id === permittedActive) {
        setMobileOpen(false);
        return;
      }
      if (dirtySections.has(permittedActive)) {
        setMobileOpen(false);
        setPendingNav({ kind: "section", id });
        return;
      }
      commitSectionNavigation(id);
    },
    [commitSectionNavigation, dirtySections, permittedActive],
  );

  const requestExternalNavigation = useCallback(
    (href: string, label?: string): boolean => {
      if (!dirtySections.has(permittedActive)) return false;
      setMobileOpen(false);
      setPendingNav({ kind: "external", href, label: label || "outra página" });
      return true;
    },
    [dirtySections, permittedActive],
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

  return (
    <ThemeProvider>
      <ConfiguracoesNavProvider
        navigateToSection={navigateToSection}
        requestExternalNavigation={requestExternalNavigation}
        setSectionDirty={setSectionDirty}
        dirtySections={dirtySections}
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

        {/* Guarda segura de navegação quando há alterações não salvas (abas internas e links externos) */}
        <AlertDialog open={pendingNav !== null} onOpenChange={(open) => !open && setPendingNav(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterações não salvas em {currentLabel}</AlertDialogTitle>
              <AlertDialogDescription>
                Você editou campos nesta tela sem salvar. Se avançar para{" "}
                <strong className="font-medium text-foreground">{pendingLabel}</strong> agora, suas alterações
                pendentes serão descartadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingNav(null)}>Continuar editando</AlertDialogCancel>
              <AlertDialogAction onClick={commitPendingNavigation}>Sair sem salvar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Toaster />
      </ConfiguracoesNavProvider>
    </ThemeProvider>
  );
}
