"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/components/configuracoes/lovable/features/settings/sections";
import { SettingsSidebar } from "@/components/configuracoes/lovable/features/settings/components/SettingsSidebar";
import { GeralSection } from "@/components/configuracoes/lovable/features/settings/sections/GeralSection";
import { AparenciaSection } from "@/components/configuracoes/lovable/features/settings/sections/AparenciaSection";
import { UsuariosSection } from "@/components/configuracoes/lovable/features/settings/sections/UsuariosSection";
import { SegurancaSection } from "@/components/configuracoes/lovable/features/settings/sections/SegurancaSection";
import { IntegracoesSection } from "@/components/configuracoes/lovable/features/settings/sections/IntegracoesSection";
import { IaSection } from "@/components/configuracoes/lovable/features/settings/sections/IaSection";
import { LojasSection } from "@/components/configuracoes/lovable/features/settings/sections/LojasSection";
import { PdvSection } from "@/components/configuracoes/lovable/features/settings/sections/PdvSection";
import { VendasSection } from "@/components/configuracoes/lovable/features/settings/sections/VendasSection";
import { FinanceiroSection } from "@/components/configuracoes/lovable/features/settings/sections/FinanceiroSection";
import "./index.css";

function isSectionId(v: string): v is SettingsSectionId {
  return SETTINGS_SECTIONS.some((s) => s.id === (v as SettingsSectionId));
}

export default function SettingsPage() {
  const sections = SETTINGS_SECTIONS;
  const initial = useMemo<SettingsSectionId>(() => "geral", []);
  const [active, setActive] = useState<SettingsSectionId>(initial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = (window.location.hash || "").replace("#", "").trim();
    if (hash && isSectionId(hash)) setActive(hash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", `#${active}`);
  }, [active]);

  return (
    <div className="lovable-settings">
      <div className="lovable-settings-app flex min-h-screen flex-col bg-surface text-foreground">
        <div className="lovable-settings-shell flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
            <div className="flex gap-8">
              <aside className="w-84 min-w-[22rem] shrink-0">
                <SettingsSidebar sections={sections} active={active} onSelect={setActive} />
              </aside>

              <main className="min-w-0 flex-1">
                <div className="mx-auto w-full max-w-7xl">
                  {active === "geral" && <GeralSection />}
                  {active === "usuarios" && <UsuariosSection />}
                  {active === "seguranca" && <SegurancaSection />}
                  {active === "aparencia" && <AparenciaSection />}
                  {active === "integracoes" && <IntegracoesSection />}
                  {active === "ia" && <IaSection />}
                  {active === "lojas" && <LojasSection />}
                  {active === "pdv" && <PdvSection />}
                  {active === "vendas" && <VendasSection />}
                  {active === "financeiro" && <FinanceiroSection />}
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
