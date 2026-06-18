"use client";

import { useCallback, useEffect, useState, type JSX } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { SETTINGS_SECTIONS, type SectionId } from "./features/settings/sections";
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
import { Sheet, SheetContent, SheetTrigger } from "./components/ui/sheet";
import { Button } from "./components/ui/button";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ConfiguracoesNavProvider } from "./contexts/ConfiguracoesNavContext";
import { Toaster } from "./components/ui/toaster";
import { useLojaAtiva } from "@/lib/loja-ativa";
import "./configuracoes-v3.css";

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

export default function ConfiguracoesV3Page() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const secFromUrl = parseSectionFromSearchParam(searchParams.get("sec"));
  const [active, setActive] = useState<SectionId>(secFromUrl);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setActive(secFromUrl);
  }, [secFromUrl]);

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

  const navigateToSection = useCallback(
    (id: SectionId) => {
      setActive(id);
      setMobileOpen(false);
      syncUrl(id);
    },
    [syncUrl],
  );

  const handleChange = useCallback(
    (id: SectionId) => {
      navigateToSection(id);
    },
    [navigateToSection],
  );

  const Active = SECTION_COMPONENTS[active];
  const currentLabel = SETTINGS_SECTIONS.find((s) => s.id === active)?.label ?? "";
  const { lojaAtivaId } = useLojaAtiva();
  const storeScopeKey = lojaAtivaId?.trim() || "__sem_unidade__";

  return (
    <ThemeProvider>
      <ConfiguracoesNavProvider navigateToSection={navigateToSection}>
        <div className="configuracoes-v3-root configuracoes-v3-app flex h-full w-full bg-surface text-foreground">
          {/* Sidebar — desktop */}
          <div className={active === "pdv" ? "hidden" : "hidden lg:flex h-full shrink-0"}>
            <SettingsSidebar active={active} onChange={handleChange} />
          </div>

          {/* Conteúdo */}
          <main className="flex-1 min-w-0 flex flex-col h-full">
            {/* Top bar mobile */}
            {active !== "pdv" && (
              <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72 p-0">
                    <SettingsSidebar active={active} onChange={handleChange} />
                  </SheetContent>
                </Sheet>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Configurações</p>
                  <h1 className="truncate text-xl font-semibold leading-tight tracking-normal text-foreground sm:text-2xl">
                    {currentLabel}
                  </h1>
                </div>
              </header>
            )}

            <div className="flex-1 overflow-y-auto scroll-elegant">
              <div
                key={`${active}-${storeScopeKey}`}
                className={`mx-auto w-full px-4 py-6 sm:px-8 sm:py-10 animate-fade-in ${active === "pdv" ? "max-w-7xl" : "max-w-5xl"}`}
              >
                <Active />
              </div>
            </div>
          </main>
        </div>
        <Toaster />
      </ConfiguracoesNavProvider>
    </ThemeProvider>
  );
}
