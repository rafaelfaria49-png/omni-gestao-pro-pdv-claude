"use client";

import { useEffect, useMemo, useState } from "react";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./sections";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { GeralSection } from "./sections/GeralSection";
import { AparenciaSection } from "./sections/AparenciaSection";
import { UsuariosSection } from "./sections/UsuariosSection";
import { SegurancaSection } from "./sections/SegurancaSection";
import { IntegracoesSection } from "./sections/IntegracoesSection";
import { IaSection } from "./sections/IaSection";
import { LojasSection } from "./sections/LojasSection";
import { PdvSection } from "./sections/PdvSection";
import { VendasSection } from "./sections/VendasSection";
import { FinanceiroSection } from "./sections/FinanceiroSection";
import { cn } from "@/components/configuracoes/lovable/lib/utils";
import "./settings-lovable.css";

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
      <div className="px-4 sm:px-8 py-6 sm:py-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6">
            <SettingsSidebar sections={sections} active={active} onSelect={setActive} />

            <div className={cn("min-w-0")}>
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
          </div>
        </div>
      </div>
    </div>
  );
}

