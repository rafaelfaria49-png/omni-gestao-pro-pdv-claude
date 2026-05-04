import { useState } from "react";
import { Menu } from "lucide-react";
import { SETTINGS_SECTIONS, SectionId } from "../features/settings/sections";
import { SettingsSidebar } from "../features/settings/components/SettingsSidebar";
import { GeralSection } from "../features/settings/sections/GeralSection";
import { LojasSection } from "../features/settings/sections/LojasSection";
import { AparenciaSection } from "../features/settings/sections/AparenciaSection";
import { PdvSection } from "../features/settings/sections/PdvSection";
import { VendasSection } from "../features/settings/sections/VendasSection";
import { FinanceiroSection } from "../features/settings/sections/FinanceiroSection";
import { IaSection } from "../features/settings/sections/IaSection";
import { IntegracoesSection } from "../features/settings/sections/IntegracoesSection";
import { ImportacaoSection } from "../features/settings/sections/ImportacaoSection";
import { UsuariosSection } from "../features/settings/sections/UsuariosSection";
import { SegurancaSection } from "../features/settings/sections/SegurancaSection";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet";
import { Button } from "../components/ui/button";

const SECTION_COMPONENTS: Record<SectionId, () => JSX.Element> = {
  geral: GeralSection,
  lojas: LojasSection,
  aparencia: AparenciaSection,
  pdv: PdvSection,
  vendas: VendasSection,
  financeiro: FinanceiroSection,
  ia: IaSection,
  integracoes: IntegracoesSection,
  importacao: ImportacaoSection,
  usuarios: UsuariosSection,
  seguranca: SegurancaSection,
};

const SettingsPage = () => {
  const [active, setActive] = useState<SectionId>("aparencia");
  const [mobileOpen, setMobileOpen] = useState(false);

  const Active = SECTION_COMPONENTS[active];
  const currentLabel = SETTINGS_SECTIONS.find((s) => s.id === active)?.label ?? "";

  const handleChange = (id: SectionId) => {
    setActive(id);
    setMobileOpen(false);
  };

  return (
    <div className="configuracoes-v3-root configuracoes-v3-app flex min-h-screen bg-surface text-foreground">
      {/* Sidebar — desktop */}
      <div className="hidden lg:flex">
        <SettingsSidebar active={active} onChange={handleChange} />
      </div>

      {/* Conteúdo */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar mobile */}
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
          <div>
            <p className="text-xs text-muted-foreground">Configurações</p>
            <h1 className="text-2xl font-semibold leading-[1.3] tracking-normal text-foreground">{currentLabel}</h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10 animate-fade-in" key={active}>
            <Active />
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
