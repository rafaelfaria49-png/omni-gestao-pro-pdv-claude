"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/components/configuracoes-v2/features/settings/sections";
import { SettingsSidebar } from "@/components/configuracoes-v2/features/settings/components/SettingsSidebar";
import { GeralSection } from "@/components/configuracoes-v2/features/settings/sections/GeralSection";
import { AparenciaSection } from "@/components/configuracoes-v2/features/settings/sections/AparenciaSection";
import { UsuariosSection } from "@/components/configuracoes-v2/features/settings/sections/UsuariosSection";
import { SegurancaSection } from "@/components/configuracoes-v2/features/settings/sections/SegurancaSection";
import { IntegracoesSection } from "@/components/configuracoes-v2/features/settings/sections/IntegracoesSection";
import { IaSection } from "@/components/configuracoes-v2/features/settings/sections/IaSection";
import { LojasSection } from "@/components/configuracoes-v2/features/settings/sections/LojasSection";
import { PdvSection } from "@/components/configuracoes-v2/features/settings/sections/PdvSection";
import { VendasSection } from "@/components/configuracoes-v2/features/settings/sections/VendasSection";
import { FinanceiroSection } from "@/components/configuracoes-v2/features/settings/sections/FinanceiroSection";
import { Toaster } from "@/components/configuracoes-v2/ui/toaster";
import "./configuracoes-v2.css";

function isSectionId(v: string): v is SettingsSectionId {
  return SETTINGS_SECTIONS.some((s) => s.id === (v as SettingsSectionId));
}

/** Entrada Next.js equivalente a `src/pages/Index.tsx` (Lovable): mesmo markup que `SettingsPage` + Toaster local. */
export default function ConfiguracoesV2Page() {
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
    <div className="lovable-settings min-h-screen w-full">
      <Toaster />
      <div className="lovable-settings-app flex min-h-screen w-full flex-col bg-surface text-foreground">
        <div className="lovable-settings-shell flex-1">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex gap-8">
              <aside className="w-[240px] shrink-0">
                <SettingsSidebar sections={sections} active={active} onSelect={setActive} />
              </aside>

              <main className="min-w-0 flex-1">
                <div className="mx-auto max-w-5xl">
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
